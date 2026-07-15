"""
AI Incident Correlation API
Detects OOMKill risk, restart incidents, and CPU throttling directly from
the live agent_metrics stored in Postgres — no K8S_AVAILABLE gate, no
self-HTTP calls.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Pydantic models ────────────────────────────────────────────────────────────

class Incident(BaseModel):
    incident_id: str
    type: str          # oomkill | restart | throttling | eviction
    severity: str      # critical | high | medium | low
    pod_name: str
    namespace: str
    cluster: str
    timestamp: str
    count: int
    message: str
    resource_correlation: Dict[str, Any]


class CorrelationAnalysis(BaseModel):
    incident_id: str
    incident_type: str
    pod_name: str
    namespace: str
    cluster: str
    root_cause: str
    confidence: float
    correlated_metrics: Dict[str, Any]
    recommendation: str
    estimated_fix_time: str
    priority: str


class IncidentPattern(BaseModel):
    pattern_id: str
    pattern_type: str
    description: str
    frequency: int
    affected_pods: List[str]
    common_cause: str
    prevention_steps: List[str]


# ── Helpers ────────────────────────────────────────────────────────────────────

def parse_cpu(val) -> float:
    s = str(val).strip()
    if not s or s == "0":
        return 0.0
    try:
        if s.endswith("n"):
            return float(s[:-1]) / 1_000_000_000
        if s.endswith("u"):
            return float(s[:-1]) / 1_000_000
        if s.endswith("m"):
            return float(s[:-1]) / 1000
        return float(s)
    except Exception:
        return 0.0


def parse_memory(val) -> float:
    """Return MB"""
    s = str(val).strip()
    if not s or s == "0":
        return 0.0
    try:
        if s.endswith("Ki"):
            return float(s[:-2]) / 1024
        if s.endswith("Mi"):
            return float(s[:-2])
        if s.endswith("Gi"):
            return float(s[:-2]) * 1024
        if s.endswith("Ti"):
            return float(s[:-2]) * 1024 * 1024
        if s.endswith("K"):
            return float(s[:-1]) / 1024
        if s.endswith("M"):
            return float(s[:-1])
        if s.endswith("G"):
            return float(s[:-1]) * 1024
        return float(s) / (1024 * 1024)
    except Exception:
        return 0.0


def _get_pods(cluster_id: Optional[str] = None):
    """
    Load raw pod list from the latest agent_metrics row.
    Returns (pods: list[dict], cluster_name: str).
    """
    from database.db import db_manager
    from utils.cluster_registry import get_clusters

    # Resolve cluster_name
    if cluster_id:
        cluster_name = cluster_id
    else:
        clusters = get_clusters()
        if not clusters:
            return [], "unknown"
        cluster_name = clusters[0]["id"]

    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        # Try by display name
        all_c = db_manager.get_all_clusters()
        if all_c:
            cluster_name = all_c[0]["cluster_name"]
            metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return [], cluster_name

    pods_domain = metrics.get("pods") or {}
    if isinstance(pods_domain, str):
        import json
        try:
            pods_domain = json.loads(pods_domain)
        except Exception:
            pods_domain = {}

    pods = pods_domain.get("items", [])
    return pods, cluster_name


def _analyze(pods: list, cluster_name: str):
    """
    Scan every pod for OOMKill risk, high restarts, and CPU throttling.
    Returns (incidents, correlations) as lists of dicts.
    """
    incidents    = []
    correlations = []
    counter      = 1
    now          = datetime.now(timezone.utc).isoformat()

    for pod in pods:
        pod_name  = pod.get("name") or pod.get("pod_name") or "unknown"
        namespace = pod.get("namespace") or "default"

        # ── Resource values ──────────────────────────────────────────────────
        cpu_req   = float(pod.get("cpu_request")        or 0.0)
        cpu_lim   = float(pod.get("cpu_limit")          or 0.0)
        mem_req   = float(pod.get("memory_request_mb")  or 0.0)
        mem_lim   = float(pod.get("memory_limit_mb")    or 0.0)

        # Fall back to container-level if pod-level is zero
        if cpu_req == 0:
            for c in pod.get("containers", []):
                cpu_req += parse_cpu(c.get("cpu_request", "0"))
                cpu_lim += parse_cpu(c.get("cpu_limit",   "0"))
                mem_req += float(c.get("memory_request_mb", 0)) or \
                           parse_memory(c.get("memory_request", "0"))
                mem_lim += float(c.get("memory_limit_mb",  0)) or \
                           parse_memory(c.get("memory_limit",  "0"))

        cpu_usage = float(pod.get("cpu_usage_cores") or 0.0)
        mem_usage = float(pod.get("memory_usage_mb")  or 0.0)

        # Effective limit defaults to 2× request when absent
        eff_cpu_lim = cpu_lim if cpu_lim > 0 else cpu_req * 2
        eff_mem_lim = mem_lim if mem_lim > 0 else mem_req * 2

        # Peak estimates (1.3× current when live data absent)
        has_live  = cpu_usage > 0 or mem_usage > 0
        cpu_usage = cpu_usage or (cpu_req * 0.5)
        mem_usage = mem_usage or (mem_req * 0.5)
        cpu_peak  = cpu_usage * (1.2 if has_live else 1.3)
        mem_peak  = mem_usage * (1.2 if has_live else 1.3)

        restarts = int(pod.get("restarts") or pod.get("total_restarts") or 0)
        age_days = int(pod.get("age_days") or 1) or 1

        # ── 1. OOMKill risk — memory peak > 90 % of limit ───────────────────
        if eff_mem_lim > 0:
            mem_pct = mem_peak / eff_mem_lim * 100
            if mem_pct > 90:
                iid      = f"inc-{counter:03d}"
                counter += 1
                severity = "critical" if mem_pct > 95 else "high"
                oomkill_count = max(1, restarts // 2) if restarts > 0 else 1
                rec_lim = eff_mem_lim * 1.3

                incidents.append({
                    "incident_id":          iid,
                    "type":                 "oomkill",
                    "severity":             severity,
                    "pod_name":             pod_name,
                    "namespace":            namespace,
                    "cluster":              cluster_name,
                    "timestamp":            now,
                    "count":                oomkill_count,
                    "message":              f"OOMKill risk: memory peak {mem_pct:.1f}% of limit",
                    "resource_correlation": {
                        "memory_request":    f"{mem_req:.0f}Mi",
                        "memory_limit":      f"{eff_mem_lim:.0f}Mi",
                        "peak_memory_usage": f"{mem_peak:.0f}Mi",
                        "memory_trend":      severity,
                    },
                })
                correlations.append({
                    "incident_id":       iid,
                    "incident_type":     "oomkill",
                    "pod_name":          pod_name,
                    "namespace":         namespace,
                    "cluster":           cluster_name,
                    "root_cause":        "Memory limit too low for workload requirements",
                    "confidence":        95.0 if mem_pct > 95 else 85.0,
                    "correlated_metrics": {
                        "memory_peak_pct_of_limit": f"{mem_pct:.1f}%",
                        "peak_usage_mb":            f"{mem_peak:.0f}",
                        "limit_mb":                 f"{eff_mem_lim:.0f}",
                        "oomkill_risk":             "Very High" if mem_pct > 95 else "High",
                    },
                    "recommendation":    f"Increase memory limit to {rec_lim:.0f}Mi",
                    "estimated_fix_time": "5 minutes",
                    "priority":          severity,
                })

        # ── 2. Restart incidents — >10 restarts AND >1/day rate ─────────────
        restarts_per_day = restarts / age_days
        if restarts > 10 and restarts_per_day > 1:
            iid      = f"inc-{counter:03d}"
            counter += 1
            if restarts_per_day > 10:
                severity = "critical"
            elif restarts_per_day > 5:
                severity = "high"
            else:
                severity = "medium"

            if mem_peak > eff_mem_lim * 0.9:
                reason = "OOMKilled"
                root   = "Memory exhaustion causing OOMKills"
            elif eff_cpu_lim > 0 and cpu_peak > eff_cpu_lim * 0.9:
                reason = "CPU throttling"
                root   = "CPU throttling causing application timeouts"
            else:
                reason = "CrashLoopBackOff"
                root   = "Resource constraints causing application crashes"

            incidents.append({
                "incident_id":          iid,
                "type":                 "restart",
                "severity":             severity,
                "pod_name":             pod_name,
                "namespace":            namespace,
                "cluster":              cluster_name,
                "timestamp":            now,
                "count":                restarts,
                "message":              f"Pod restarted {restarts}× ({restarts_per_day:.1f}/day) — {reason}",
                "resource_correlation": {
                    "restart_count":    restarts,
                    "restart_reason":   reason,
                    "cpu_usage_cores":  f"{cpu_usage:.3f}",
                    "mem_usage_mb":     f"{mem_usage:.0f}",
                },
            })
            correlations.append({
                "incident_id":       iid,
                "incident_type":     "restart",
                "pod_name":          pod_name,
                "namespace":         namespace,
                "cluster":           cluster_name,
                "root_cause":        root,
                "confidence":        88.0,
                "correlated_metrics": {
                    "restart_count":        restarts,
                    "restarts_per_day":     f"{restarts_per_day:.1f}",
                    "restart_reason":       reason,
                    "cpu_utilization_pct":  f"{(cpu_usage / cpu_req * 100) if cpu_req > 0 else 0:.1f}%",
                    "memory_utilization_pct": f"{(mem_usage / mem_req * 100) if mem_req > 0 else 0:.1f}%",
                },
                "recommendation":    "Increase resource limits and add readiness/liveness probes",
                "estimated_fix_time": "3 minutes",
                "priority":          severity,
            })

        # ── 3. CPU throttling — cpu peak > 85 % of limit ────────────────────
        if eff_cpu_lim > 0:
            cpu_pct = cpu_peak / eff_cpu_lim * 100
            if cpu_pct > 85:
                iid       = f"inc-{counter:03d}"
                counter  += 1
                severity  = "high" if cpu_pct > 95 else "medium"
                throttle_events = int((cpu_pct - 85) * 10)
                rec_lim   = eff_cpu_lim * 1.5

                incidents.append({
                    "incident_id":          iid,
                    "type":                 "throttling",
                    "severity":             severity,
                    "pod_name":             pod_name,
                    "namespace":            namespace,
                    "cluster":              cluster_name,
                    "timestamp":            now,
                    "count":                throttle_events,
                    "message":              f"CPU throttling: peak {cpu_pct:.1f}% of limit (~{throttle_events} events est.)",
                    "resource_correlation": {
                        "cpu_request":          f"{cpu_req:.3f}",
                        "cpu_limit":            f"{eff_cpu_lim:.3f}",
                        "cpu_peak_cores":       f"{cpu_peak:.3f}",
                        "throttling_percentage": f"{cpu_pct:.1f}%",
                    },
                })
                correlations.append({
                    "incident_id":       iid,
                    "incident_type":     "throttling",
                    "pod_name":          pod_name,
                    "namespace":         namespace,
                    "cluster":           cluster_name,
                    "root_cause":        "CPU limit too restrictive for workload demand",
                    "confidence":        92.0,
                    "correlated_metrics": {
                        "cpu_peak_pct_of_limit": f"{cpu_pct:.1f}%",
                        "estimated_throttle_events": throttle_events,
                        "performance_impact": "High latency / slow responses",
                    },
                    "recommendation":    f"Increase CPU limit to {rec_lim:.2f} cores",
                    "estimated_fix_time": "2 minutes",
                    "priority":          severity,
                })

    return incidents, correlations


def _build_patterns(incidents: list) -> list:
    by_type: Dict[str, list] = {}
    for i in incidents:
        by_type.setdefault(i["type"], []).append(i)

    patterns = []
    pid = 1

    _steps = {
        "oomkill": [
            "Increase memory limits for affected pods",
            "Set VPA (VerticalPodAutoscaler) in recommendation mode",
            "Add memory monitoring and OOMKill alerts",
            "Consider horizontal scaling for memory-intensive workloads",
        ],
        "restart": [
            "Investigate crash logs: kubectl logs <pod> --previous",
            "Add liveness and readiness probes",
            "Increase resource limits",
            "Implement graceful shutdown handling",
        ],
        "throttling": [
            "Increase CPU limits for affected services",
            "Enable HorizontalPodAutoscaler",
            "Profile application CPU usage during peak",
            "Use burst-capable resource configurations",
        ],
    }

    for t, items in by_type.items():
        pods = list({i["pod_name"] for i in items})[:5]
        patterns.append({
            "pattern_id":      f"pattern-{pid:03d}",
            "pattern_type":    t,
            "description": {
                "oomkill":    "Memory exhaustion across multiple pods",
                "restart":    "Frequent pod restarts due to resource pressure",
                "throttling": "CPU throttling degrading performance",
            }.get(t, f"{t} incidents"),
            "frequency":       len(items),
            "affected_pods":   pods,
            "common_cause": {
                "oomkill":    "Memory limits set below actual working-set requirements",
                "restart":    "Application crashes under resource pressure or misconfig",
                "throttling": "CPU limits too restrictive for burst workloads",
            }.get(t, "Resource misconfiguration"),
            "prevention_steps": _steps.get(t, ["Review resource settings"]),
        })
        pid += 1

    return patterns


# ── Resolve cluster from query param ──────────────────────────────────────────

def _resolve(cluster: Optional[str]) -> str:
    from utils.cluster_registry import get_clusters
    clusters = get_clusters()
    if not clusters:
        return "unknown"
    ids = [c["id"] for c in clusters]
    if cluster and cluster not in ("all", ""):
        return cluster if cluster in ids else ids[0]
    return ids[0]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/incidents", response_model=List[Incident])
async def get_incidents(
    cluster_id: Optional[str] = Query(None),
    namespace: Optional[str] = None,
    incident_type: Optional[str] = None,
    severity: Optional[str] = None,
):
    """Return live incidents derived from agent pod metrics."""
    cname = _resolve(cluster_id)
    pods, cname = _get_pods(cname)
    incidents, _ = _analyze(pods, cname)

    if namespace:
        incidents = [i for i in incidents if i["namespace"] == namespace]
    if incident_type:
        incidents = [i for i in incidents if i["type"] == incident_type]
    if severity:
        incidents = [i for i in incidents if i["severity"] == severity]

    logger.info(f"incidents: {len(incidents)} from {len(pods)} pods in {cname}")
    return incidents


@router.get("/correlations", response_model=List[CorrelationAnalysis])
async def get_correlations(
    cluster_id: Optional[str] = Query(None),
    namespace: Optional[str] = None,
    min_confidence: float = 0,
):
    """Return AI correlation analysis for all detected incidents."""
    cname = _resolve(cluster_id)
    pods, cname = _get_pods(cname)
    _, correlations = _analyze(pods, cname)

    if namespace:
        correlations = [c for c in correlations if c["namespace"] == namespace]
    if min_confidence > 0:
        correlations = [c for c in correlations if c["confidence"] >= min_confidence]

    return sorted(correlations, key=lambda x: x["confidence"], reverse=True)


@router.get("/patterns", response_model=List[IncidentPattern])
async def get_patterns(cluster_id: Optional[str] = Query(None)):
    """Return recurring incident patterns derived from live data."""
    cname = _resolve(cluster_id)
    pods, cname = _get_pods(cname)
    incidents, _ = _analyze(pods, cname)
    return _build_patterns(incidents)


@router.get("/summary")
async def get_incident_summary(cluster_id: Optional[str] = Query(None)):
    """Return aggregated incident statistics."""
    cname = _resolve(cluster_id)
    pods, cname = _get_pods(cname)
    incidents, _ = _analyze(pods, cname)

    by_type: Dict[str, int] = {}
    by_sev:  Dict[str, int] = {}
    pod_counts: Dict[str, int] = {}

    for i in incidents:
        by_type[i["type"]]     = by_type.get(i["type"], 0)     + 1
        by_sev[i["severity"]]  = by_sev.get(i["severity"], 0)  + 1
        pod_counts[i["pod_name"]] = pod_counts.get(i["pod_name"], 0) + i["count"]

    top_pods = sorted(pod_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "total_incidents":        len(incidents),
        "by_type":                by_type,
        "by_severity":            by_sev,
        "by_cluster":             {cname: len(incidents)},
        "top_affected_pods":      [{"pod": p, "count": c} for p, c in top_pods],
        "total_oomkills":         sum(i["count"] for i in incidents if i["type"] == "oomkill"),
        "total_restarts":         sum(i["count"] for i in incidents if i["type"] == "restart"),
        "total_throttling_events": sum(i["count"] for i in incidents if i["type"] == "throttling"),
    }


@router.get("/timeline")
async def get_incident_timeline(cluster_id: Optional[str] = Query(None)):
    """Return incidents sorted chronologically."""
    cname = _resolve(cluster_id)
    pods, cname = _get_pods(cname)
    incidents, _ = _analyze(pods, cname)
    return sorted(
        [{"timestamp": i["timestamp"], "incident_type": i["type"],
          "pod_name": i["pod_name"], "namespace": i["namespace"],
          "severity": i["severity"], "message": i["message"]}
         for i in incidents],
        key=lambda x: x["timestamp"], reverse=True,
    )

# Made with Bob
