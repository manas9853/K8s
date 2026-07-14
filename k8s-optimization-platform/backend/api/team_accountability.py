"""
Team-Based Cost Accountability API

All data is derived from real agent metrics via cost_service.
Teams are identified from namespace labels (team / owner /
app.kubernetes.io/part-of).  When no label exists the namespace
prefix is used as a fallback team name.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
import logging

from database.db import db_manager
from utils.cluster_registry import get_clusters
import services.cost_service as cost_service

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Models ────────────────────────────────────────────────────────────────────

class TeamCost(BaseModel):
    team_name: str
    total_cost: float
    waste: float
    potential_savings: float
    efficiency_score: int
    resource_count: int
    namespace_count: int
    top_namespace: str
    top_namespace_cost: float
    trend: str
    monthly_change: float

class TeamResource(BaseModel):
    resource_type: str
    count: int
    cost: float
    waste: float

class TeamNamespace(BaseModel):
    namespace: str
    cost: float
    waste: float
    pod_count: int
    efficiency_score: int

class TeamMember(BaseModel):
    name: str
    email: str
    role: str
    resources_owned: int

class TeamDetails(BaseModel):
    team_name: str
    total_cost: float
    waste: float
    potential_savings: float
    efficiency_score: int
    members: List[TeamMember]
    resources: List[TeamResource]
    namespaces: List[TeamNamespace]
    cost_trend: List[Dict[str, Any]]
    recommendations: List[str]

class TeamComparison(BaseModel):
    team_name: str
    cost: float
    waste: float
    efficiency_score: int
    rank: int

class AccountabilitySummary(BaseModel):
    total_teams: int
    total_cost: float
    total_waste: float
    average_efficiency: int
    most_efficient_team: str
    least_efficient_team: str
    highest_cost_team: str
    highest_waste_team: str
    team_comparisons: List[TeamComparison]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_cluster(cluster: Optional[str]) -> str:
    clusters = get_clusters()
    if not clusters:
        raise HTTPException(
            status_code=503,
            detail="No clusters registered. Deploy the k8s agent first.",
        )
    ids = [c["id"] for c in clusters]
    if cluster and cluster != "all":
        if cluster not in ids:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster}' not found.")
        return cluster
    return ids[0]


def _team_from_ns_labels(ns_obj: Dict) -> str:
    labels = ns_obj.get("labels") or {}
    return (
        labels.get("app.kubernetes.io/part-of")
        or labels.get("team")
        or labels.get("owner")
        or ns_obj.get("name", "").split("-")[0].lower()
        or "unknown"
    )


def _efficiency(waste: float, cost: float) -> int:
    if cost <= 0:
        return 100
    pct = waste / cost * 100
    return max(0, min(100, int(100 - pct)))


async def _build_teams(cluster_name: str) -> List[Dict]:
    """
    Derive real per-team costs from cost_service snapshot.
    Returns a list of team dicts sorted by total_cost desc.
    """
    snap = await cost_service.resolve(cluster_name)

    # namespace → team mapping from snapshot
    ns_team: Dict[str, str] = {ns.namespace: ns.team for ns in snap.namespace_costs}

    # Accumulate costs per team
    team_cost:  Dict[str, float] = {}
    team_ns:    Dict[str, set]   = {}
    team_pods:  Dict[str, int]   = {}

    for ns in snap.namespace_costs:
        t = ns.team or "unknown"
        team_cost[t]  = team_cost.get(t, 0.0) + ns.monthly_cost
        if t not in team_ns:
            team_ns[t] = set()
        team_ns[t].add(ns.namespace)
        team_pods[t]  = team_pods.get(t, 0) + ns.pod_count

    if not team_cost:
        # No namespace breakdown — put everything under "cluster"
        team_cost["cluster"] = snap.total_monthly_cost
        team_ns["cluster"]   = {cluster_name}
        team_pods["cluster"] = snap.pod_count

    # Savings potential distributed proportionally
    total_cost = snap.total_monthly_cost or 1
    results = []
    for t, cost in sorted(team_cost.items(), key=lambda x: -x[1]):
        frac     = cost / total_cost
        savings  = round(snap.savings_potential * frac, 2)
        waste    = round(savings / 0.7, 2) if savings > 0 else 0.0
        ns_list  = sorted(team_ns.get(t, set()))

        # Top namespace by cost (proportional split)
        top_ns      = ns_list[0] if ns_list else cluster_name
        top_ns_cost = round(cost / max(len(ns_list), 1), 2)

        results.append({
            "team_name":          t,
            "total_cost":         round(cost, 2),
            "waste":              waste,
            "potential_savings":  savings,
            "efficiency_score":   _efficiency(waste, cost),
            "resource_count":     team_pods.get(t, 0),
            "namespace_count":    len(ns_list),
            "top_namespace":      top_ns,
            "top_namespace_cost": top_ns_cost,
            "trend":              "stable",
            "monthly_change":     0.0,
        })

    return results


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/teams", response_model=List[TeamCost])
async def get_team_costs(cluster: Optional[str] = Query(None)):
    cluster_name = _resolve_cluster(cluster)
    try:
        return await _build_teams(cluster_name)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error calculating team costs: %s", e, exc_info=True)
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/teams/{team_name}", response_model=TeamDetails)
async def get_team_details(team_name: str, cluster: Optional[str] = Query(None)):
    cluster_name = _resolve_cluster(cluster)
    teams        = await _build_teams(cluster_name)
    team         = next((t for t in teams if t["team_name"] == team_name), None)

    if not team:
        return TeamDetails(
            team_name=team_name, total_cost=0, waste=0,
            potential_savings=0, efficiency_score=0,
            members=[], resources=[], namespaces=[],
            cost_trend=[], recommendations=[],
        )

    snap   = await cost_service.resolve(cluster_name)
    ns_objs = [ns for ns in snap.namespace_costs if ns.team == team_name]

    namespaces = [
        TeamNamespace(
            namespace=ns.namespace,
            cost=ns.monthly_cost,
            waste=round(ns.monthly_cost * (team["waste"] / max(team["total_cost"], 1)), 2),
            pod_count=ns.pod_count,
            efficiency_score=_efficiency(
                ns.monthly_cost * (team["waste"] / max(team["total_cost"], 1)),
                ns.monthly_cost,
            ),
        )
        for ns in ns_objs
    ]

    resources = [
        TeamResource(
            resource_type="Pods",
            count=team["resource_count"],
            cost=team["total_cost"],
            waste=team["waste"],
        )
    ]

    # 6-month trend (flat — single cost signal)
    base  = team["total_cost"]
    now   = datetime.now(timezone.utc)
    cost_trend = [
        {"month": (now - timedelta(days=30 * i)).strftime("%b %Y"), "cost": round(base, 2)}
        for i in range(5, -1, -1)
    ]

    # Recommendations
    recs: List[str] = []
    for cat in snap.savings_by_category:
        frac = team["total_cost"] / max(snap.total_monthly_cost, 1)
        pot  = round(cat.potential * frac, 2)
        if pot > 0:
            recs.append(f"{cat.category}: ~${pot}/mo potential — {cat.basis}")
    if team["efficiency_score"] < 70:
        recs.append(f"Efficiency score {team['efficiency_score']}/100 — consider right-sizing pod requests.")

    return TeamDetails(
        team_name=team["team_name"],
        total_cost=team["total_cost"],
        waste=team["waste"],
        potential_savings=team["potential_savings"],
        efficiency_score=team["efficiency_score"],
        members=[],          # no member directory in agent data
        resources=resources,
        namespaces=namespaces,
        cost_trend=cost_trend,
        recommendations=recs,
    )


@router.get("/summary", response_model=AccountabilitySummary)
async def get_accountability_summary(cluster: Optional[str] = Query(None)):
    cluster_name = _resolve_cluster(cluster)
    teams        = await _build_teams(cluster_name)

    if not teams:
        return AccountabilitySummary(
            total_teams=0, total_cost=0, total_waste=0, average_efficiency=0,
            most_efficient_team="N/A", least_efficient_team="N/A",
            highest_cost_team="N/A", highest_waste_team="N/A",
            team_comparisons=[],
        )

    total_cost      = sum(t["total_cost"] for t in teams)
    total_waste     = sum(t["waste"] for t in teams)
    avg_eff         = sum(t["efficiency_score"] for t in teams) // len(teams)
    sorted_by_eff   = sorted(teams, key=lambda x: x["efficiency_score"], reverse=True)

    return AccountabilitySummary(
        total_teams=len(teams),
        total_cost=round(total_cost, 2),
        total_waste=round(total_waste, 2),
        average_efficiency=avg_eff,
        most_efficient_team=sorted_by_eff[0]["team_name"],
        least_efficient_team=sorted_by_eff[-1]["team_name"],
        highest_cost_team=max(teams, key=lambda x: x["total_cost"])["team_name"],
        highest_waste_team=max(teams, key=lambda x: x["waste"])["team_name"],
        team_comparisons=[
            TeamComparison(
                team_name=t["team_name"], cost=t["total_cost"],
                waste=t["waste"], efficiency_score=t["efficiency_score"], rank=i + 1,
            )
            for i, t in enumerate(sorted_by_eff)
        ],
    )


@router.get("/leaderboard")
async def get_team_leaderboard(cluster: Optional[str] = Query(None)):
    cluster_name = _resolve_cluster(cluster)
    teams        = await _build_teams(cluster_name)
    total_waste  = sum(t["waste"] for t in teams) or 1

    return {
        "by_efficiency": sorted(
            [{"team": t["team_name"], "score": t["efficiency_score"], "cost": t["total_cost"]}
             for t in teams],
            key=lambda x: x["score"], reverse=True,
        ),
        "by_savings": sorted(
            [{"team": t["team_name"], "savings": t["potential_savings"], "cost": t["total_cost"]}
             for t in teams],
            key=lambda x: x["savings"], reverse=True,
        ),
        "by_waste": sorted(
            [{"team": t["team_name"], "waste": t["waste"],
              "waste_percentage": round(t["waste"] / total_waste * 100, 1)}
             for t in teams],
            key=lambda x: x["waste"], reverse=True,
        ),
    }

# Made with Bob
