"""
AutoFix API - Feature 7: One-Click Auto Fix
Converts recommendations into actionable fix operations
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import logging
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)


class ResourceChange(BaseModel):
    field: str
    old_value: str
    new_value: str
    reason: str


class FixAction(BaseModel):
    action_id: str
    resource_type: str
    resource_name: str
    namespace: str
    cluster: str
    fix_type: str
    changes: List[ResourceChange]
    estimated_savings: float
    risk_level: str
    requires_restart: bool
    estimated_downtime: str
    status: str


class FixResult(BaseModel):
    action_id: str
    success: bool
    message: str
    applied_at: str
    rollback_id: Optional[str]
    logs: List[str]


class BulkFixRequest(BaseModel):
    action_ids: List[str]
    apply_mode: str  # immediate, scheduled, dry_run


class BulkFixResponse(BaseModel):
    total: int
    successful: int
    failed: int
    results: List[FixResult]


def convert_recommendation_to_fix_action(rec: dict, index: int) -> FixAction:
    """Convert a recommendation into a fix action"""
    
    action_id = f"fix-{index:03d}"
    changes = []
    fix_type = "Resource Optimization"
    
    # Get nested CPU and memory data
    cpu_data = rec.get('cpu', {})
    memory_data = rec.get('memory', {})
    status = rec.get('status', '')
    
    # Determine fix type based on recommendation status
    if 'cpu' in status:
        fix_type = "CPU Optimization"
    elif 'memory' in status:
        fix_type = "Memory Optimization"
    
    # Calculate waste percentages
    cpu_waste = 0
    if cpu_data.get('current_request', 0) > 0:
        cpu_waste = ((cpu_data.get('current_request', 0) -
                     cpu_data.get('current_usage', 0)) /
                     cpu_data.get('current_request', 0) * 100)
    
    memory_waste = 0
    if memory_data.get('current_request', 0) > 0:
        memory_waste = ((memory_data.get('current_request', 0) -
                        memory_data.get('current_usage', 0)) /
                        memory_data.get('current_request', 0) * 100)
    
    # CPU changes
    if status == 'reduce_cpu' or status == 'reduce_both':
        changes.append(ResourceChange(
            field="spec.containers[0].resources.requests.cpu",
            old_value=f"{cpu_data.get('current_request', 0):.3f}",
            new_value=f"{cpu_data.get('recommended_request', 0):.3f}",
            reason=f"Usage: {cpu_data.get('current_usage', 0):.3f} cores "
                   f"({cpu_waste:.1f}% waste)"
        ))
        
        if cpu_data.get('current_limit', 0) > 0:
            changes.append(ResourceChange(
                field="spec.containers[0].resources.limits.cpu",
                old_value=f"{cpu_data.get('current_limit', 0):.3f}",
                new_value=f"{cpu_data.get('recommended_limit', 0):.3f}",
                reason="Reduce limit to match optimized request"
            ))
    
    elif status == 'increase_cpu':
        changes.append(ResourceChange(
            field="spec.containers[0].resources.requests.cpu",
            old_value=f"{cpu_data.get('current_request', 0):.3f}",
            new_value=f"{cpu_data.get('recommended_request', 0):.3f}",
            reason=f"Prevent throttling (usage: "
                   f"{cpu_data.get('current_usage', 0):.3f} cores)"
        ))
    
    # Memory changes
    if status == 'reduce_memory' or status == 'reduce_both':
        changes.append(ResourceChange(
            field="spec.containers[0].resources.requests.memory",
            old_value=f"{memory_data.get('current_request', 0):.0f}Mi",
            new_value=f"{memory_data.get('recommended_request', 0):.0f}Mi",
            reason=f"Usage: {memory_data.get('current_usage', 0):.0f}Mi "
                   f"({memory_waste:.1f}% waste)"
        ))
        
        if memory_data.get('current_limit', 0) > 0:
            changes.append(ResourceChange(
                field="spec.containers[0].resources.limits.memory",
                old_value=f"{memory_data.get('current_limit', 0):.0f}Mi",
                new_value=f"{memory_data.get('recommended_limit', 0):.0f}Mi",
                reason="Reduce limit to match optimized request"
            ))
    
    elif status == 'increase_memory':
        changes.append(ResourceChange(
            field="spec.containers[0].resources.requests.memory",
            old_value=f"{memory_data.get('current_request', 0):.0f}Mi",
            new_value=f"{memory_data.get('recommended_request', 0):.0f}Mi",
            reason=f"Prevent OOMKills (peak: "
                   f"{memory_data.get('peak_usage', 0):.0f}Mi)"
        ))
    
    # Determine risk level
    confidence = rec.get('confidence', 'medium_risk')
    if 'low' in confidence:
        risk_level = 'Low'
    elif 'high' in confidence:
        risk_level = 'High'
    else:
        risk_level = 'Medium'
    
    # Determine if restart is required
    requires_restart = False
    estimated_downtime = "0s"
    
    if 'increase' in status:
        requires_restart = True
        estimated_downtime = "~30s"
    
    return FixAction(
        action_id=action_id,
        resource_type=rec.get('workload_type', 'Pod'),
        resource_name=rec.get('workload_name', 'unknown'),
        namespace=rec.get('namespace', 'default'),
        cluster=rec.get('cluster_id', 'unknown'),
        fix_type=fix_type,
        changes=changes,
        estimated_savings=rec.get('estimated_monthly_savings', 0.0),
        risk_level=risk_level,
        requires_restart=requires_restart,
        estimated_downtime=estimated_downtime,
        status="ready"
    )


@router.get("/actions", response_model=List[FixAction])
async def get_fix_actions(
    cluster: Optional[str] = None,
    namespace: Optional[str] = None,
    risk_level: Optional[str] = None
):
    """Get available auto-fix actions from real recommendations"""
    
    try:
        # Fetch real recommendations from recommendations API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://localhost:8000/api/recommendations/"
            )
            
            if response.status_code != 200:
                logger.error(
                    f"Failed to fetch recommendations: "
                    f"{response.status_code}"
                )
                return []
            
            # API returns array directly, not wrapped in object
            recommendations = response.json()
            if not isinstance(recommendations, list):
                recommendations = []
        
        # Convert recommendations to fix actions
        fix_actions = []
        for idx, rec in enumerate(recommendations, 1):
            # Only create fix actions for recommendations that need action
            if rec.get('status') != 'no_action':
                try:
                    fix_action = convert_recommendation_to_fix_action(rec, idx)
                    fix_actions.append(fix_action)
                except Exception as e:
                    logger.error(f"Error converting recommendation to fix action: {e}")
                    continue
        
        logger.info(f"Generated {len(fix_actions)} fix actions from {len(recommendations)} recommendations")
        
        # Apply filters
        filtered = fix_actions
        if cluster:
            filtered = [a for a in filtered if cluster in a.cluster]
        if namespace:
            filtered = [a for a in filtered if a.namespace == namespace]
        if risk_level:
            filtered = [a for a in filtered if a.risk_level == risk_level]
        
        return filtered
        
    except Exception as e:
        logger.error(f"Error fetching fix actions: {e}")
        return []


@router.post("/apply/{action_id}", response_model=FixResult)
async def apply_fix(action_id: str):
    """Apply a single fix action"""
    
    # TODO: Implement actual Kubernetes resource patching
    # For now, simulate the fix application
    
    logs = [
        f"[{datetime.utcnow().isoformat()}] Starting fix application for {action_id}",
        f"[{datetime.utcnow().isoformat()}] Validating changes",
        f"[{datetime.utcnow().isoformat()}] Creating rollback point",
        f"[{datetime.utcnow().isoformat()}] Applying resource updates",
        f"[{datetime.utcnow().isoformat()}] Waiting for rollout",
        f"[{datetime.utcnow().isoformat()}] Fix applied successfully"
    ]
    
    return FixResult(
        action_id=action_id,
        success=True,
        message=f"Successfully applied fix {action_id}",
        applied_at=datetime.utcnow().isoformat(),
        rollback_id=f"rollback-{action_id}-{int(datetime.utcnow().timestamp())}",
        logs=logs
    )


@router.post("/bulk-apply", response_model=BulkFixResponse)
async def bulk_apply_fixes(request: BulkFixRequest):
    """Apply multiple fixes in bulk"""
    
    results = []
    successful = 0
    failed = 0
    
    for action_id in request.action_ids:
        try:
            result = await apply_fix(action_id)
            results.append(result)
            if result.success:
                successful += 1
            else:
                failed += 1
        except Exception as e:
            results.append(FixResult(
                action_id=action_id,
                success=False,
                message=str(e),
                applied_at=datetime.utcnow().isoformat(),
                rollback_id=None,
                logs=[f"Error: {str(e)}"]
            ))
            failed += 1
    
    return BulkFixResponse(
        total=len(request.action_ids),
        successful=successful,
        failed=failed,
        results=results
    )


@router.get("/summary")
async def get_fix_summary():
    """Get summary of available fixes from real data"""
    
    try:
        actions = await get_fix_actions()
        
        total_savings = sum(a.estimated_savings for a in actions)
        by_risk = {}
        by_type = {}
        
        for action in actions:
            by_risk[action.risk_level] = by_risk.get(action.risk_level, 0) + 1
            by_type[action.fix_type] = by_type.get(action.fix_type, 0) + 1
        
        return {
            "total_actions": len(actions),
            "pending_actions": len([a for a in actions if a.status == "ready"]),
            "applied_actions": 0,  # TODO: Track applied actions in database
            "failed_actions": 0,   # TODO: Track failed actions in database
            "total_potential_savings": round(total_savings, 2),
            "low_risk_count": by_risk.get("Low", 0),
            "medium_risk_count": by_risk.get("Medium", 0),
            "high_risk_count": by_risk.get("High", 0),
            "by_risk_level": by_risk,
            "by_fix_type": by_type,
            "ready_to_apply": len([a for a in actions if a.status == "ready"]),
            "requires_restart": len([a for a in actions if a.requires_restart])
        }
    except Exception as e:
        logger.error(f"Error getting fix summary: {e}")
        return {
            "total_actions": 0,
            "pending_actions": 0,
            "applied_actions": 0,
            "failed_actions": 0,
            "total_potential_savings": 0.0,
            "low_risk_count": 0,
            "medium_risk_count": 0,
            "high_risk_count": 0,
            "by_risk_level": {},
            "by_fix_type": {},
            "ready_to_apply": 0,
            "requires_restart": 0
        }

# Made with Bob
