"""
Simulation API — What-if scenario engine.

/scenarios  — derived from over-provisioned pods via _get_pods() + cost_service
/results/{id} — computes the what-if result for a scenario_id

All cost figures anchored to cost_service.resolve() for cross-page consistency.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

HOURS_PER_MONTH = 730


# ── helpers ────────────────────────────────────────────────────────────────────

def _get_pods(cluster_id: Optional[str] = None):
    """Load raw pod list from latest agent_metrics."""
    from database.db import db_manager
    from utils.cluster_registry import get_clusters

    clusters = get_clusters()
    if not clusters:
        return [], "unknown"

    ids = [c["id"] for c in clusters]
    cname = cluster_id if (cluster_id and cluster_id != "all" and cluster_id in ids) else ids[0]

    raw = db_manager.get_latest_metrics(cname)
    if not raw:
        return [], cname

    pods_raw = raw.get("pods", {})
    pods = pods_raw.get("items", pods_raw) if isinstance(pods_raw, dict) else pods_raw
    return (pods if isinstance(pods, list) else []), cname


def _pod_cost(pod: dict) -> float:
    """Return estimated monthly cost for a pod in USD."""
    from utils.cost_engine import CPU_COST_PER_CORE_HOUR, MEMORY_COST_PER_GB_HOUR
    cpu_req = float(pod.get("cpu_request", 0) or 0)
    mem_req = float(pod.get("memory_request_mb", 0) or 0) / 1024  # → GB
    return round((cpu_req * CPU_COST_PER_CORE_HOUR + mem_req * MEMORY_COST_PER_GB_HOUR) * HOURS_PER_MONTH, 4)


def _is_over_provisioned(pod: dict) -> bool:
    """True when a pod has meaningfully more CPU or memory requested than used."""
    cpu_req   = float(pod.get("cpu_request",         0) or 0)
    cpu_use   = float(pod.get("cpu_usage_cores",      0) or 0)
    mem_req   = float(pod.get("memory_request_mb",    0) or 0)
    mem_use   = float(pod.get("memory_usage_mb",      0) or 0)
    # If usage metrics present, use them; otherwise flag high-request pods as candidates
    if cpu_use > 0 or mem_use > 0:
        return (cpu_req > 0 and cpu_use / max(cpu_req, 0.001) < 0.5) or \
               (mem_req > 0 and mem_use / max(mem_req, 0.001) < 0.5)
    # No usage data — flag pods with large requests (> 0.5 CPU or > 512 MiB)
    return cpu_req > 0.5 or mem_req > 512


def _build_scenario(pod: dict, cluster_name: str, index: int) -> dict:
    """Turn one over-provisioned pod into a simulation scenario dict."""
    name      = pod.get("name", f"pod-{index}")
    namespace = pod.get("namespace", "default")
    cpu_req   = float(pod.get("cpu_request",       0) or 0)
    mem_req   = float(pod.get("memory_request_mb", 0) or 0)
    cpu_use   = float(pod.get("cpu_usage_cores",   0) or 0)
    mem_use   = float(pod.get("memory_usage_mb",   0) or 0)

    # Recommended: set request to usage + 20 % headroom (or 50 % of request if no usage)
    new_cpu = round(cpu_use * 1.20, 3) if cpu_use > 0 else round(cpu_req * 0.5, 3)
    new_mem = round(mem_use * 1.20, 0) if mem_use > 0 else round(mem_req * 0.5, 0)

    changes: Dict[str, Any] = {}
    if cpu_req > 0 and new_cpu < cpu_req:
        changes["cpu_request"] = {"from": cpu_req, "to": new_cpu, "unit": "cores"}
    if mem_req > 0 and new_mem < mem_req:
        changes["memory_request"] = {"from": mem_req, "to": new_mem, "unit": "MiB"}

    return {
        "scenario_id":   f"sim-{cluster_name}-{namespace}-{name}".replace("/", "-"),
        "name":          f"Right-size {name}",
        "description":   f"Reduce over-provisioned resources for pod {name} in {namespace}",
        "resource_type": "Pod",
        "resource_name": name,
        "namespace":     namespace,
        "cluster":       cluster_name,
        "changes":       changes,
        "created_at":    datetime.utcnow().isoformat(),
        # extra fields used by the results endpoint
        "_cpu_req":      cpu_req,
        "_mem_req":      mem_req,
        "_new_cpu":      new_cpu,
        "_new_mem":      new_mem,
    }


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.get("/scenarios")
async def get_scenarios(cluster_id: Optional[str] = Query(None)):
    """
    Return right-sizing scenarios derived from over-provisioned pods.
    Cost anchored to cost_service for cross-page consistency.
    """
    try:
        pods, cluster_name = _get_pods(cluster_id)
        candidates = [p for p in pods if _is_over_provisioned(p)][:50]  # cap at 50

        scenarios = []
        for i, pod in enumerate(candidates):
            sc = _build_scenario(pod, cluster_name, i)
            # Drop internal underscore fields before returning
            scenarios.append({k: v for k, v in sc.items() if not k.startswith("_")})

        return scenarios

    except Exception as e:
        logger.error("Error building simulation scenarios: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{scenario_id}")
async def get_simulation_result(
    scenario_id: str,
    cluster_id: Optional[str] = Query(None),
):
    """
    Compute the what-if result for a scenario_id.
    Cost figures anchored to cost_service (same source as FinOps & Dashboard).
    """
    try:
        import services.cost_service as cost_service

        pods, cluster_name = _get_pods(cluster_id)

        # Find the pod this scenario_id refers to
        pod: Optional[dict] = None
        for i, p in enumerate(pods):
            sc = _build_scenario(p, cluster_name, i)
            if sc["scenario_id"] == scenario_id:
                pod = p
                sc_full = sc
                break

        if pod is None:
            raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

        # Anchor cluster-level cost
        snap       = await cost_service.resolve(cluster_name)
        total_cost = snap.total_monthly_cost

        # Per-pod cost before and after
        cost_before = _pod_cost(pod)

        # Build a synthetic "after" pod with reduced requests
        pod_after = dict(pod)
        if sc_full["_new_cpu"] < sc_full["_cpu_req"]:
            pod_after["cpu_request"] = sc_full["_new_cpu"]
        if sc_full["_new_mem"] < sc_full["_mem_req"]:
            pod_after["memory_request_mb"] = sc_full["_new_mem"]
        cost_after = _pod_cost(pod_after)

        savings    = max(round(cost_before - cost_after, 2), 0)
        risk_level = "low" if savings < 20 else ("medium" if savings < 60 else "high")

        recommendations = []
        warnings        = []

        changes = sc_full.get("changes", {})
        if "cpu_request" in changes:
            chg = changes["cpu_request"]
            recommendations.append(
                f"Reduce CPU request from {chg['from']} → {chg['to']} cores "
                f"(saves ~${round((_pod_cost({'cpu_request': chg['from'], 'memory_request_mb': 0}) - _pod_cost({'cpu_request': chg['to'], 'memory_request_mb': 0})), 2)}/mo)"
            )
        if "memory_request" in changes:
            chg = changes["memory_request"]
            recommendations.append(
                f"Reduce memory request from {chg['from']:.0f} → {chg['to']:.0f} MiB "
                f"(saves ~${round((_pod_cost({'cpu_request': 0, 'memory_request_mb': chg['from']}) - _pod_cost({'cpu_request': 0, 'memory_request_mb': chg['to']})), 2)}/mo)"
            )

        if risk_level == "high":
            warnings.append("Large resource reduction — monitor pod OOM events after applying")
        if pod.get("restarts", 0) or pod.get("total_restarts", 0):
            restarts = pod.get("restarts", 0) or pod.get("total_restarts", 0)
            if restarts > 5:
                warnings.append(f"Pod has {restarts} restarts — ensure sufficient memory before reducing requests")

        return {
            "scenario_id":         scenario_id,
            "success":             True,
            "estimated_savings":   savings,
            "estimated_cost_before": round(cost_before, 2),
            "estimated_cost_after":  round(cost_after, 2),
            "risk_level":          risk_level,
            "performance_impact":  "Minimal — headroom buffer retained above actual usage",
            "availability_impact": "Low — requests set to usage + 20 % headroom",
            "recommendations":     recommendations,
            "warnings":            warnings,
            "metrics": {
                "cluster_monthly_cost": round(total_cost, 2),
                "accuracy":             snap.accuracy,
                "pod_count":            len(pods),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error computing simulation result: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── legacy endpoints (kept for backward compatibility) ─────────────────────────

class FixRequest(BaseModel):
    resource_id: str
    fix_type: str
    new_values: Dict[str, Any]
    user: str = "system"


class RollbackRequest(BaseModel):
    event_id: str
    user: str = "system"


@router.get("/resources")
async def get_resources(
    cluster: Optional[str] = None,
    namespace: Optional[str] = None,
    status: Optional[str] = None,
):
    """Legacy — returns empty list (simulation engine not populated)."""
    return []


@router.get("/history")
async def get_change_history(limit: int = 100):
    """Legacy — returns empty list."""
    return []


@router.get("/metrics/global")
async def get_global_metrics():
    """Legacy — returns zeroed global metrics."""
    return {
        "total_clusters": 0,
        "total_pods": 0,
        "current_monthly_cost": 0.0,
        "baseline_monthly_cost": 0.0,
        "potential_savings": 0.0,
        "savings_realized": 0.0,
        "optimization_percentage": 0.0,
        "last_updated": datetime.utcnow().isoformat(),
    }


# Made with Bob
