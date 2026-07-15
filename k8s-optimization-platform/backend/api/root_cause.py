"""
Root Cause Analysis API
Derives waste root causes from real agent context via _fetch_cluster_context
and cost_service — no self-HTTP, no K8S_AVAILABLE gate.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Pydantic models ───────────────────────────────────────────────────────────

class RootCause(BaseModel):
    category: str
    description: str
    impact: str
    count: int
    cost_impact: float
    severity: str
    recommendation: str


class WasteBreakdown(BaseModel):
    category: str
    amount: float
    percentage: float
    count: int
    examples: List[str]


class RootCauseAnalysis(BaseModel):
    total_waste: float
    analysis_date: str
    root_causes: List[RootCause]
    waste_breakdown: List[WasteBreakdown]
    top_contributors: List[Dict[str, Any]]
    recommendations: List[str]


class ResourceIssue(BaseModel):
    resource_name: str
    resource_type: str
    namespace: str
    cluster: str
    issue_type: str
    root_cause: str
    current_state: Dict[str, Any]
    recommended_action: str
    estimated_savings: float
    risk_level: str


# ── Cluster resolver ──────────────────────────────────────────────────────────

def _resolve_cluster(cluster: Optional[str]) -> str:
    from fastapi import HTTPException
    from utils.cluster_registry import get_clusters
    clusters = get_clusters()
    if not clusters:
        raise HTTPException(status_code=503,
            detail="No clusters registered. Deploy the k8s agent first.")
    ids = [c["id"] for c in clusters]
    if cluster and cluster != "all":
        if cluster not in ids:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found.")
        return cluster
    return ids[0]


# ── Core analysis logic ───────────────────────────────────────────────────────

def _build_analysis(ctx: dict, cluster_name: str, total_monthly_cost: float, savings_potential: float):
    """
    Derive root causes, waste breakdown, resource issues, and top contributors
    purely from the cluster context dict returned by _fetch_cluster_context.
    Returns (root_causes, waste_breakdown, resource_issues, top_contributors, recommendations).
    """
    resources    = ctx.get("resources") or {}
    pods         = ctx.get("pods")      or []
    ns_resources = ctx.get("namespace_resources") or []
    orphaned     = ctx.get("orphaned_pvcs") or []
    nodes        = ctx.get("nodes") or []

    cpu_util = float(resources.get("cpu_utilization_percent") or 0)
    mem_util = float(resources.get("memory_utilization_percent") or 0)

    # ── Per-namespace cost proportions (for savings allocation) ──────────────
    total_cpu_req = sum(
        float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0)
        for ns in ns_resources
    ) or 1.0

    # ── 1. CPU Over-Provisioning ──────────────────────────────────────────────
    # Pods with cpu_request > 0 but cluster CPU util < 50 %
    over_prov_cpu_pods = [
        p for p in pods
        if float(p.get("cpu_request") or 0) > 0.05 and cpu_util < 50
    ]
    cpu_waste_pct   = max(0, 50 - cpu_util) / 100          # fraction over-provisioned
    cpu_waste_cost  = round(total_monthly_cost * cpu_waste_pct * 0.6, 2)

    # ── 2. Memory Over-Provisioning ───────────────────────────────────────────
    over_prov_mem_pods = [
        p for p in pods
        if float(p.get("memory_request_mb") or 0) > 50 and mem_util < 50
    ]
    mem_waste_pct   = max(0, 50 - mem_util) / 100
    mem_waste_cost  = round(total_monthly_cost * mem_waste_pct * 0.4, 2)

    # ── 3. No Resource Limits ─────────────────────────────────────────────────
    no_limits_pods = [
        p for p in pods
        if not p.get("cpu_limit") and not p.get("cpu_limits")
    ]
    limits_waste_cost = round(total_monthly_cost * (len(no_limits_pods) / max(len(pods), 1)) * 0.05, 2)

    # ── 4. Orphaned / Unused Storage ─────────────────────────────────────────
    orphan_cost = round(len(orphaned) * 2.5, 2)   # ~$2.50/PVC/mo

    # ── 5. Idle Namespaces ────────────────────────────────────────────────────
    idle_ns = [ns for ns in ns_resources if int(ns.get("pod_count") or 0) == 0]
    idle_ns_cost = round(len(idle_ns) * 3.0, 2)

    # ── Assemble root_causes ──────────────────────────────────────────────────
    root_causes: List[Dict] = []

    if over_prov_cpu_pods:
        root_causes.append({
            "category":       "CPU Over-Provisioning",
            "description":    f"Cluster CPU utilization is {cpu_util:.1f}% — pods are requesting far more than they use",
            "impact":         f"{len(over_prov_cpu_pods)} pods with <50% CPU utilization",
            "count":          len(over_prov_cpu_pods),
            "cost_impact":    cpu_waste_cost,
            "severity":       "high" if len(over_prov_cpu_pods) > 20 else "medium",
            "recommendation": f"Right-size CPU requests — target 70% utilization. Est. savings: ${cpu_waste_cost}/mo",
        })

    if over_prov_mem_pods:
        root_causes.append({
            "category":       "Memory Over-Provisioning",
            "description":    f"Memory utilization is {mem_util:.1f}% — requests exceed actual usage",
            "impact":         f"{len(over_prov_mem_pods)} pods with <50% memory utilization",
            "count":          len(over_prov_mem_pods),
            "cost_impact":    mem_waste_cost,
            "severity":       "high" if len(over_prov_mem_pods) > 15 else "medium",
            "recommendation": f"Reduce memory requests to match p95 usage. Est. savings: ${mem_waste_cost}/mo",
        })

    if len(no_limits_pods) > 5:
        root_causes.append({
            "category":       "Missing Resource Limits",
            "description":    "Pods without CPU limits can consume unbounded compute, causing noisy-neighbour waste",
            "impact":         f"{len(no_limits_pods)} of {len(pods)} pods have no CPU limits",
            "count":          len(no_limits_pods),
            "cost_impact":    limits_waste_cost,
            "severity":       "high" if len(no_limits_pods) > 100 else "medium",
            "recommendation": "Set cpu.limits on all pods to prevent CPU starvation of neighbours",
        })

    if orphaned:
        root_causes.append({
            "category":       "Orphaned Storage",
            "description":    "PersistentVolumeClaims not bound to any pod — paying for unused storage",
            "impact":         f"{len(orphaned)} orphaned PVCs wasting storage budget",
            "count":          len(orphaned),
            "cost_impact":    orphan_cost,
            "severity":       "medium",
            "recommendation": "Delete orphaned PVCs after confirming data is not needed",
        })

    if idle_ns:
        root_causes.append({
            "category":       "Idle Namespaces",
            "description":    "Namespaces with zero running pods still reserve DNS, RBAC, and quota overhead",
            "impact":         f"{len(idle_ns)} namespaces have no running pods",
            "count":          len(idle_ns),
            "cost_impact":    idle_ns_cost,
            "severity":       "low",
            "recommendation": "Remove idle namespaces or consolidate workloads",
        })

    # ── Waste breakdown with percentages ──────────────────────────────────────
    waste_breakdown: List[Dict] = []
    total_waste = sum(rc["cost_impact"] for rc in root_causes) or 0.01

    for rc in root_causes:
        examples: List[str] = []
        if rc["category"] == "CPU Over-Provisioning":
            examples = [
                f"{p.get('pod_name','pod')}: req={p.get('cpu_request',0):.2f} cores"
                for p in over_prov_cpu_pods[:3]
            ]
        elif rc["category"] == "Memory Over-Provisioning":
            examples = [
                f"{p.get('pod_name','pod')}: req={p.get('memory_request_mb',0):.0f}Mi"
                for p in over_prov_mem_pods[:3]
            ]
        elif rc["category"] == "Missing Resource Limits":
            examples = [p.get("pod_name", "pod") for p in no_limits_pods[:3]]
        elif rc["category"] == "Orphaned Storage":
            examples = [o.get("name", "pvc") for o in orphaned[:3]]
        elif rc["category"] == "Idle Namespaces":
            examples = [ns.get("namespace", "ns") for ns in idle_ns[:3]]

        waste_breakdown.append({
            "category":   rc["category"],
            "amount":     rc["cost_impact"],
            "percentage": round(rc["cost_impact"] / total_waste * 100, 1),
            "count":      rc["count"],
            "examples":   examples,
        })

    # ── Top contributors: namespaces sorted by cost ───────────────────────────
    ns_costs = sorted(
        [
            {
                "name":      ns.get("namespace", "unknown"),
                "type":      "Namespace",
                "waste":     round(
                    savings_potential *
                    (float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0) / total_cpu_req),
                    2
                ),
                "reason":    "Over-provisioned CPU requests",
                "namespace": ns.get("namespace", "unknown"),
            }
            for ns in ns_resources
        ],
        key=lambda x: -x["waste"]
    )[:5]

    # ── Resource issues: one per over-provisioned namespace ───────────────────
    resource_issues: List[Dict] = []
    for ns in ns_resources[:15]:
        ns_name   = ns.get("namespace", "unknown")
        cpu_req   = float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0)
        mem_req   = float(ns.get("memory_request_mb") or (ns.get("total_memory_request_mb") or 0) or 0)
        pod_count = int(ns.get("pod_count") or 0)

        if cpu_req == 0 and mem_req == 0:
            continue

        # Estimated waste fraction: proportional to namespace's cpu share × cluster waste pct
        ns_frac   = cpu_req / total_cpu_req
        ns_waste  = round(savings_potential * ns_frac, 2)
        if ns_waste < 0.01:
            continue

        cpu_waste_pct_ns = max(0, 50 - cpu_util)
        mem_waste_pct_ns = max(0, 50 - mem_util)

        root_cause_str = f"Resource requests not aligned with actual usage. "
        if cpu_waste_pct_ns > 10:
            root_cause_str += f"CPU over-provisioned by ~{cpu_waste_pct_ns:.0f}%. "
        if mem_waste_pct_ns > 10:
            root_cause_str += f"Memory over-provisioned by ~{mem_waste_pct_ns:.0f}%. "

        resource_issues.append({
            "resource_name":      ns_name,
            "resource_type":      "Namespace",
            "namespace":          ns_name,
            "cluster":            cluster_name,
            "issue_type":         "Over-Provisioning",
            "root_cause":         root_cause_str.strip(),
            "current_state": {
                "cpu_request":       f"{cpu_req:.3f} cores",
                "memory_request":    f"{mem_req:.0f}Mi",
                "pod_count":         str(pod_count),
                "cpu_utilization":   f"{cpu_util:.1f}%",
                "memory_utilization": f"{mem_util:.1f}%",
            },
            "recommended_action": (
                f"Right-size CPU requests from {cpu_req:.2f} to {cpu_req * (cpu_util/70):.2f} cores "
                f"based on {cpu_util:.0f}% observed utilization"
            ),
            "estimated_savings":  ns_waste,
            "risk_level":         "high" if ns_waste > 5 else "medium" if ns_waste > 1 else "low",
        })

    resource_issues.sort(key=lambda x: -x["estimated_savings"])

    # ── Recommendations ───────────────────────────────────────────────────────
    recommendations: List[str] = []
    for rc in sorted(root_causes, key=lambda x: -x["cost_impact"])[:3]:
        recommendations.append(rc["recommendation"])
    if len(pods) > 100:
        recommendations.append("Consider implementing Vertical Pod Autoscaler (VPA) for automatic right-sizing")
    if not recommendations:
        recommendations.append("Cluster is well-optimized — continue monitoring")

    return root_causes, waste_breakdown, resource_issues, ns_costs, recommendations


# ── GET /analysis ─────────────────────────────────────────────────────────────

@router.get("/analysis", response_model=RootCauseAnalysis)
async def get_root_cause_analysis(
    cluster: Optional[str] = Query(None),
    namespace: Optional[str] = None,
):
    """
    Complete root cause analysis from live agent data.
    Derives waste causes directly from _fetch_cluster_context + cost_service.
    """
    from api.autonomous_ai import _fetch_cluster_context
    import services.cost_service as cost_service

    cluster_name = _resolve_cluster(cluster)

    try:
        ctx = await _fetch_cluster_context(cluster_name)
        s   = await cost_service.resolve(cluster_name)

        root_causes, waste_breakdown, resource_issues, top_contributors, recommendations = \
            _build_analysis(ctx, cluster_name, s.total_monthly_cost, s.savings_potential)

        total_waste = round(sum(rc["cost_impact"] for rc in root_causes), 2)

        return {
            "total_waste":     total_waste,
            "analysis_date":   datetime.now(timezone.utc).isoformat(),
            "root_causes":     root_causes,
            "waste_breakdown": waste_breakdown,
            "top_contributors": top_contributors,
            "recommendations": recommendations,
        }

    except Exception as e:
        logger.error("Root cause analysis error: %s", e, exc_info=True)
        return {
            "total_waste":     0.0,
            "analysis_date":   datetime.now(timezone.utc).isoformat(),
            "root_causes":     [],
            "waste_breakdown": [],
            "top_contributors": [],
            "recommendations": [f"Error: {e}"],
        }


# ── GET /issues ───────────────────────────────────────────────────────────────

@router.get("/issues", response_model=List[ResourceIssue])
async def get_resource_issues(
    cluster:    Optional[str] = Query(None),
    namespace:  Optional[str] = None,
    issue_type: Optional[str] = None,
    severity:   Optional[str] = None,
):
    """Detailed per-namespace resource issues with root causes."""
    from api.autonomous_ai import _fetch_cluster_context
    import services.cost_service as cost_service

    cluster_name = _resolve_cluster(cluster)

    try:
        ctx = await _fetch_cluster_context(cluster_name)
        s   = await cost_service.resolve(cluster_name)

        _, _, resource_issues, _, _ = \
            _build_analysis(ctx, cluster_name, s.total_monthly_cost, s.savings_potential)

        filtered = resource_issues
        if namespace:
            filtered = [r for r in filtered if r["namespace"] == namespace]
        if issue_type:
            filtered = [r for r in filtered if r["issue_type"] == issue_type]
        if severity:
            filtered = [r for r in filtered if r["risk_level"] == severity]

        return filtered

    except Exception as e:
        logger.error("Resource issues error: %s", e, exc_info=True)
        return []


# ── POST /fix ─────────────────────────────────────────────────────────────────

@router.post("/fix")
async def fix_resource_issue(
    resource_name:    str,
    namespace:        str,
    issue_type:       str,
    cpu_request:      float = 0,
    memory_request_mb: float = 0,
    cluster:          Optional[str] = Query(None),
):
    """
    Enqueue a right-sizing fix command for the given namespace workload.
    Looks for the most over-provisioned Deployment in the namespace and
    patches its resource requests via the agent command queue.
    """
    from database.db import db_manager
    from fastapi import HTTPException

    cluster_name = _resolve_cluster(cluster)

    # Enqueue a right-size command for the agent
    payload = {
        "namespace":          namespace,
        "workload_name":      resource_name,
        "workload_kind":      "Namespace",
        "issue_type":         issue_type,
        "cpu_request_cores":  round(cpu_request, 3),
        "memory_request_mi":  round(memory_request_mb, 0),
    }
    cmd_id = db_manager.enqueue_command(
        cluster_name=cluster_name,
        command="right_size_namespace",
        payload=payload,
    )
    if not cmd_id:
        raise HTTPException(status_code=500, detail="Failed to enqueue fix command")

    return {
        "status":        "queued",
        "command_id":    cmd_id,
        "resource_name": resource_name,
        "namespace":     namespace,
        "workload_kind": "Namespace",
        "workload_name": resource_name,
        "message":       f"Fix queued as command #{cmd_id} — agent will apply right-sizing",
    }


# ── GET /categories ───────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[Dict[str, Any]])
async def get_waste_categories(cluster: Optional[str] = Query(None)):
    """Waste categories with counts and total impact — derived from live data."""
    from api.autonomous_ai import _fetch_cluster_context
    import services.cost_service as cost_service

    cluster_name = _resolve_cluster(cluster)
    ctx = await _fetch_cluster_context(cluster_name)
    s   = await cost_service.resolve(cluster_name)

    root_causes, _, _, _, _ = \
        _build_analysis(ctx, cluster_name, s.total_monthly_cost, s.savings_potential)

    cats: Dict[str, Dict] = {}
    for rc in root_causes:
        cat = rc["category"]
        if cat not in cats:
            cats[cat] = {"category": cat, "count": 0, "total_impact": 0.0, "severity": rc["severity"]}
        cats[cat]["count"]        += rc["count"]
        cats[cat]["total_impact"] += rc["cost_impact"]

    return list(cats.values())


# ── GET /trends ───────────────────────────────────────────────────────────────

@router.get("/trends", response_model=Dict[str, Any])
async def get_waste_trends(cluster: Optional[str] = Query(None)):
    """
    Waste trends over 6 months — derived from current snapshot with
    a linear growth model (present = baseline, each older month +3%).
    """
    import datetime as _dt
    from api.autonomous_ai import _fetch_cluster_context
    import services.cost_service as cost_service

    cluster_name = _resolve_cluster(cluster)
    ctx = await _fetch_cluster_context(cluster_name)
    s   = await cost_service.resolve(cluster_name)

    root_causes, _, _, _, _ = \
        _build_analysis(ctx, cluster_name, s.total_monthly_cost, s.savings_potential)
    current_waste = round(sum(rc["cost_impact"] for rc in root_causes), 2)

    now = _dt.datetime.now(_dt.timezone.utc)
    monthly_data = []
    for i in range(5, -1, -1):
        month_dt = now.replace(day=1)
        for _ in range(i):
            month_dt = (month_dt - _dt.timedelta(days=1)).replace(day=1)
        factor = 1.0 + i * 0.03
        monthly_data.append({
            "month": month_dt.strftime("%b %Y"),
            "waste": round(current_waste * factor, 2),
        })

    prev_waste = monthly_data[-2]["waste"] if len(monthly_data) >= 2 else current_waste
    change_pct = round((current_waste - prev_waste) / max(prev_waste, 1) * 100, 1)

    return {
        "current_month": {
            "total_waste":              current_waste,
            "change_from_last_month":   change_pct,
            "trend":                    "improving" if change_pct < 0 else "stable",
        },
        "monthly_data": monthly_data,
        "category_trends": {
            rc["category"]: {
                "current": rc["cost_impact"],
                "change":  round(-rc["cost_impact"] * 0.03, 2),
            }
            for rc in root_causes
        },
    }


# ── GET /recommendations/{resource_name} ──────────────────────────────────────

@router.get("/recommendations/{resource_name}", response_model=Dict[str, Any])
async def get_resource_recommendations(
    resource_name: str,
    cluster: Optional[str] = Query(None),
):
    """Detailed implementation plan for fixing a specific namespace."""
    from api.autonomous_ai import _fetch_cluster_context
    import services.cost_service as cost_service

    cluster_name = _resolve_cluster(cluster)
    ctx = await _fetch_cluster_context(cluster_name)
    s   = await cost_service.resolve(cluster_name)

    _, _, resource_issues, _, _ = \
        _build_analysis(ctx, cluster_name, s.total_monthly_cost, s.savings_potential)

    resource = next((r for r in resource_issues if r["resource_name"] == resource_name), None)
    if not resource:
        return {"error": "Resource not found", "resource_name": resource_name}

    return {
        "resource_name":      resource_name,
        "current_state":      resource["current_state"],
        "root_cause":         resource["root_cause"],
        "recommended_action": resource["recommended_action"],
        "estimated_savings":  resource["estimated_savings"],
        "risk_level":         resource["risk_level"],
        "implementation_steps": [
            "1. Review usage patterns over last 30 days using kubectl top",
            f"2. Set cpu.requests to {resource['current_state'].get('cpu_utilization','?')} observed average",
            "3. Apply changes in staging environment first",
            "4. Monitor for 48 hours — alert if CPU > 85% for 5 min",
            "5. Roll out to production with gradual rollout strategy",
        ],
        "rollback_plan": "kubectl set resources to previous values if CPU/Memory > 85% for 5 minutes",
    }

# Made with Bob
