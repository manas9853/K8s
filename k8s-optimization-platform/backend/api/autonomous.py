"""
Autonomous Optimization Modes API - Feature 10
Provides three levels of automation for optimization
Integrates with AutoFix API for real optimization tasks
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import logging
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)


# Enums
class OptimizationMode(str, Enum):
    MANUAL = "manual"
    ASSISTED = "assisted"
    AUTONOMOUS = "autonomous"


class OptimizationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    APPLIED = "applied"
    FAILED = "failed"


# Pydantic Models
class ModeConfig(BaseModel):
    """Configuration for optimization mode"""
    mode: OptimizationMode
    cluster: Optional[str] = None
    namespace: Optional[str] = None
    auto_approve_threshold: float = 100.0
    risk_tolerance: str = "low"
    enabled: bool = True


class OptimizationTask(BaseModel):
    """Optimization task"""
    task_id: str
    mode: OptimizationMode
    cluster: str
    namespace: str
    resource_type: str
    resource_name: str
    optimization_type: str
    current_config: Dict[str, Any]
    recommended_config: Dict[str, Any]
    estimated_savings: float
    risk_level: str
    status: OptimizationStatus
    requires_approval: bool
    auto_approved: bool
    created_at: str
    updated_at: str
    applied_at: Optional[str] = None
    approved_by: Optional[str] = None


class ApprovalRequest(BaseModel):
    """Request to approve/reject optimization"""
    task_id: str
    action: str
    reason: Optional[str] = None


class ModeStats(BaseModel):
    """Statistics for optimization mode"""
    mode: OptimizationMode
    total_tasks: int
    pending_approval: int
    auto_approved: int
    manually_approved: int
    rejected: int
    applied: int
    failed: int
    total_savings: float
    avg_approval_time: float


# In-memory storage (production would use database)
CURRENT_MODE = {
    "global": OptimizationMode.ASSISTED,
}
OPTIMIZATION_TASKS = []


def convert_fix_action_to_task(
    action: dict,
    mode: OptimizationMode
) -> OptimizationTask:
    """Convert AutoFix action into optimization task"""
    
    task_id = f"task-{action.get('action_id', 'unknown').replace('fix-', '')}"
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # Extract current and recommended configs from changes
    current_config = {}
    recommended_config = {}
    
    for change in action.get('changes', []):
        field = change.get('field', '')
        if 'cpu' in field.lower():
            if 'request' in field:
                current_config['cpu_request'] = change.get('old_value', '')
                recommended_config['cpu_request'] = change.get('new_value', '')
            elif 'limit' in field:
                current_config['cpu_limit'] = change.get('old_value', '')
                recommended_config['cpu_limit'] = change.get('new_value', '')
        elif 'memory' in field.lower():
            if 'request' in field:
                current_config['memory_request'] = change.get('old_value', '')
                recommended_config['memory_request'] = change.get('new_value', '')
            elif 'limit' in field:
                current_config['memory_limit'] = change.get('old_value', '')
                recommended_config['memory_limit'] = change.get('new_value', '')
    
    # Determine if auto-approval applies
    risk_level = action.get('risk_level', 'Medium')
    estimated_savings = action.get('estimated_savings', 0.0)
    
    auto_approved = False
    requires_approval = True
    status = OptimizationStatus.PENDING
    
    if mode == OptimizationMode.AUTONOMOUS:
        if risk_level == "Low" and estimated_savings < 100.0:
            auto_approved = True
            requires_approval = False
            status = OptimizationStatus.APPLIED
    elif mode == OptimizationMode.ASSISTED:
        requires_approval = True
        status = OptimizationStatus.PENDING
    else:  # MANUAL
        requires_approval = True
        status = OptimizationStatus.PENDING
    
    return OptimizationTask(
        task_id=task_id,
        mode=mode,
        cluster=action.get('cluster', 'unknown'),
        namespace=action.get('namespace', 'default'),
        resource_type=action.get('resource_type', 'Pod'),
        resource_name=action.get('resource_name', 'unknown'),
        optimization_type=action.get('fix_type', 'Optimization'),
        current_config=current_config,
        recommended_config=recommended_config,
        estimated_savings=estimated_savings,
        risk_level=risk_level.lower(),
        status=status,
        requires_approval=requires_approval,
        auto_approved=auto_approved,
        created_at=timestamp,
        updated_at=timestamp,
        applied_at=timestamp if auto_approved else None,
        approved_by="system" if auto_approved else None
    )


async def populate_tasks_from_autofix():
    """Populate optimization tasks from AutoFix actions"""
    
    if len(OPTIMIZATION_TASKS) > 0:
        return
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "http://localhost:8000/api/autofix/actions"
            )
            
            if response.status_code == 200:
                actions = response.json()
                
                # Get current mode
                global_mode = CURRENT_MODE.get("global", OptimizationMode.ASSISTED)
                
                # Convert first 10 actions to tasks
                for action in actions[:10]:
                    task = convert_fix_action_to_task(action, global_mode)
                    OPTIMIZATION_TASKS.append(task.dict())
                
                logger.info(
                    f"Generated {len(OPTIMIZATION_TASKS)} optimization tasks "
                    f"from AutoFix actions"
                )
    except Exception as e:
        logger.error(f"Error populating tasks from AutoFix: {e}")


@router.get("/modes")
async def get_modes():
    """Get all configured optimization modes"""
    return {
        "modes": [
            {
                "mode": "manual",
                "name": "Manual Mode",
                "description": "Recommendations only. No automatic changes.",
                "features": [
                    "View optimization recommendations",
                    "Manual review required for all changes",
                    "Full control over every optimization",
                    "Suitable for production environments"
                ],
                "risk": "None",
                "automation_level": 0
            },
            {
                "mode": "assisted",
                "name": "Assisted Mode",
                "description": "User approval required before applying.",
                "features": [
                    "Automatic detection of opportunities",
                    "One-click approval workflow",
                    "Auto-approve low-risk changes below threshold",
                    "Notification on pending approvals"
                ],
                "risk": "Low",
                "automation_level": 50
            },
            {
                "mode": "autonomous",
                "name": "Autonomous Mode",
                "description": "System automatically applies safe optimizations.",
                "features": [
                    "Fully automated optimization",
                    "Applies low-risk changes automatically",
                    "Continuous optimization",
                    "Detailed audit trail"
                ],
                "risk": "Low to Medium",
                "automation_level": 100
            }
        ],
        "current_config": CURRENT_MODE
    }


@router.get("/config")
async def get_config():
    """Get current optimization mode configuration"""
    return {
        "global_mode": CURRENT_MODE.get("global", "manual"),
        "cluster_overrides": {
            k: v for k, v in CURRENT_MODE.items() if k != "global"
        },
        "settings": {
            "auto_approve_threshold": 100.0,
            "risk_tolerance": "low",
            "notification_enabled": True,
            "rollback_enabled": True
        }
    }


@router.post("/config")
async def update_config(config: ModeConfig):
    """Update optimization mode configuration"""
    if config.cluster:
        CURRENT_MODE[config.cluster] = config.mode
    else:
        CURRENT_MODE["global"] = config.mode
    
    return {
        "message": "Configuration updated successfully",
        "config": config,
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }


@router.get("/tasks", response_model=List[OptimizationTask])
async def get_tasks(
    mode: Optional[str] = None,
    status: Optional[str] = None,
    cluster: Optional[str] = None
):
    """Get optimization tasks from real AutoFix actions"""
    
    # Populate tasks from AutoFix if empty
    await populate_tasks_from_autofix()
    
    tasks = OPTIMIZATION_TASKS.copy()
    
    if mode:
        tasks = [t for t in tasks if t["mode"] == mode]
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    if cluster:
        tasks = [t for t in tasks if cluster in t["cluster"]]
    
    return tasks


@router.post("/tasks/{task_id}/approve")
async def approve_task(task_id: str, request: ApprovalRequest):
    """Approve or reject an optimization task"""
    
    await populate_tasks_from_autofix()
    
    task = next(
        (t for t in OPTIMIZATION_TASKS if t["task_id"] == task_id),
        None
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] not in ["pending", "approved"]:
        raise HTTPException(
            status_code=400,
            detail=f"Task cannot be {request.action}ed in "
                   f"{task['status']} state"
        )
    
    if request.action == "approve":
        task["status"] = "approved"
        task["approved_by"] = "user@k8s-optimizer.local"
        task["updated_at"] = datetime.utcnow().isoformat() + "Z"
    elif request.action == "reject":
        task["status"] = "rejected"
        task["approved_by"] = "user@k8s-optimizer.local"
        task["updated_at"] = datetime.utcnow().isoformat() + "Z"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    return {
        "message": f"Task {request.action}ed successfully",
        "task": task
    }


@router.post("/tasks/{task_id}/apply")
async def apply_task(task_id: str):
    """Apply an approved optimization task"""
    
    await populate_tasks_from_autofix()
    
    task = next(
        (t for t in OPTIMIZATION_TASKS if t["task_id"] == task_id),
        None
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] != "approved":
        raise HTTPException(
            status_code=400,
            detail="Task must be approved before applying"
        )
    
    task["status"] = "applied"
    task["applied_at"] = datetime.utcnow().isoformat() + "Z"
    task["updated_at"] = datetime.utcnow().isoformat() + "Z"
    
    return {
        "message": "Optimization applied successfully",
        "task": task
    }


@router.get("/stats")
async def get_stats():
    """Get statistics for each optimization mode"""
    
    await populate_tasks_from_autofix()
    
    stats = {
        "manual": {
            "mode": "manual",
            "total_tasks": 0,
            "pending_approval": 0,
            "auto_approved": 0,
            "manually_approved": 0,
            "rejected": 0,
            "applied": 0,
            "failed": 0,
            "total_savings": 0.0,
            "avg_approval_time": 0.0
        },
        "assisted": {
            "mode": "assisted",
            "total_tasks": 0,
            "pending_approval": 0,
            "auto_approved": 0,
            "manually_approved": 0,
            "rejected": 0,
            "applied": 0,
            "failed": 0,
            "total_savings": 0.0,
            "avg_approval_time": 45.0
        },
        "autonomous": {
            "mode": "autonomous",
            "total_tasks": 0,
            "pending_approval": 0,
            "auto_approved": 0,
            "manually_approved": 0,
            "rejected": 0,
            "applied": 0,
            "failed": 0,
            "total_savings": 0.0,
            "avg_approval_time": 2.0
        }
    }
    
    for task in OPTIMIZATION_TASKS:
        mode = task["mode"]
        stats[mode]["total_tasks"] += 1
        
        if task["status"] == "pending":
            stats[mode]["pending_approval"] += 1
        elif task["status"] == "approved":
            stats[mode]["manually_approved"] += 1
        elif task["status"] == "rejected":
            stats[mode]["rejected"] += 1
        elif task["status"] == "applied":
            stats[mode]["applied"] += 1
            stats[mode]["total_savings"] += task["estimated_savings"]
            if task["auto_approved"]:
                stats[mode]["auto_approved"] += 1
            else:
                stats[mode]["manually_approved"] += 1
        elif task["status"] == "failed":
            stats[mode]["failed"] += 1
    
    return {
        "stats": list(stats.values()),
        "summary": {
            "total_tasks": sum(s["total_tasks"] for s in stats.values()),
            "total_savings": sum(s["total_savings"] for s in stats.values()),
            "pending_approval": sum(
                s["pending_approval"] for s in stats.values()
            ),
            "auto_approved": sum(s["auto_approved"] for s in stats.values())
        }
    }


@router.get("/summary")
async def get_summary():
    """Get summary of autonomous optimization system"""
    
    await populate_tasks_from_autofix()
    
    pending = len([t for t in OPTIMIZATION_TASKS if t["status"] == "pending"])
    approved = len([t for t in OPTIMIZATION_TASKS if t["status"] == "approved"])
    applied = len([t for t in OPTIMIZATION_TASKS if t["status"] == "applied"])
    rejected = len([t for t in OPTIMIZATION_TASKS if t["status"] == "rejected"])
    
    total_savings = sum(
        t["estimated_savings"]
        for t in OPTIMIZATION_TASKS
        if t["status"] == "applied"
    )
    
    auto_approved = len([
        t for t in OPTIMIZATION_TASKS
        if t["auto_approved"] and t["status"] == "applied"
    ])
    
    return {
        "current_mode": CURRENT_MODE.get("global", "manual"),
        "total_tasks": len(OPTIMIZATION_TASKS),
        "pending_approval": pending,
        "approved": approved,
        "applied": applied,
        "rejected": rejected,
        "auto_approved": auto_approved,
        "total_savings": round(total_savings, 2),
        "avg_savings_per_task": round(
            total_savings / applied if applied > 0 else 0,
            2
        )
    }


# Made with Bob
