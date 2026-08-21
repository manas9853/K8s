"""
Agent Receiver API
Receives metrics and heartbeats from remote cluster agents.
Supports both basic (v1) and comprehensive (v2) agent payloads.
"""
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Set
from datetime import datetime
import asyncio
import json
import logging

from database.db import db_manager
from api.tokens import get_token_org

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agent"])

# ── SSE broadcast bus ─────────────────────────────────────────────────────────
# Each connected SSE client registers its own asyncio.Queue here.
# When new agent metrics arrive we put a message on every queue.
_sse_clients: Set[asyncio.Queue] = set()


def _broadcast(cluster_name: str) -> None:
    """Put a metrics_update event onto every connected SSE client queue.
    Called synchronously from within an async context (no await needed)."""
    payload = json.dumps({"event": "metrics_update", "cluster": cluster_name})
    dead: List[asyncio.Queue] = []
    for q in _sse_clients:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _sse_clients.discard(q)


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
    configmaps: Optional[Dict[str, Any]] = None
    secrets_domain: Optional[Dict[str, Any]] = None


class HeartbeatRequest(BaseModel):
    cluster_name: str
    timestamp: str
    status: str
    cluster_id: Optional[str] = None


class NetworkFlowRecord(BaseModel):
    src_namespace: str
    src_pod: str
    dst_namespace: str
    dst_pod: str
    dst_port: int
    protocol: str
    connection_count: int


class NodeImageScanResult(BaseModel):
    image: str
    scan_status: str  # "scanned" | "error"
    raw_report: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class NodeImageScanBatch(BaseModel):
    """One node_scanner.py DaemonSet pod's report for one node, one cycle."""
    cluster_name: str
    node_name: str
    scanned_at: float
    results: List[NodeImageScanResult] = []


class NetworkFlowBatch(BaseModel):
    """One flow_collector.py DaemonSet pod's report for one node, one cycle."""
    cluster_name: str
    node_name: str
    timestamp: str
    flows: List[NetworkFlowRecord] = []


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
        org_id = get_token_org(token)

        success = db_manager.register_cluster({
            "cluster_name":   cluster_name,
            "environment":    registration.environment,
            "cloud_provider": resolved_provider,
            "region":         registration.region,
            "version":        registration.version,
            "agent_version":  registration.agent_version,
            "status":         "active",
            "org_id":         org_id,
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
            "configmaps":      metrics.configmaps,
            "secrets_domain":  metrics.secrets_domain,
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
        # Notify all connected SSE clients that fresh data is available
        _broadcast(cluster_name)
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


# ── /network-flows ──────────────────────────────────────────────────────────
# Receives per-node batches from agent/flow_collector.py (a separate,
# opt-in DaemonSet — see flow-collector-daemonset.yaml). Each pod posts
# once per node per collection cycle; records are aggregated connection
# tuples only (no packet content), see that file's docstring.

@router.post("/network-flows")
async def receive_network_flows(
    batch: NetworkFlowBatch,
    token: str = Depends(verify_token),
):
    try:
        cluster = db_manager.get_cluster(batch.cluster_name)
        if not cluster:
            raise HTTPException(status_code=404, detail=f"Cluster {batch.cluster_name} not registered")

        flows = [f.model_dump() for f in batch.flows]
        if not db_manager.insert_network_flows(
            batch.cluster_name, batch.node_name, batch.timestamp, flows
        ):
            raise HTTPException(status_code=500, detail="Failed to store network flows")

        logger.debug(
            f"Network flows received from {batch.cluster_name}/{batch.node_name} "
            f"({len(flows)} records)"
        )
        return {"status": "success", "message": "Network flows received"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving network flows: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── /node-image-scans ───────────────────────────────────────────────────────
# Receives per-node batches from agent/node_scanner.py (a separate, opt-in
# DaemonSet — see node-scanner-daemonset.yaml). Scans the node's local
# containerd image store, so it needs zero registry credentials and works
# for private registries — unlike services/trivy_scanner.py's network pull,
# which is skipped/fails for any private image. See that file's docstring.

@router.post("/node-image-scans")
async def receive_node_image_scans(
    batch: NodeImageScanBatch,
    token: str = Depends(verify_token),
):
    try:
        cluster = db_manager.get_cluster(batch.cluster_name)
        if not cluster:
            raise HTTPException(status_code=404, detail=f"Cluster {batch.cluster_name} not registered")

        from services.trivy_scanner import _parse_trivy_json

        results = []
        for r in batch.results:
            if r.scan_status == "scanned" and r.raw_report:
                try:
                    parsed = _parse_trivy_json(r.raw_report, r.image)
                except Exception as e:
                    results.append({"image": r.image, "scan_status": "error",
                                     "error_message": f"parse failed: {e}"})
                    continue
                results.append({"image": r.image, "scan_status": "scanned", "parsed_report": parsed})
            else:
                results.append({"image": r.image, "scan_status": "error",
                                 "error_message": r.error_message or "unknown error"})

        if not db_manager.upsert_node_image_scans(
            batch.cluster_name, batch.node_name, batch.scanned_at, results
        ):
            raise HTTPException(status_code=500, detail="Failed to store node image scans")

        logger.info(
            f"Node image scans received from {batch.cluster_name}/{batch.node_name} "
            f"({len(results)} images)"
        )
        return {"status": "success", "message": "Node image scans received"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving node image scans: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── /falco-alerts/{cluster_name}/{token} ────────────────────────────────────
# Pushed directly by Falco's own http_output (see docs/falco-setup.md) —
# unlike every other agent-> backend path, this isn't posted by our own
# agent code: Falco natively supports POSTing each alert as JSON to a URL,
# so we point it straight at this endpoint instead of writing a poller.
# Falco's http_output has no custom-header support in any shipped version,
# so the auth token travels in the URL path (same trick Slack/GitHub
# webhooks use) rather than an Authorization header like every other route
# here.

class FalcoAlert(BaseModel):
    """Falco's standard JSON output shape (json_output: true)."""
    rule: str
    priority: str
    output: str
    time: Optional[str] = None
    output_fields: Dict[str, Any] = {}


@router.post("/falco-alerts/{cluster_name}/{token}")
async def receive_falco_alert(cluster_name: str, token: str, alert: FalcoAlert):
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        cluster = db_manager.get_cluster(cluster_name)
        if not cluster:
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not registered")

        alert_time = alert.time or datetime.utcnow().isoformat() + "Z"
        if not db_manager.insert_falco_alert(
            cluster_name, alert.rule, alert.priority, alert.output,
            alert.output_fields, alert_time,
        ):
            raise HTTPException(status_code=500, detail="Failed to store falco alert")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving falco alert: {e}")
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


@router.get("/clusters/{cluster_name}/network-flows")
async def get_cluster_network_flows(cluster_name: str, minutes: int = 15):
    """Merged, observed pod-to-pod traffic edges from flow_collector.py
    DaemonSet pods across all nodes, over the last `minutes` (default 15).
    Empty list is a valid response — it means either no traffic was seen,
    or the DaemonSet isn't deployed / isn't compatible with this cluster's
    CNI (see flow_collector.py's docstring)."""
    try:
        if not db_manager.get_cluster(cluster_name):
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_name} not found")
        return {"cluster_name": cluster_name, "window_minutes": minutes,
                "flows": db_manager.get_recent_network_flows(cluster_name, minutes)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network flows: {e}")
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


# ── /commands — agent polls for work, backend enqueues write actions ──────────

@router.get("/commands/pending")
async def get_pending_commands(
    cluster_name: str,
    token: str = Depends(verify_token),
):
    """Agent polls this endpoint every cycle to get pending write commands."""
    commands = db_manager.get_pending_commands(cluster_name)
    return {"commands": commands}


@router.post("/commands/{command_id}/ack")
async def ack_command(
    command_id: int,
    body: Dict[str, Any],
    token: str = Depends(verify_token),
):
    """Agent calls this after executing a command to report success/failure."""
    success = body.get("success", False)
    result  = body.get("result", {})
    db_manager.ack_command(command_id, success, result)
    return {"status": "ok"}


@router.get("/commands/{command_id}")
async def get_command_status(command_id: int):
    """Frontend long-polls to check if a command has been executed."""
    cmd = db_manager.get_command(command_id)
    if not cmd:
        raise HTTPException(status_code=404, detail="Command not found")
    return cmd

# ── /events — SSE endpoint for real-time push to the frontend ─────────────────

@router.get("/events")
async def metrics_events(request: Request):
    """
    Server-Sent Events stream.
    The frontend connects once; whenever an agent pushes new metrics the
    backend immediately sends a `metrics_update` event so the UI can
    re-fetch only the data it needs — no polling, no page reload.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=32)
    _sse_clients.add(queue)

    async def stream():
        # Send an initial ping so the browser knows the connection is live
        yield "data: {\"event\": \"connected\"}\n\n"
        try:
            while True:
                # Check for client disconnect every second
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    # keepalive comment so proxies don't close the connection
                    yield ": keepalive\n\n"
        finally:
            _sse_clients.discard(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
    )

# Made with Bob
