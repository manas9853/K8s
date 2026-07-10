"""
Carbon Footprint API - Feature 20
Tracks carbon emissions and environmental impact of Kubernetes infrastructure.
All data comes directly from the database via _fetch_cluster_context and
compute_energy — no self-HTTP loops.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging

from api.autonomous_ai import _fetch_cluster_context
from utils.cost_engine import compute_energy

router = APIRouter(tags=["Carbon Footprint"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Physics constants (EPA / cloud-provider data)
# ---------------------------------------------------------------------------
KWH_PER_CPU_CORE_HOUR = 0.012     # Average power consumption per CPU core
KWH_PER_GB_MEMORY_HOUR = 0.0038   # Average power consumption per GB RAM
CO2_KG_PER_KWH = 0.385            # Average grid carbon intensity (kg CO2/kWh)
COST_PER_KWH = 0.12               # Average electricity cost ($/kWh)

# Environmental equivalents
KG_CO2_PER_TREE_YEAR = 21         # CO2 absorbed by one tree per year
KG_CO2_PER_MILE_DRIVEN = 0.404    # CO2 from driving one mile
KWH_PER_HOME_MONTH = 877          # Average US home electricity usage per month


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CarbonSummary(BaseModel):
    """Overall carbon footprint summary"""
    total_carbon_saved_kg: float
    total_energy_saved_kwh: float
    total_cost_saved: float
    reduction_percentage: float
    trees_equivalent: int
    miles_not_driven: int
    homes_powered: float
    current_monthly_emissions_kg: float
    optimized_monthly_emissions_kg: float


class ClusterCarbon(BaseModel):
    """Carbon data for a single cluster"""
    cluster: str
    carbon_saved_kg: float
    energy_saved_kwh: float
    cost_saved: float
    efficiency_score: int
    current_emissions_kg: float
    optimized_emissions_kg: float


class CarbonTrend(BaseModel):
    """Carbon footprint trend data"""
    month: str
    carbon_kg: float
    energy_kwh: float
    cost_saved: float
    optimizations_applied: int


class NamespaceCarbon(BaseModel):
    """Carbon data by namespace"""
    namespace: str
    cluster: str
    carbon_saved_kg: float
    energy_saved_kwh: float
    cost_saved: float
    workload_count: int


# ---------------------------------------------------------------------------
# Pure helper functions
# ---------------------------------------------------------------------------

def calculate_energy_from_resources(
    cpu_cores: float,
    memory_gb: float,
    hours: float = 730,
) -> float:
    """Calculate energy consumption in kWh from CPU and memory."""
    cpu_kwh = cpu_cores * KWH_PER_CPU_CORE_HOUR * hours
    memory_kwh = memory_gb * KWH_PER_GB_MEMORY_HOUR * hours
    return cpu_kwh + memory_kwh


def calculate_carbon_from_energy(energy_kwh: float) -> float:
    """Calculate CO2 emissions in kg from energy consumption."""
    return energy_kwh * CO2_KG_PER_KWH


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=CarbonSummary)
async def get_summary(cluster: Optional[str] = Query(None)):
    """
    Get comprehensive carbon footprint summary.
    Derives current emissions directly from cluster resources via compute_energy.
    Optimised emissions = 30 % reduction estimate (right-sizing all pods).
    """
    ctx = await _fetch_cluster_context(cluster)
    energy = compute_energy(ctx)

    current_kwh = energy.get("monthly_kwh", 0.0)
    # Optimised estimate: 30 % reduction from right-sizing
    optimized_kwh = round(current_kwh * 0.70, 2)
    energy_saved = round(current_kwh - optimized_kwh, 2)

    co2_intensity = energy.get("co2_intensity_kg_per_kwh", CO2_KG_PER_KWH)
    current_carbon = round(current_kwh * co2_intensity, 2)
    optimized_carbon = round(optimized_kwh * co2_intensity, 2)
    carbon_saved = round(current_carbon - optimized_carbon, 2)

    cost_saved = round(energy_saved * COST_PER_KWH, 2)

    reduction_pct = 0.0
    if current_carbon > 0:
        reduction_pct = round((carbon_saved / current_carbon) * 100, 1)

    trees_equivalent = int(carbon_saved / KG_CO2_PER_TREE_YEAR * 12)
    miles_not_driven = int(carbon_saved / KG_CO2_PER_MILE_DRIVEN)
    homes_powered = round(energy_saved / KWH_PER_HOME_MONTH, 1)

    return CarbonSummary(
        total_carbon_saved_kg=carbon_saved,
        total_energy_saved_kwh=energy_saved,
        total_cost_saved=cost_saved,
        reduction_percentage=reduction_pct,
        trees_equivalent=trees_equivalent,
        miles_not_driven=miles_not_driven,
        homes_powered=homes_powered,
        current_monthly_emissions_kg=current_carbon,
        optimized_monthly_emissions_kg=optimized_carbon,
    )


@router.get("/clusters", response_model=List[ClusterCarbon])
async def get_clusters(cluster: Optional[str] = Query(None)):
    """
    Get carbon footprint data per cluster.
    Iterates over every registered cluster and computes energy from its latest
    metrics snapshot.  When `cluster` is supplied only that cluster is returned.
    """
    from database.db import db_manager

    all_clusters = db_manager.get_all_clusters()
    if not all_clusters:
        return []

    # Filter to the requested cluster when scoped
    if cluster:
        all_clusters = [c for c in all_clusters if c["cluster_name"] == cluster]

    result: List[ClusterCarbon] = []
    for c in all_clusters:
        cname = c["cluster_name"]
        ctx = await _fetch_cluster_context(cname)
        if not ctx:
            continue
        energy = compute_energy(ctx)

        current_kwh = energy.get("monthly_kwh", 0.0)
        optimized_kwh = round(current_kwh * 0.70, 2)
        energy_saved = round(current_kwh - optimized_kwh, 2)

        co2_intensity = energy.get("co2_intensity_kg_per_kwh", CO2_KG_PER_KWH)
        current_carbon = round(current_kwh * co2_intensity, 2)
        optimized_carbon = round(optimized_kwh * co2_intensity, 2)
        carbon_saved = round(current_carbon - optimized_carbon, 2)
        cost_saved = round(energy_saved * COST_PER_KWH, 2)

        # Efficiency score: fraction of current emissions that are NOT wasted
        # (higher is worse from a waste perspective — we invert it)
        efficiency = 100
        if current_carbon > 0:
            # how close to optimised we already are (0–100)
            efficiency = int((optimized_carbon / current_carbon) * 100)

        result.append(ClusterCarbon(
            cluster=cname,
            carbon_saved_kg=carbon_saved,
            energy_saved_kwh=energy_saved,
            cost_saved=cost_saved,
            efficiency_score=efficiency,
            current_emissions_kg=current_carbon,
            optimized_emissions_kg=optimized_carbon,
        ))

    return result


@router.get("/trends", response_model=List[CarbonTrend])
async def get_trends(
    cluster: Optional[str] = Query(None),
    months: int = 6,
):
    """
    Get carbon footprint trends over time.
    Pulls real agent_metrics history (up to 90 rows), groups by calendar month,
    and computes energy for each snapshot.  Only months with real data are
    returned — no fabrication of pre-onboarding history.
    """
    from database.db import db_manager
    import json as _json

    all_clusters = db_manager.get_all_clusters()
    if not all_clusters:
        return []

    if cluster:
        target_clusters = [c["cluster_name"] for c in all_clusters
                           if c["cluster_name"] == cluster]
    else:
        target_clusters = [c["cluster_name"] for c in all_clusters]

    # Collect (month_key → accumulated kwh) across all target clusters
    month_kwh: Dict[str, float] = {}
    month_opts: Dict[str, int] = {}   # rough "optimizations applied" count

    for cname in target_clusters:
        rows = db_manager.get_metrics_history(cname, limit=90)
        for row in rows:
            ts_raw = row.get("timestamp")
            if ts_raw is None:
                continue
            # timestamp may be a datetime object or a string
            if isinstance(ts_raw, datetime):
                ts = ts_raw
            else:
                try:
                    ts = datetime.fromisoformat(str(ts_raw))
                except Exception:
                    continue

            month_key = ts.strftime("%Y-%m")   # e.g. "2025-03"
            # Build a minimal ctx from this snapshot for compute_energy
            snap_ctx: Dict[str, Any] = {
                "nodes":               row.get("nodes") or {},
                "resources":           row.get("resources") or {},
                "finops":              row.get("finops") or {},
                "namespace_resources": [],
            }
            # namespace_resources may live inside finops
            finops_d = snap_ctx["finops"]
            if isinstance(finops_d, dict):
                nr = finops_d.get("namespace_resources", {})
                if isinstance(nr, dict):
                    snap_ctx["namespace_resources"] = [
                        {"namespace": k, **v} for k, v in nr.items()
                    ]

            energy = compute_energy(snap_ctx)
            kwh = energy.get("monthly_kwh", 0.0)

            if month_key not in month_kwh:
                month_kwh[month_key] = 0.0
                month_opts[month_key] = 0
            # Average across multiple snapshots in the same month
            month_kwh[month_key] = (month_kwh[month_key] + kwh) / 2
            month_opts[month_key] += 1

    if not month_kwh:
        return []

    # Sort chronologically and keep only the most recent `months` entries
    sorted_months = sorted(month_kwh.keys())[-months:]

    trends: List[CarbonTrend] = []
    for mk in sorted_months:
        kwh = round(month_kwh[mk], 2)
        co2 = round(kwh * CO2_KG_PER_KWH, 2)
        cost_saved = round(kwh * 0.30 * COST_PER_KWH, 2)   # 30 % optimisation saving
        label = datetime.strptime(mk, "%Y-%m").strftime("%b %Y")
        trends.append(CarbonTrend(
            month=label,
            carbon_kg=co2,
            energy_kwh=kwh,
            cost_saved=cost_saved,
            optimizations_applied=month_opts[mk],
        ))

    return trends


@router.get("/namespaces", response_model=List[NamespaceCarbon])
async def get_namespaces(cluster: Optional[str] = Query(None)):
    """
    Get carbon footprint broken down by namespace.
    Uses the namespace_energy list already computed by compute_energy so there
    is no double-calculation.
    """
    ctx = await _fetch_cluster_context(cluster)
    energy = compute_energy(ctx)

    cluster_label = ctx.get("cluster_name", cluster or "unknown")
    co2_intensity = energy.get("co2_intensity_kg_per_kwh", CO2_KG_PER_KWH)

    # namespace_resources carries workload counts via pod membership
    ns_res = ctx.get("namespace_resources") or []
    ns_pod_count: Dict[str, int] = {}
    for ns in ns_res:
        name = ns.get("namespace") or "unknown"
        # agent reports pod_count directly, fallback to 1
        ns_pod_count[name] = int(ns.get("pod_count") or 1)

    result: List[NamespaceCarbon] = []
    for ns_e in energy.get("namespace_energy", []):
        ns_name = ns_e.get("namespace", "unknown")
        kwh = ns_e.get("kwh", 0.0)
        ns_co2 = ns_e.get("co2_kg", round(kwh * co2_intensity, 2))
        ns_optimized_co2 = round(ns_co2 * 0.70, 2)
        carbon_saved = round(ns_co2 - ns_optimized_co2, 2)
        energy_saved = round(kwh * 0.30, 2)
        cost_saved = round(energy_saved * COST_PER_KWH, 2)

        # Determine which cluster this namespace belongs to
        ns_cluster = cluster_label
        # In multi-cluster ctx each ns_res item may carry _cluster
        for ns in ns_res:
            if ns.get("namespace") == ns_name and ns.get("_cluster"):
                ns_cluster = ns["_cluster"]
                break

        result.append(NamespaceCarbon(
            namespace=ns_name,
            cluster=ns_cluster,
            carbon_saved_kg=carbon_saved,
            energy_saved_kwh=energy_saved,
            cost_saved=cost_saved,
            workload_count=ns_pod_count.get(ns_name, 1),
        ))

    result.sort(key=lambda x: x.carbon_saved_kg, reverse=True)
    return result


@router.get("/impact")
async def get_environmental_impact(cluster: Optional[str] = Query(None)):
    """
    Get detailed environmental impact metrics.
    Calls get_summary() internally — no HTTP hop.
    """
    summary = await get_summary(cluster=cluster)

    return {
        "carbon_metrics": {
            "total_saved_kg":         summary.total_carbon_saved_kg,
            "total_saved_tons":       round(summary.total_carbon_saved_kg / 1000, 3),
            "annual_projection_kg":   round(summary.total_carbon_saved_kg * 12, 2),
            "annual_projection_tons": round(summary.total_carbon_saved_kg * 12 / 1000, 2),
        },
        "equivalents": {
            "trees_planted":          summary.trees_equivalent,
            "miles_not_driven":       summary.miles_not_driven,
            "homes_powered_monthly":  summary.homes_powered,
            "smartphones_charged":    int(summary.total_energy_saved_kwh / 0.012),
            "led_bulbs_year":         int(summary.total_energy_saved_kwh / 8.76),
        },
        "energy_metrics": {
            "kwh_saved":              summary.total_energy_saved_kwh,
            "mwh_saved":              round(summary.total_energy_saved_kwh / 1000, 3),
            "annual_kwh_projection":  round(summary.total_energy_saved_kwh * 12, 2),
        },
        "financial_metrics": {
            "monthly_savings":        summary.total_cost_saved,
            "annual_projection":      round(summary.total_cost_saved * 12, 2),
        },
        "reduction_metrics": {
            "percentage":              summary.reduction_percentage,
            "current_emissions_kg":    summary.current_monthly_emissions_kg,
            "optimized_emissions_kg":  summary.optimized_monthly_emissions_kg,
        },
    }

# Made with Bob
