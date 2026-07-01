"""
Agent Receiver API
Receives metrics and heartbeats from remote cluster agents
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging

# Import database manager
from database.db import db_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agent"])


class ClusterRegistration(BaseModel):
    """Cluster registration request"""
    cluster_name: str
    environment: str
    cluster_id: Optional[str] = None
    provider: Optional[str] = "unknown"
    cloud_provider: Optional[str] = None  # legacy alias — mapped to provider
    region: Optional[str] = None
    version: Optional[str] = None
    agent_version: Optional[str] = None


class ClusterMetrics(BaseModel):
    """Cluster metrics from agent"""
    cluster_name: str
    timestamp: str
    nodes: Dict[str, Any]
    namespaces: Dict[str, Any]
    pods: Dict[str, Any]
    resources: Dict[str, Any]


class HeartbeatRequest(BaseModel):
    """Agent heartbeat"""
    cluster_name: str
    timestamp: str
    status: str


def verify_token(authorization: str = Header(None)) -> str:
    """Verify API token from agent"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.replace("Bearer ", "")
    
    # In production, verify token against database
    # For now, accept any non-empty token
    if not token:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return token


@router.post("/register")
async def register_cluster(
    registration: ClusterRegistration,
    token: str = Depends(verify_token)
):
    """
    Register a new cluster with the platform
    Called by agent on startup
    """
    try:
        cluster_name = registration.cluster_name
        # Resolve provider: new agents send `provider`, legacy agents send `cloud_provider`
        resolved_provider = registration.provider or registration.cloud_provider or "unknown"
        resolved_cluster_id = registration.cluster_id or cluster_name

        # Store cluster registration in database
        cluster_data = {
            "cluster_name": cluster_name,
            "environment": registration.environment,
            "cloud_provider": resolved_provider,
            "region": registration.region,
            "version": registration.version,
            "agent_version": registration.agent_version,
            "status": "active"
        }

        success = db_manager.register_cluster(cluster_data)

        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to register cluster"
            )

        logger.info(f"Cluster registered: {cluster_name} (id={resolved_cluster_id})")

        return {
            "status": "success",
            "message": f"Cluster {cluster_name} registered successfully",
            "cluster_id": resolved_cluster_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering cluster: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/metrics")
async def receive_metrics(
    metrics: ClusterMetrics,
    token: str = Depends(verify_token)
):
    """
    Receive metrics from agent
    Called every collection interval (default: 30s)
    """
    try:
        cluster_name = metrics.cluster_name
        
        # Verify cluster is registered
        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(
                status_code=404,
                detail=f"Cluster {cluster_name} not registered"
            )
        
        # Store metrics in database
        metrics_data = {
            "cluster_name": cluster_name,
            "timestamp": metrics.timestamp,
            "nodes": metrics.nodes,
            "namespaces": metrics.namespaces,
            "pods": metrics.pods,
            "resources": metrics.resources
        }
        
        success = db_manager.insert_metrics(metrics_data)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to store metrics"
            )
        
        # Update last seen timestamp
        db_manager.update_cluster_heartbeat(cluster_name, "active")
        
        logger.debug(f"Metrics received from {cluster_name}")
        
        return {
            "status": "success",
            "message": "Metrics received"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/heartbeat")
async def receive_heartbeat(
    heartbeat: HeartbeatRequest,
    token: str = Depends(verify_token)
):
    """
    Receive heartbeat from agent
    Keeps cluster status updated
    """
    try:
        cluster_name = heartbeat.cluster_name
        
        # Verify cluster is registered
        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(
                status_code=404,
                detail=f"Cluster {cluster_name} not registered"
            )
        
        # Update last seen and status in database
        success = db_manager.update_cluster_heartbeat(
            cluster_name,
            heartbeat.status
        )
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update heartbeat"
            )
        
        return {
            "status": "success",
            "message": "Heartbeat received"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving heartbeat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clusters")
async def list_clusters():
    """
    List all registered clusters
    """
    try:
        # Get all clusters from database
        clusters_data = db_manager.get_all_clusters()
        
        clusters = []
        for cluster_info in clusters_data:
            # Get latest metrics if available
            metrics = db_manager.get_latest_metrics(
                cluster_info['cluster_name']
            )
            
            cluster_data = {
                **cluster_info,
                "has_metrics": metrics is not None,
                "metrics_age": None
            }
            
            if metrics:
                # Calculate metrics age
                try:
                    metrics_time = datetime.fromisoformat(
                        metrics["timestamp"].replace('Z', '+00:00')
                    )
                    age_seconds = (
                        datetime.utcnow() - metrics_time.replace(tzinfo=None)
                    ).total_seconds()
                    cluster_data["metrics_age"] = age_seconds
                except Exception:
                    cluster_data["metrics_age"] = None
            
            clusters.append(cluster_data)
        
        return {
            "total_clusters": len(clusters),
            "clusters": clusters
        }
    
    except Exception as e:
        logger.error(f"Error listing clusters: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clusters/{cluster_name}/metrics")
async def get_cluster_metrics(cluster_name: str):
    """
    Get latest metrics for a specific cluster
    """
    try:
        # Verify cluster exists
        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(
                status_code=404,
                detail=f"Cluster {cluster_name} not found"
            )
        
        # Get latest metrics from database
        metrics = db_manager.get_latest_metrics(cluster_name)
        if not metrics:
            raise HTTPException(
                status_code=404,
                detail=f"No metrics available for cluster {cluster_name}"
            )
        
        return metrics
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cluster metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clusters/{cluster_name}/status")
async def get_cluster_status(cluster_name: str):
    """
    Get status of a specific cluster
    """
    try:
        # Get cluster from database
        cluster_info = db_manager.get_cluster(cluster_name)
        if not cluster_info:
            raise HTTPException(
                status_code=404,
                detail=f"Cluster {cluster_name} not found"
            )
        
        # Calculate time since last seen
        last_seen = datetime.fromisoformat(cluster_info["last_seen"])
        seconds_since_seen = (datetime.utcnow() - last_seen).total_seconds()
        
        # Determine health status
        if seconds_since_seen < 60:
            health = "healthy"
        elif seconds_since_seen < 300:
            health = "warning"
        else:
            health = "critical"
        
        return {
            **cluster_info,
            "seconds_since_seen": seconds_since_seen,
            "health": health
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cluster status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clusters/{cluster_name}")
async def unregister_cluster(
    cluster_name: str,
    token: str = Depends(verify_token)
):
    """
    Unregister a cluster
    """
    try:
        # Verify cluster exists
        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(
                status_code=404,
                detail=f"Cluster {cluster_name} not found"
            )
        
        # Delete cluster from database (cascades to metrics)
        success = db_manager.delete_cluster(cluster_name)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to unregister cluster"
            )
        
        logger.info(f"Cluster unregistered: {cluster_name}")
        
        return {
            "status": "success",
            "message": f"Cluster {cluster_name} unregistered"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unregistering cluster: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def agent_receiver_health():
    """
    Health check for agent receiver service
    """
    # Get counts from database
    total_clusters = db_manager.get_cluster_count()
    clusters_with_recent_metrics = len(
        db_manager.get_clusters_with_recent_metrics(max_age_seconds=300)
    )
    
    return {
        "status": "healthy",
        "registered_clusters": total_clusters,
        "clusters_with_metrics": clusters_with_recent_metrics,
        "timestamp": datetime.utcnow().isoformat()
    }

# Made with Bob
