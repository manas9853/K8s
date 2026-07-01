"""
Report generation Celery tasks.

The heavy work (fetching ~10 internal API endpoints + building the report
payload) is moved off the FastAPI event-loop into a worker process so that
POST /generate/{type} returns immediately with a task_id.
"""
from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime
from typing import Any, Dict

import httpx

from celery_app import celery_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal API base — resolved inside the docker network
# ---------------------------------------------------------------------------
_BASE = "http://localhost:8000"

_ENDPOINTS: Dict[str, str] = {
    "dashboard":   f"{_BASE}/api/v1/dashboard/summary",
    "executive":   f"{_BASE}/api/v1/executive/summary",
    "pods":        f"{_BASE}/api/v1/pods/summary",
    "cost_savings":f"{_BASE}/api/v1/cost-savings/summary",
    "cleanup":     f"{_BASE}/api/v1/cleanup/summary",
    "incidents":   f"{_BASE}/api/v1/incidents/summary",
    "scoring":     f"{_BASE}/api/v1/scoring/summary",
    "root_cause":  f"{_BASE}/api/v1/root-cause/summary",
    "heatmap":     f"{_BASE}/api/v1/heatmap/summary",
    "predictive":  f"{_BASE}/api/v1/predictive/summary",
    "recommendations": f"{_BASE}/api/v1/recommendations",
}


def _fetch(url: str) -> Any:
    """Synchronous HTTP GET — tasks run in a thread pool, not an event loop."""
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
        return {}


def _gather_all_data() -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    for key, url in _ENDPOINTS.items():
        raw = _fetch(url)
        if key == "recommendations":
            if isinstance(raw, list):
                data[key] = raw
            elif isinstance(raw, dict) and "recommendations" in raw:
                data[key] = raw["recommendations"]
            else:
                data[key] = []
        else:
            data[key] = raw
    data["generated_at"] = datetime.utcnow().isoformat() + "Z"
    return data


# ---------------------------------------------------------------------------
# Content builders (pure functions — no I/O)
# ---------------------------------------------------------------------------

def _build_executive_summary(data: Dict[str, Any]) -> Dict[str, Any]:
    dashboard   = data.get("dashboard", {})
    executive   = data.get("executive", {})
    cost_savings= data.get("cost_savings", {})
    scoring     = data.get("scoring", {})
    incidents   = data.get("incidents", {})
    predictive  = data.get("predictive", {})

    return {
        "report_title":    "Kubernetes Optimization Executive Report",
        "generated_at":    data.get("generated_at"),
        "cluster_overview": {
            "total_clusters":      dashboard.get("total_clusters", 0),
            "total_nodes":         dashboard.get("total_nodes", 0),
            "total_pods":          dashboard.get("total_pods", 0),
            "total_namespaces":    dashboard.get("total_namespaces", 0),
            "cluster_health_score":scoring.get("overall_score", 0),
        },
        "financial_summary": {
            "monthly_infrastructure_cost": executive.get("total_monthly_spend", 0),
            "annual_infrastructure_cost":  executive.get("total_annual_spend", 0),
            "potential_monthly_savings":   cost_savings.get("total_potential_savings", 0),
            "savings_already_realized":    executive.get("savings_already_realized", 0),
            "optimization_coverage":       executive.get("optimization_coverage_percent", 0),
        },
        "optimization_metrics": {
            "resources_optimized":  dashboard.get("resources_optimized", 0),
            "resources_pending":    dashboard.get("resources_pending_optimization", 0),
            "unused_resources":     dashboard.get("unused_resources", 0),
            "total_recommendations":len(data.get("recommendations", [])),
        },
        "incident_summary": {
            "total_incidents":    incidents.get("total_incidents", 0),
            "critical_incidents": incidents.get("critical_incidents", 0),
            "predictions_made":   predictive.get("total_predictions", 0),
            "incidents_prevented":predictive.get("prevented_incidents", 0),
        },
        "key_insights": executive.get("executive_insights", []),
    }


def _build_csv(data: Dict[str, Any]) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    dashboard    = data.get("dashboard", {})
    executive    = data.get("executive", {})
    cost_savings = data.get("cost_savings", {})

    w.writerow(["Kubernetes Optimization Report"])
    w.writerow(["Generated:", data.get("generated_at")])
    w.writerow([])
    w.writerow(["CLUSTER OVERVIEW"])
    w.writerow(["Total Clusters",    dashboard.get("total_clusters", 0)])
    w.writerow(["Total Nodes",       dashboard.get("total_nodes", 0)])
    w.writerow(["Total Pods",        dashboard.get("total_pods", 0)])
    w.writerow(["Total Namespaces",  dashboard.get("total_namespaces", 0)])
    w.writerow([])
    w.writerow(["FINANCIAL SUMMARY"])
    w.writerow(["Monthly Cost",    f"${executive.get('total_monthly_spend', 0):,.2f}"])
    w.writerow(["Annual Cost",     f"${executive.get('total_annual_spend', 0):,.2f}"])
    w.writerow(["Potential Savings",f"${cost_savings.get('total_potential_savings', 0):,.2f}"])
    w.writerow([])
    w.writerow(["TOP RECOMMENDATIONS"])
    w.writerow(["Pod Name", "Namespace", "Type", "Savings", "Risk"])
    for rec in data.get("recommendations", [])[:10]:
        w.writerow([
            rec.get("pod_name", ""),
            rec.get("namespace", ""),
            rec.get("recommendation_status", ""),
            f"${rec.get('estimated_savings', {}).get('cost_saved', 0):.2f}",
            rec.get("recommendation_confidence", ""),
        ])
    return out.getvalue()


def _build_json(data: Dict[str, Any]) -> str:
    report = {
        "report_metadata": {
            "report_type": "executive_summary",
            "format":      "json",
            "generated_at":data.get("generated_at"),
            "version":     "1.0",
        },
        "executive_summary": _build_executive_summary(data),
        "detailed_data": {
            "dashboard":            data.get("dashboard", {}),
            "cost_savings":         data.get("cost_savings", {}),
            "incidents":            data.get("incidents", {}),
            "scoring":              data.get("scoring", {}),
            "recommendations_count":len(data.get("recommendations", [])),
        },
    }
    return json.dumps(report, indent=2)


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="tasks.report_tasks.generate_report",
    max_retries=2,
    default_retry_delay=10,
)
def generate_report(self, report_type: str, fmt: str) -> Dict[str, Any]:
    """
    Gather cluster data from internal APIs and produce a report payload.

    Returns a dict that the FastAPI endpoint can serve directly:
    {
        "report_id":    str,
        "title":        str,
        "type":         str,
        "format":       str,
        "generated_at": str,
        "size_mb":      float,
        "download_url": str,
        "status":       "available",
        "content":      str,   # full report text
    }
    """
    logger.info("Generating %s report (%s) — task %s", report_type, fmt, self.request.id)
    try:
        data = _gather_all_data()

        if fmt == "csv":
            content = _build_csv(data)
        else:
            content = _build_json(data)

        size_mb = round(len(content.encode()) / (1024 * 1024), 4)
        report_id = f"rpt-{report_type}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

        result = {
            "report_id":   report_id,
            "title":       f"{report_type.capitalize()} Optimization Report",
            "type":        report_type,
            "format":      fmt,
            "generated_at":data["generated_at"],
            "size_mb":     size_mb,
            "download_url":f"/api/v1/reports/download/{report_id}",
            "status":      "available",
            "content":     content,
        }
        logger.info("Report %s ready (%.4f MB)", report_id, size_mb)
        return result

    except Exception as exc:
        logger.error("Report task failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)

# Made with Bob
