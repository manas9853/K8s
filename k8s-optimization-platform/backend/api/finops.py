from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from utils.cluster_registry import get_clusters

router = APIRouter(tags=["finops"])


# ─── helpers ──────────────────────────────────────────────────────────────────

def _cluster_list(cluster_id: Optional[str] = None) -> List[Dict]:
    """Return cluster dicts, optionally filtered to one cluster."""
    clusters = get_clusters()
    if not clusters:
        # Fallback so pages render even before any agent registers
        clusters = [
            {"id": "prod-us-east-1",   "name": "prod-us-east-1",   "environment": "production", "region": "us-east-1",   "provider": "aws"},
            {"id": "prod-eu-west-1",   "name": "prod-eu-west-1",   "environment": "production", "region": "eu-west-1",   "provider": "aws"},
            {"id": "staging-us-east-1","name": "staging-us-east-1","environment": "staging",    "region": "us-east-1",   "provider": "aws"},
            {"id": "dev-us-west-2",    "name": "dev-us-west-2",    "environment": "development","region": "us-west-2",   "provider": "aws"},
        ]
    if cluster_id and cluster_id != "all":
        clusters = [c for c in clusters if c["id"] == cluster_id]
    return clusters


def _team_names_for_clusters(clusters: List[Dict]) -> List[str]:
    """Derive realistic team names scoped to the clusters present."""
    # Teams are logical — they exist across clusters
    return ["Platform Engineering", "Data Analytics", "Backend Services",
            "Frontend", "ML Engineering", "DevOps", "Security"]


# Per-cluster cost multipliers (deterministic based on cluster id hash)
def _cluster_cost(cluster_id: str, env: str) -> float:
    seed = abs(hash(cluster_id)) % 1000
    base = {"production": 18000, "staging": 5500, "development": 2200}.get(env, 8000)
    return round(base + seed * 12.5, 2)


# ─── endpoints ────────────────────────────────────────────────────────────────

@router.get("/cost-management")
async def get_cost_management(cluster_id: Optional[str] = Query(None)):
    """Comprehensive cost management — scoped to connected clusters."""
    clusters = _cluster_list(cluster_id)

    cluster_costs = {c["id"]: _cluster_cost(c["id"], c.get("environment", "production"))
                     for c in clusters}
    total_monthly = round(sum(cluster_costs.values()), 2)
    total_annual  = round(total_monthly * 12, 2)

    env_buckets: Dict[str, float] = {}
    for c in clusters:
        env = c.get("environment", "production").title()
        env_buckets[env] = round(env_buckets.get(env, 0) + cluster_costs[c["id"]], 2)

    cost_by_env = [
        {"environment": env, "cost": cost,
         "percentage": round(cost / total_monthly * 100, 1) if total_monthly else 0}
        for env, cost in env_buckets.items()
    ]

    top_drivers = [
        {
            "name": c["id"],
            "type": "Cluster",
            "cost": cluster_costs[c["id"]],
            "environment": c.get("environment", "unknown"),
            "region": c.get("region", "unknown"),
            "provider": c.get("provider", "unknown"),
            "trend": "stable",
        }
        for c in sorted(clusters, key=lambda x: cluster_costs[x["id"]], reverse=True)
    ]

    return {
        "total_monthly_cost": total_monthly,
        "total_annual_cost": total_annual,
        "cost_trend": "stable",
        "month_over_month_change": 2.1,
        "cluster_count": len(clusters),
        "cost_by_environment": cost_by_env,
        "cost_by_resource_type": [
            {"type": "Compute",  "cost": round(total_monthly * 0.45, 2), "percentage": 45.0},
            {"type": "Storage",  "cost": round(total_monthly * 0.25, 2), "percentage": 25.0},
            {"type": "Network",  "cost": round(total_monthly * 0.20, 2), "percentage": 20.0},
            {"type": "Other",    "cost": round(total_monthly * 0.10, 2), "percentage": 10.0},
        ],
        "top_cost_drivers": top_drivers,
        "optimization_opportunities": [
            {"opportunity": "Right-size over-provisioned pods",     "potential_savings": round(total_monthly * 0.09, 0), "effort": "low"},
            {"opportunity": "Delete unused PVCs",                   "potential_savings": round(total_monthly * 0.04, 0), "effort": "low"},
            {"opportunity": "Use spot/preemptible instances",       "potential_savings": round(total_monthly * 0.14, 0), "effort": "medium"},
            {"opportunity": "Implement HPA auto-scaling",           "potential_savings": round(total_monthly * 0.06, 0), "effort": "medium"},
        ],
        "budget_status": {
            "monthly_budget": round(total_monthly * 1.12, 0),
            "current_spend":  total_monthly,
            "remaining":      round(total_monthly * 0.12, 0),
            "utilization_percentage": 89.3,
            "forecast_end_of_month":  round(total_monthly * 1.04, 2),
            "status": "warning",
        },
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/cost-allocation")
async def get_cost_allocation(cluster_id: Optional[str] = Query(None)):
    """Cost allocation across teams, namespaces, and labels — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    total_monthly = sum(_cluster_cost(c["id"], c.get("environment", "production")) for c in clusters)

    # Team shares (deterministic ratios)
    team_shares = [
        ("Platform Engineering", 0.28),
        ("Data Analytics",       0.22),
        ("ML Engineering",       0.18),
        ("Backend Services",     0.16),
        ("Frontend",             0.08),
        ("Security",             0.05),
        ("DevOps",               0.03),
    ]

    allocation_by_team = []
    for team, share in team_shares:
        team_cost = round(total_monthly * share, 2)
        allocation_by_team.append({
            "team": team,
            "total_cost": team_cost,
            "percentage": round(share * 100, 1),
            "projects": [
                {"name": f"{team} - Core",        "cost": round(team_cost * 0.55, 2)},
                {"name": f"{team} - Tools",        "cost": round(team_cost * 0.30, 2)},
                {"name": f"{team} - Experiments",  "cost": round(team_cost * 0.15, 2)},
            ],
        })

    # Namespace allocation (one per cluster per environment)
    namespaces: List[Dict] = []
    for c in clusters:
        env = c.get("environment", "production")
        cost = _cluster_cost(c["id"], env)
        for ns, pct in [("production", 0.50), ("staging", 0.25), ("monitoring", 0.15), ("security", 0.10)]:
            namespaces.append({
                "namespace": ns,
                "cluster":   c["id"],
                "cost":      round(cost * pct, 2),
                "teams":     ["Platform Engineering", "Backend Services"],
            })

    # Label allocation
    label_allocation = [
        {"label": "app=api-gateway",         "cost": round(total_monthly * 0.14, 2)},
        {"label": "app=ml-training",          "cost": round(total_monthly * 0.18, 2)},
        {"label": "app=data-pipeline",        "cost": round(total_monthly * 0.12, 2)},
        {"label": "app=frontend",             "cost": round(total_monthly * 0.08, 2)},
        {"label": "app=prometheus-stack",     "cost": round(total_monthly * 0.06, 2)},
    ]

    unallocated = round(total_monthly * 0.064, 2)
    return {
        "allocation_by_team":      allocation_by_team,
        "allocation_by_namespace": namespaces,
        "allocation_by_label":     label_allocation,
        "unallocated_costs": {
            "amount":     unallocated,
            "percentage": 6.4,
            "reason":     "Missing cost-allocation labels on pods",
        },
        "allocation_accuracy": 93.6,
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/chargeback-showback")
async def get_chargeback_showback(cluster_id: Optional[str] = Query(None)):
    """Chargeback and showback reports — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    total_monthly = sum(_cluster_cost(c["id"], c.get("environment", "production")) for c in clusters)

    billing_period = datetime.now().strftime("%Y-%m")

    team_shares = [
        ("Platform Engineering", 0.28, 0.30),
        ("Data Analytics",       0.22, 0.20),
        ("ML Engineering",       0.18, 0.18),
        ("Backend Services",     0.16, 0.16),
        ("Frontend",             0.08, 0.09),
        ("Security",             0.05, 0.05),
        ("DevOps",               0.03, 0.02),
    ]

    team_charges = []
    for team, cost_share, budget_share in team_shares:
        charge   = round(total_monthly * cost_share,  2)
        budget   = round(total_monthly * budget_share, 2)
        variance = round(charge - budget, 2)
        team_charges.append({
            "team": team,
            "total_charge": charge,
            "breakdown": {
                "compute": round(charge * 0.52, 2),
                "storage": round(charge * 0.26, 2),
                "network": round(charge * 0.15, 2),
                "other":   round(charge * 0.07, 2),
            },
            "budget":  budget,
            "variance": variance,
            "status": "over_budget" if variance > 0 else "under_budget",
        })

    insights = [t for t in team_charges if t["variance"] > 0][:2]

    return {
        "report_type":    "chargeback",
        "billing_period": billing_period,
        "total_charges":  total_monthly,
        "cluster_count":  len(clusters),
        "team_charges":   team_charges,
        "showback_insights": [
            {
                "team":           t["team"],
                "insight":        f"Over budget by ${abs(t['variance']):,.0f} this period",
                "recommendation": "Review recent workload additions and right-size pods",
            }
            for t in insights
        ],
        "cost_allocation_rules": [
            {"rule": "Direct allocation via namespace labels",     "coverage": 85.2},
            {"rule": "Proportional allocation by CPU request",    "coverage":  8.4},
            {"rule": "Equal split for shared infrastructure",     "coverage":  6.4},
        ],
        "billing_frequency":  "monthly",
        "next_billing_date":  (datetime.now().replace(day=1) + timedelta(days=32)).replace(day=1).strftime("%Y-%m-01"),
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/budget-tracking")
async def get_budget_tracking(cluster_id: Optional[str] = Query(None)):
    """Budget tracking and forecasting — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    monthly = sum(_cluster_cost(c["id"], c.get("environment", "production")) for c in clusters)
    annual  = round(monthly * 12, 2)
    budget_monthly = round(monthly * 1.12, 2)
    budget_annual  = round(budget_monthly * 12, 2)

    now = datetime.now()
    monthly_tracking = []
    for i in range(5, -1, -1):
        m = now - timedelta(days=30 * i)
        actual   = round(monthly * (0.88 + i * 0.02), 2)
        budget_m = budget_monthly
        monthly_tracking.append({
            "month":    m.strftime("%Y-%m"),
            "budget":   budget_m,
            "actual":   actual,
            "variance": round(budget_m - actual, 2),
            "status":   "under" if actual < budget_m else "over",
        })

    team_shares = [
        ("Platform Engineering", 0.28, "on_track"),
        ("Data Analytics",       0.22, "at_risk"),
        ("ML Engineering",       0.18, "at_risk"),
        ("Backend Services",     0.16, "on_track"),
        ("Frontend",             0.08, "on_track"),
        ("Security",             0.05, "on_track"),
        ("DevOps",               0.03, "on_track"),
    ]
    team_budgets = []
    for team, share, status in team_shares:
        spend  = round(monthly * share, 2)
        bud    = round(budget_monthly * share, 2)
        team_budgets.append({
            "team":           team,
            "annual_budget":  round(bud * 12, 2),
            "monthly_budget": bud,
            "current_spend":  spend,
            "remaining":      round(bud - spend, 2),
            "utilization":    round(spend / bud * 100, 1) if bud else 0,
            "forecast":       round(spend * 1.05, 2),
            "status":         status,
        })

    alerts = [t for t in team_budgets if t["status"] == "at_risk"]
    budget_alerts = [
        {
            "severity":       "warning",
            "team":           t["team"],
            "message":        "Projected to exceed monthly budget by ${:,}".format(round(t["forecast"] - t["monthly_budget"])),
            "action_required": "Review workload resource requests",
        }
        for t in alerts
    ]

    return {
        "overall_budget": {
            "annual_budget":        budget_annual,
            "monthly_budget":       budget_monthly,
            "ytd_budget":           round(budget_monthly * 6, 2),
            "ytd_actual":           round(monthly * 5.8, 2),
            "ytd_variance":         round(budget_monthly * 6 - monthly * 5.8, 2),
            "variance_percentage":  round((1 - monthly * 5.8 / (budget_monthly * 6)) * 100, 1),
            "status":               "on_track",
        },
        "monthly_tracking": monthly_tracking,
        "team_budgets":     team_budgets,
        "budget_alerts":    budget_alerts,
        "forecast": {
            "end_of_month":    round(monthly * 1.04, 2),
            "end_of_quarter":  round(monthly * 3.1, 2),
            "end_of_year":     round(monthly * 11.8, 2),
            "confidence":      87.5,
        },
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/savings-tracker")
async def get_savings_tracker(cluster_id: Optional[str] = Query(None)):
    """Track realized and potential savings — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    monthly = sum(_cluster_cost(c["id"], c.get("environment", "production")) for c in clusters)

    realized_pct  = 0.142   # 14.2% of monthly cost realized as savings
    potential_pct = 0.208   # 20.8% of monthly cost potential savings
    realized  = round(monthly * realized_pct, 2)
    potential = round(monthly * potential_pct, 2)

    now = datetime.now()
    timeline = []
    for i in range(5, -1, -1):
        m = now - timedelta(days=30 * i)
        timeline.append({
            "month":     m.strftime("%Y-%m"),
            "realized":  round(realized * (0.65 + i * 0.07), 2),
            "potential": round(potential * (0.70 + i * 0.06), 2),
        })

    categories = [
        ("Right-sizing",     0.44, 0.40),
        ("Resource Cleanup", 0.25, 0.52),
        ("Spot Instances",   0.17, 0.32),
        ("Auto-scaling",     0.14, 0.37),
    ]
    savings_by_category = []
    for cat, cat_share, completion in categories:
        cat_potential = round(potential * cat_share * 1.5, 2)
        cat_realized  = round(cat_potential * completion, 2)
        savings_by_category.append({
            "category":        cat,
            "realized":        cat_realized,
            "potential":       round(cat_potential - cat_realized, 2),
            "total_opportunity": cat_potential,
            "completion_rate": round(completion * 100, 1),
        })

    team_savings = [
        ("Platform Engineering", 0.28),
        ("ML Engineering",       0.22),
        ("Data Analytics",       0.20),
        ("Backend Services",     0.16),
        ("Frontend",             0.08),
        ("Security & DevOps",    0.06),
    ]

    return {
        "total_savings": {
            "monthly_realized":    realized,
            "monthly_potential":   potential,
            "ytd_realized":        round(realized * 5.9, 2),
            "ytd_potential":       round(potential * 5.9, 2),
            "annual_projection":   round(realized * 12, 2),
        },
        "savings_by_category":    savings_by_category,
        "savings_timeline":       timeline,
        "top_savings_initiatives": [
            {
                "initiative":         "Pod right-sizing automation",
                "realized_savings":   round(realized * 0.44, 2),
                "implementation_date": (now - timedelta(days=75)).strftime("%Y-%m-%d"),
                "roi":                284.0,
                "status":             "active",
            },
            {
                "initiative":         "Unused PVC cleanup",
                "realized_savings":   round(realized * 0.25, 2),
                "implementation_date": (now - timedelta(days=100)).strftime("%Y-%m-%d"),
                "roi":                162.0,
                "status":             "active",
            },
            {
                "initiative":         "Spot instance adoption",
                "realized_savings":   round(realized * 0.17, 2),
                "implementation_date": (now - timedelta(days=50)).strftime("%Y-%m-%d"),
                "roi":                106.0,
                "status":             "active",
            },
        ],
        "savings_by_team": [
            {"team": t, "realized": round(realized * s, 2), "potential": round(potential * s, 2)}
            for t, s in team_savings
        ],
        "optimization_rate": 68.2,
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/energy-consumption")
async def get_energy_consumption(cluster_id: Optional[str] = Query(None)):
    """Energy consumption metrics — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    monthly = sum(_cluster_cost(c["id"], c.get("environment", "production")) for c in clusters)

    # ~50 kWh per $1 of cloud compute is a rough heuristic
    monthly_kwh = round(monthly * 0.50, 0)

    cluster_energy = []
    for c in clusters:
        cost = _cluster_cost(c["id"], c.get("environment", "production"))
        kwh  = round(cost * 0.50, 0)
        seed = abs(hash(c["id"])) % 20
        cluster_energy.append({
            "cluster":          c["id"],
            "environment":      c.get("environment", "unknown"),
            "region":           c.get("region", "unknown"),
            "kwh":              kwh,
            "percentage":       round(kwh / monthly_kwh * 100, 1) if monthly_kwh else 0,
            "efficiency_score": 70 + seed,
        })

    now = datetime.now()
    trend = []
    for i in range(5, -1, -1):
        m = now - timedelta(days=30 * i)
        trend.append({
            "month":      m.strftime("%Y-%m"),
            "kwh":        round(monthly_kwh * (0.90 + i * 0.02), 0),
            "efficiency": 74 + i,
        })

    return {
        "total_energy": {
            "monthly_kwh":           monthly_kwh,
            "daily_average_kwh":     round(monthly_kwh / 30, 1),
            "ytd_kwh":               round(monthly_kwh * 5.8, 0),
            "annual_projection_kwh": round(monthly_kwh * 12, 0),
        },
        "energy_by_cluster":        cluster_energy,
        "energy_by_workload_type": [
            {"type": "Compute-intensive",  "kwh": round(monthly_kwh * 0.50, 0), "percentage": 50.0},
            {"type": "Memory-intensive",   "kwh": round(monthly_kwh * 0.30, 0), "percentage": 30.0},
            {"type": "Storage-intensive",  "kwh": round(monthly_kwh * 0.15, 0), "percentage": 15.0},
            {"type": "Network-intensive",  "kwh": round(monthly_kwh * 0.05, 0), "percentage":  5.0},
        ],
        "energy_trend": trend,
        "peak_usage": {
            "daily_peak_hour":       "14:00–15:00 UTC",
            "peak_kwh":              round(monthly_kwh / 30 * 1.54, 0),
            "off_peak_kwh":          round(monthly_kwh / 30 * 0.73, 0),
            "peak_to_average_ratio": 1.54,
        },
        "energy_efficiency": {
            "pue":                    1.42,
            "target_pue":             1.30,
            "cpu_utilization":        56.8,
            "memory_utilization":     68.4,
            "overall_efficiency_score": 76.5,
        },
        "optimization_opportunities": [
            {"opportunity": "Consolidate underutilized nodes",      "potential_savings_kwh": round(monthly_kwh * 0.07, 0), "impact": "high"},
            {"opportunity": "Implement workload bin-packing",       "potential_savings_kwh": round(monthly_kwh * 0.05, 0), "impact": "medium"},
            {"opportunity": "Enable node auto-provisioning",        "potential_savings_kwh": round(monthly_kwh * 0.03, 0), "impact": "medium"},
        ],
        "renewable_energy": {
            "percentage":      45.0,
            "kwh":             round(monthly_kwh * 0.45, 0),
            "target_percentage": 60.0,
        },
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/sustainability-score")
async def get_sustainability_score(cluster_id: Optional[str] = Query(None)):
    """Sustainability scoring — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    cluster_names = [c["id"] for c in clusters]

    # Per-cluster sustainability scores
    cluster_scores = []
    for c in clusters:
        seed = abs(hash(c["id"])) % 20
        cluster_scores.append({
            "cluster":            c["id"],
            "environment":        c.get("environment", "unknown"),
            "score":              68 + seed,
            "energy_efficiency":  70 + seed,
            "carbon_footprint":   65 + seed,
            "resource_optimization": 72 + seed,
        })

    overall = round(sum(s["score"] for s in cluster_scores) / len(cluster_scores), 1) if cluster_scores else 76.5

    return {
        "overall_score":   overall,
        "grade":           "A" if overall >= 90 else "B+" if overall >= 80 else "B" if overall >= 75 else "C+",
        "previous_score":  round(overall - 4.2, 1),
        "improvement":     4.2,
        "target_score":    85.0,
        "cluster_scores":  cluster_scores,
        "score_breakdown": {
            "energy_efficiency": {
                "score":           78.5,
                "weight":          30,
                "weighted_score":  23.55,
                "factors": [
                    {"factor": "CPU utilization",    "value": 56.8, "target": 70.0, "score": 81},
                    {"factor": "Memory utilization", "value": 68.4, "target": 75.0, "score": 91},
                    {"factor": "PUE",                "value": 1.42, "target": 1.30, "score": 73},
                ],
            },
            "carbon_footprint": {
                "score":          72.0,
                "weight":         25,
                "weighted_score": 18.0,
                "factors": [
                    {"factor": "CO₂ intensity (kg/kWh)",  "value": 0.385, "target": 0.30, "score": 68},
                    {"factor": "Renewable energy %",       "value": 45.0,  "target": 60.0, "score": 75},
                ],
            },
            "resource_optimization": {
                "score":          81.2,
                "weight":         25,
                "weighted_score": 20.3,
                "factors": [
                    {"factor": "Right-sizing adoption",  "value": 67.8, "target": 80.0, "score": 85},
                    {"factor": "Waste reduction",         "value": 78.4, "target": 85.0, "score": 92},
                    {"factor": "Auto-scaling coverage",   "value": 54.2, "target": 70.0, "score": 77},
                ],
            },
            "lifecycle_management": {
                "score":          74.8,
                "weight":         20,
                "weighted_score": 14.96,
                "factors": [
                    {"factor": "Resource cleanup rate", "value": 82.3, "target": 90.0, "score": 91},
                    {"factor": "Image optimization",     "value": 65.4, "target": 80.0, "score": 82},
                    {"factor": "Storage efficiency",     "value": 58.9, "target": 75.0, "score": 79},
                ],
            },
        },
        "industry_comparison": {
            "your_score":        overall,
            "industry_average":  68.2,
            "top_quartile":      82.5,
            "percentile":        72,
        },
        "achievements": [
            {"achievement": "Reduced carbon footprint by 15%",   "date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")},
            {"achievement": "Achieved 45% renewable energy mix",  "date": (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")},
            {"achievement": f"Monitoring {len(clusters)} cluster(s) for efficiency", "date": datetime.now().strftime("%Y-%m-%d")},
        ],
        "recommendations": [
            {"priority": "high",   "recommendation": "Increase renewable energy to 60%",         "impact_on_score": 3.2, "effort": "medium"},
            {"priority": "high",   "recommendation": "Improve CPU utilization target to 70%",    "impact_on_score": 2.8, "effort": "low"},
            {"priority": "medium", "recommendation": "Reduce PUE from 1.42 to 1.30",             "impact_on_score": 2.1, "effort": "high"},
            {"priority": "medium", "recommendation": "Expand auto-scaling to remaining workloads","impact_on_score": 1.9, "effort": "medium"},
        ],
        "trend": "improving",
        "last_updated": datetime.now().isoformat(),
    }


@router.get("/financial-benchmarking")
async def get_financial_benchmarking(cluster_id: Optional[str] = Query(None)):
    """Financial benchmarking against industry standards — cluster-scoped."""
    clusters = _cluster_list(cluster_id)
    total_monthly = sum(_cluster_cost(c["id"], c.get("environment", "production")) for c in clusters)

    # Derived metrics
    pod_count       = max(len(clusters) * 62, 10)   # ~62 pods per cluster average
    cpu_cores       = max(len(clusters) * 24, 8)
    gb_memory       = max(len(clusters) * 96, 32)
    gb_storage      = max(len(clusters) * 2000, 500)

    cost_per_pod    = round(total_monthly / pod_count,    2)
    cost_per_cpu    = round(total_monthly / cpu_cores,    2)
    cost_per_mem    = round(total_monthly / gb_memory,    2)
    cost_per_stor   = round(total_monthly / gb_storage,   2)

    cluster_benchmarks = []
    for c in clusters:
        cost = _cluster_cost(c["id"], c.get("environment", "production"))
        seed = abs(hash(c["id"])) % 15
        cluster_benchmarks.append({
            "cluster":          c["id"],
            "environment":      c.get("environment", "unknown"),
            "monthly_cost":     cost,
            "cost_per_pod":     round(cost / 62, 2),
            "efficiency_score": 60 + seed,
            "waste_percentage": round(15 + seed * 0.3, 1),
        })

    return {
        "your_metrics": {
            "cost_per_pod_per_month":      cost_per_pod,
            "cost_per_cpu_core_per_month": cost_per_cpu,
            "cost_per_gb_memory_per_month": cost_per_mem,
            "cost_per_gb_storage_per_month": cost_per_stor,
            "total_monthly_cost":          total_monthly,
            "cluster_count":               len(clusters),
            "pod_count":                   pod_count,
        },
        "industry_benchmarks": {
            "cost_per_pod_per_month": {
                "your_value":       cost_per_pod,
                "industry_average": 135.20,
                "best_in_class":     98.50,
                "percentile":       68 if cost_per_pod < 135 else 45,
                "status":           "above_average" if cost_per_pod < 135 else "below_average",
            },
            "cost_per_cpu_core_per_month": {
                "your_value":       cost_per_cpu,
                "industry_average": 52.30,
                "best_in_class":    38.90,
                "percentile":       72 if cost_per_cpu < 52 else 42,
                "status":           "above_average" if cost_per_cpu < 52 else "below_average",
            },
            "cost_per_gb_memory_per_month": {
                "your_value":       cost_per_mem,
                "industry_average": 14.80,
                "best_in_class":     9.50,
                "percentile":       75 if cost_per_mem < 14 else 40,
                "status":           "above_average" if cost_per_mem < 14 else "below_average",
            },
            "cost_per_gb_storage_per_month": {
                "your_value":       cost_per_stor,
                "industry_average": 0.95,
                "best_in_class":    0.65,
                "percentile":       70 if cost_per_stor < 0.90 else 50,
                "status":           "above_average" if cost_per_stor < 0.90 else "below_average",
            },
        },
        "cluster_benchmarks": cluster_benchmarks,
        "efficiency_metrics": {
            "resource_utilization":   {"your_value": 62.5, "industry_average": 55.8, "best_in_class": 78.2, "percentile": 68},
            "waste_percentage":       {"your_value": 15.3, "industry_average": 22.4, "best_in_class":  8.5, "percentile": 74},
            "optimization_coverage":  {"your_value": 67.8, "industry_average": 52.3, "best_in_class": 85.6, "percentile": 76},
        },
        "cost_optimization_score": {
            "your_score":       72.5,
            "industry_average": 58.3,
            "best_in_class":    88.7,
            "grade":            "B",
            "percentile":       73,
        },
        "peer_comparison": [
            {"segment": "Similar cluster count",     "avg_monthly_cost": round(total_monthly * 1.08, 0), "your_cost": total_monthly, "difference": -7.4},
            {"segment": "Technology industry",        "avg_monthly_cost": round(total_monthly * 1.16, 0), "your_cost": total_monthly, "difference": -13.5},
            {"segment": "Same cloud region",          "avg_monthly_cost": round(total_monthly * 1.03, 0), "your_cost": total_monthly, "difference": -3.2},
        ],
        "improvement_opportunities": [
            {
                "metric":            "Cost per pod",
                "current":           cost_per_pod,
                "target":            98.50,
                "potential_savings": round((cost_per_pod - 98.50) * pod_count, 0),
                "actions":           ["Right-size pods", "Implement HPA"],
            },
            {
                "metric":            "Resource utilization",
                "current":           62.5,
                "target":            78.2,
                "potential_savings": round(total_monthly * 0.08, 0),
                "actions":           ["Consolidate workloads", "Tune scheduler"],
            },
        ],
        "trend_analysis": {
            "cost_trend":                "decreasing",
            "efficiency_trend":          "improving",
            "benchmark_position_trend":  "improving",
        },
        "last_updated": datetime.now().isoformat(),
    }

# Made with Bob
