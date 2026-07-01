"""
Observability API - Events, Logs, Metrics, and Service Health
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import logging
from utils.dummy_data import get_dummy_data, get_dummy_metrics

# Import Kubernetes client
try:
    from services.k8s_client import k8s_client
    K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()
except Exception as e:
    K8S_AVAILABLE = False
    k8s_client = None
    logging.warning(f"Kubernetes client not available: {e}")

logger = logging.getLogger(__name__)
router = APIRouter()


class EventModel(BaseModel):
    """Kubernetes Event model"""
    name: str
    namespace: str
    type: str
    reason: str
    message: str
    involved_object: Dict[str, str]
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
    """Get Kubernetes events — cluster-scoped."""
    if not K8S_AVAILABLE or k8s_client is None:
        raw_events = get_dummy_data("events", cluster_id)
        result = []
        for e in raw_events:
            result.append(EventModel(
                name=f"event-{e['reason'].lower()}-{e['cluster_id'][:4]}",
                namespace=e["namespace"],
                type=e["type"],
                reason=e["reason"],
                message=e["message"],
                involved_object={"kind": "Pod", "name": e["object"]},
                count=e["count"],
                first_timestamp=e["first_time"],
                last_timestamp=e["last_time"],
                age="1h",
            ))
        return result

    try:
        v1 = k8s_client.get_core_api()
        
        if namespace:
            events = v1.list_namespaced_event(namespace)
        else:
            events = v1.list_event_for_all_namespaces()
        
        # Filter by time
        cutoff_time = datetime.now(datetime.now().astimezone().tzinfo) - timedelta(hours=hours)
        
        result = []
        for event in events.items:
            # Skip old events
            if event.last_timestamp and event.last_timestamp < cutoff_time:
                continue
            
            # Filter by type if specified
            if event_type and event.type != event_type:
                continue
            
            # Calculate age
            if event.last_timestamp:
                age_delta = datetime.now(event.last_timestamp.tzinfo) - event.last_timestamp
                if age_delta.days > 0:
                    age = f"{age_delta.days}d"
                elif age_delta.seconds > 3600:
                    age = f"{age_delta.seconds // 3600}h"
                else:
                    age = f"{age_delta.seconds // 60}m"
            else:
                age = "Unknown"
            
            result.append(EventModel(
                name=event.metadata.name,
                namespace=event.metadata.namespace,
                type=event.type or "Normal",
                reason=event.reason or "Unknown",
                message=event.message or "",
                involved_object={
                    "kind": event.involved_object.kind or "",
                    "name": event.involved_object.name or "",
                    "namespace": event.involved_object.namespace or ""
                },
                count=event.count or 1,
                first_timestamp=event.first_timestamp.isoformat() if event.first_timestamp else "",
                last_timestamp=event.last_timestamp.isoformat() if event.last_timestamp else "",
                age=age
            ))
        
        # Sort by last timestamp (most recent first)
        result.sort(key=lambda x: x.last_timestamp, reverse=True)
        
        return result
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-health", response_model=List[ServiceHealthModel])
async def get_service_health(namespace: Optional[str] = None):
    """Get service health status — falls back to dummy data when K8s unavailable."""
    if not K8S_AVAILABLE or k8s_client is None:
        from utils.dummy_data import get_dummy_data
        services = get_dummy_data("services")
        result = []
        for svc in services:
            rng_val = sum(ord(c) for c in svc["name"])
            endpoints_ready = max(1, rng_val % 4 + 1)
            endpoints_total = endpoints_ready + (1 if rng_val % 5 == 0 else 0)
            health_pct = (endpoints_ready / endpoints_total) * 100
            result.append(ServiceHealthModel(
                service_name=svc["name"],
                namespace=svc["namespace"],
                status="Healthy" if health_pct == 100 else ("Degraded" if health_pct >= 50 else "Unhealthy"),
                endpoints_ready=endpoints_ready,
                endpoints_total=endpoints_total,
                health_percentage=round(health_pct, 2),
                issues=[] if health_pct == 100 else [f"{endpoints_total - endpoints_ready} endpoint(s) not ready"],
                last_check=datetime.now().isoformat(),
            ))
        return result

    try:
        v1 = k8s_client.get_core_api()
        
        if namespace:
            services = v1.list_namespaced_service(namespace)
        else:
            services = v1.list_service_for_all_namespaces()
        
        result = []
        for svc in services.items:
            # Get endpoints
            endpoints_ready = 0
            endpoints_total = 0
            issues = []
            
            try:
                endpoints = v1.read_namespaced_endpoints(
                    svc.metadata.name,
                    svc.metadata.namespace
                )
                
                if endpoints.subsets:
                    for subset in endpoints.subsets:
                        if subset.addresses:
                            endpoints_ready += len(subset.addresses)
                            endpoints_total += len(subset.addresses)
                        if subset.not_ready_addresses:
                            endpoints_total += len(subset.not_ready_addresses)
                            issues.append(f"{len(subset.not_ready_addresses)} endpoints not ready")
                
                if endpoints_total == 0:
                    issues.append("No endpoints available")
            except Exception as e:
                logger.debug(f"No endpoints for {svc.metadata.name}: {e}")
                issues.append("No endpoints found")
            
            # Calculate health
            if endpoints_total > 0:
                health_pct = (endpoints_ready / endpoints_total) * 100
            else:
                health_pct = 0
            
            # Determine status
            if health_pct == 100:
                status = "Healthy"
            elif health_pct >= 50:
                status = "Degraded"
            else:
                status = "Unhealthy"
            
            result.append(ServiceHealthModel(
                service_name=svc.metadata.name,
                namespace=svc.metadata.namespace,
                status=status,
                endpoints_ready=endpoints_ready,
                endpoints_total=endpoints_total,
                health_percentage=round(health_pct, 2),
                issues=issues,
                last_check=datetime.now().isoformat()
            ))
        
        return result
    except Exception as e:
        logger.error(f"Error checking service health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics-summary", response_model=List[MetricsSummaryModel])
async def get_metrics_summary(cluster_id: Optional[str] = Query(None)):
    """Get metrics summary by namespace — falls back to dummy data when K8s unavailable."""
    if not K8S_AVAILABLE or k8s_client is None:
        from utils.dummy_data import get_dummy_data
        deployments = get_dummy_data("deployments", cluster_id)
        # Aggregate by namespace from deployment data
        ns_map: Dict[str, Dict] = {}
        for dep in deployments:
            ns = dep["namespace"]
            if ns not in ns_map:
                ns_map[ns] = {"pod_count": 0, "cpu_usage": 0.0, "memory_usage": 0.0, "restart_count": 0}
            replicas = dep.get("replicas_ready", 1)
            ns_map[ns]["pod_count"] += replicas
            # Estimate from resource requests
            for container in dep.get("containers", []):
                req = container.get("resources", {}).get("requests", {})
                cpu_str = req.get("cpu", "100m")
                mem_str = req.get("memory", "128Mi")
                cpu_cores = float(cpu_str.replace("m", "")) / 1000 if "m" in cpu_str else float(cpu_str)
                mem_gi = float(mem_str.replace("Mi", "")) / 1024 if "Mi" in mem_str else (
                    float(mem_str.replace("Gi", "")) if "Gi" in mem_str else 0.1)
                ns_map[ns]["cpu_usage"] += cpu_cores * replicas * 0.7
                ns_map[ns]["memory_usage"] += mem_gi * replicas * 0.7
        result = []
        for ns, data in ns_map.items():
            result.append(MetricsSummaryModel(
                namespace=ns,
                pod_count=data["pod_count"],
                cpu_usage_cores=round(data["cpu_usage"], 3),
                memory_usage_gi=round(data["memory_usage"], 3),
                network_rx_bytes=0,
                network_tx_bytes=0,
                restart_count=0,
            ))
        return sorted(result, key=lambda x: x.pod_count, reverse=True)
    
    try:
        v1 = k8s_client.get_core_api()
        
        pods = v1.list_pod_for_all_namespaces()
        
        # Group by namespace
        namespace_metrics: Dict[str, Dict[str, Any]] = {}
        
        for pod in pods.items:
            ns = pod.metadata.namespace
            if ns not in namespace_metrics:
                namespace_metrics[ns] = {
                    "pod_count": 0,
                    "restart_count": 0,
                    "cpu_usage": 0.0,
                    "memory_usage": 0.0
                }
            
            namespace_metrics[ns]["pod_count"] += 1
            
            # Count restarts
            if pod.status.container_statuses:
                for container in pod.status.container_statuses:
                    namespace_metrics[ns]["restart_count"] += container.restart_count
            
            # Estimate resource usage (in production, use metrics-server)
            if pod.spec.containers:
                for container in pod.spec.containers:
                    if container.resources and container.resources.requests:
                        cpu_req = container.resources.requests.get('cpu', '0')
                        mem_req = container.resources.requests.get('memory', '0')
                        
                        # Parse CPU (e.g., "100m" -> 0.1 cores)
                        try:
                            if 'm' in cpu_req:
                                cpu_cores = float(cpu_req.replace('m', '')) / 1000
                            else:
                                cpu_cores = float(cpu_req)
                            namespace_metrics[ns]["cpu_usage"] += cpu_cores * 0.7
                        except:
                            pass
                        
                        # Parse memory (e.g., "256Mi" -> GB)
                        try:
                            if 'Gi' in mem_req:
                                mem_gi = float(mem_req.replace('Gi', ''))
                            elif 'Mi' in mem_req:
                                mem_gi = float(mem_req.replace('Mi', '')) / 1024
                            else:
                                mem_gi = 0
                            namespace_metrics[ns]["memory_usage"] += mem_gi * 0.7
                        except:
                            pass
        
        result = []
        for ns, metrics in namespace_metrics.items():
            result.append(MetricsSummaryModel(
                namespace=ns,
                pod_count=metrics["pod_count"],
                cpu_usage_cores=round(metrics["cpu_usage"], 2),
                memory_usage_gi=round(metrics["memory_usage"], 2),
                network_rx_bytes=0,  # Would need metrics-server
                network_tx_bytes=0,  # Would need metrics-server
                restart_count=metrics["restart_count"]
            ))
        
        return sorted(result, key=lambda x: x.pod_count, reverse=True)
    except Exception as e:
        logger.error(f"Error fetching metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/log-analysis", response_model=List[LogAnalysisModel])
async def get_log_analysis(namespace: Optional[str] = None):
    """Analyze pod logs for errors and warnings"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return []
    
    try:
        v1 = k8s_client.get_core_api()
        
        if namespace:
            pods = v1.list_namespaced_pod(namespace)
        else:
            pods = v1.list_pod_for_all_namespaces()
        
        result = []
        
        # Analyze logs for a sample of pods (limit to avoid timeout)
        sample_pods = list(pods.items)[:20]
        
        for pod in sample_pods:
            if pod.status.phase != "Running":
                continue
            
            error_count = 0
            warning_count = 0
            recent_errors = []
            
            try:
                # Get logs from first container
                if pod.spec.containers:
                    container_name = pod.spec.containers[0].name
                    logs = v1.read_namespaced_pod_log(
                        pod.metadata.name,
                        pod.metadata.namespace,
                        container=container_name,
                        tail_lines=100
                    )
                    
                    # Analyze logs
                    for line in logs.split('\n'):
                        line_lower = line.lower()
                        if 'error' in line_lower or 'exception' in line_lower:
                            error_count += 1
                            if len(recent_errors) < 5:
                                recent_errors.append(line[:200])
                        elif 'warning' in line_lower or 'warn' in line_lower:
                            warning_count += 1
                    
                    # Estimate log volume
                    log_volume_mb = len(logs) / (1024 * 1024)
                    
                    if error_count > 0 or warning_count > 0:
                        result.append(LogAnalysisModel(
                            namespace=pod.metadata.namespace,
                            pod_name=pod.metadata.name,
                            error_count=error_count,
                            warning_count=warning_count,
                            recent_errors=recent_errors,
                            log_volume_mb=round(log_volume_mb, 2)
                        ))
            except Exception as e:
                logger.debug(f"Could not analyze logs for {pod.metadata.name}: {e}")
        
        return sorted(result, key=lambda x: x.error_count, reverse=True)
    except Exception as e:
        logger.error(f"Error analyzing logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traces")
async def get_traces():
    """Get distributed tracing data (placeholder for future integration)"""
    return {
        "message": "Tracing integration coming soon",
        "supported_backends": ["Jaeger", "Zipkin", "OpenTelemetry"],
        "status": "not_configured"
    }


@router.get("/namespaces", response_model=List[str])
async def list_namespaces():
    """Return all namespace names from the live cluster."""
    if not K8S_AVAILABLE or k8s_client is None:
        raise HTTPException(status_code=503, detail="Kubernetes not available")
    try:
        return sorted(k8s_client.list_namespaces())
    except Exception as e:
        logger.error(f"Error listing namespaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/namespace-pods", response_model=List[str])
async def list_pods_in_namespace(namespace: str = Query(..., description="Namespace to list pods from")):
    """Return all pod names in the given namespace."""
    if not K8S_AVAILABLE or k8s_client is None:
        raise HTTPException(status_code=503, detail="Kubernetes not available")
    try:
        v1 = k8s_client.get_core_api()
        pods = v1.list_namespaced_pod(namespace)
        return sorted(p.metadata.name for p in pods.items)
    except Exception as e:
        logger.error(f"Error listing pods in {namespace}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pod-logs")
async def get_pod_logs(
    namespace: str = Query(..., description="Namespace of the pod"),
    pod: str = Query(..., description="Pod name"),
    container: Optional[str] = Query(None, description="Container name (optional)"),
    tail_lines: int = Query(100, ge=1, le=10000, description="Number of log lines to return"),
):
    """
    Fetch real pod logs from the live cluster.
    Returns the log text as a plain string under the key `logs`.
    """
    if not K8S_AVAILABLE or k8s_client is None:
        raise HTTPException(status_code=503, detail="Kubernetes not available")
    try:
        v1 = k8s_client.get_core_api()
        kwargs: Dict[str, Any] = {"tail_lines": tail_lines}
        if container:
            kwargs["container"] = container
        log_text = v1.read_namespaced_pod_log(
            name=pod,
            namespace=namespace,
            **kwargs,
        )
        return {"logs": log_text or "", "pod": pod, "namespace": namespace, "tail_lines": tail_lines}
    except Exception as e:
        logger.error(f"Error fetching logs for {namespace}/{pod}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob
