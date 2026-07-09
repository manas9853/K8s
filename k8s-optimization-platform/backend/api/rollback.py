"""
Rollback Center API
Wires all 4 rollback operations to the real agent command pipeline.
No in-memory state — every action is persisted via db_manager.enqueue_command().
The agent polls for commands every 3 seconds and executes them on the real cluster.

Command routing:
  DeploymentRollback    → emergency_rollback      (agent: kubectl rollout undo)
  ConfigurationRollback → patch_configmap         (agent: patch_namespaced_config_map)
  NamespaceRollback     → restart_deployment × N  (agent: rolling restart per deployment)
  ClusterRollback       → restart_deployment × all (agent: all deployments across cluster)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request models ────────────────────────────────────────────────────────────

class DeploymentRollbackRequest(BaseModel):
    cluster: str
    deployment: str
    namespace: str
    revision: Optional[int] = None       # target revision (None = previous)


class ConfigurationRollbackRequest(BaseModel):
    cluster: str
    name: str                            # ConfigMap name
    namespace: str
    data: Dict[str, str]                 # key→value pairs to restore


class NamespaceRollbackRequest(BaseModel):
    cluster: str
    namespace: str


class ClusterRollbackRequest(BaseModel):
    cluster: str
    snapshot_timestamp: Optional[str] = None   # informational; agent restarts all


# ── Response models ───────────────────────────────────────────────────────────

class RollbackEnqueuedResponse(BaseModel):
    command_id: int
    cluster: str
    command: str
    status: str = "pending"
    message: str


class BatchRollbackEnqueuedResponse(BaseModel):
    command_ids: List[int]
    cluster: str
    commands_enqueued: int
    status: str = "pending"
    message: str


class CommandStatusResponse(BaseModel):
    command_id: int
    cluster: str
    command: str
    status: str           # pending | done | failed
    result: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str


# ── Helper ────────────────────────────────────────────────────────────────────

def _db():
    from database.db import db_manager
    return db_manager


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/deployment", response_model=RollbackEnqueuedResponse)
async def rollback_deployment(req: DeploymentRollbackRequest):
    """
    Roll a specific deployment back to its previous revision.
    Enqueues emergency_rollback → agent runs real kubectl rollout undo.
    """
    params: Dict[str, Any] = {
        "name":          req.deployment,
        "namespace":     req.namespace,
        "resource_type": "deployment",
    }
    if req.revision is not None:
        params["revision"] = req.revision

    try:
        cmd_id = _db().enqueue_command(req.cluster, "emergency_rollback", params)
        if cmd_id is None:
            raise HTTPException(status_code=503, detail="Database unavailable — could not enqueue command")
        logger.info(f"DeploymentRollback enqueued: cluster={req.cluster} deployment={req.deployment} cmd_id={cmd_id}")
        return RollbackEnqueuedResponse(
            command_id=cmd_id,
            cluster=req.cluster,
            command="emergency_rollback",
            message=f"Rollback of {req.deployment} enqueued. Agent will execute within 3 seconds.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"rollback_deployment error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configuration", response_model=RollbackEnqueuedResponse)
async def rollback_configuration(req: ConfigurationRollbackRequest):
    """
    Revert a ConfigMap to a previous state by applying the supplied key→value snapshot.
    Enqueues patch_configmap → agent runs core_v1.patch_namespaced_config_map().
    """
    if not req.data:
        raise HTTPException(status_code=400, detail="data must be a non-empty dict of key→value pairs to restore")

    params: Dict[str, Any] = {
        "name":      req.name,
        "namespace": req.namespace,
        "data":      req.data,
    }

    try:
        cmd_id = _db().enqueue_command(req.cluster, "patch_configmap", params)
        if cmd_id is None:
            raise HTTPException(status_code=503, detail="Database unavailable — could not enqueue command")
        logger.info(f"ConfigRollback enqueued: cluster={req.cluster} configmap={req.name} cmd_id={cmd_id}")
        return RollbackEnqueuedResponse(
            command_id=cmd_id,
            cluster=req.cluster,
            command="patch_configmap",
            message=f"ConfigMap '{req.name}' rollback enqueued. Agent will apply within 3 seconds.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"rollback_configuration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/namespace", response_model=BatchRollbackEnqueuedResponse)
async def rollback_namespace(req: NamespaceRollbackRequest):
    """
    Roll back ALL deployments in a namespace by triggering a rolling restart on each.
    Enqueues one restart_deployment command per deployment found in the latest metrics snapshot.
    """
    try:
        db = _db()
        # Read real deployments in the namespace from the latest metrics snapshot
        metrics = db.get_latest_metrics(req.cluster)
        deployments = []
        if metrics:
            import json as _json
            wl_raw = metrics.get("workloads") or {}
            if isinstance(wl_raw, str):
                try:
                    wl_raw = _json.loads(wl_raw)
                except Exception:
                    wl_raw = {}
            dep_list = (wl_raw.get("deployments") or {})
            if isinstance(dep_list, dict):
                dep_list = dep_list.get("items", [])
            deployments = [
                d for d in (dep_list or [])
                if d.get("namespace") == req.namespace
            ]

        if not deployments:
            raise HTTPException(
                status_code=404,
                detail=f"No deployments found in namespace '{req.namespace}' on cluster '{req.cluster}'. "
                       "Ensure the agent has collected metrics for this cluster."
            )

        command_ids = []
        for dep in deployments:
            dep_name = dep.get("name") or dep.get("deployment_name", "")
            if not dep_name:
                continue
            cmd_id = db.enqueue_command(req.cluster, "restart_deployment", {
                "name":      dep_name,
                "namespace": req.namespace,
            })
            if cmd_id:
                command_ids.append(cmd_id)

        if not command_ids:
            raise HTTPException(status_code=500, detail="Failed to enqueue any restart commands")

        logger.info(f"NamespaceRollback enqueued: cluster={req.cluster} ns={req.namespace} commands={command_ids}")
        return BatchRollbackEnqueuedResponse(
            command_ids=command_ids,
            cluster=req.cluster,
            commands_enqueued=len(command_ids),
            message=f"Namespace '{req.namespace}' rollback enqueued — {len(command_ids)} deployments will be restarted.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"rollback_namespace error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cluster", response_model=BatchRollbackEnqueuedResponse)
async def rollback_cluster(req: ClusterRollbackRequest):
    """
    Roll back the entire cluster by restarting ALL deployments across all namespaces.
    Reads real deployments from the latest metrics snapshot and enqueues restart_deployment × all.
    """
    try:
        db = _db()
        metrics = db.get_latest_metrics(req.cluster)
        if not metrics:
            raise HTTPException(
                status_code=404,
                detail=f"No metrics found for cluster '{req.cluster}'. Ensure the agent is running."
            )

        import json as _json
        wl_raw = metrics.get("workloads") or {}
        if isinstance(wl_raw, str):
            try:
                wl_raw = _json.loads(wl_raw)
            except Exception:
                wl_raw = {}
        dep_list = (wl_raw.get("deployments") or {})
        if isinstance(dep_list, dict):
            dep_list = dep_list.get("items", [])
        deployments = dep_list or []

        if not deployments:
            raise HTTPException(
                status_code=404,
                detail=f"No deployments found for cluster '{req.cluster}'."
            )

        command_ids = []
        for dep in deployments:
            dep_name = dep.get("name") or dep.get("deployment_name", "")
            dep_ns   = dep.get("namespace", "default")
            if not dep_name:
                continue
            cmd_id = db.enqueue_command(req.cluster, "restart_deployment", {
                "name":      dep_name,
                "namespace": dep_ns,
            })
            if cmd_id:
                command_ids.append(cmd_id)

        if not command_ids:
            raise HTTPException(status_code=500, detail="Failed to enqueue any restart commands")

        logger.info(f"ClusterRollback enqueued: cluster={req.cluster} commands={len(command_ids)}")
        return BatchRollbackEnqueuedResponse(
            command_ids=command_ids,
            cluster=req.cluster,
            commands_enqueued=len(command_ids),
            message=f"Cluster '{req.cluster}' rollback enqueued — {len(command_ids)} deployments will be restarted.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"rollback_cluster error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{command_id}", response_model=CommandStatusResponse)
async def get_rollback_status(command_id: int):
    """
    Poll the status of a rollback command.
    Returns: pending → agent is processing | done → success | failed → error
    Frontend polls this endpoint every 2 seconds until status is done or failed.
    """
    try:
        row = _db().get_command(command_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"Command {command_id} not found")

        result = row.get("result")
        if isinstance(result, str):
            import json as _json
            try:
                result = _json.loads(result)
            except Exception:
                result = {"raw": result}

        return CommandStatusResponse(
            command_id=row["id"],
            cluster=row["cluster_name"],
            command=row["command"],
            status=row["status"],
            result=result,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_rollback_status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/snapshots")
async def get_cluster_snapshots(
    cluster: str = Query(..., description="Cluster name"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Return the last N metric snapshots for a cluster as rollback points.
    Used by ClusterRollback and NamespaceRollback to show the timeline of available states.
    """
    try:
        history = _db().get_metrics_history(cluster, limit=limit)
        snapshots = []
        for row in history:
            pods_raw = row.get("pods") or {}
            if isinstance(pods_raw, str):
                import json as _json
                try:
                    pods_raw = _json.loads(pods_raw)
                except Exception:
                    pods_raw = {}
            pod_count  = len(pods_raw.get("items", []))
            nodes_raw  = row.get("nodes") or {}
            if isinstance(nodes_raw, str):
                import json as _json
                try:
                    nodes_raw = _json.loads(nodes_raw)
                except Exception:
                    nodes_raw = {}
            node_count = len(nodes_raw.get("items", [])) if isinstance(nodes_raw, dict) else 0

            ns_raw = row.get("namespaces") or {}
            if isinstance(ns_raw, str):
                import json as _json
                try:
                    ns_raw = _json.loads(ns_raw)
                except Exception:
                    ns_raw = {}
            ns_count = len(ns_raw.get("items", [])) if isinstance(ns_raw, dict) else 0

            snapshots.append({
                "snapshot_id":  row["id"],
                "timestamp":    row.get("timestamp") or row.get("received_at", ""),
                "pod_count":    pod_count,
                "node_count":   node_count,
                "namespace_count": ns_count,
            })
        return {"cluster": cluster, "snapshots": snapshots}
    except Exception as e:
        logger.error(f"get_cluster_snapshots error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Made with Bob
