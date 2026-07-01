"""
Agent Receiver API
Receives metrics and heartbeats from remote cluster agents.
Supports both basic (v1) and comprehensive (v2) agent payloads.
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging

from database.db import db_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agent"])


class ClusterRegistration(BaseModel):
    cluster_name: str
    environment: str
    cluster_id: Optional[str] = None
    provider: Optional[str] = "unknown"
    cloud_provider: Optional[str] = None   # legacy alias
    region: Optional[str] = None
    version: Optional[str] = None
    agent_version: Optional[str] = None


class ClusterMetrics(BaseModel):
    """Accepts both basic (v1) and comprehensive (v2) agent payloads."""
    cluster_name: str
    timestamp: str
    # Core domains — always present
    nodes: Dict[str, Any] = {}
    namespaces: Dict[str, Any] = {}
    pods: Dict[str, Any] = {}
    resources: Dict[str, Any] = {}
    # Extended v2 domains
    cluster_id: Optional[str] = None
    collection_type: Optional[str] = None
    agent_version: Optional[str] = None
    provider: Optional[str] = None
    region: Optional[str] = None
    k8s_version: Optional[str] = None
    environment: Optional[str] = None
    workloads: Optional[Dict[str, Any]] = None
    storage: Optional[Dict[str, Any]] = None
    network: Optional[Dict[str, Any]] = None
    security: Optional[Dict[str, Any]] = None
    compliance: Optional[Dict[str, Any]] = None
    observability: Optional[Dict[str, Any]] = None
    finops: Optional[Dict[str, Any]] = None
    platform: Optional[Dict[str, Any]] = None
    teams: Optional[Dict[str, Any]] = None
    hpa: Optional[Dict[str, Any]] = None
    pdb: Optional[Dict[str, Any]] = None
    service_accounts: Optional[List[Any]] = None


class HeartbeatRequest(BaseModel):
    cluster_name: str
    timestamp: str
    status: str
    cluster_id: Optional[str] = None


def verify_token(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    token = authorization.replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


# ── /register ────────────────────────────────────────────────────────────────

@router.post("/register")
async def register_cluster(
    registration: ClusterRegistration,
    token: str = Depends(verify_token),
):
    try:
        cluster_name = registration.cluster_name
        resolved_provider = registration.provider or registration.cloud_provider or "unknown"
        resolved_cluster_id = registration.cluster_id or cluster_name

        success = db_manager.register_cluster({
            "cluster_name":   cluster_name,
            "environment":    registration.environment,
            "cloud_provider": resolved_provider,
            "region":         registration.region,
            "version":        registration.version,
            "agent_version":  registration.agent_version,
            "status":         "active",
        })

        if not success:
            raise HTTPException(status_code=500, detail="Failed to register cluster")

        logger.info(f"Cluster registered: {cluster_name} (id={resolved_cluster_id})")
        return {
            "status":     "success",
            "message":    f"Cluster {cluster_name} registered successfully",
            "cluster_id": resolved_cluster_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering cluster: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── /metrics ─────────────────────────────────────────────────────────────────

@router.post("/metrics")
async def receive_metrics(
    metrics: ClusterMetrics,
    token: str = Depends(verify_token),
):
    try:
        cluster_name = metrics.cluster_name

        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not registered")

        metrics_data = {
            "cluster_name":    cluster_name,
            "timestamp":       metrics.timestamp,
            # Core
            "nodes":           metrics.nodes,
            "namespaces":      metrics.namespaces,
            "pods":            metrics.pods,
            "resources":       metrics.resources,
            # Extended domains (None values are skipped by db.insert_metrics)
            "workloads":       metrics.workloads,
            "storage":         metrics.storage,
            "network":         metrics.network,
            "security":        metrics.security,
            "compliance":      metrics.compliance,
            "observability":   metrics.observability,
            "finops":          metrics.finops,
            "platform":        metrics.platform,
            "teams":           metrics.teams,
            "hpa":             metrics.hpa,
            "pdb":             metrics.pdb,
            "service_accounts": metrics.service_accounts,
            # Scalar metadata
            "agent_version":   metrics.agent_version,
            "collection_type": metrics.collection_type,
            "k8s_version":     metrics.k8s_version,
            "provider":        metrics.provider,
            "region":          metrics.region,
        }

        if not db_manager.insert_metrics(metrics_data):
            raise HTTPException(status_code=500, detail="Failed to store metrics")

        db_manager.update_cluster_heartbeat(cluster_name, "active")
        logger.debug(f"Metrics received from {cluster_name} (agent_v={metrics.agent_version})")
        return {"status": "success", "message": "Metrics received"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── /heartbeat ───────────────────────────────────────────────────────────────

@router.post("/heartbeat")
async def receive_heartbeat(
    heartbeat: HeartbeatRequest,
    token: str = Depends(verify_token),
):
    try:
        cluster_name = heartbeat.cluster_name
        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not registered")

        if not db_manager.update_cluster_heartbeat(cluster_name, heartbeat.status):
            raise HTTPException(status_code=500, detail="Failed to update heartbeat")

        return {"status": "success", "message": "Heartbeat received"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving heartbeat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── /clusters ────────────────────────────────────────────────────────────────

@router.get("/clusters")
async def list_clusters():
    try:
        clusters_data = db_manager.get_all_clusters()
        clusters = []
        for info in clusters_data:
            m = db_manager.get_latest_metrics(info['cluster_name'])
            entry = {**info, "has_metrics": m is not None, "metrics_age": None}
            if m:
                try:
                    mt = datetime.fromisoformat(m["timestamp"].replace('Z', '+00:00'))
                    entry["metrics_age"] = (datetime.utcnow() - mt.replace(tzinfo=None)).total_seconds()
                except Exception:
                    pass
            clusters.append(entry)
        return {"total_clusters": len(clusters), "clusters": clusters}
    except Exception as e:
        logger.error(f"Error listing clusters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clusters/{cluster_name}/metrics")
async def get_cluster_metrics(cluster_name: str):
    try:
        if not db_manager.get_cluster(cluster_name):
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not found")
        m = db_manager.get_latest_metrics(cluster_name)
        if not m:
            raise HTTPException(status_code=404, detail=f"No metrics available for {cluster_name}")
        return m
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cluster metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clusters/{cluster_name}/status")
async def get_cluster_status(cluster_name: str):
    try:
        info = db_manager.get_cluster(cluster_name)
        if not info:
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not found")
        last_seen = datetime.fromisoformat(info["last_seen"])
        age = (datetime.utcnow() - last_seen).total_seconds()
        health = "healthy" if age < 60 else ("warning" if age < 300 else "critical")
        return {**info, "seconds_since_seen": age, "health": health}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cluster status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clusters/{cluster_name}")
async def unregister_cluster(
    cluster_name: str,
    token: str = Depends(verify_token),
):
    try:
        if not db_manager.get_cluster(cluster_name):
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not found")
        if not db_manager.delete_cluster(cluster_name):
            raise HTTPException(status_code=500, detail="Failed to unregister cluster")
        logger.info(f"Cluster unregistered: {cluster_name}")
        return {"status": "success", "message": f"Cluster {cluster_name} unregistered"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unregistering cluster: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def agent_receiver_health():
    return {
        "status":               "healthy",
        "registered_clusters":  db_manager.get_cluster_count(),
        "clusters_with_metrics": len(db_manager.get_clusters_with_recent_metrics(300)),
        "timestamp":            datetime.utcnow().isoformat(),
    }

# Made with Bob
