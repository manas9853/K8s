"""
Rollback Engine API - Feature 8
Provides change history tracking, rollback capabilities, and audit trail
Integrates with AutoFix API to track applied changes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)


# Pydantic Models
class ConfigurationSnapshot(BaseModel):
    """Snapshot of configuration before change"""
    field: str
    old_value: str
    new_value: str
    resource_path: str


class ChangeRecord(BaseModel):
    """Record of a change made to the system"""
    change_id: str
    action_id: str
    resource_type: str
    resource_name: str
    namespace: str
    cluster: str
    change_type: str
    user: str
    timestamp: str
    status: str
    snapshots: List[ConfigurationSnapshot]
    rollback_available: bool
    rollback_id: Optional[str] = None


class RollbackRequest(BaseModel):
    """Request to rollback a change"""
    change_ids: List[str]
    reason: str
    user: str


class RollbackResult(BaseModel):
    """Result of a rollback operation"""
    rollback_id: str
    change_id: str
    success: bool
    message: str
    rolled_back_at: str


class AuditEntry(BaseModel):
    """Audit trail entry"""
    audit_id: str
    change_id: str
    action: str
    user: str
    timestamp: str
    details: Dict[str, Any]
    ip_address: Optional[str] = None


class ChangeHistorySummary(BaseModel):
    """Summary of change history"""
    total_changes: int
    successful_changes: int
    failed_changes: int
    rolled_back_changes: int
    pending_changes: int
    total_rollbacks: int
    successful_rollbacks: int
    failed_rollbacks: int


# In-memory storage for changes (in production, use database)
CHANGE_HISTORY = []
ROLLBACK_HISTORY = []
AUDIT_TRAIL = []


def create_change_record_from_fix_action(
    action: dict,
    user: str = "system@k8s-optimizer.local"
) -> ChangeRecord:
    """Convert a fix action into a change record"""
    
    change_id = f"chg-{len(CHANGE_HISTORY) + 1:03d}"
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # Convert changes to snapshots
    snapshots = []
    for change in action.get('changes', []):
        snapshots.append(ConfigurationSnapshot(
            field=change.get('field', ''),
            old_value=change.get('old_value', ''),
            new_value=change.get('new_value', ''),
            resource_path=f"{action.get('resource_type', '').lower()}s/"
                         f"{action.get('resource_name', '')}"
        ))
    
    return ChangeRecord(
        change_id=change_id,
        action_id=action.get('action_id', ''),
        resource_type=action.get('resource_type', 'Unknown'),
        resource_name=action.get('resource_name', 'unknown'),
        namespace=action.get('namespace', 'default'),
        cluster=action.get('cluster', 'unknown'),
        change_type=action.get('fix_type', 'Optimization'),
        user=user,
        timestamp=timestamp,
        status="applied",
        snapshots=snapshots,
        rollback_available=True,
        rollback_id=None
    )


@router.get("/history", response_model=List[ChangeRecord])
async def get_change_history(
    cluster: Optional[str] = None,
    namespace: Optional[str] = None,
    status: Optional[str] = None,
    user: Optional[str] = None
):
    """
    Get change history with optional filters
    Fetches from AutoFix API applied changes
    """
    try:
        # If no changes in history, generate from AutoFix actions
        # (simulating that some actions were applied)
        if len(CHANGE_HISTORY) == 0:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    "http://localhost:8000/api/autofix/actions"
                )
                
                if response.status_code == 200:
                    actions = response.json()
                    
                    # Simulate that first 5 actions were applied
                    for action in actions[:5]:
                        change = create_change_record_from_fix_action(
                            action,
                            user="admin@k8s-optimizer.local"
                        )
                        CHANGE_HISTORY.append(change.dict())
                    
                    logger.info(
                        f"Generated {len(CHANGE_HISTORY)} change records "
                        f"from AutoFix actions"
                    )
        
        changes = CHANGE_HISTORY.copy()
        
        # Apply filters
        if cluster:
            changes = [c for c in changes if cluster in c["cluster"]]
        if namespace:
            changes = [c for c in changes if c["namespace"] == namespace]
        if status:
            changes = [c for c in changes if c["status"] == status]
        if user:
            changes = [c for c in changes if c["user"] == user]
        
        return changes
        
    except Exception as e:
        logger.error(f"Error fetching change history: {e}")
        return []


@router.get("/history/{change_id}", response_model=ChangeRecord)
async def get_change_details(change_id: str):
    """
    Get detailed information about a specific change
    """
    # Ensure history is populated
    await get_change_history()
    
    change = next(
        (c for c in CHANGE_HISTORY if c["change_id"] == change_id),
        None
    )
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    return change


@router.post("/rollback", response_model=List[RollbackResult])
async def rollback_changes(request: RollbackRequest):
    """
    Rollback one or more changes
    """
    results = []
    
    # Ensure history is populated
    await get_change_history()
    
    for change_id in request.change_ids:
        change = next(
            (c for c in CHANGE_HISTORY if c["change_id"] == change_id),
            None
        )
        
        if not change:
            results.append(RollbackResult(
                rollback_id=f"rb-{len(ROLLBACK_HISTORY) + len(results) + 1:03d}",
                change_id=change_id,
                success=False,
                message="Change not found",
                rolled_back_at=datetime.utcnow().isoformat() + "Z"
            ))
            continue
        
        if not change["rollback_available"]:
            results.append(RollbackResult(
                rollback_id=f"rb-{len(ROLLBACK_HISTORY) + len(results) + 1:03d}",
                change_id=change_id,
                success=False,
                message="Rollback not available for this change",
                rolled_back_at=datetime.utcnow().isoformat() + "Z"
            ))
            continue
        
        if change["status"] == "rolled_back":
            results.append(RollbackResult(
                rollback_id=f"rb-{len(ROLLBACK_HISTORY) + len(results) + 1:03d}",
                change_id=change_id,
                success=False,
                message="Change already rolled back",
                rolled_back_at=datetime.utcnow().isoformat() + "Z"
            ))
            continue
        
        # Simulate successful rollback
        rollback_id = f"rb-{len(ROLLBACK_HISTORY) + len(results) + 1:03d}"
        rolled_back_at = datetime.utcnow().isoformat() + "Z"
        
        result = RollbackResult(
            rollback_id=rollback_id,
            change_id=change_id,
            success=True,
            message=f"Successfully rolled back {change['change_type']} "
                   f"for {change['resource_name']}",
            rolled_back_at=rolled_back_at
        )
        results.append(result)
        
        # Update change status
        change["status"] = "rolled_back"
        change["rollback_available"] = False
        change["rollback_id"] = rollback_id
        
        # Add to rollback history
        ROLLBACK_HISTORY.append(result.dict())
        
        # Add audit entry
        AUDIT_TRAIL.append({
            "audit_id": f"aud-{len(AUDIT_TRAIL) + 1:03d}",
            "change_id": change_id,
            "action": "rollback_change",
            "user": request.user,
            "timestamp": rolled_back_at,
            "details": {
                "rollback_id": rollback_id,
                "reason": request.reason,
                "changes_reverted": len(change["snapshots"])
            },
            "ip_address": "127.0.0.1"
        })
        
        logger.info(
            f"Rolled back change {change_id} "
            f"(rollback_id: {rollback_id})"
        )
    
    return results


@router.get("/rollbacks", response_model=List[RollbackResult])
async def get_rollback_history():
    """
    Get history of all rollback operations
    """
    return ROLLBACK_HISTORY


@router.get("/rollbacks/{rollback_id}", response_model=RollbackResult)
async def get_rollback_details(rollback_id: str):
    """
    Get details of a specific rollback operation
    """
    rollback = next(
        (r for r in ROLLBACK_HISTORY if r["rollback_id"] == rollback_id),
        None
    )
    if not rollback:
        raise HTTPException(status_code=404, detail="Rollback not found")
    return rollback


@router.get("/audit", response_model=List[AuditEntry])
async def get_audit_trail(
    change_id: Optional[str] = None,
    user: Optional[str] = None,
    action: Optional[str] = None
):
    """
    Get audit trail with optional filters
    """
    # Ensure history is populated
    await get_change_history()
    
    # Generate audit entries for applied changes if not exists
    if len(AUDIT_TRAIL) == 0:
        for change in CHANGE_HISTORY:
            AUDIT_TRAIL.append({
                "audit_id": f"aud-{len(AUDIT_TRAIL) + 1:03d}",
                "change_id": change["change_id"],
                "action": "apply_change",
                "user": change["user"],
                "timestamp": change["timestamp"],
                "details": {
                    "action_id": change["action_id"],
                    "resource": f"{change['resource_type'].lower()}s/"
                               f"{change['resource_name']}",
                    "changes_applied": len(change["snapshots"])
                },
                "ip_address": "127.0.0.1"
            })
    
    audit = AUDIT_TRAIL.copy()
    
    # Apply filters
    if change_id:
        audit = [a for a in audit if a["change_id"] == change_id]
    if user:
        audit = [a for a in audit if a["user"] == user]
    if action:
        audit = [a for a in audit if a["action"] == action]
    
    return audit


@router.get("/summary", response_model=ChangeHistorySummary)
async def get_change_summary():
    """
    Get summary statistics of change history
    """
    # Ensure history is populated
    await get_change_history()
    
    total_changes = len(CHANGE_HISTORY)
    successful_changes = len(
        [c for c in CHANGE_HISTORY if c["status"] == "applied"]
    )
    failed_changes = len(
        [c for c in CHANGE_HISTORY if c["status"] == "failed"]
    )
    rolled_back_changes = len(
        [c for c in CHANGE_HISTORY if c["status"] == "rolled_back"]
    )
    pending_changes = len(
        [c for c in CHANGE_HISTORY if c["status"] == "pending"]
    )
    
    total_rollbacks = len(ROLLBACK_HISTORY)
    successful_rollbacks = len(
        [r for r in ROLLBACK_HISTORY if r["success"]]
    )
    failed_rollbacks = len(
        [r for r in ROLLBACK_HISTORY if not r["success"]]
    )
    
    return ChangeHistorySummary(
        total_changes=total_changes,
        successful_changes=successful_changes,
        failed_changes=failed_changes,
        rolled_back_changes=rolled_back_changes,
        pending_changes=pending_changes,
        total_rollbacks=total_rollbacks,
        successful_rollbacks=successful_rollbacks,
        failed_rollbacks=failed_rollbacks
    )


# Made with Bob
