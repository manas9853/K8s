"""
Executive Reports API
Feature 22: Generate executive reports (PDF/Excel/CSV)
UPDATED: Heavy generation offloaded to Celery workers; endpoints are non-blocking.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Celery app + task (imported lazily-safe — worker and API share the same module)
from celery_app import celery_app  # noqa: E402
from tasks.report_tasks import generate_report as _generate_report_task  # noqa: E402


class Report(BaseModel):
    report_id: str
    title: str
    type: str
    format: str
    generated_at: str
    size_mb: float
    download_url: str
    status: str


class ReportSummary(BaseModel):
    total_reports: int
    reports_this_week: int
    reports_this_month: int
    total_savings_tracked: float
    last_generated: str



# In-memory storage for generated reports (in production, use database)
generated_reports = []


@router.get("/list", response_model=List[Report])
async def get_reports():
    """Get list of generated reports"""

    if generated_reports:
        return generated_reports

    return [
        {
            "report_id": "rpt-sample-001",
            "title": "Sample Executive Report",
            "type": "executive",
            "format": "json",
            "generated_at": datetime.utcnow().isoformat() + 'Z',
            "size_mb": 0.5,
            "download_url": "/api/v1/reports/download/rpt-sample-001",
            "status": "available"
        }
    ]


@router.get("/summary", response_model=ReportSummary)
async def get_summary():
    """Get reports summary"""

    now = datetime.utcnow()
    week_ago  = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    def _ts(r):
        return datetime.fromisoformat(r["generated_at"].replace('Z', '+00:00'))

    reports_this_week  = sum(1 for r in generated_reports if _ts(r) > week_ago)
    reports_this_month = sum(1 for r in generated_reports if _ts(r) > month_ago)

    return {
        "total_reports": len(generated_reports),
        "reports_this_week": reports_this_week,
        "reports_this_month": reports_this_month,
        "total_savings_tracked": 0,
        "last_generated": (
            generated_reports[-1]["generated_at"]
            if generated_reports
            else "Never"
        ),
    }


@router.post("/generate/{report_type}")
async def generate_report(report_type: str, format: str = "json"):
    """
    Enqueue report generation as a Celery task.
    Returns immediately with task_id; poll /status/{task_id} for progress.
    """
    valid_types   = ["executive", "weekly", "monthly", "detailed"]
    valid_formats = ["json", "csv"]

    if report_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid report type. Must be one of: {valid_types}",
        )
    if format not in valid_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format. Must be one of: {valid_formats}",
        )

    task = _generate_report_task.delay(report_type, format)
    logger.info("Enqueued report task %s (%s/%s)", task.id, report_type, format)

    return {
        "status":      "queued",
        "task_id":     task.id,
        "report_type": report_type,
        "format":      format,
        "message":     "Report generation queued. Poll /status/{task_id} for result.",
        "status_url":  f"/api/v1/reports/status/{task.id}",
    }


@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    """
    Poll the status of a report generation task.

    States: PENDING → STARTED → SUCCESS | FAILURE
    On SUCCESS, the report metadata (including download_url) is returned and
    the report is appended to the in-memory list.
    """
    result = celery_app.AsyncResult(task_id)
    state  = result.state

    if state == "PENDING":
        return {"task_id": task_id, "status": "pending"}

    if state == "STARTED":
        return {"task_id": task_id, "status": "running"}

    if state == "FAILURE":
        return {
            "task_id": task_id,
            "status":  "failed",
            "error":   str(result.info),
        }

    if state == "SUCCESS":
        report_meta = result.result
        # Register in the in-memory list (deduplicated by report_id)
        existing_ids = {r["report_id"] for r in generated_reports}
        if report_meta["report_id"] not in existing_ids:
            generated_reports.append(report_meta)
            if len(generated_reports) > 50:
                generated_reports.pop(0)
        return {
            "task_id":     task_id,
            "status":      "success",
            "report_id":   report_meta["report_id"],
            "title":       report_meta["title"],
            "format":      report_meta["format"],
            "size_mb":     report_meta["size_mb"],
            "generated_at":report_meta["generated_at"],
            "download_url":report_meta["download_url"],
        }

    # Any other Celery state (RETRY, REVOKED, …)
    return {"task_id": task_id, "status": state.lower()}


@router.get("/download/{report_id}")
async def download_report(report_id: str):
    """Download a generated report"""
    
    # Find report
    report = None
    for r in generated_reports:
        if r["report_id"] == report_id:
            report = r
            break
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Get content
    content = report.get("content", "")
    
    # Determine media type
    if report["format"] == "csv":
        media_type = "text/csv"
        filename = f"{report_id}.csv"
    else:
        media_type = "application/json"
        filename = f"{report_id}.json"
    
    # Return as streaming response
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/preview/{report_type}")
async def preview_report(report_type: str):
    """
    Preview metadata for a report type without generating the file.
    Queue a task and return its task_id — the caller can poll /status/{task_id}.
    """
    valid_types = ["executive", "weekly", "monthly", "detailed"]
    if report_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid report type. Must be one of: {valid_types}",
        )

    task = _generate_report_task.delay(report_type, "json")
    return {
        "report_type": report_type,
        "task_id":     task.id,
        "status_url":  f"/api/v1/reports/status/{task.id}",
        "message":     "Preview queued — poll status_url for the full summary.",
    }


@router.delete("/delete/{report_id}")
async def delete_report(report_id: str):
    """Delete a generated report"""
    
    global generated_reports
    
    # Find and remove report
    initial_count = len(generated_reports)
    generated_reports = [
        r for r in generated_reports 
        if r["report_id"] != report_id
    ]
    
    if len(generated_reports) == initial_count:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {
        "status": "success",
        "message": f"Report {report_id} deleted successfully"
    }

# Made with Bob
