"""
Pods API - Pod Optimization Dashboard
Feature 4: Pod Optimization Dashboard
Reads pod data from agent_metrics stored in Supabase/Postgres (db_manager).
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import logging

from database.db import db_manager
from utils.cluster_registry import get_clusters

router = APIRouter()
logger = logging.getLogger(__name__)

# Cost rates
from utils.cost_engine import CPU_COST_PER_CORE_HOUR, MEMORY_COST_PER_GB_HOUR


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ResourceMetrics(BaseModel):
    current: float
    average: float
    peak: float
    requested: float
    limit: float
    utilization_percent: float


class SmartAnalysis(BaseModel):
    issue: str
    recommendation: str
    estimated_savings: float
    risk_level: str


class PodOptimization(BaseModel):
    pod_name: str
    namespace: str
    cluster_id: str
    workload_type: str
    node_name: str
    cpu_metrics: ResourceMetrics
    memory_metrics: ResourceMetrics
    smart_analysis: SmartAnalysis
    status: str
    last_restart: str
    age_days: int


class CPUAnalysisItem(BaseModel):
    pod_name: str
    namespace: str
    cluster_id: str
    node_name: str
    cpu_current: float
    cpu_average: float
    cpu_peak: float
    cpu_request: float
    cpu_limit: float
    cpu_utilization: float
    cpu_throttling: float
    cpu_waste_percent: float
    recommendation: str
    estimated_savings: float
    status: str
    age_days: int


class MemoryAnalysisItem(BaseModel):
    pod_name: str
    namespace: str
    cluster_id: str
    node_name: str
    memory_current: float
    memory_average: float
    memory_peak: float
    memory_request: float
    memory_limit: float
    memory_utilization: float
    memory_waste_percent: float
    oom_kills: int
    recommendation: str
    estimated_savings: float
    status: str
    age_days: int


class RestartAnalysisItem(BaseModel):
    pod_name: str
    namespace: str
    cluster_id: str
    node_name: str
    restart_count: int
    last_restart_time: str
    restart_reason: str
    cpu_at_restart: float
    memory_at_restart: float
    oom_kills: int
    crash_loop: bool
    recommendation: str
    severity: str
    age_days: int


class OOMEventItem(BaseModel):
    pod_name: str
    namespace: str
    cluster_id: str
    node_name: str
    oom_count: int
    last_oom_time: str
    memory_limit: float
    memory_at_oom: float
    memory_request: float
    recommended_memory: float
    estimated_cost_increase: float
    severity: str
    age_days: int


class PodHealthItem(BaseModel):
    pod_name: str
    namespace: str
    cluster_id: str
    node_name: str
    status: str
    ready: bool
    restarts: int
    cpu_health: str
    memory_health: str
    overall_health: str
    health_score: int
    issues: List[str]
    recommendations: List[str]
    age_days: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_cpu(cpu_str: str) -> float:
    """Parse CPU string to cores (e.g., '500m' -> 0.5, '2' -> 2.0)"""
    if not cpu_str or cpu_str == "0":
        return 0.0
    if cpu_str.endswith("m"):
        return float(cpu_str[:-1]) / 1000
    return float(cpu_str)


def parse_memory(mem_str: str) -> float:
    """Parse memory string to MB (e.g., '512Mi' -> 512, '2Gi' -> 2048)"""
    if not mem_str or mem_str == "0":
        return 0.0
    if mem_str.endswith("Mi"):
        return float(mem_str[:-2])
    elif mem_str.endswith("Gi"):
        return float(mem_str[:-2]) * 1024
    elif mem_str.endswith("Ki"):
        return float(mem_str[:-2]) / 1024
    return float(mem_str)


def _get_pods_from_db(cluster_id: Optional[str] = None) -> tuple[list, str]:
    """
    Fetch pod list from the latest agent_metrics row for the given cluster
    (or the first registered cluster if cluster_id is None).
    Returns (pods_list, resolved_cluster_name).
    """
    # Resolve cluster name
    if cluster_id:
        cluster_name = cluster_id
    else:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return [], "unknown"
        cluster_name = clusters[0]["cluster_name"]

    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return [], cluster_name

    pods_domain = metrics.get("pods") or {}
    if isinstance(pods_domain, str):
        import json
        pods_domain = json.loads(pods_domain)

    pods = pods_domain.get("items", [])
    return pods, cluster_name


def analyze_pod_resources(pod: dict, cluster_id: str) -> PodOptimization:
    """Analyze pod resources using real agent metrics data."""
    pod_name  = pod.get("name", "unknown")
    namespace = pod.get("namespace", "default")
    node_name = pod.get("node_name") or pod.get("node", "unknown") or "unknown"
    owner_kind = pod.get("owner_kind", "Pod")

    # Age
    creation_time = pod.get("creation_timestamp") or pod.get("created")
    age_days = 0
    if creation_time:
        try:
            created = datetime.fromisoformat(creation_time.replace("Z", "+00:00"))
            age_days = (datetime.now(timezone.utc) - created).days
        except Exception:
            pass

    restarts = pod.get("restarts", 0) or pod.get("total_restarts", 0)
    last_restart = f"{restarts} restarts" if restarts > 0 else "No restarts"

    # Resource requests/limits — agent stores them at the pod level directly
    total_cpu_request = float(pod.get("cpu_request", 0.0))
    total_cpu_limit   = float(pod.get("cpu_limit", 0.0))
    total_mem_request = float(pod.get("memory_request_mb", 0.0))  # already in MB
    total_mem_limit   = float(pod.get("memory_limit_mb", 0.0))

    # If pod-level is zero, sum from containers
    if total_cpu_request == 0:
        for c in pod.get("containers", []):
            total_cpu_request += parse_cpu(str(c.get("cpu_request", "0")))
            total_cpu_limit   += parse_cpu(str(c.get("cpu_limit", "0")))
            total_mem_request += float(c.get("memory_request_mb", 0.0)) or \
                                 parse_memory(str(c.get("memory_request", "0")))
            total_mem_limit   += float(c.get("memory_limit_mb", 0.0)) or \
                                 parse_memory(str(c.get("memory_limit", "0")))

    # Live usage from metrics-server (0 when not available)
    cpu_current = float(pod.get("cpu_usage_cores", 0.0))
    mem_current = float(pod.get("memory_usage_mb", 0.0))

    # When metrics-server data is absent fall back to 50 % of request
    has_live = cpu_current > 0 or mem_current > 0
    if not has_live:
        cpu_current = total_cpu_request * 0.5 if total_cpu_request > 0 else 0.0
        mem_current = total_mem_request * 0.5 if total_mem_request > 0 else 0.0

    cpu_average = cpu_current
    cpu_peak    = cpu_current * 1.2 if has_live else cpu_current * 1.3
    mem_average = mem_current
    mem_peak    = mem_current * 1.2 if has_live else mem_current * 1.3

    cpu_util = (cpu_current / total_cpu_request * 100) if total_cpu_request > 0 else 0.0
    mem_util = (mem_current / total_mem_request * 100) if total_mem_request > 0 else 0.0

    cpu_waste_pct = (
        (total_cpu_request - cpu_current) / total_cpu_request * 100
    ) if total_cpu_request > 0 else 0
    mem_waste_pct = (
        (total_mem_request - mem_current) / total_mem_request * 100
    ) if total_mem_request > 0 else 0

    status = "optimized"
    issue = "Resources appropriately sized"
    recommendation = "No action required"
    estimated_savings = 0.0
    risk_level = "low"

    if cpu_waste_pct > 50 and total_cpu_request > 0.1:
        status = "over_provisioned"
        recommended_cpu = max(cpu_peak * 1.3, 0.01)
        cpu_saved = total_cpu_request - recommended_cpu
        monthly_savings = cpu_saved * CPU_COST_PER_CORE_HOUR * 730
        issue = f"Pod uses {cpu_current:.2f} cores, requests {total_cpu_request:.2f} ({cpu_waste_pct:.0f}% waste)"
        recommendation = f"Reduce CPU to {recommended_cpu:.2f} cores"
        estimated_savings += monthly_savings

    if mem_waste_pct > 50 and total_mem_request > 16:
        if status != "over_provisioned":
            status = "over_provisioned"
        recommended_mem = max(mem_peak * 1.3, 16)
        mem_saved_gb = (total_mem_request - recommended_mem) / 1024
        monthly_savings = mem_saved_gb * MEMORY_COST_PER_GB_HOUR * 730
        if issue == "Resources appropriately sized":
            issue = f"Memory at {mem_util:.0f}% ({mem_waste_pct:.0f}% waste)"
        recommendation = f"Reduce memory to {recommended_mem:.0f}MB"
        estimated_savings += monthly_savings

    if cpu_util > 85 or mem_util > 85 or restarts > 5:
        status = "under_provisioned"
        if cpu_util > 85:
            recommended_cpu = total_cpu_request * 1.5
            issue = f"CPU at {cpu_util:.0f}% - throttling risk"
            recommendation = f"Increase CPU to {recommended_cpu:.2f} cores"
        elif mem_util > 85:
            recommended_mem = total_mem_request * 1.4
            issue = f"Memory at {mem_util:.0f}% - OOMKill risk"
            recommendation = f"Increase memory to {recommended_mem:.0f}MB"
        elif restarts > 5:
            issue = f"{restarts} restarts - resource constraints"
            recommendation = "Investigate and increase resources"
        risk_level = "high" if restarts > 10 else "medium"
        estimated_savings = 0

    return PodOptimization(
        pod_name=pod_name,
        namespace=namespace,
        cluster_id=cluster_id,
        workload_type=owner_kind,
        node_name=node_name,
        cpu_metrics=ResourceMetrics(
            current=round(cpu_current, 3),
            average=round(cpu_average, 3),
            peak=round(cpu_peak, 3),
            requested=round(total_cpu_request, 3),
            limit=round(total_cpu_limit, 3) if total_cpu_limit > 0 else round(total_cpu_request * 2, 3),
            utilization_percent=round(cpu_util, 1),
        ),
        memory_metrics=ResourceMetrics(
            current=round(mem_current, 1),
            average=round(mem_average, 1),
            peak=round(mem_peak, 1),
            requested=round(total_mem_request, 1),
            limit=round(total_mem_limit, 1) if total_mem_limit > 0 else round(total_mem_request * 2, 1),
            utilization_percent=round(mem_util, 1),
        ),
        smart_analysis=SmartAnalysis(
            issue=issue,
            recommendation=recommendation,
            estimated_savings=round(estimated_savings, 2),
            risk_level=risk_level,
        ),
        status=status,
        last_restart=last_restart,
        age_days=age_days,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[PodOptimization])
async def list_pods(
    cluster_id: Optional[str] = Query(None),
    namespace: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List all pods with optimization metrics — reads from agent_metrics in Supabase."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        if not pods:
            logger.info("No pods found in agent_metrics")
            return []

        optimizations = []
        for pod in pods:
            try:
                opt = analyze_pod_resources(pod, resolved_cluster)
                optimizations.append(opt)
            except Exception as e:
                logger.error(f"Error analysing pod {pod.get('name')}: {e}")

        if namespace:
            optimizations = [p for p in optimizations if p.namespace == namespace]
        if status:
            optimizations = [p for p in optimizations if p.status == status]

        logger.info(f"Returning {len(optimizations)} pods from db_manager")
        return optimizations
    except Exception as e:
        logger.error(f"Error fetching pods: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_pod_summary(cluster_id: Optional[str] = Query(None)):
    """Summary statistics for pod optimization."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        if not pods:
            return {
                "total_pods": 0,
                "over_provisioned": 0,
                "under_provisioned": 0,
                "optimized": 0,
                "total_potential_savings": 0.0,
                "avg_cpu_utilization": 0.0,
                "avg_memory_utilization": 0.0,
                "optimization_opportunities": 0,
            }

        optimizations = []
        for pod in pods:
            try:
                optimizations.append(analyze_pod_resources(pod, resolved_cluster))
            except Exception:
                pass

        total_pods = len(optimizations)
        over_provisioned = sum(1 for p in optimizations if "Reduce" in p.smart_analysis.recommendation)
        under_provisioned = sum(1 for p in optimizations if "Increase" in p.smart_analysis.recommendation)
        optimized = sum(1 for p in optimizations if "No action" in p.smart_analysis.recommendation)
        total_savings = sum(
            p.smart_analysis.estimated_savings for p in optimizations
            if p.smart_analysis.estimated_savings > 0
        )
        avg_cpu = (
            sum(p.cpu_metrics.utilization_percent for p in optimizations) / total_pods
            if total_pods else 0
        )
        avg_mem = (
            sum(p.memory_metrics.utilization_percent for p in optimizations) / total_pods
            if total_pods else 0
        )

        return {
            "total_pods": total_pods,
            "over_provisioned": over_provisioned,
            "under_provisioned": under_provisioned,
            "optimized": optimized,
            "total_potential_savings": round(total_savings, 2),
            "avg_cpu_utilization": round(avg_cpu, 1),
            "avg_memory_utilization": round(avg_mem, 1),
            "optimization_opportunities": over_provisioned + under_provisioned,
        }
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cpu-analysis", response_model=List[CPUAnalysisItem])
async def get_cpu_analysis(
    namespace: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """CPU analysis from agent_metrics."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        result = []
        for pod in pods:
            try:
                opt = analyze_pod_resources(pod, resolved_cluster)
                cpu = opt.cpu_metrics
                cpu_waste = (
                    (cpu.requested - cpu.current) / cpu.requested * 100
                ) if cpu.requested > 0 else 0
                pod_status = "optimal"
                recommendation = "CPU resources appropriately sized"
                estimated_savings = 0.0
                cpu_throttling = 0.0
                if cpu_waste > 50 and cpu.requested > 0.1:
                    pod_status = "over_provisioned"
                    recommended_cpu = max(cpu.peak * 1.3, 0.01)
                    estimated_savings = (
                        (cpu.requested - recommended_cpu) * CPU_COST_PER_CORE_HOUR * 730
                    )
                    recommendation = (
                        f"Reduce CPU request from {cpu.requested:.2f} to {recommended_cpu:.2f} cores"
                    )
                elif cpu.utilization_percent > 85:
                    pod_status = "under_provisioned"
                    recommendation = (
                        f"Increase CPU request from {cpu.requested:.2f} to {cpu.requested * 1.5:.2f} cores"
                    )
                    cpu_throttling = 5.0
                if namespace and opt.namespace != namespace:
                    continue
                result.append(CPUAnalysisItem(
                    pod_name=opt.pod_name, namespace=opt.namespace,
                    cluster_id=opt.cluster_id, node_name=opt.node_name,
                    cpu_current=cpu.current, cpu_average=cpu.average, cpu_peak=cpu.peak,
                    cpu_request=cpu.requested, cpu_limit=cpu.limit,
                    cpu_utilization=cpu.utilization_percent, cpu_throttling=cpu_throttling,
                    cpu_waste_percent=round(cpu_waste, 1), recommendation=recommendation,
                    estimated_savings=round(estimated_savings, 2), status=pod_status,
                    age_days=opt.age_days,
                ))
            except Exception as e:
                logger.error(f"CPU analysis error for pod {pod.get('name')}: {e}")
        if status:
            result = [p for p in result if p.status == status]
        return result
    except Exception as e:
        logger.error(f"Error in CPU analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory-analysis", response_model=List[MemoryAnalysisItem])
async def get_memory_analysis(
    namespace: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """Memory analysis from agent_metrics."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        result = []
        for pod in pods:
            try:
                opt = analyze_pod_resources(pod, resolved_cluster)
                mem = opt.memory_metrics
                restarts = pod.get("restarts", 0)
                oom_kills = 1 if restarts > 5 and mem.utilization_percent > 80 else 0
                mem_waste = (
                    (mem.requested - mem.current) / mem.requested * 100
                ) if mem.requested > 0 else 0
                pod_status = "optimal"
                recommendation = "Memory resources appropriately sized"
                estimated_savings = 0.0
                if oom_kills > 0:
                    pod_status = "oom_risk"
                    recommendation = (
                        f"OOM risk! Increase memory from {mem.requested:.0f}MB to {mem.requested * 1.5:.0f}MB"
                    )
                elif mem_waste > 50 and mem.requested > 128:
                    pod_status = "over_provisioned"
                    recommended_mem = max(mem.peak * 1.3, 64)
                    estimated_savings = (
                        (mem.requested - recommended_mem) / 1024
                    ) * MEMORY_COST_PER_GB_HOUR * 730
                    recommendation = (
                        f"Reduce memory from {mem.requested:.0f}MB to {recommended_mem:.0f}MB"
                    )
                elif mem.utilization_percent > 85:
                    pod_status = "under_provisioned"
                    recommendation = (
                        f"Increase memory from {mem.requested:.0f}MB to {mem.requested * 1.4:.0f}MB"
                    )
                if namespace and opt.namespace != namespace:
                    continue
                result.append(MemoryAnalysisItem(
                    pod_name=opt.pod_name, namespace=opt.namespace,
                    cluster_id=opt.cluster_id, node_name=opt.node_name,
                    memory_current=mem.current, memory_average=mem.average, memory_peak=mem.peak,
                    memory_request=mem.requested, memory_limit=mem.limit,
                    memory_utilization=mem.utilization_percent,
                    memory_waste_percent=round(mem_waste, 1), oom_kills=oom_kills,
                    recommendation=recommendation,
                    estimated_savings=round(estimated_savings, 2), status=pod_status,
                    age_days=opt.age_days,
                ))
            except Exception as e:
                logger.error(f"Memory analysis error for pod {pod.get('name')}: {e}")
        if status:
            result = [p for p in result if p.status == status]
        return result
    except Exception as e:
        logger.error(f"Error in memory analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _last_restart_time(pod: dict) -> str:
    """Return the real last-restart timestamp as a human-readable string.

    Sources (in priority order):
    1. last_state_finished from any container_status (added by updated agent)
    2. start_time of the pod (current run started after a restart)
    3. created_at of the pod as final fallback
    """
    best: Optional[datetime] = None
    for cs in pod.get("container_statuses", []):
        finished = cs.get("last_state_finished")
        if finished:
            try:
                dt = datetime.fromisoformat(finished.replace("Z", "+00:00"))
                if best is None or dt > best:
                    best = dt
            except Exception:
                pass

    # Fall back to pod start_time (the pod restarted when the current run began)
    if best is None:
        for key in ("start_time", "created"):
            ts = pod.get(key)
            if ts:
                try:
                    best = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    break
                except Exception:
                    pass

    if best is None:
        return "unknown"

    delta = datetime.now(timezone.utc) - best
    minutes = int(delta.total_seconds() // 60)
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    return f"{hours // 24}d ago"


def _restart_reason(pod: dict) -> str:
    """Extract the real restart reason from container state/last_state."""
    for cs in pod.get("container_statuses", []):
        reason = cs.get("last_state_reason")
        if reason:
            return reason
        # Current state may also be informative (e.g. waiting:CrashLoopBackOff)
        state = cs.get("state", "")
        if isinstance(state, str) and ":" in state:
            return state.split(":", 1)[1]
    return "Unknown"


@router.get("/restart-analysis", response_model=List[RestartAnalysisItem])
async def get_restart_analysis(
    namespace: Optional[str] = Query(None),
    min_restarts: int = Query(1, description="Minimum restart count to include"),
    cluster_id: Optional[str] = Query(None),
):
    """Restart analysis from agent_metrics — uses real restart counts and timestamps."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        result = []
        for pod in pods:
            try:
                # Agent stores restarts as total_restarts (sum of all containers)
                restarts = int(pod.get("total_restarts") or pod.get("restarts") or 0)
                if restarts < min_restarts:
                    continue
                if namespace and pod.get("namespace") != namespace:
                    continue
                opt = analyze_pod_resources(pod, resolved_cluster)

                # Real reason from container last_state / current waiting state
                restart_reason = _restart_reason(pod)
                crash_loop = (
                    restart_reason == "CrashLoopBackOff" or restarts > 100
                )
                oom_kills = sum(
                    1 for cs in pod.get("container_statuses", [])
                    if cs.get("last_state_reason") == "OOMKilled"
                )

                if oom_kills > 0:
                    severity = "critical" if oom_kills > 3 else "high"
                    recommendation = (
                        f"Increase memory from {opt.memory_metrics.requested:.0f}MB "
                        f"to {opt.memory_metrics.requested * 1.5:.0f}MB"
                    )
                elif crash_loop:
                    severity = "critical"
                    recommendation = "Investigate application logs and increase resources"
                elif restarts > 50:
                    severity = "high"
                    recommendation = "Review application health checks and resource limits"
                else:
                    severity = "medium"
                    recommendation = "Monitor pod for additional restarts"

                result.append(RestartAnalysisItem(
                    pod_name=opt.pod_name, namespace=opt.namespace,
                    cluster_id=opt.cluster_id, node_name=opt.node_name,
                    restart_count=restarts,
                    last_restart_time=_last_restart_time(pod),
                    restart_reason=restart_reason,
                    cpu_at_restart=round(opt.cpu_metrics.current or opt.cpu_metrics.requested * 0.85, 3),
                    memory_at_restart=round(opt.memory_metrics.current or opt.memory_metrics.requested * 0.92, 1),
                    oom_kills=oom_kills, crash_loop=crash_loop,
                    recommendation=recommendation, severity=severity,
                    age_days=opt.age_days,
                ))
            except Exception as e:
                logger.error(f"Restart analysis error for pod {pod.get('name')}: {e}")
        result.sort(key=lambda x: x.restart_count, reverse=True)
        return result
    except Exception as e:
        logger.error(f"Error in restart analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/oom-events", response_model=List[OOMEventItem])
async def get_oom_events(
    namespace: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """OOM events derived from real agent_metrics pod restart data."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        result = []
        for pod in pods:
            try:
                if namespace and pod.get("namespace") != namespace:
                    continue

                # Count actual OOMKilled last_state entries across containers
                oom_count = sum(
                    1 for cs in pod.get("container_statuses", [])
                    if cs.get("last_state_reason") == "OOMKilled"
                )
                # Fall back: high restarts + high memory utilization heuristic
                if oom_count == 0:
                    restarts = int(pod.get("total_restarts") or pod.get("restarts") or 0)
                    opt_check = analyze_pod_resources(pod, resolved_cluster)
                    if restarts > 3 and opt_check.memory_metrics.utilization_percent > 75:
                        oom_count = restarts

                if oom_count == 0:
                    continue

                opt = analyze_pod_resources(pod, resolved_cluster)
                mem = opt.memory_metrics
                mem_at_oom = mem.limit * 0.97 if mem.limit > 0 else mem.requested * 0.98
                recommended_mem = max(mem_at_oom * 1.5, mem.requested * 1.4)
                estimated_cost = (
                    (recommended_mem - mem.requested) / 1024
                ) * MEMORY_COST_PER_GB_HOUR * 730
                severity = "critical" if oom_count > 5 else ("high" if oom_count > 2 else "medium")

                # Real last OOM time from container last_state_finished
                last_oom_time = _last_restart_time(pod)

                result.append(OOMEventItem(
                    pod_name=opt.pod_name, namespace=opt.namespace,
                    cluster_id=opt.cluster_id, node_name=opt.node_name,
                    oom_count=oom_count, last_oom_time=last_oom_time,
                    memory_limit=mem.limit if mem.limit > 0 else round(mem.requested * 2, 1),
                    memory_at_oom=round(mem_at_oom, 1),
                    memory_request=mem.requested,
                    recommended_memory=round(recommended_mem, 1),
                    estimated_cost_increase=round(estimated_cost, 2),
                    severity=severity, age_days=opt.age_days,
                ))
            except Exception as e:
                logger.error(f"OOM analysis error for pod {pod.get('name')}: {e}")
        result.sort(key=lambda x: x.oom_count, reverse=True)
        return result
    except Exception as e:
        logger.error(f"Error in OOM analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pod-health", response_model=List[PodHealthItem])
async def get_pod_health(
    namespace: Optional[str] = Query(None),
    health_status: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
):
    """Pod health from agent_metrics."""
    try:
        pods, resolved_cluster = _get_pods_from_db(cluster_id)
        result = []
        for pod in pods:
            try:
                if namespace and pod.get("namespace") != namespace:
                    continue
                opt = analyze_pod_resources(pod, resolved_cluster)
                restarts = pod.get("restarts", 0)
                pod_status = pod.get("status", "Unknown")
                cpu_util = opt.cpu_metrics.utilization_percent
                mem_util = opt.memory_metrics.utilization_percent
                ready = pod_status == "Running" and restarts < 5
                cpu_health = (
                    "critical" if cpu_util > 90 else "warning" if cpu_util > 80 else "healthy"
                )
                memory_health = (
                    "critical" if mem_util > 90 else "warning" if mem_util > 85 else "healthy"
                )
                health_score = 100
                if pod_status != "Running":
                    health_score -= 40
                if not ready:
                    health_score -= 20
                if restarts > 10:
                    health_score -= 30
                elif restarts > 5:
                    health_score -= 20
                elif restarts > 0:
                    health_score -= 10
                if cpu_health == "critical":
                    health_score -= 15
                elif cpu_health == "warning":
                    health_score -= 8
                if memory_health == "critical":
                    health_score -= 15
                elif memory_health == "warning":
                    health_score -= 8
                health_score = max(0, health_score)
                overall_health = (
                    "healthy" if health_score >= 80
                    else "degraded" if health_score >= 50
                    else "unhealthy"
                )
                issues = []
                recommendations = []
                if pod_status != "Running":
                    issues.append(f"Pod status: {pod_status}")
                if not ready:
                    issues.append("Pod not ready")
                if restarts > 5:
                    issues.append(f"{restarts} restarts detected")
                if cpu_health != "healthy":
                    issues.append(f"CPU {cpu_health}: {cpu_util:.0f}%")
                if memory_health != "healthy":
                    issues.append(f"Memory {memory_health}: {mem_util:.0f}%")
                if opt.smart_analysis.recommendation != "No action required":
                    recommendations.append(opt.smart_analysis.recommendation)
                result.append(PodHealthItem(
                    pod_name=opt.pod_name, namespace=opt.namespace,
                    cluster_id=opt.cluster_id, node_name=opt.node_name,
                    status=pod_status, ready=ready, restarts=restarts,
                    cpu_health=cpu_health, memory_health=memory_health,
                    overall_health=overall_health, health_score=health_score,
                    issues=issues, recommendations=recommendations,
                    age_days=opt.age_days,
                ))
            except Exception as e:
                logger.error(f"Health analysis error for pod {pod.get('name')}: {e}")
        if health_status:
            result = [p for p in result if p.overall_health == health_status]
        return result
    except Exception as e:
        logger.error(f"Error in pod health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/simulation", response_model=List[PodOptimization])
async def list_simulation_pods(
    cluster_id: Optional[str] = Query(None),
    namespace: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """Alias to the main list_pods endpoint (legacy simulation route)."""
    return await list_pods(cluster_id=cluster_id, namespace=namespace, status=status)

# Made with Bob
