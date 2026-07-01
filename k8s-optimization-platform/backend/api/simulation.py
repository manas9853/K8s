"""
Simulation API - Endpoints for interacting with the simulation engine
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime

from services.simulation_engine import simulation_engine

router = APIRouter()


# Models
class FixRequest(BaseModel):
    """Request to apply a fix"""
    resource_id: str
    fix_type: str  # reduce_cpu, reduce_memory, increase_memory, delete, optimize
    new_values: Dict[str, Any]
    user: str = "system"


class RollbackRequest(BaseModel):
    """Request to rollback a change"""
    event_id: str
    user: str = "system"


class ResourceResponse(BaseModel):
    """Resource state response"""
    resource_type: str
    resource_id: str
    cluster: str
    namespace: str
    name: str
    cpu_request: float
    cpu_limit: float
    cpu_usage: float
    memory_request: float
    memory_limit: float
    memory_usage: float
    status: str
    restarts: int
    cost_per_hour: float
    monthly_cost: float
    last_updated: str
    metadata: Dict[str, Any]


class ChangeEventResponse(BaseModel):
    """Change event response"""
    event_id: str
    event_type: str
    resource_type: str
    resource_id: str
    cluster: str
    namespace: str
    changes: Dict[str, Any]
    before_state: Dict[str, Any]
    after_state: Dict[str, Any]
    cost_impact: float
    timestamp: str
    user: str
    reason: str


class GlobalMetricsResponse(BaseModel):
    """Global metrics response"""
    total_clusters: int
    total_pods: int
    current_monthly_cost: float
    baseline_monthly_cost: float
    potential_savings: float
    savings_realized: float
    optimization_percentage: float
    last_updated: str


# Endpoints
@router.get("/resources", response_model=List[ResourceResponse])
async def get_resources(
    cluster: Optional[str] = None,
    namespace: Optional[str] = None,
    status: Optional[str] = None
):
    """
    Get all resources with optional filters
    """
    resources = simulation_engine.get_all_resources(
        cluster=cluster,
        namespace=namespace,
        status=status
    )
    
    return [
        ResourceResponse(
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            cluster=r.cluster,
            namespace=r.namespace,
            name=r.name,
            cpu_request=r.cpu_request,
            cpu_limit=r.cpu_limit,
            cpu_usage=r.cpu_usage,
            memory_request=r.memory_request,
            memory_limit=r.memory_limit,
            memory_usage=r.memory_usage,
            status=r.status,
            restarts=r.restarts,
            cost_per_hour=r.cost_per_hour,
            monthly_cost=r.cost_per_hour * 730,
            last_updated=r.last_updated.isoformat(),
            metadata=r.metadata
        )
        for r in resources
    ]


@router.get("/resources/{resource_id}", response_model=ResourceResponse)
async def get_resource(resource_id: str):
    """
    Get a specific resource by ID
    """
    resource = simulation_engine.get_resource(resource_id)
    
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    return ResourceResponse(
        resource_type=resource.resource_type,
        resource_id=resource.resource_id,
        cluster=resource.cluster,
        namespace=resource.namespace,
        name=resource.name,
        cpu_request=resource.cpu_request,
        cpu_limit=resource.cpu_limit,
        cpu_usage=resource.cpu_usage,
        memory_request=resource.memory_request,
        memory_limit=resource.memory_limit,
        memory_usage=resource.memory_usage,
        status=resource.status,
        restarts=resource.restarts,
        cost_per_hour=resource.cost_per_hour,
        monthly_cost=resource.cost_per_hour * 730,
        last_updated=resource.last_updated.isoformat(),
        metadata=resource.metadata
    )


@router.post("/fix", response_model=ChangeEventResponse)
async def apply_fix(request: FixRequest):
    """
    Apply a fix to a resource
    
    Example:
    {
        "resource_id": "pod-prod-cluster-us-east-0",
        "fix_type": "reduce_cpu",
        "new_values": {
            "cpu_request": 0.5,
            "cpu_limit": 1.0
        },
        "user": "admin"
    }
    """
    try:
        event = simulation_engine.apply_fix(
            resource_id=request.resource_id,
            fix_type=request.fix_type,
            new_values=request.new_values,
            user=request.user
        )
        
        return ChangeEventResponse(
            event_id=event.event_id,
            event_type=event.event_type,
            resource_type=event.resource_type,
            resource_id=event.resource_id,
            cluster=event.cluster,
            namespace=event.namespace,
            changes=event.changes,
            before_state=event.before_state,
            after_state=event.after_state,
            cost_impact=event.cost_impact,
            timestamp=event.timestamp.isoformat(),
            user=event.user,
            reason=event.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rollback", response_model=ChangeEventResponse)
async def rollback_change(request: RollbackRequest):
    """
    Rollback a previous change
    
    Example:
    {
        "event_id": "event-0",
        "user": "admin"
    }
    """
    try:
        event = simulation_engine.rollback_change(
            event_id=request.event_id,
            user=request.user
        )
        
        return ChangeEventResponse(
            event_id=event.event_id,
            event_type=event.event_type,
            resource_type=event.resource_type,
            resource_id=event.resource_id,
            cluster=event.cluster,
            namespace=event.namespace,
            changes=event.changes,
            before_state=event.before_state,
            after_state=event.after_state,
            cost_impact=event.cost_impact,
            timestamp=event.timestamp.isoformat(),
            user=event.user,
            reason=event.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", response_model=List[ChangeEventResponse])
async def get_change_history(limit: int = 100):
    """
    Get recent change history
    """
    events = simulation_engine.get_change_history(limit=limit)
    
    return [
        ChangeEventResponse(
            event_id=e.event_id,
            event_type=e.event_type,
            resource_type=e.resource_type,
            resource_id=e.resource_id,
            cluster=e.cluster,
            namespace=e.namespace,
            changes=e.changes,
            before_state=e.before_state,
            after_state=e.after_state,
            cost_impact=e.cost_impact,
            timestamp=e.timestamp.isoformat(),
            user=e.user,
            reason=e.reason
        )
        for e in events
    ]


@router.get("/metrics/global", response_model=GlobalMetricsResponse)
async def get_global_metrics():
    """
    Get global platform metrics
    """
    metrics = simulation_engine.get_global_metrics()
    
    return GlobalMetricsResponse(**metrics)


@router.get("/metrics/cluster/{cluster}")
async def get_cluster_metrics(cluster: str):
    """
    Get metrics for a specific cluster
    """
    metrics = simulation_engine.get_cluster_metrics(cluster)
    
    if not metrics:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    return metrics


@router.get("/metrics/clusters")
async def get_all_cluster_metrics():
    """
    Get metrics for all clusters
    """
    return simulation_engine.get_cluster_metrics()

# Made with Bob
