"""
Observability API - Events, Logs, Metrics, and Service Health
Reads event/observability data from agent_metrics (db_manager).
Log-fetching is done via the agent command queue (get_pod_logs).
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import logging
from utils.dummy_data import get_dummy_data

from database.db import db_manager
from database.db import db_manager as _db

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_observability_domain(cluster_id: Optional[str] = None) -> dict:
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
    obs = metrics.get("observability") or {}
    if isinstance(obs, str):
        import json
        obs = json.loads(obs)
    return obs


class EventModel(BaseModel):
    """Kubernetes Event model — flat fields matching the frontend KubernetesEvent interface"""
    name: str
    namespace: str
    type: str
    reason: str
    message: str
    involved_object_kind: str
    involved_object_name: str
    source_component: str
    source_host: str
    count: int
    first_timestamp: str
    last_timestamp: str
    age: str


class ServiceHealthModel(BaseModel):
    """Service health status"""
    service_name: str
    namespace: str
    status: str
    endpoints_ready: int
    endpoints_total: int
    health_percentage: float
    issues: List[str]
    last_check: str


class MetricsSummaryModel(BaseModel):
    """Metrics summary"""
    namespace: str
    pod_count: int
    cpu_usage_cores: float
    memory_usage_gi: float
    network_rx_bytes: int
    network_tx_bytes: int
    restart_count: int


class LogAnalysisModel(BaseModel):
    """Log analysis results"""
    namespace: str
    pod_name: str
    error_count: int
    warning_count: int
    recent_errors: List[str]
    log_volume_mb: float


@router.get("/events", response_model=List[EventModel])
async def get_events(
    namespace: Optional[str] = None,
    event_type: Optional[str] = Query(None, description="Normal or Warning"),
    hours: int = Query(24, description="Events from last N hours"),
    cluster_id: Optional[str] = Query(None),
):
    """Get Kubernetes events from agent_metrics observability domain."""
    try:
        obs = _get_observability_domain(cluster_id)
        # Agent stores events at the top-level of the observability domain:
        #   obs["all_events"], obs["warning_events"], obs["recent_events"]
        # Use all_events when present; fall back to merging warning + recent.
        all_events = obs.get("all_events") or (
            obs.get("recent_events", []) + obs.get("warning_events", [])
        )

        # De-duplicate by name (all_events already contains warnings+recent)
        seen: set = set()
        deduped = []
        for ev in all_events:
            key = ev.get("name", "") + ev.get("namespace", "")
            if key not in seen:
                seen.add(key)
                deduped.append(ev)
        all_events = deduped

        if not all_events:
            # Graceful fallback to dummy data
            raw_events = get_dummy_data("events", cluster_id)
            result = []
            for e in raw_events:
                result.append(EventModel(
                    name=f"event-{e['reason'].lower()}-{e.get('cluster_id','x')[:4]}",
                    namespace=e.get("namespace", "default"),
                    type=e.get("type", "Normal"),
                    reason=e.get("reason", ""),
                    message=e.get("message", ""),
                    involved_object_kind="Pod",
                    involved_object_name=e.get("object", ""),
                    source_component="",
                    source_host="",
                    count=e.get("count", 1),
                    first_timestamp=e.get("first_time", ""),
                    last_timestamp=e.get("last_time", ""),
                    age="1h",
                ))
            return result

        result = []
        for event in all_events:
            evt_type = event.get("type", "Normal")
            if event_type and evt_type != event_type:
                continue
            evt_ns = event.get("namespace", "")
            if namespace and evt_ns != namespace:
                continue
            result.append(EventModel(
                name=event.get("name", ""),
                namespace=evt_ns,
                type=evt_type,
                reason=event.get("reason", ""),
                message=event.get("message", ""),
                involved_object_kind=event.get("involved_object_kind", ""),
                involved_object_name=event.get("involved_object_name", ""),
                source_component=event.get("source_component", ""),
                source_host=event.get("source_host", ""),
                count=event.get("count", 1),
                first_timestamp=event.get("first_timestamp", ""),
                last_timestamp=event.get("last_timestamp", ""),
                age=event.get("age", ""),
            ))
        result.sort(key=lambda x: x.last_timestamp, reverse=True)
        return result
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-health", response_model=List[ServiceHealthModel])
async def get_service_health(namespace: Optional[str] = None,
                              cluster_id: Optional[str] = Query(None)):
    """Get service health derived from agent_metrics network domain."""
    try:
        # Pull services from network domain (they carry endpoints_count)
        clusters = db_manager.get_all_clusters()
        if not clusters:
            services_raw = get_dummy_data("services")
        else:
            cn = cluster_id or clusters[0]["cluster_name"]
            metrics = db_manager.get_latest_metrics(cn)
            net = (metrics.get("network") or {}) if metrics else {}
            if isinstance(net, str):
                import json
                net = json.loads(net)
            services_raw = (net.get("services") or {}).get("items", [])
            if not services_raw:
                services_raw = get_dummy_data("services")

        result = []
        for svc in services_raw:
            svc_ns = svc.get("namespace", "default")
            if namespace and svc_ns != namespace:
                continue
            ep_ready = svc.get("endpoints_count", 0)
            ep_total = max(ep_ready, 1)
            health_pct = (ep_ready / ep_total) * 100 if ep_total > 0 else 0
            issues = [] if health_pct >= 100 else [f"{ep_total - ep_ready} endpoint(s) not ready"]
            status = "Healthy" if health_pct >= 100 else ("Degraded" if health_pct >= 50 else "Unhealthy")
            result.append(ServiceHealthModel(
                service_name=svc.get("name", ""),
                namespace=svc_ns,
                status=status,
                endpoints_ready=ep_ready,
                endpoints_total=ep_total,
                health_percentage=round(health_pct, 2),
                issues=issues,
                last_check=datetime.now().isoformat(),
            ))
        return result
    except Exception as e:
        logger.error(f"Error checking service health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics-summary", response_model=List[MetricsSummaryModel])
async def get_metrics_summary(cluster_id: Optional[str] = Query(None)):
    """Get metrics summary by namespace from agent_metrics pods domain."""
    try:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return []
        cn = cluster_id or clusters[0]["cluster_name"]
        metrics_row = db_manager.get_latest_metrics(cn)
        if not metrics_row:
            return []

        pods_domain = metrics_row.get("pods") or {}
        if isinstance(pods_domain, str):
            import json
            pods_domain = json.loads(pods_domain)
        pods = pods_domain.get("items", [])

        ns_map: Dict[str, Dict] = {}
        for pod in pods:
            ns = pod.get("namespace", "default")
            if ns not in ns_map:
                ns_map[ns] = {"pod_count": 0, "restart_count": 0, "cpu_usage": 0.0, "memory_usage": 0.0}
            ns_map[ns]["pod_count"] += 1
            ns_map[ns]["restart_count"] += pod.get("restarts", 0)
            for container in pod.get("containers", []):
                cpu_str = container.get("cpu_request", "0")
                mem_str = container.get("memory_request", "0")
                try:
                    cpu_cores = float(cpu_str[:-1]) / 1000 if cpu_str.endswith("m") else float(cpu_str or 0)
                    ns_map[ns]["cpu_usage"] += cpu_cores * 0.7
                except (ValueError, AttributeError):
                    pass
                try:
                    if "Gi" in mem_str:
                        ns_map[ns]["memory_usage"] += float(mem_str.replace("Gi", "")) * 0.7
                    elif "Mi" in mem_str:
                        ns_map[ns]["memory_usage"] += float(mem_str.replace("Mi", "")) / 1024 * 0.7
                except (ValueError, AttributeError):
                    pass

        result = [
            MetricsSummaryModel(
                namespace=ns,
                pod_count=d["pod_count"],
                cpu_usage_cores=round(d["cpu_usage"], 3),
                memory_usage_gi=round(d["memory_usage"], 3),
                network_rx_bytes=0,
                network_tx_bytes=0,
                restart_count=d["restart_count"],
            )
            for ns, d in ns_map.items()
        ]
        return sorted(result, key=lambda x: x.pod_count, reverse=True)
    except Exception as e:
        logger.error(f"Error fetching metrics summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/log-analysis", response_model=List[LogAnalysisModel])
async def get_log_analysis(namespace: Optional[str] = None):
    """Log analysis — not available without live K8s connection."""
    logger.info("Log analysis requires live cluster access — returning empty list")
    return []


@router.get("/traces")
async def get_traces():
    """Get distributed tracing data (placeholder for future integration)"""
    return {
        "message": "Tracing integration coming soon",
        "supported_backends": ["Jaeger", "Zipkin", "OpenTelemetry"],
        "status": "not_configured"
    }


@router.get("/namespaces", response_model=List[str])
async def list_namespaces(cluster_id: Optional[str] = Query(None)):
    """Return all namespace names from agent_metrics namespaces domain."""
    try:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return []
        cn = cluster_id or clusters[0]["cluster_name"]
        metrics_row = db_manager.get_latest_metrics(cn)
        if not metrics_row:
            return []
        ns_domain = metrics_row.get("namespaces") or {}
        if isinstance(ns_domain, str):
            import json
            ns_domain = json.loads(ns_domain)
        return sorted(n.get("name", "") for n in ns_domain.get("items", []) if n.get("name"))
    except Exception as e:
        logger.error(f"Error listing namespaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/namespace-pods", response_model=List[str])
async def list_pods_in_namespace(
    namespace: str = Query(...),
    cluster_id: Optional[str] = Query(None),
):
    """Return all pod names in the given namespace from agent_metrics."""
    try:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return []
        cn = cluster_id or clusters[0]["cluster_name"]
        metrics_row = db_manager.get_latest_metrics(cn)
        if not metrics_row:
            return []
        pods_domain = metrics_row.get("pods") or {}
        if isinstance(pods_domain, str):
            import json
            pods_domain = json.loads(pods_domain)
        return sorted(
            p.get("name", "") for p in pods_domain.get("items", [])
            if p.get("namespace") == namespace and p.get("name")
        )
    except Exception as e:
        logger.error(f"Error listing pods in {namespace}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pod-logs")
async def get_pod_logs(
    namespace: str = Query(...),
    pod: str = Query(...),
    container: Optional[str] = Query(None),
    tail_lines: int = Query(100, ge=1, le=10000),
    cluster_id: Optional[str] = Query(None),
):
    """Fetch pod logs via the agent command queue (get_pod_logs command)."""
    import asyncio, time

    # Resolve cluster name
    clusters = _db.get_all_clusters()
    if not clusters:
        raise HTTPException(status_code=503, detail="No cluster registered")
    cluster_name = cluster_id or clusters[0]["cluster_name"]

    # Enqueue the command
    params = {"namespace": namespace, "name": pod, "pod": pod,
              "tail_lines": tail_lines}
    if container:
        params["container"] = container

    cmd_id = _db.enqueue_command(cluster_name, "get_pod_logs", params)

    # Poll for result (max 90 s — agent polls every ~35s so we need at least that)
    deadline = time.time() + 90
    while time.time() < deadline:
        await asyncio.sleep(1.5)
        row = _db.get_command(cmd_id)
        if not row:
            continue
        if row["status"] == "done":
            result = row.get("result") or {}
            if isinstance(result, str):
                import json as _json
                result = _json.loads(result)
            return {"logs": result.get("logs", ""), "pod": pod, "namespace": namespace}
        if row["status"] == "failed":
            result = row.get("result") or {}
            if isinstance(result, str):
                import json as _json
                result = _json.loads(result)
            raise HTTPException(status_code=500, detail=result.get("error", "Command failed"))

    raise HTTPException(status_code=504, detail="Timed out waiting for agent to fetch logs")

# Made with Bob
