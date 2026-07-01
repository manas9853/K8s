"""
Workloads API - Kubernetes workload management endpoints
Operations > Workloads section with real K8s data
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import logging

# Import Kubernetes client
try:
    from services.k8s_client import k8s_client
    K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()
except Exception as e:
    K8S_AVAILABLE = False
    k8s_client = None
    logging.warning(f"Kubernetes client not available: {e}")

from utils.dummy_data import get_dummy_data

router = APIRouter()
logger = logging.getLogger(__name__)


# Models
class DeploymentInfo(BaseModel):
    """Deployment information model"""
    name: str
    namespace: str
    replicas_desired: int
    replicas_current: int
    replicas_ready: int
    replicas_available: int
    replicas_unavailable: int
    strategy: str
    age: str
    labels: Dict[str, str]
    selector: Dict[str, str]
    containers: List[Dict[str, Any]]
    conditions: List[Dict[str, Any]]
    created_at: datetime


class StatefulSetInfo(BaseModel):
    """StatefulSet information model"""
    name: str
    namespace: str
    replicas_desired: int
    replicas_current: int
    replicas_ready: int
    service_name: str
    age: str
    labels: Dict[str, str]
    selector: Dict[str, str]
    containers: List[Dict[str, Any]]
    volume_claim_templates: List[Dict[str, Any]]
    created_at: datetime


class DaemonSetInfo(BaseModel):
    """DaemonSet information model"""
    name: str
    namespace: str
    desired_number_scheduled: int
    current_number_scheduled: int
    number_ready: int
    number_available: int
    number_misscheduled: int
    age: str
    labels: Dict[str, str]
    selector: Dict[str, str]
    containers: List[Dict[str, Any]]
    created_at: datetime


class JobInfo(BaseModel):
    """Job information model"""
    name: str
    namespace: str
    completions: Optional[int]
    parallelism: Optional[int]
    active: int
    succeeded: int
    failed: int
    start_time: Optional[datetime]
    completion_time: Optional[datetime]
    duration: Optional[str]
    age: str
    labels: Dict[str, str]
    selector: Dict[str, str]
    containers: List[Dict[str, Any]]
    conditions: List[Dict[str, Any]]
    created_at: datetime


class CronJobInfo(BaseModel):
    """CronJob information model"""
    name: str
    namespace: str
    schedule: str
    suspend: bool
    active: int
    last_schedule_time: Optional[datetime]
    last_successful_time: Optional[datetime]
    age: str
    labels: Dict[str, str]
    job_template: Dict[str, Any]
    created_at: datetime


# Helper functions
def _calculate_age(created_at: datetime) -> str:
    """Calculate age from creation timestamp"""
    if not created_at:
        return "Unknown"
    
    now = datetime.now(created_at.tzinfo)
    delta = now - created_at
    
    days = delta.days
    hours = delta.seconds // 3600
    minutes = (delta.seconds % 3600) // 60
    
    if days > 0:
        return f"{days}d"
    elif hours > 0:
        return f"{hours}h"
    else:
        return f"{minutes}m"


def _extract_containers(pod_spec) -> List[Dict[str, Any]]:
    """Extract container information from pod spec"""
    containers = []
    for container in pod_spec.containers:
        container_info = {
            "name": container.name,
            "image": container.image,
            "ports": [{"containerPort": p.container_port, "protocol": p.protocol} 
                     for p in (container.ports or [])],
            "resources": {}
        }
        
        if container.resources:
            if container.resources.requests:
                container_info["resources"]["requests"] = dict(container.resources.requests)
            if container.resources.limits:
                container_info["resources"]["limits"] = dict(container.resources.limits)
        
        containers.append(container_info)
    
    return containers


# Endpoints

@router.get("/deployments", response_model=List[DeploymentInfo])
async def list_deployments(
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector"),
    cluster_id: Optional[str] = Query(None, description="Filter by cluster ID"),
):
    """
    List all Deployments from the real Kubernetes cluster.
    Falls back to generated data when Kubernetes is not connected.
    """
    if not K8S_AVAILABLE or k8s_client is None:
        return get_dummy_data("deployments", cluster_id)
    
    try:
        apps_v1 = k8s_client.get_apps_api()
        
        # Get deployments
        if namespace:
            deployments = apps_v1.list_namespaced_deployment(
                namespace=namespace,
                label_selector=label_selector
            )
        else:
            deployments = apps_v1.list_deployment_for_all_namespaces(
                label_selector=label_selector
            )
        
        result = []
        for deploy in deployments.items:
            age = _calculate_age(deploy.metadata.creation_timestamp)
            
            # Extract conditions
            conditions = []
            if deploy.status.conditions:
                for cond in deploy.status.conditions:
                    conditions.append({
                        "type": cond.type,
                        "status": cond.status,
                        "reason": cond.reason,
                        "message": cond.message,
                        "last_update_time": cond.last_update_time
                    })
            
            # Extract containers
            containers = _extract_containers(deploy.spec.template.spec)
            
            deployment_info = DeploymentInfo(
                name=deploy.metadata.name,
                namespace=deploy.metadata.namespace,
                replicas_desired=deploy.spec.replicas or 0,
                replicas_current=deploy.status.replicas or 0,
                replicas_ready=deploy.status.ready_replicas or 0,
                replicas_available=deploy.status.available_replicas or 0,
                replicas_unavailable=deploy.status.unavailable_replicas or 0,
                strategy=deploy.spec.strategy.type if deploy.spec.strategy else "RollingUpdate",
                age=age,
                labels=deploy.metadata.labels or {},
                selector=deploy.spec.selector.match_labels or {},
                containers=containers,
                conditions=conditions,
                created_at=deploy.metadata.creation_timestamp
            )
            result.append(deployment_info)
        
        logger.info(f"Found {len(result)} deployments")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching deployments: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching deployments: {str(e)}")


@router.get("/statefulsets", response_model=List[StatefulSetInfo])
async def list_statefulsets(
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector"),
    cluster_id: Optional[str] = Query(None, description="Filter by cluster ID"),
):
    """List all StatefulSets from the real Kubernetes cluster."""
    if not K8S_AVAILABLE or k8s_client is None:
        return get_dummy_data("statefulsets", cluster_id)
    
    try:
        apps_v1 = k8s_client.get_apps_api()
        
        # Get statefulsets
        if namespace:
            statefulsets = apps_v1.list_namespaced_stateful_set(
                namespace=namespace,
                label_selector=label_selector
            )
        else:
            statefulsets = apps_v1.list_stateful_set_for_all_namespaces(
                label_selector=label_selector
            )
        
        result = []
        for sts in statefulsets.items:
            age = _calculate_age(sts.metadata.creation_timestamp)
            
            # Extract containers
            containers = _extract_containers(sts.spec.template.spec)
            
            # Extract volume claim templates
            volume_claims = []
            if sts.spec.volume_claim_templates:
                for vct in sts.spec.volume_claim_templates:
                    volume_claims.append({
                        "name": vct.metadata.name,
                        "storage_class": vct.spec.storage_class_name,
                        "access_modes": vct.spec.access_modes,
                        "storage": vct.spec.resources.requests.get("storage") if vct.spec.resources and vct.spec.resources.requests else None
                    })
            
            statefulset_info = StatefulSetInfo(
                name=sts.metadata.name,
                namespace=sts.metadata.namespace,
                replicas_desired=sts.spec.replicas or 0,
                replicas_current=sts.status.replicas or 0,
                replicas_ready=sts.status.ready_replicas or 0,
                service_name=sts.spec.service_name,
                age=age,
                labels=sts.metadata.labels or {},
                selector=sts.spec.selector.match_labels or {},
                containers=containers,
                volume_claim_templates=volume_claims,
                created_at=sts.metadata.creation_timestamp
            )
            result.append(statefulset_info)
        
        logger.info(f"Found {len(result)} statefulsets")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching statefulsets: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching statefulsets: {str(e)}")


@router.get("/daemonsets", response_model=List[DaemonSetInfo])
async def list_daemonsets(
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector"),
    cluster_id: Optional[str] = Query(None, description="Filter by cluster ID"),
):
    """List all DaemonSets from the real Kubernetes cluster."""
    if not K8S_AVAILABLE or k8s_client is None:
        return get_dummy_data("daemonsets", cluster_id)
    
    try:
        apps_v1 = k8s_client.get_apps_api()
        
        # Get daemonsets
        if namespace:
            daemonsets = apps_v1.list_namespaced_daemon_set(
                namespace=namespace,
                label_selector=label_selector
            )
        else:
            daemonsets = apps_v1.list_daemon_set_for_all_namespaces(
                label_selector=label_selector
            )
        
        result = []
        for ds in daemonsets.items:
            age = _calculate_age(ds.metadata.creation_timestamp)
            
            # Extract containers
            containers = _extract_containers(ds.spec.template.spec)
            
            daemonset_info = DaemonSetInfo(
                name=ds.metadata.name,
                namespace=ds.metadata.namespace,
                desired_number_scheduled=ds.status.desired_number_scheduled or 0,
                current_number_scheduled=ds.status.current_number_scheduled or 0,
                number_ready=ds.status.number_ready or 0,
                number_available=ds.status.number_available or 0,
                number_misscheduled=ds.status.number_misscheduled or 0,
                age=age,
                labels=ds.metadata.labels or {},
                selector=ds.spec.selector.match_labels or {},
                containers=containers,
                created_at=ds.metadata.creation_timestamp
            )
            result.append(daemonset_info)
        
        logger.info(f"Found {len(result)} daemonsets")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching daemonsets: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching daemonsets: {str(e)}")


@router.get("/jobs", response_model=List[JobInfo])
async def list_jobs(
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector"),
    cluster_id: Optional[str] = Query(None, description="Filter by cluster ID"),
):
    """List all Jobs from the real Kubernetes cluster."""
    if not K8S_AVAILABLE or k8s_client is None:
        return get_dummy_data("jobs", cluster_id)
    
    try:
        batch_v1 = k8s_client.get_batch_api()
        
        # Get jobs
        if namespace:
            jobs = batch_v1.list_namespaced_job(
                namespace=namespace,
                label_selector=label_selector
            )
        else:
            jobs = batch_v1.list_job_for_all_namespaces(
                label_selector=label_selector
            )
        
        result = []
        for job in jobs.items:
            age = _calculate_age(job.metadata.creation_timestamp)
            
            # Calculate duration
            duration = None
            if job.status.start_time and job.status.completion_time:
                delta = job.status.completion_time - job.status.start_time
                duration = f"{delta.seconds}s"
            
            # Extract conditions
            conditions = []
            if job.status.conditions:
                for cond in job.status.conditions:
                    conditions.append({
                        "type": cond.type,
                        "status": cond.status,
                        "reason": cond.reason,
                        "message": cond.message,
                        "last_transition_time": cond.last_transition_time
                    })
            
            # Extract containers
            containers = _extract_containers(job.spec.template.spec)
            
            job_info = JobInfo(
                name=job.metadata.name,
                namespace=job.metadata.namespace,
                completions=job.spec.completions,
                parallelism=job.spec.parallelism,
                active=job.status.active or 0,
                succeeded=job.status.succeeded or 0,
                failed=job.status.failed or 0,
                start_time=job.status.start_time,
                completion_time=job.status.completion_time,
                duration=duration,
                age=age,
                labels=job.metadata.labels or {},
                selector=job.spec.selector.match_labels or {} if job.spec.selector else {},
                containers=containers,
                conditions=conditions,
                created_at=job.metadata.creation_timestamp
            )
            result.append(job_info)
        
        logger.info(f"Found {len(result)} jobs")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching jobs: {str(e)}")


@router.get("/cronjobs", response_model=List[CronJobInfo])
async def list_cronjobs(
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector"),
    cluster_id: Optional[str] = Query(None, description="Filter by cluster ID"),
):
    """List all CronJobs from the real Kubernetes cluster."""
    if not K8S_AVAILABLE or k8s_client is None:
        return get_dummy_data("cronjobs", cluster_id)
    
    try:
        batch_v1 = k8s_client.get_batch_api()
        
        # Get cronjobs
        if namespace:
            cronjobs = batch_v1.list_namespaced_cron_job(
                namespace=namespace,
                label_selector=label_selector
            )
        else:
            cronjobs = batch_v1.list_cron_job_for_all_namespaces(
                label_selector=label_selector
            )
        
        result = []
        for cj in cronjobs.items:
            age = _calculate_age(cj.metadata.creation_timestamp)
            
            # Extract job template info
            job_template = {
                "completions": cj.spec.job_template.spec.completions,
                "parallelism": cj.spec.job_template.spec.parallelism,
                "backoff_limit": cj.spec.job_template.spec.backoff_limit,
                "containers": _extract_containers(cj.spec.job_template.spec.template.spec)
            }
            
            cronjob_info = CronJobInfo(
                name=cj.metadata.name,
                namespace=cj.metadata.namespace,
                schedule=cj.spec.schedule,
                suspend=cj.spec.suspend or False,
                active=len(cj.status.active) if cj.status.active else 0,
                last_schedule_time=cj.status.last_schedule_time,
                last_successful_time=cj.status.last_successful_time,
                age=age,
                labels=cj.metadata.labels or {},
                job_template=job_template,
                created_at=cj.metadata.creation_timestamp
            )
            result.append(cronjob_info)
        
        logger.info(f"Found {len(result)} cronjobs")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching cronjobs: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching cronjobs: {str(e)}")


# Made with Bob
