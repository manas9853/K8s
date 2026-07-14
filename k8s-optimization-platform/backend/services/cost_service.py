"""
CostService — single authority for all cost and savings figures.

Every API endpoint that displays a dollar amount MUST call:

    snapshot = await cost_service.resolve(cluster_name)

and read from the returned CostSnapshot. This guarantees every page
shows the identical number for the same cluster at the same moment.

Phase selection is automatic:
  Phase 2 → cluster has real cloud billing in cluster_billing_cache
  Phase 1 → estimated from node specs via compute_cluster_cost()

Results are cached in-process for CACHE_TTL seconds to avoid
redundant DB reads when multiple endpoints fire in the same request
cycle (e.g. FinOpsReports fetches 3 endpoints in parallel).
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────────────────
CACHE_TTL = 300   # seconds — 5 minutes per cluster

_cache: Dict[str, tuple[float, "CostSnapshot"]] = {}   # {cluster_name: (ts, snapshot)}
_locks: Dict[str, asyncio.Lock] = {}


def _get_lock(cluster_name: str) -> asyncio.Lock:
    if cluster_name not in _locks:
        _locks[cluster_name] = asyncio.Lock()
    return _locks[cluster_name]


def invalidate(cluster_name: Optional[str] = None) -> None:
    """Force-expire cache for one cluster (or all if None)."""
    if cluster_name:
        _cache.pop(cluster_name, None)
    else:
        _cache.clear()


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class NamespaceCost:
    namespace:          str
    monthly_cost:       float
    cpu_share_pct:      float
    cpu_request:        float
    memory_request_gb:  float
    pod_count:          int
    team:               str = "unknown"


@dataclass
class NodeCost:
    name:           str
    instance_type:  str
    cpu_cores:      float
    memory_gb:      float
    hourly_rate:    float
    monthly_cost:   float
    method:         str    # "instance_lookup" | "vcpu_fallback"


@dataclass
class PVCCost:
    name:           str
    namespace:      str
    storage_class:  str
    capacity_gb:    float
    rate_per_gb:    float
    monthly_cost:   float


@dataclass
class SavingsCategory:
    category:           str    # "Right-sizing" | "PVC Cleanup" | "HPA Auto-scaling"
    potential:          float
    realized:           float
    total_opportunity:  float
    basis:              str    # human description: "14 over-provisioned pods"


@dataclass
class CostSnapshot:
    # ── Identity ──────────────────────────────────────────────────────────────
    cluster_name:   str
    source:         str    # "phase1_estimate" | "phase2_billing_api"
    accuracy:       str    # "estimated"       | "invoice"
    provider:       str    # "AWS" | "GCP" | "IBM Cloud" | "Azure" | "unknown"
    region:         str

    # ── Core totals — THE single number every page must use ───────────────────
    total_monthly_cost:         float
    total_annual_cost:          float
    compute_monthly:            float
    storage_monthly:            float
    control_plane_monthly:      float

    # ── Breakdowns ────────────────────────────────────────────────────────────
    namespace_costs:    List[NamespaceCost]  = field(default_factory=list)
    node_costs:         List[NodeCost]       = field(default_factory=list)
    pvc_costs:          List[PVCCost]        = field(default_factory=list)

    # ── Savings ───────────────────────────────────────────────────────────────
    savings_potential:      float              = 0.0   # total monthly potential
    savings_by_category:    List[SavingsCategory] = field(default_factory=list)

    # ── Resource totals (for efficiency ratios) ───────────────────────────────
    total_cpu_request:      float = 0.0
    total_memory_request_gb: float = 0.0
    node_count:             int   = 0
    pod_count:              int   = 0

    # ── Meta ──────────────────────────────────────────────────────────────────
    data_from:      str = ""
    last_updated:   str = ""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _build_namespace_costs(
    raw_ns_costs: List[Dict],
    ns_team_map: Dict[str, str],
) -> List[NamespaceCost]:
    out = []
    for ns in raw_ns_costs:
        out.append(NamespaceCost(
            namespace         = ns.get("namespace") or "unknown",
            monthly_cost      = float(ns.get("monthly_cost") or 0),
            cpu_share_pct     = float(ns.get("cpu_share_pct") or 0),
            cpu_request       = float(ns.get("cpu_request") or 0),
            memory_request_gb = float(ns.get("memory_request_gb") or 0),
            pod_count         = int(ns.get("pod_count") or 0),
            team              = ns_team_map.get(ns.get("namespace") or "", "unknown"),
        ))
    return out


def _build_node_costs(raw_node_costs: List[Dict]) -> List[NodeCost]:
    out = []
    for n in raw_node_costs:
        out.append(NodeCost(
            name          = n.get("name") or "unknown",
            instance_type = n.get("instance_type") or "unknown",
            cpu_cores     = float(n.get("cpu_cores") or 0),
            memory_gb     = float(n.get("memory_gb") or 0),
            hourly_rate   = float(n.get("hourly_rate") or 0),
            monthly_cost  = float(n.get("monthly_cost") or 0),
            method        = n.get("method") or "vcpu_fallback",
        ))
    return out


def _build_pvc_costs(raw_pvc_costs: List[Dict]) -> List[PVCCost]:
    out = []
    for p in raw_pvc_costs:
        out.append(PVCCost(
            name          = p.get("name") or "unknown",
            namespace     = p.get("namespace") or "",
            storage_class = p.get("storage_class") or "default",
            capacity_gb   = float(p.get("capacity_gb") or 0),
            rate_per_gb   = float(p.get("rate_per_gb") or 0),
            monthly_cost  = float(p.get("monthly_cost") or 0),
        ))
    return out


def _compute_savings(
    ctx: Dict,
    total_monthly: float,
) -> tuple[float, List[SavingsCategory]]:
    """
    Derive savings opportunities from cluster context.
    Returns (monthly_potential_total, savings_by_category list).
    All three categories use the same rates as compute_cluster_cost().
    """
    from utils.cost_engine import (
        CPU_COST_PER_CORE_HOUR, MEMORY_COST_PER_GB_HOUR,
        HOURS_PER_MONTH, _parse_gi, STORAGE_CLASS_RATES,
    )

    pods        = ctx.get("pods") or []
    orphaned    = ctx.get("orphaned_pvcs") or []
    deployments = ctx.get("deployments") or []

    # Right-sizing: pods with cpu_request > 0.5 cores → 30% reduction
    BUFFER = 0.30
    rs_total = 0.0
    for pod in pods:
        cpu_req = float(pod.get("cpu_request") or 0)
        mem_req = float(pod.get("memory_request_mb") or 0) / 1024
        cpu_use = float(pod.get("cpu_usage_cores") or 0)
        mem_use = float(pod.get("memory_usage_mb") or 0) / 1024
        if cpu_req <= 0.5 and mem_req <= 0:
            continue
        if cpu_use > 0 and cpu_req > 0:
            saved_cpu = max(0.0, cpu_req - max(cpu_use * (1 + BUFFER), 0.01))
            saved_mem = max(0.0, mem_req - max(mem_use * (1 + BUFFER), 0.016))
            rs_total += (saved_cpu * CPU_COST_PER_CORE_HOUR +
                         saved_mem * MEMORY_COST_PER_GB_HOUR) * HOURS_PER_MONTH
        elif cpu_req > 0.5:
            rs_total += cpu_req * BUFFER * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH

    rs_total = round(rs_total, 2)

    # PVC cleanup: orphaned PVCs → full cost is savings
    pvc_total = 0.0
    for pvc in orphaned:
        sc   = pvc.get("storage_class") or "default"
        rate = STORAGE_CLASS_RATES.get(sc, STORAGE_CLASS_RATES.get("default", 0.10))
        gb   = _parse_gi(pvc.get("capacity") or pvc.get("size") or 0)
        pvc_total += gb * rate
    pvc_total = round(pvc_total, 2)

    # HPA candidates: deployments with replicas > 1 and no HPA → 20% cost reduction
    hpa_candidates = [
        d for d in deployments
        if not d.get("hpa_enabled") and int(d.get("replicas") or 1) > 1
    ]
    nd = max(len(deployments), 1)
    hpa_total = round(len(hpa_candidates) * 0.20 * (total_monthly / nd), 2)

    categories: List[SavingsCategory] = []
    if rs_total > 0:
        over_prov_count = sum(1 for p in pods if float(p.get("cpu_request") or 0) > 0.5)
        categories.append(SavingsCategory(
            category="Right-sizing",
            potential=rs_total,
            realized=0.0,
            total_opportunity=rs_total,
            basis=f"{over_prov_count} over-provisioned pods (cpu_request > 500m)",
        ))
    if pvc_total > 0:
        categories.append(SavingsCategory(
            category="PVC Cleanup",
            potential=pvc_total,
            realized=0.0,
            total_opportunity=pvc_total,
            basis=f"{len(orphaned)} orphaned PVCs",
        ))
    if hpa_total > 0:
        categories.append(SavingsCategory(
            category="HPA Auto-scaling",
            potential=hpa_total,
            realized=0.0,
            total_opportunity=hpa_total,
            basis=f"{len(hpa_candidates)} deployments without HPA",
        ))

    total_potential = round(rs_total + pvc_total + hpa_total, 2)
    return total_potential, categories


# ── Public API ─────────────────────────────────────────────────────────────────

async def resolve(cluster_name: str) -> CostSnapshot:
    """
    Return the canonical CostSnapshot for cluster_name.
    Hits cache first; rebuilds if stale or missing.
    Thread-safe: uses per-cluster asyncio.Lock to avoid duplicate fetches.
    """
    now = time.monotonic()
    cached = _cache.get(cluster_name)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    async with _get_lock(cluster_name):
        # Re-check after acquiring lock
        cached = _cache.get(cluster_name)
        if cached and (now - cached[0]) < CACHE_TTL:
            return cached[1]

        snapshot = await _build_snapshot(cluster_name)
        _cache[cluster_name] = (time.monotonic(), snapshot)
        return snapshot


async def _build_snapshot(cluster_name: str) -> CostSnapshot:
    """Build a fresh CostSnapshot — called only on cache miss."""
    from utils.cost_engine import (
        get_billing_cache, compute_cluster_cost, HOURS_PER_MONTH,
    )
    from api.autonomous_ai import _fetch_cluster_context
    from database.db import db_manager

    current_month   = _current_month()
    onboarding_date = db_manager.get_cluster_onboarding_date(cluster_name)
    data_from       = (onboarding_date[:10] if onboarding_date
                       else current_month + "-01")

    # ── Phase 2: real billing invoice ─────────────────────────────────────────
    billing = get_billing_cache(cluster_name, current_month)
    if billing:
        total   = float(billing.get("total_cost") or 0)
        compute = round(total * float(billing.get("compute_pct") or 0.80), 2)
        storage = round(total * float(billing.get("storage_pct") or 0.10), 2)
        cp      = round(total * float(billing.get("cp_pct") or 0.10), 2)
        return CostSnapshot(
            cluster_name            = cluster_name,
            source                  = "phase2_billing_api",
            accuracy                = "invoice",
            provider                = billing.get("provider") or "unknown",
            region                  = billing.get("region") or "unknown",
            total_monthly_cost      = round(total, 2),
            total_annual_cost       = round(total * 12, 2),
            compute_monthly         = compute,
            storage_monthly         = storage,
            control_plane_monthly   = cp,
            namespace_costs         = [],   # Phase 2: use billing namespace breakdown if available
            node_costs              = [],
            pvc_costs               = [],
            savings_potential       = 0.0,
            savings_by_category     = [],
            data_from               = data_from,
            last_updated            = _now_iso(),
        )

    # ── Phase 1: agent estimates ───────────────────────────────────────────────
    ctx  = await _fetch_cluster_context(cluster_name)
    cost = compute_cluster_cost(ctx)

    total   = cost["total_monthly"]
    compute = cost["compute_monthly"]
    storage = cost["storage_monthly"]
    cp      = cost["control_plane_monthly"]

    # namespace → team map
    ns_team_map: Dict[str, str] = {}
    for ns_obj in (ctx.get("namespaces") or []):
        name = ns_obj.get("name") or ns_obj.get("namespace") or ""
        labels = ns_obj.get("labels") or {}
        team = (labels.get("app.kubernetes.io/part-of")
                or labels.get("team")
                or labels.get("owner")
                or name or "unknown")
        if name:
            ns_team_map[name] = team

    namespace_costs = _build_namespace_costs(
        cost.get("namespace_costs") or [], ns_team_map
    )
    node_costs  = _build_node_costs(cost.get("node_costs") or [])
    pvc_costs   = _build_pvc_costs(cost.get("pvc_costs") or [])

    savings_potential, savings_by_category = _compute_savings(ctx, total)

    pods = ctx.get("pods") or []

    return CostSnapshot(
        cluster_name            = cluster_name,
        source                  = "phase1_estimate",
        accuracy                = "estimated",
        provider                = cost.get("provider") or "unknown",
        region                  = cost.get("region") or "unknown",
        total_monthly_cost      = round(total, 2),
        total_annual_cost       = round(total * 12, 2),
        compute_monthly         = round(compute, 2),
        storage_monthly         = round(storage, 2),
        control_plane_monthly   = round(cp, 2),
        namespace_costs         = namespace_costs,
        node_costs              = node_costs,
        pvc_costs               = pvc_costs,
        savings_potential       = savings_potential,
        savings_by_category     = savings_by_category,
        total_cpu_request       = float(cost.get("total_cpu_request") or 0),
        total_memory_request_gb = float(cost.get("total_memory_request_gb") or 0),
        node_count              = len(node_costs),
        pod_count               = len(pods),
        data_from               = data_from,
        last_updated            = _now_iso(),
    )


# ── Convenience serialisers used by API endpoints ─────────────────────────────

def snapshot_to_cost_management(s: CostSnapshot, meta: Dict) -> Dict:
    """Shape for /finops/cost-management and similar total-cost endpoints."""
    total_safe = s.total_monthly_cost if s.total_monthly_cost > 0 else 1
    return {
        "total_monthly_cost":  s.total_monthly_cost,
        "total_annual_cost":   s.total_annual_cost,
        "cost_trend":          "stable",
        "month_over_month_change": 0.0,
        "cluster_count":       1,
        "cost_source":         s.source,
        "accuracy":            s.accuracy,
        "data_from":           s.data_from,
        "cost_by_environment": [
            {"environment": meta.get("environment", "unknown"),
             "cost": s.total_monthly_cost, "percentage": 100.0}
        ],
        "cost_by_resource_type": [
            {"type": "Compute",       "cost": s.compute_monthly,
             "percentage": round(s.compute_monthly / total_safe * 100, 1)},
            {"type": "Storage",       "cost": s.storage_monthly,
             "percentage": round(s.storage_monthly / total_safe * 100, 1)},
            {"type": "Control Plane", "cost": s.control_plane_monthly,
             "percentage": round(s.control_plane_monthly / total_safe * 100, 1)},
        ],
        "top_cost_drivers": [
            {"name": s.cluster_name, "type": "Cluster",
             "cost": s.total_monthly_cost,
             "environment": meta.get("environment", "unknown"),
             "region":      meta.get("region", s.region),
             "provider":    meta.get("provider", s.provider),
             "trend": "stable"}
        ],
        "optimization_opportunities": [
            {"opportunity": c.category,
             "potential_savings": c.potential,
             "effort": "low",
             "basis": c.basis}
            for c in s.savings_by_category
        ],
        "budget_status": {"monthly_budget": None,
                          "current_spend": s.total_monthly_cost,
                          "status": "unknown"},
        "last_updated": s.last_updated,
    }


def snapshot_to_savings_tracker(s: CostSnapshot) -> Dict:
    """Shape for /finops/savings-tracker."""
    monthly_potential = s.savings_potential
    return {
        "total_savings": {
            "monthly_realized":            0.0,
            "monthly_potential":           monthly_potential,
            "ytd_realized":                0.0,
            "annual_potential_projection": round(monthly_potential * 12, 2),
        },
        "savings_by_category": [
            {
                "category":          c.category,
                "realized":          c.realized,
                "potential":         c.potential,
                "total_opportunity": c.total_opportunity,
                "completion_rate":   0,
                "basis":             c.basis,
            }
            for c in s.savings_by_category
        ],
        "optimization_rate": (
            round(0.0 / monthly_potential * 100, 1)
            if monthly_potential > 0 else 0
        ),
        "cost_source":  s.source,
        "accuracy":     s.accuracy,
        "last_updated": s.last_updated,
    }


def snapshot_to_cost_allocation(s: CostSnapshot) -> Dict:
    """Shape for /finops/cost-allocation."""
    from collections import defaultdict
    team_totals: Dict[str, float] = defaultdict(float)
    alloc_by_ns = []
    for ns in s.namespace_costs:
        alloc_by_ns.append({
            "namespace":     ns.namespace,
            "cluster":       s.cluster_name,
            "cost":          ns.monthly_cost,
            "cpu_share_pct": ns.cpu_share_pct,
            "pod_count":     ns.pod_count,
            "teams":         [ns.team],
        })
        team_totals[ns.team] += ns.monthly_cost

    total = s.total_monthly_cost or 1
    alloc_by_team = [
        {"team": t, "total_cost": round(v, 2),
         "percentage": round(v / total * 100, 1)}
        for t, v in sorted(team_totals.items(), key=lambda x: -x[1])
    ]
    all_pods = sum(ns.pod_count for ns in s.namespace_costs)
    accuracy_pct = round(all_pods / max(s.pod_count, 1) * 100, 1) if s.pod_count else 85.0

    return {
        "allocation_by_namespace": alloc_by_ns,
        "allocation_by_team":      alloc_by_team,
        "allocation_accuracy":     accuracy_pct,
        "cost_source":             s.source,
        "accuracy":                s.accuracy,
        "last_updated":            s.last_updated,
    }

# Made with Bob
