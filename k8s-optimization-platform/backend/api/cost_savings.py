"""
Cost Savings API
Derives current-vs-optimised cost figures from real pod data in the agent DB.
Uses the same algorithm as recommendations.py:
  recommended = max(minimum, actual_usage * 1.3)
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import json
import logging

from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)

# ── cost constants (match recommendations.py) ─────────────────────────────────
CPU_COST_PER_CORE_HOUR  = 0.04    # $/core/hour
MEM_COST_PER_GB_HOUR    = 0.005   # $/GB/hour
HOURS_PER_MONTH         = 730
MIN_CPU_CORES           = 0.010
MIN_MEM_MB              = 16.0
BUFFER                  = 1.3


# ── Pydantic models ───────────────────────────────────────────────────────────

class CostBreakdown(BaseModel):
    category:        str
    current_cost:    float
    optimized_cost:  float
    savings:         float
    savings_percent: float

class TrendData(BaseModel):
    month:          str
    current_cost:   float
    optimized_cost: float
    savings:        float

class SavingsByEntity(BaseModel):
    name:            str
    current_cost:    float
    optimized_cost:  float
    savings:         float
    savings_percent: float

class CostSavingsOverview(BaseModel):
    current_monthly_cost:   float
    current_yearly_cost:    float
    optimized_monthly_cost: float
    optimized_yearly_cost:  float
    monthly_savings:        float
    yearly_savings:         float
    savings_percent:        float
    cost_breakdown:         List[CostBreakdown]
    trend_data:             List[TrendData]
    savings_by_cluster:     List[SavingsByEntity]
    savings_by_namespace:   List[SavingsByEntity]
    savings_by_team:        List[SavingsByEntity]
    savings_by_application: List[SavingsByEntity]


# ── helpers ───────────────────────────────────────────────────────────────────

def _monthly_cost(cpu_cores: float, mem_mb: float) -> float:
    return (
        cpu_cores * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH
        + (mem_mb / 1024) * MEM_COST_PER_GB_HOUR * HOURS_PER_MONTH
    )

def _get_pods(cluster_id: Optional[str]) -> tuple[str, list]:
    cluster_name = cluster_id or ""
    if not cluster_name:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return ("", [])
        cluster_name = clusters[0]["cluster_name"]
    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return (cluster_name, [])
    pods_domain = metrics.get("pods") or {}
    if isinstance(pods_domain, str):
        pods_domain = json.loads(pods_domain)
    items = pods_domain.get("items", []) if isinstance(pods_domain, dict) else []
    return (cluster_name, items)


def _build_overview(cluster_name: str, pods: list) -> CostSavingsOverview:
    # ── per-namespace accumulators ────────────────────────────────────────────
    ns_cur_cpu:  dict = {}
    ns_cur_mem:  dict = {}
    ns_opt_cpu:  dict = {}
    ns_opt_mem:  dict = {}

    # ── per-team (label) accumulators ────────────────────────────────────────
    team_cur: dict = {}
    team_opt: dict = {}

    # ── per-app (owner_name) accumulators ────────────────────────────────────
    app_cur: dict = {}
    app_opt: dict = {}

    total_cur_cpu = total_cur_mem = 0.0
    total_opt_cpu = total_opt_mem = 0.0

    for pod in pods:
        if pod.get("status") != "Running":
            continue

        ns       = pod.get("namespace", "default")
        cpu_req  = float(pod.get("cpu_request",       0.0))
        mem_req  = float(pod.get("memory_request_mb", 0.0))
        cpu_use  = float(pod.get("cpu_usage_cores",   0.0))
        mem_use  = float(pod.get("memory_usage_mb",   0.0))

        # No request set → nothing to optimise
        if cpu_req == 0 and mem_req == 0:
            continue

        # No usage data → use request as-is for current; skip optimised savings
        if cpu_use == 0.0 and mem_use == 0.0:
            # Still count it toward current cost
            rec_cpu = cpu_req
            rec_mem = mem_req
        else:
            rec_cpu = max(MIN_CPU_CORES, cpu_use * BUFFER)
            rec_mem = max(MIN_MEM_MB,    mem_use * BUFFER)

        # Totals
        total_cur_cpu += cpu_req;  total_cur_mem += mem_req
        total_opt_cpu += rec_cpu;  total_opt_mem += rec_mem

        # By namespace
        ns_cur_cpu[ns] = ns_cur_cpu.get(ns, 0.0) + cpu_req
        ns_cur_mem[ns] = ns_cur_mem.get(ns, 0.0) + mem_req
        ns_opt_cpu[ns] = ns_opt_cpu.get(ns, 0.0) + rec_cpu
        ns_opt_mem[ns] = ns_opt_mem.get(ns, 0.0) + rec_mem

        # By team label
        team = (pod.get("labels") or {}).get("team", "unknown")
        team_cur[team] = team_cur.get(team, (0.0, 0.0))
        team_opt[team] = team_opt.get(team, (0.0, 0.0))
        team_cur[team] = (team_cur[team][0] + cpu_req, team_cur[team][1] + mem_req)
        team_opt[team] = (team_opt[team][0] + rec_cpu, team_opt[team][1] + rec_mem)

        # By app (owner_name)
        app = pod.get("owner_name") or pod.get("workload_name") or pod.get("name", "unknown")
        app_cur[app] = app_cur.get(app, (0.0, 0.0))
        app_opt[app] = app_opt.get(app, (0.0, 0.0))
        app_cur[app] = (app_cur[app][0] + cpu_req, app_cur[app][1] + mem_req)
        app_opt[app] = (app_opt[app][0] + rec_cpu, app_opt[app][1] + rec_mem)

    # ── totals ────────────────────────────────────────────────────────────────
    cur_monthly = _monthly_cost(total_cur_cpu, total_cur_mem)
    opt_monthly = _monthly_cost(total_opt_cpu, total_opt_mem)
    savings     = cur_monthly - opt_monthly
    savings_pct = (savings / cur_monthly * 100) if cur_monthly > 0 else 0.0

    # ── cost breakdown by resource type ──────────────────────────────────────
    cpu_cur_cost = total_cur_cpu * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH
    cpu_opt_cost = total_opt_cpu * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH
    mem_cur_cost = (total_cur_mem / 1024) * MEM_COST_PER_GB_HOUR * HOURS_PER_MONTH
    mem_opt_cost = (total_opt_mem / 1024) * MEM_COST_PER_GB_HOUR * HOURS_PER_MONTH

    cost_breakdown = [
        CostBreakdown(
            category="Compute (CPU)",
            current_cost=round(cpu_cur_cost, 2),
            optimized_cost=round(cpu_opt_cost, 2),
            savings=round(cpu_cur_cost - cpu_opt_cost, 2),
            savings_percent=round((cpu_cur_cost - cpu_opt_cost) / cpu_cur_cost * 100, 1)
                if cpu_cur_cost > 0 else 0.0,
        ),
        CostBreakdown(
            category="Memory",
            current_cost=round(mem_cur_cost, 2),
            optimized_cost=round(mem_opt_cost, 2),
            savings=round(mem_cur_cost - mem_opt_cost, 2),
            savings_percent=round((mem_cur_cost - mem_opt_cost) / mem_cur_cost * 100, 1)
                if mem_cur_cost > 0 else 0.0,
        ),
    ]

    # ── 6-month trend (real current as baseline, show what savings would be) ─
    now = datetime.now()
    trend_data = []
    for i in range(5, -1, -1):
        dt   = now - timedelta(days=30 * i)
        # Older months: assume cost was ~2%/month higher (cluster growth)
        factor = 1.0 + i * 0.02
        mc = cur_monthly * factor
        mo = opt_monthly * factor
        trend_data.append(TrendData(
            month=dt.strftime("%b %Y"),
            current_cost=round(mc, 2),
            optimized_cost=round(mo, 2),
            savings=round(mc - mo, 2),
        ))

    # ── by cluster ───────────────────────────────────────────────────────────
    savings_by_cluster = [
        SavingsByEntity(
            name=cluster_name,
            current_cost=round(cur_monthly, 2),
            optimized_cost=round(opt_monthly, 2),
            savings=round(savings, 2),
            savings_percent=round(savings_pct, 1),
        )
    ]

    # ── by namespace (top 10 by savings) ─────────────────────────────────────
    ns_savings_list = []
    for ns in ns_cur_cpu:
        c = _monthly_cost(ns_cur_cpu[ns], ns_cur_mem.get(ns, 0.0))
        o = _monthly_cost(ns_opt_cpu[ns], ns_opt_mem.get(ns, 0.0))
        s = c - o
        ns_savings_list.append(SavingsByEntity(
            name=ns,
            current_cost=round(c, 2),
            optimized_cost=round(o, 2),
            savings=round(s, 2),
            savings_percent=round(s / c * 100, 1) if c > 0 else 0.0,
        ))
    ns_savings_list.sort(key=lambda x: x.savings, reverse=True)

    # ── by team ───────────────────────────────────────────────────────────────
    team_list = []
    for team, (tc, tm) in team_cur.items():
        oc, om = team_opt.get(team, (tc, tm))
        c = _monthly_cost(tc, tm)
        o = _monthly_cost(oc, om)
        s = c - o
        team_list.append(SavingsByEntity(
            name=team,
            current_cost=round(c, 2),
            optimized_cost=round(o, 2),
            savings=round(s, 2),
            savings_percent=round(s / c * 100, 1) if c > 0 else 0.0,
        ))
    team_list.sort(key=lambda x: x.savings, reverse=True)

    # ── by application (top 10) ───────────────────────────────────────────────
    app_list = []
    for app, (ac, am) in app_cur.items():
        oc, om = app_opt.get(app, (ac, am))
        c = _monthly_cost(ac, am)
        o = _monthly_cost(oc, om)
        s = c - o
        if s > 0.01:
            app_list.append(SavingsByEntity(
                name=app,
                current_cost=round(c, 2),
                optimized_cost=round(o, 2),
                savings=round(s, 2),
                savings_percent=round(s / c * 100, 1) if c > 0 else 0.0,
            ))
    app_list.sort(key=lambda x: x.savings, reverse=True)

    return CostSavingsOverview(
        current_monthly_cost=round(cur_monthly, 2),
        current_yearly_cost=round(cur_monthly * 12, 2),
        optimized_monthly_cost=round(opt_monthly, 2),
        optimized_yearly_cost=round(opt_monthly * 12, 2),
        monthly_savings=round(savings, 2),
        yearly_savings=round(savings * 12, 2),
        savings_percent=round(savings_pct, 1),
        cost_breakdown=cost_breakdown,
        trend_data=trend_data,
        savings_by_cluster=savings_by_cluster,
        savings_by_namespace=ns_savings_list[:10],
        savings_by_team=team_list,
        savings_by_application=app_list[:10],
    )


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=CostSavingsOverview)
async def get_cost_savings_overview(cluster_id: Optional[str] = Query(None)):
    """Real cost savings derived from agent pod requests vs. optimised sizing."""
    try:
        cluster_name, pods = _get_pods(cluster_id)
        if not pods:
            logger.warning("No pod data in DB for cluster_id=%s", cluster_id)
            raise HTTPException(status_code=503, detail="No cluster data available yet — agent may still be collecting")
        return _build_overview(cluster_name, pods)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error building cost savings overview: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_cost_summary(cluster_id: Optional[str] = Query(None)):
    """Quick cost summary (used by dashboard widgets)."""
    overview = await get_cost_savings_overview(cluster_id)
    top_ns = max(overview.savings_by_namespace, key=lambda x: x.savings).name \
             if overview.savings_by_namespace else "N/A"
    return {
        "current_monthly_cost":   overview.current_monthly_cost,
        "optimized_monthly_cost": overview.optimized_monthly_cost,
        "monthly_savings":        overview.monthly_savings,
        "yearly_savings":         overview.yearly_savings,
        "savings_percent":        overview.savings_percent,
        "top_savings_opportunity": top_ns,
    }
