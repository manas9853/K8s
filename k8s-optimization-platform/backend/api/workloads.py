"""
Workloads API - Kubernetes workload management endpoints
Reads workload data from agent_metrics stored in Supabase/Postgres (db_manager).
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import logging

from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DeploymentInfo(BaseModel):
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
    created_at: str


class StatefulSetInfo(BaseModel):
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
    created_at: str


class DaemonSetInfo(BaseModel):
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
    created_at: str


class JobInfo(BaseModel):
    name: str
    namespace: str
    completions: Optional[int]
    parallelism: Optional[int]
    active: int
    succeeded: int
    failed: int
    start_time: Optional[str]
    completion_time: Optional[str]
    duration: Optional[str]
    age: str
    labels: Dict[str, str]
    selector: Dict[str, str]
    containers: List[Dict[str, Any]]
    conditions: List[Dict[str, Any]]
    created_at: str


class CronJobInfo(BaseModel):
    name: str
    namespace: str
    schedule: str
    suspend: bool
    active: int
    last_schedule_time: Optional[str]
    last_successful_time: Optional[str]
    age: str
    labels: Dict[str, str]
    job_template: Dict[str, Any]
    created_at: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_workloads_domain(cluster_id: Optional[str] = None) -> dict:
    """Return the workloads JSONB domain from the latest agent_metrics row."""
    if cluster_id:
        cluster_name = cluster_id
    else:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return {}
        cluster_name = clusters[0]["cluster_name"]

    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return {}

    wl = metrics.get("workloads") or {}
    if isinstance(wl, str):
        import json
        wl = json.loads(wl)
    return wl


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/deployments", response_model=List[DeploymentInfo])
async def list_deployments(
    namespace: Optional[str] = Query(None),
    label_selector: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """List Deployments from agent_metrics workloads domain."""
    try:
        wl = _get_workloads_domain(cluster_id)
        items = (wl.get("deployments") or {}).get("items", [])

        result = []
        for d in items:
            if namespace and d.get("namespace") != namespace:
                continue
            result.append(DeploymentInfo(
                name=d.get("name", ""),
                namespace=d.get("namespace", ""),
                replicas_desired=d.get("replicas_desired", 0),
                replicas_current=d.get("replicas_current", 0),
                replicas_ready=d.get("replicas_ready", 0),
                replicas_available=d.get("replicas_available", 0),
                replicas_unavailable=d.get("replicas_unavailable", 0),
                strategy=d.get("strategy", "RollingUpdate"),
                age=d.get("age", ""),
                labels=d.get("labels", {}),
                selector=d.get("selector", {}),
                containers=d.get("containers", []),
                conditions=d.get("conditions", []),
                created_at=d.get("created_at", ""),
            ))
        logger.info(f"Found {len(result)} deployments")
        return result
    except Exception as e:
        logger.error(f"Error fetching deployments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statefulsets", response_model=List[StatefulSetInfo])
async def list_statefulsets(
    namespace: Optional[str] = Query(None),
    label_selector: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """List StatefulSets from agent_metrics workloads domain."""
    try:
        wl = _get_workloads_domain(cluster_id)
        items = (wl.get("statefulsets") or {}).get("items", [])

        result = []
        for s in items:
            if namespace and s.get("namespace") != namespace:
                continue
            result.append(StatefulSetInfo(
                name=s.get("name", ""),
                namespace=s.get("namespace", ""),
                replicas_desired=s.get("replicas_desired", 0),
                replicas_current=s.get("replicas_current", 0),
                replicas_ready=s.get("replicas_ready", 0),
                service_name=s.get("service_name", ""),
                age=s.get("age", ""),
                labels=s.get("labels", {}),
                selector=s.get("selector", {}),
                containers=s.get("containers", []),
                volume_claim_templates=s.get("volume_claim_templates", []),
                created_at=s.get("created_at", ""),
            ))
        logger.info(f"Found {len(result)} statefulsets")
        return result
    except Exception as e:
        logger.error(f"Error fetching statefulsets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/daemonsets", response_model=List[DaemonSetInfo])
async def list_daemonsets(
    namespace: Optional[str] = Query(None),
    label_selector: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """List DaemonSets from agent_metrics workloads domain."""
    try:
        wl = _get_workloads_domain(cluster_id)
        items = (wl.get("daemonsets") or {}).get("items", [])

        result = []
        for ds in items:
            if namespace and ds.get("namespace") != namespace:
                continue
            result.append(DaemonSetInfo(
                name=ds.get("name", ""),
                namespace=ds.get("namespace", ""),
                desired_number_scheduled=ds.get("desired_number_scheduled", 0),
                current_number_scheduled=ds.get("current_number_scheduled", 0),
                number_ready=ds.get("number_ready", 0),
                number_available=ds.get("number_available", 0),
                number_misscheduled=ds.get("number_misscheduled", 0),
                age=ds.get("age", ""),
                labels=ds.get("labels", {}),
                selector=ds.get("selector", {}),
                containers=ds.get("containers", []),
                created_at=ds.get("created_at", ""),
            ))
        logger.info(f"Found {len(result)} daemonsets")
        return result
    except Exception as e:
        logger.error(f"Error fetching daemonsets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs", response_model=List[JobInfo])
async def list_jobs(
    namespace: Optional[str] = Query(None),
    label_selector: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """List Jobs from agent_metrics workloads domain."""
    try:
        wl = _get_workloads_domain(cluster_id)
        items = (wl.get("jobs") or {}).get("items", [])

        result = []
        for j in items:
            if namespace and j.get("namespace") != namespace:
                continue
            result.append(JobInfo(
                name=j.get("name", ""),
                namespace=j.get("namespace", ""),
                completions=j.get("completions"),
                parallelism=j.get("parallelism"),
                active=j.get("active", 0),
                succeeded=j.get("succeeded", 0),
                failed=j.get("failed", 0),
                start_time=j.get("start_time"),
                completion_time=j.get("completion_time"),
                duration=j.get("duration"),
                age=j.get("age", ""),
                labels=j.get("labels", {}),
                selector=j.get("selector", {}),
                containers=j.get("containers", []),
                conditions=j.get("conditions", []),
                created_at=j.get("created_at", ""),
            ))
        logger.info(f"Found {len(result)} jobs")
        return result
    except Exception as e:
        logger.error(f"Error fetching jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cronjobs", response_model=List[CronJobInfo])
async def list_cronjobs(
    namespace: Optional[str] = Query(None),
    label_selector: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """List CronJobs from agent_metrics workloads domain."""
    try:
        wl = _get_workloads_domain(cluster_id)
        items = (wl.get("cronjobs") or {}).get("items", [])

        result = []
        for cj in items:
            if namespace and cj.get("namespace") != namespace:
                continue
            result.append(CronJobInfo(
                name=cj.get("name", ""),
                namespace=cj.get("namespace", ""),
                schedule=cj.get("schedule", ""),
                suspend=cj.get("suspend", False),
                active=cj.get("active", 0),
                last_schedule_time=cj.get("last_schedule_time"),
                last_successful_time=cj.get("last_successful_time"),
                age=cj.get("age", ""),
                labels=cj.get("labels", {}),
                job_template=cj.get("job_template", {}),
                created_at=cj.get("created_at", ""),
            ))
        logger.info(f"Found {len(result)} cronjobs")
        return result
    except Exception as e:
        logger.error(f"Error fetching cronjobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob
