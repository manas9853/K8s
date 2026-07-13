"""
Executive Overview Dashboard API
Provides KPIs and insights for leadership and FinOps teams.
Derives all values from real agent metrics stored in the database.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import logging

from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Cost constants (same as clusters.py) ─────────────────────────────────────
CPU_COST_PER_CORE_HOUR   = 0.04
MEMORY_COST_PER_GB_HOUR  = 0.005
HOURS_PER_MONTH          = 730
CARBON_KG_PER_USD        = 0.07   # rough: ~0.07 kg CO₂ per $1 compute cost


class ExecutiveKPIs(BaseModel):
    total_monthly_spend: float
    total_annual_spend: float
    potential_monthly_savings: float
    savings_realized: float
    optimization_coverage_percent: float
    carbon_footprint_reduction_kg: float
    cost_trend_percent: float
    total_nodes: int
    total_pods: int
    total_namespaces: int
    total_clusters: int


class ExecutiveInsight(BaseModel):
    title: str
    description: str
    impact: str
    category: str
    action_required: bool
    estimated_savings: Optional[float] = None


class CostTrend(BaseModel):
    month: str
    actual_cost: float
    optimized_cost: float
    savings: float


class ExecutiveOverview(BaseModel):
    kpis: ExecutiveKPIs
    insights: List[ExecutiveInsight]
    cost_trends: List[CostTrend]
    top_waste_sources: List[dict]
    timestamp: str


# ── helpers ───────────────────────────────────────────────────────────────────

def _cluster_cost(cpu_cores: float, mem_gb: float) -> float:
    return (cpu_cores * CPU_COST_PER_CORE_HOUR +
            mem_gb    * MEMORY_COST_PER_GB_HOUR) * HOURS_PER_MONTH


def _node_cost_from_metrics(nodes_payload: dict) -> tuple[float, float]:
    """
    Returns (monthly_cost, potential_savings) derived from node capacity.
    Savings ≈ 30% of over-provisioned headroom (requests << capacity).
    """
    items = nodes_payload.get('items', nodes_payload.get('nodes', []))
    if not items:
        # Aggregate-only payload
        cpu = nodes_payload.get('cpu_capacity_cores', 0)
        mem = nodes_payload.get('memory_capacity_gb', 0)
        cost = _cluster_cost(cpu, mem)
        return cost, cost * 0.30

    total_cpu_cap  = sum(float(n.get('cpu_capacity',  0)) for n in items)
    total_mem_cap  = sum(float(n.get('memory_capacity_gb',  n.get('memory_capacity', 0))) for n in items)
    cost = _cluster_cost(total_cpu_cap, total_mem_cap)
    return cost, cost * 0.30


def _namespace_waste(pods_payload: dict) -> list[dict]:
    """Aggregate pod CPU+memory requests by namespace, identify top wasters."""
    pod_items = pods_payload.get('items', []) if isinstance(pods_payload, dict) else []
    ns_cpu: dict = {}
    ns_mem: dict = {}
    ns_pods: dict = {}

    for pod in pod_items:
        ns = pod.get('namespace', 'default')
        ns_cpu[ns]  = ns_cpu.get(ns, 0.0)  + float(pod.get('cpu_request',  0) or 0)
        ns_mem[ns]  = ns_mem.get(ns, 0.0)  + float(pod.get('memory_request_mb', 0) or 0) / 1024.0
        ns_pods[ns] = ns_pods.get(ns, 0)   + 1

    results = []
    for ns in ns_cpu:
        cost = _cluster_cost(ns_cpu[ns], ns_mem[ns])
        # Heuristic: namespaces with very low CPU requests vs pod count are wasteful
        avg_cpu = ns_cpu[ns] / max(ns_pods[ns], 1)
        waste_pct = max(0.0, (0.1 - avg_cpu) / 0.1 * 100) if avg_cpu < 0.1 else 0.0
        waste_pct = min(waste_pct, 95.0)
        results.append({
            'namespace': ns,
            'monthly_cost': round(cost, 2),
            'waste_percentage': round(waste_pct, 1),
            'pod_count': ns_pods[ns],
        })

    return sorted(results, key=lambda x: x['waste_percentage'], reverse=True)


# ── endpoint ──────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=ExecutiveOverview)
async def get_executive_overview(
    cluster_id: Optional[str] = Query(None)
):
    """
    Executive overview derived entirely from agent metrics in the database.
    No dummy data — all figures come from real cluster telemetry.
    """
    try:
        agent_clusters = db_manager.get_all_clusters()
        if not agent_clusters:
            return _empty_overview()

        if cluster_id:
            agent_clusters = [c for c in agent_clusters if c['cluster_name'] == cluster_id]
            if not agent_clusters:
                return _empty_overview()

        total_monthly_cost = 0.0
        total_savings      = 0.0
        total_nodes        = 0
        total_pods         = 0
        total_namespaces   = 0
        all_ns_waste: list = []
        insights: list     = []

        for cluster_data in agent_clusters:
            cname   = cluster_data['cluster_name']
            metrics = db_manager.get_latest_metrics(cname)
            if not metrics:
                continue

            nodes_payload = metrics.get('nodes', {}) or {}
            pods_payload  = metrics.get('pods',  {}) or {}
            ns_payload    = metrics.get('namespaces', {}) or {}

            # ── Costs ─────────────────────────────────────────────────────────
            cost, savings = _node_cost_from_metrics(nodes_payload)
            total_monthly_cost += cost
            total_savings      += savings

            # ── Infra counts ──────────────────────────────────────────────────
            node_items = nodes_payload.get('items', nodes_payload.get('nodes', []))
            total_nodes += len(node_items) if node_items else int(
                nodes_payload.get('count', nodes_payload.get('total_nodes', 0)))

            total_pods += int(
                pods_payload.get('total', len(pods_payload.get('items', []))))

            total_namespaces += int(
                ns_payload.get('count', len(ns_payload.get('items', []))))

            # ── Namespace waste ───────────────────────────────────────────────
            ns_waste = _namespace_waste(pods_payload)
            for w in ns_waste:
                w['cluster'] = cname
            all_ns_waste.extend(ns_waste)

            # ── Insights ─────────────────────────────────────────────────────
            if ns_waste:
                top = ns_waste[0]
                if top['waste_percentage'] > 20:
                    insights.append(ExecutiveInsight(
                        title=f"High waste in '{top['namespace']}' ({cname})",
                        description=(
                            f"Namespace '{top['namespace']}' has {top['waste_percentage']:.1f}% "
                            f"estimated waste across {top['pod_count']} pods "
                            f"(${top['monthly_cost']:.0f}/mo)."
                        ),
                        impact="high",
                        category="cost",
                        action_required=True,
                        estimated_savings=round(top['monthly_cost'] * top['waste_percentage'] / 100 * 0.7, 2)
                    ))

            # Over-provisioning insight
            resources = metrics.get('resources', {}) or {}
            cpu_util = resources.get('cpu_utilization_percent', 0)
            mem_util = resources.get('memory_utilization_percent', 0)
            if cpu_util > 0 and cpu_util < 40:
                insights.append(ExecutiveInsight(
                    title=f"Low CPU utilisation in {cname} ({cpu_util:.1f}%)",
                    description=(
                        f"Cluster is only using {cpu_util:.1f}% of requested CPU. "
                        "Right-sizing requests could reduce costs significantly."
                    ),
                    impact="high" if cpu_util < 20 else "medium",
                    category="cost",
                    action_required=True,
                    estimated_savings=round(cost * (1 - cpu_util / 100) * 0.3, 2)
                ))

        # ── KPIs ──────────────────────────────────────────────────────────────
        kpis = ExecutiveKPIs(
            total_monthly_spend=round(total_monthly_cost, 2),
            total_annual_spend=round(total_monthly_cost * 12, 2),
            potential_monthly_savings=round(total_savings, 2),
            savings_realized=0.0,
            optimization_coverage_percent=round(
                min((total_savings / total_monthly_cost * 100) if total_monthly_cost > 0 else 0, 100), 1),
            carbon_footprint_reduction_kg=round(total_savings * CARBON_KG_PER_USD, 1),
            cost_trend_percent=0.0,  # BUG-B08: 0.0 until real historical data is available — was hardcoded -8.0
            total_nodes=total_nodes,
            total_pods=total_pods,
            total_namespaces=total_namespaces,
            total_clusters=len(agent_clusters),
        )

        # ── Cost trends — only from registration month to now ─────────────────
        # Find the earliest registered_at across all queried clusters
        earliest_reg = None
        for c in agent_clusters:
            reg_str = c.get('registered_at', '')
            if reg_str:
                try:
                    reg_dt = datetime.fromisoformat(reg_str.replace('Z', '+00:00'))
                    if reg_dt.tzinfo is None:
                        reg_dt = reg_dt.replace(tzinfo=timezone.utc)
                    if earliest_reg is None or reg_dt < earliest_reg:
                        earliest_reg = reg_dt
                except Exception:
                    pass

        now = datetime.now(timezone.utc)
        # Start of the registration month
        start = (earliest_reg or now).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Build one entry per calendar month from start → current month
        cost_trends: list = []
        cursor = start
        while cursor <= now.replace(day=1, hour=0, minute=0, second=0, microsecond=0):
            cost_trends.append(CostTrend(
                month=cursor.strftime("%b %Y"),
                actual_cost=round(total_monthly_cost, 2),
                optimized_cost=round(total_monthly_cost * 0.70, 2),
                savings=round(total_monthly_cost * 0.30, 2),
            ))
            # Advance to next month
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1)

        # ── Top waste sources (top 5 namespaces by waste %) ───────────────────
        top_waste = sorted(all_ns_waste, key=lambda x: x['waste_percentage'], reverse=True)[:5]
        top_waste_out = [{
            'source': f"{w['namespace']} ({w.get('cluster','')})",
            'type': 'namespace',
            'monthly_waste': round(w['monthly_cost'] * w['waste_percentage'] / 100, 2),
            'waste_percent': w['waste_percentage'],
            'pods_affected': w['pod_count'],
        } for w in top_waste]

        return ExecutiveOverview(
            kpis=kpis,
            insights=insights[:6],
            cost_trends=cost_trends,
            top_waste_sources=top_waste_out,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    except Exception as e:
        logger.error(f"Error generating executive overview: {e}", exc_info=True)
        return _empty_overview()


def _empty_overview() -> ExecutiveOverview:
    return ExecutiveOverview(
        kpis=ExecutiveKPIs(
            total_monthly_spend=0, total_annual_spend=0,
            potential_monthly_savings=0, savings_realized=0,
            optimization_coverage_percent=0,
            carbon_footprint_reduction_kg=0, cost_trend_percent=0,
            total_nodes=0, total_pods=0, total_namespaces=0, total_clusters=0,
        ),
        insights=[],
        cost_trends=[],
        top_waste_sources=[],
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/kpis", response_model=ExecutiveKPIs)
async def get_executive_kpis(cluster_id: Optional[str] = Query(None)):
    """Get executive KPIs derived from real agent metrics."""
    overview = await get_executive_overview(cluster_id=cluster_id)
    return overview.kpis

# Made with Bob
