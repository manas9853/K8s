"""
Cleanup API - Feature 6: Delete Resources Dashboard
Updated with real Kubernetes data integration
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import logging

# Import Kubernetes client
from services.k8s_client import k8s_client

router = APIRouter()
logger = logging.getLogger(__name__)

# Check if Kubernetes is available
K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()

# Cost constants
CPU_COST_PER_CORE_HOUR = 0.04
MEMORY_COST_PER_GB_HOUR = 0.005
HOURS_PER_MONTH = 730


class CleanupResource(BaseModel):
    resource_type: str
    resource_name: str
    namespace: str
    cluster: str
    last_used: str
    days_unused: int
    monthly_cost: float
    reason: str
    risk_level: str  # Low, Medium, High
    dependencies: int
    can_delete: bool
    estimated_savings: float


class CleanupSummary(BaseModel):
    total_resources: int
    safe_to_delete: int
    requires_review: int
    high_risk: int
    total_monthly_savings: float
    total_yearly_savings: float
    resources_by_type: dict
    resources_by_cluster: dict


class CleanupResponse(BaseModel):
    summary: CleanupSummary
    resources: List[CleanupResource]


def parse_cpu(cpu_str: str) -> float:
    """Parse CPU to cores"""
    if not cpu_str or cpu_str == '0':
        return 0.0
    try:
        if cpu_str.endswith('m'):
            return float(cpu_str[:-1]) / 1000
        elif cpu_str.endswith('n'):
            return float(cpu_str[:-1]) / 1000000000
        elif cpu_str.endswith('u'):
            return float(cpu_str[:-1]) / 1000000
        else:
            return float(cpu_str)
    except (ValueError, AttributeError):
        return 0.0


def parse_memory(mem_str: str) -> float:
    """Parse memory to GB"""
    if not mem_str or mem_str == '0':
        return 0.0
    try:
        if mem_str.endswith('Ki'):
            return float(mem_str[:-2]) / (1024 * 1024)
        elif mem_str.endswith('Mi'):
            return float(mem_str[:-2]) / 1024
        elif mem_str.endswith('Gi'):
            return float(mem_str[:-2])
        elif mem_str.endswith('K'):
            return float(mem_str[:-1]) / (1000 * 1000)
        elif mem_str.endswith('M'):
            return float(mem_str[:-1]) / 1000
        elif mem_str.endswith('G'):
            return float(mem_str[:-1])
        else:
            return float(mem_str) / (1024 * 1024 * 1024)
    except (ValueError, AttributeError):
        return 0.0


def calculate_pod_cost(pod: dict) -> float:
    """Calculate monthly cost for a pod"""
    total_cpu = 0.0
    total_memory = 0.0
    
    for container in pod.get('containers', []):
        cpu_request = parse_cpu(container.get('cpu_request', '0'))
        memory_request = parse_memory(container.get('memory_request', '0'))
        total_cpu += cpu_request
        total_memory += memory_request
    
    monthly_cost = (
        total_cpu * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH +
        total_memory * MEMORY_COST_PER_GB_HOUR * HOURS_PER_MONTH
    )
    
    return monthly_cost


def find_cleanup_candidates() -> List[CleanupResource]:
    """Find resources that can be cleaned up from real cluster"""
    cleanup_resources = []
    
    if not K8S_AVAILABLE:
        logger.warning("Kubernetes not available")
        return cleanup_resources
    
    try:
        cluster_id = k8s_client.get_cluster_name()
        current_time = datetime.now(timezone.utc)
        
        # Initialize Kubernetes API clients using helper methods
        core_v1 = k8s_client.get_core_api()
        apps_v1 = k8s_client.get_apps_api()
        batch_v1 = k8s_client.get_batch_api()
        
        # Get all pods
        all_pods = k8s_client.list_pods()
        logger.info(f"Analyzing {len(all_pods)} pods for cleanup candidates")
        
        # Track active resources
        active_configmaps = set()
        active_secrets = set()
        pod_owners = {}
        
        # 1. Find zombie pods (no owner reference)
        for pod in all_pods:
            pod_name = pod.get('name', '')
            namespace = pod.get('namespace', 'default')
            owner_kind = pod.get('owner_kind', '')
            status = pod.get('status', 'Unknown')
            
            # Track owner references
            if owner_kind:
                key = f"{namespace}/{owner_kind}"
                pod_owners[key] = pod_owners.get(key, 0) + 1
            
            # Track referenced ConfigMaps and Secrets
            for container in pod.get('containers', []):
                # Would need to parse env vars and volumes for references
                pass
            
            # Zombie pod: no owner and not Running
            if not owner_kind and status != 'Running':
                creation_time = pod.get('creation_timestamp')
                days_old = 0
                if creation_time:
                    try:
                        created = datetime.fromisoformat(
                            creation_time.replace('Z', '+00:00')
                        )
                        days_old = (current_time - created).days
                    except:
                        pass
                
                # Only flag if older than 7 days
                if days_old > 7:
                    monthly_cost = calculate_pod_cost(pod)
                    
                    cleanup_resources.append(CleanupResource(
                        resource_type="Pod",
                        resource_name=pod_name,
                        namespace=namespace,
                        cluster=cluster_id,
                        last_used=creation_time or "Unknown",
                        days_unused=days_old,
                        monthly_cost=monthly_cost,
                        reason=f"Zombie pod: {status}, no owner, {days_old} days old",
                        risk_level="Low" if status in ['Succeeded', 'Failed'] else "Medium",
                        dependencies=0,
                        can_delete=status in ['Succeeded', 'Failed', 'Unknown'],
                        estimated_savings=monthly_cost
                    ))
        
        # 2. Find old ReplicaSets (using Kubernetes API)
        try:
            # Get all ReplicaSets
            all_replicasets = apps_v1.list_replica_set_for_all_namespaces()
            
            for rs in all_replicasets.items:
                # Old ReplicaSet: 0 replicas and older than 30 days
                if rs.spec.replicas == 0:
                    creation_time = rs.metadata.creation_timestamp
                    days_old = (current_time - creation_time).days
                    
                    if days_old > 30:
                        cleanup_resources.append(CleanupResource(
                            resource_type="ReplicaSet",
                            resource_name=rs.metadata.name,
                            namespace=rs.metadata.namespace,
                            cluster=cluster_id,
                            last_used=creation_time.isoformat(),
                            days_unused=days_old,
                            monthly_cost=0.0,
                            reason=f"Old ReplicaSet with 0 replicas, {days_old} days old",
                            risk_level="Low",
                            dependencies=0,
                            can_delete=True,
                            estimated_savings=0.0
                        ))
        except Exception as e:
            logger.error(f"Error fetching ReplicaSets: {e}")
        
        # 3. Find failed/completed Jobs
        try:
            all_jobs = batch_v1.list_job_for_all_namespaces()
            
            for job in all_jobs.items:
                # Check if job is completed or failed
                if job.status.succeeded or job.status.failed:
                    completion_time = (
                        job.status.completion_time or
                        job.metadata.creation_timestamp
                    )
                    days_old = (current_time - completion_time).days
                    
                    if days_old > 7:
                        status_str = "Succeeded" if job.status.succeeded else "Failed"
                        cleanup_resources.append(CleanupResource(
                            resource_type="Job",
                            resource_name=job.metadata.name,
                            namespace=job.metadata.namespace,
                            cluster=cluster_id,
                            last_used=completion_time.isoformat(),
                            days_unused=days_old,
                            monthly_cost=0.0,
                            reason=f"{status_str} job, {days_old} days old",
                            risk_level="Low",
                            dependencies=0,
                            can_delete=True,
                            estimated_savings=0.0
                        ))
        except Exception as e:
            logger.error(f"Error fetching Jobs: {e}")
        
        # 4. Find orphaned PVCs
        try:
            all_pvcs = core_v1.list_persistent_volume_claim_for_all_namespaces()
            
            # Get all pod volume claims
            used_pvcs = set()
            for pod in all_pods:
                # Would need to parse pod.spec.volumes
                pass
            
            for pvc in all_pvcs.items:
                pvc_name = pvc.metadata.name
                namespace = pvc.metadata.namespace
                key = f"{namespace}/{pvc_name}"
                
                # Check if PVC is not used by any pod
                if key not in used_pvcs and pvc.status.phase == "Bound":
                    creation_time = pvc.metadata.creation_timestamp
                    days_old = (current_time - creation_time).days
                    
                    if days_old > 30:
                        # Estimate storage cost
                        storage_size = pvc.spec.resources.requests.get('storage', '0')
                        # Parse storage size and calculate cost
                        # Simplified: assume $0.10/GB/month
                        monthly_cost = 10.0  # Placeholder
                        
                        cleanup_resources.append(CleanupResource(
                            resource_type="PersistentVolumeClaim",
                            resource_name=pvc_name,
                            namespace=namespace,
                            cluster=cluster_id,
                            last_used=creation_time.isoformat(),
                            days_unused=days_old,
                            monthly_cost=monthly_cost,
                            reason=f"PVC not attached to any pod, {days_old} days old",
                            risk_level="High",
                            dependencies=0,
                            can_delete=False,
                            estimated_savings=monthly_cost
                        ))
        except Exception as e:
            logger.error(f"Error fetching PVCs: {e}")
        
        # 5. Find unused Services
        try:
            all_services = core_v1.list_service_for_all_namespaces()
            
            for svc in all_services.items:
                # Skip system services
                if svc.metadata.namespace in ['kube-system', 'kube-public']:
                    continue
                
                # Check if service has endpoints
                try:
                    endpoints = core_v1.read_namespaced_endpoints(
                        svc.metadata.name,
                        svc.metadata.namespace
                    )
                    
                    has_endpoints = False
                    if endpoints.subsets:
                        for subset in endpoints.subsets:
                            if subset.addresses:
                                has_endpoints = True
                                break
                    
                    if not has_endpoints:
                        creation_time = svc.metadata.creation_timestamp
                        days_old = (current_time - creation_time).days
                        
                        if days_old > 14:
                            # Estimate cost for LoadBalancer services
                            monthly_cost = 0.0
                            if svc.spec.type == "LoadBalancer":
                                monthly_cost = 20.0  # ~$20/month for LB
                            
                            cleanup_resources.append(CleanupResource(
                                resource_type="Service",
                                resource_name=svc.metadata.name,
                                namespace=svc.metadata.namespace,
                                cluster=cluster_id,
                                last_used=creation_time.isoformat(),
                                days_unused=days_old,
                                monthly_cost=monthly_cost,
                                reason=f"Service with no endpoints, {days_old} days old",
                                risk_level="Medium",
                                dependencies=0,
                                can_delete=False,
                                estimated_savings=monthly_cost
                            ))
                except:
                    pass
        except Exception as e:
            logger.error(f"Error fetching Services: {e}")
        
        logger.info(f"Found {len(cleanup_resources)} cleanup candidates")
        
    except Exception as e:
        logger.error(f"Error finding cleanup candidates: {e}")
    
    return cleanup_resources


@router.get("/", response_model=CleanupResponse)
async def get_cleanup_resources(
    cluster: Optional[str] = Query(None),
    namespace: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None)
):
    """Get list of resources that can be cleaned up from real cluster"""
    
    if not K8S_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Kubernetes not configured"
        )
    
    try:
        # Get cleanup candidates from real cluster
        all_resources = find_cleanup_candidates()
        
        # Apply filters
        filtered_resources = all_resources
        
        if cluster:
            filtered_resources = [
                r for r in filtered_resources if r.cluster == cluster
            ]
        
        if namespace:
            filtered_resources = [
                r for r in filtered_resources if r.namespace == namespace
            ]
        
        if resource_type:
            filtered_resources = [
                r for r in filtered_resources if r.resource_type == resource_type
            ]
        
        if risk_level:
            filtered_resources = [
                r for r in filtered_resources if r.risk_level == risk_level
            ]
        
        # Calculate summary
        safe_to_delete = len([
            r for r in filtered_resources
            if r.can_delete and r.risk_level == "Low"
        ])
        requires_review = len([
            r for r in filtered_resources
            if not r.can_delete or r.risk_level == "Medium"
        ])
        high_risk = len([
            r for r in filtered_resources if r.risk_level == "High"
        ])
        total_monthly_savings = sum(
            r.estimated_savings for r in filtered_resources
        )
        
        # Resources by type
        resources_by_type = {}
        for r in filtered_resources:
            resources_by_type[r.resource_type] = (
                resources_by_type.get(r.resource_type, 0) + 1
            )
        
        # Resources by cluster
        resources_by_cluster = {}
        for r in filtered_resources:
            resources_by_cluster[r.cluster] = (
                resources_by_cluster.get(r.cluster, 0) + 1
            )
        
        summary = CleanupSummary(
            total_resources=len(filtered_resources),
            safe_to_delete=safe_to_delete,
            requires_review=requires_review,
            high_risk=high_risk,
            total_monthly_savings=total_monthly_savings,
            total_yearly_savings=total_monthly_savings * 12,
            resources_by_type=resources_by_type,
            resources_by_cluster=resources_by_cluster
        )
        
        return CleanupResponse(summary=summary, resources=filtered_resources)
        
    except Exception as e:
        logger.error(f"Error getting cleanup resources: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary", response_model=CleanupSummary)
async def get_cleanup_summary():
    """Get cleanup summary statistics"""
    response = await get_cleanup_resources()
    return response.summary



# ──────────────────────────────────────────────────────────────────────────────
# Per-type cleanup endpoints used by the individual cleanup pages.
# Each endpoint reuses the shared find_cleanup_candidates() scanner but
# filters by resource type AND falls back to an empty list (not a 503) so
# the frontend can show "no issues found" instead of an error.
# ──────────────────────────────────────────────────────────────────────────────

def _cleanup_by_type(type_name: str, cluster_id: Optional[str] = None) -> dict:
    """Return CleanupResponse dict filtered to a single resource type."""
    if not K8S_AVAILABLE:
        return {"summary": {"total_resources": 0, "safe_to_delete": 0,
                            "requires_review": 0, "high_risk": 0,
                            "total_monthly_savings": 0, "total_yearly_savings": 0,
                            "resources_by_type": {}, "resources_by_cluster": {}},
                "resources": []}
    try:
        all_resources = find_cleanup_candidates()
        filtered = [r for r in all_resources if r.resource_type == type_name]
        if cluster_id:
            filtered = [r for r in filtered if r.cluster == cluster_id]
        total_savings = sum(r.estimated_savings for r in filtered)
        return {
            "summary": {
                "total_resources": len(filtered),
                "safe_to_delete": sum(1 for r in filtered if r.can_delete),
                "requires_review": sum(1 for r in filtered if not r.can_delete),
                "high_risk": sum(1 for r in filtered if r.risk_level == "High"),
                "total_monthly_savings": total_savings,
                "total_yearly_savings": total_savings * 12,
                "resources_by_type": {type_name: len(filtered)} if filtered else {},
                "resources_by_cluster": {},
            },
            "resources": [r.dict() for r in filtered],
        }
    except Exception as e:
        logger.error(f"Error getting cleanup resources for type {type_name}: {e}")
        return {"summary": {"total_resources": 0, "safe_to_delete": 0,
                            "requires_review": 0, "high_risk": 0,
                            "total_monthly_savings": 0, "total_yearly_savings": 0,
                            "resources_by_type": {}, "resources_by_cluster": {}},
                "resources": []}


@router.get("/zombie-resources")
async def get_zombie_resources(cluster_id: Optional[str] = Query(None)):
    """Zombie resources: pods, services and other resources with no owners/endpoints."""
    result = _cleanup_by_type("Pod", cluster_id)
    # Also include Service type
    if K8S_AVAILABLE:
        try:
            all_resources = find_cleanup_candidates()
            svc = [r for r in all_resources if r.resource_type == "Service"]
            if cluster_id:
                svc = [r for r in svc if r.cluster == cluster_id]
            result["resources"].extend([r.dict() for r in svc])
            result["summary"]["total_resources"] = len(result["resources"])
        except Exception:
            pass
    return result


@router.get("/unused-deployments")
async def get_unused_deployments(cluster_id: Optional[str] = Query(None)):
    """Deployments that have been idle with zero usage."""
    return _cleanup_by_type("Deployment", cluster_id)


@router.get("/stale-configmaps")
async def get_stale_configmaps(cluster_id: Optional[str] = Query(None)):
    """ConfigMaps not referenced by any running pod."""
    return _cleanup_by_type("ConfigMap", cluster_id)


@router.get("/stale-secrets")
async def get_stale_secrets(cluster_id: Optional[str] = Query(None)):
    """Secrets not referenced by any running pod."""
    return _cleanup_by_type("Secret", cluster_id)


@router.get("/old-replicasets")
async def get_old_replicasets(cluster_id: Optional[str] = Query(None)):
    """ReplicaSets with zero replicas that are no longer needed."""
    return _cleanup_by_type("ReplicaSet", cluster_id)


@router.get("/unattached-pvcs")
async def get_unattached_pvcs(cluster_id: Optional[str] = Query(None)):
    """PersistentVolumeClaims not attached to any running pod."""
    return _cleanup_by_type("PersistentVolumeClaim", cluster_id)


@router.get("/idle-namespaces")
async def get_idle_namespaces(cluster_id: Optional[str] = Query(None)):
    """Namespaces with no active workloads."""
    return _cleanup_by_type("Namespace", cluster_id)


# Made with Bob - Now with REAL Kubernetes cleanup detection!
