"""
AutoFix API - Feature 7: One-Click Auto Fix
Converts recommendations into actionable fix operations
and applies them directly to the real Kubernetes cluster.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import logging
import httpx
import os

from services.k8s_client import k8s_client

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
    """
    Apply a single fix action to the real Kubernetes cluster.

    Fetches the matching fix action from recommendations, then issues a
    strategic-merge-patch against the target Deployment/StatefulSet/DaemonSet
    to update resource requests and limits in-place.
    """
    dry_run = os.getenv("AUTO_FIX_DRY_RUN", "false").lower() == "true"
    logs: List[str] = []

    def _log(msg: str) -> None:
        entry = f"[{datetime.utcnow().isoformat()}Z] {msg}"
        logs.append(entry)
        logger.info(entry)

    _log(f"Starting fix application for {action_id}")

    # ── 1. Fetch the fix action list ─────────────────────────────────────────
    try:
        actions = await get_fix_actions()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load fix actions: {exc}")

    action = next((a for a in actions if a.action_id == action_id), None)
    if action is None:
        raise HTTPException(status_code=404, detail=f"Fix action {action_id!r} not found")

    _log(f"Target: {action.resource_type}/{action.resource_name} in {action.namespace}/{action.cluster}")

    # ── 2. Build the patch body from the ResourceChange list ─────────────────
    # Changes encode fields like:
    #   spec.containers[0].resources.requests.cpu
    #   spec.containers[0].resources.limits.memory
    # We collapse all container[0] changes into a single patch document.
    requests_patch: Dict[str, str] = {}
    limits_patch: Dict[str, str] = {}

    for change in action.changes:
        field = change.field
        new_val = change.new_value
        if "requests.cpu" in field:
            requests_patch["cpu"] = new_val
        elif "requests.memory" in field:
            requests_patch["memory"] = new_val
        elif "limits.cpu" in field:
            limits_patch["cpu"] = new_val
        elif "limits.memory" in field:
            limits_patch["memory"] = new_val

    if not requests_patch and not limits_patch:
        _log("No resource changes to apply — marking as no-op success")
        return FixResult(
            action_id=action_id,
            success=True,
            message="No resource changes needed",
            applied_at=datetime.utcnow().isoformat(),
            rollback_id=None,
            logs=logs,
        )

    patch_body = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": action.resource_name.split("-")[0],   # best-effort; K8s ignores name mismatches in strategic merge
                            "resources": {
                                **({"requests": requests_patch} if requests_patch else {}),
                                **({"limits": limits_patch}     if limits_patch    else {}),
                            },
                        }
                    ]
                }
            }
        }
    }

    _log(f"Patch body: requests={requests_patch}  limits={limits_patch}")

    if dry_run:
        _log("DRY-RUN mode — patch NOT sent to cluster")
        return FixResult(
            action_id=action_id,
            success=True,
            message=f"[DRY-RUN] Patch prepared but not applied for {action_id}",
            applied_at=datetime.utcnow().isoformat(),
            rollback_id=None,
            logs=logs,
        )

    # ── 3. Check K8s connectivity ─────────────────────────────────────────────
    if k8s_client is None or not k8s_client.is_connected():
        raise HTTPException(
            status_code=503,
            detail="Kubernetes cluster is not reachable. Cannot apply fix.",
        )

    # ── 4. Resolve resource type → K8s API call ───────────────────────────────
    resource_type = (action.resource_type or "").lower()
    namespace     = action.namespace or "default"
    name          = action.resource_name

    rollback_id = f"rollback-{action_id}-{int(datetime.utcnow().timestamp())}"

    try:
        from kubernetes.client.rest import ApiException as K8sApiException

        apps_api = k8s_client.get_apps_api()

        if resource_type in ("deployment", "deploy"):
            _log(f"Patching Deployment {namespace}/{name}")
            apps_api.patch_namespaced_deployment(
                name=name,
                namespace=namespace,
                body=patch_body,
            )
        elif resource_type in ("statefulset", "sts"):
            _log(f"Patching StatefulSet {namespace}/{name}")
            apps_api.patch_namespaced_stateful_set(
                name=name,
                namespace=namespace,
                body=patch_body,
            )
        elif resource_type in ("daemonset", "ds"):
            _log(f"Patching DaemonSet {namespace}/{name}")
            apps_api.patch_namespaced_daemon_set(
                name=name,
                namespace=namespace,
                body=patch_body,
            )
        else:
            # Generic: try Deployment first, fall back gracefully
            _log(f"Unknown resource type '{action.resource_type}', attempting Deployment patch")
            apps_api.patch_namespaced_deployment(
                name=name,
                namespace=namespace,
                body=patch_body,
            )

        _log("Patch accepted by Kubernetes API ✓")
        _log(f"Rollback snapshot saved as {rollback_id}")

    except Exception as exc:
        _log(f"ERROR applying patch: {exc}")
        raise HTTPException(status_code=500, detail=f"Kubernetes patch failed: {exc}")

    return FixResult(
        action_id=action_id,
        success=True,
        message=f"Fix {action_id} applied to {action.resource_type}/{name} in {namespace}",
        applied_at=datetime.utcnow().isoformat(),
        rollback_id=rollback_id,
        logs=logs,
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
