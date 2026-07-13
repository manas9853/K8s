"""
Team-Based Cost Accountability API
Tracks costs, waste, and savings by team for accountability
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime, timedelta
import httpx
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Base URL for internal API calls
BASE_URL = "http://localhost:8000/api/v1"

# Cost constants
CPU_COST_PER_CORE_HOUR = 0.031
MEMORY_COST_PER_GB_HOUR = 0.004
HOURS_PER_MONTH = 730


class TeamCost(BaseModel):
    """Team cost breakdown"""
    team_name: str
    total_cost: float
    waste: float
    potential_savings: float
    efficiency_score: int
    resource_count: int
    namespace_count: int
    top_namespace: str
    top_namespace_cost: float
    trend: str  # increasing, decreasing, stable
    monthly_change: float


class TeamResource(BaseModel):
    """Team resource details"""
    resource_type: str
    count: int
    cost: float
    waste: float


class TeamNamespace(BaseModel):
    """Team namespace details"""
    namespace: str
    cost: float
    waste: float
    pod_count: int
    efficiency_score: int


class TeamMember(BaseModel):
    """Team member details"""
    name: str
    email: str
    role: str
    resources_owned: int


class TeamDetails(BaseModel):
    """Detailed team information"""
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


class CostAllocation(BaseModel):
    """Cost allocation by dimension"""
    dimension: str
    breakdown: List[Dict[str, float]]


class TeamComparison(BaseModel):
    """Team comparison metrics"""
    team_name: str
    cost: float
    waste: float
    efficiency_score: int
    rank: int


class AccountabilitySummary(BaseModel):
    """Overall accountability summary"""
    total_teams: int
    total_cost: float
    total_waste: float
    average_efficiency: int
    most_efficient_team: str
    least_efficient_team: str
    highest_cost_team: str
    highest_waste_team: str
    team_comparisons: List[TeamComparison]


# Demo data
TEAM_COSTS = [
    {
        "team_name": "Payments",
        "total_cost": 5000.0,
        "waste": 1000.0,
        "potential_savings": 800.0,
        "efficiency_score": 80,
        "resource_count": 45,
        "namespace_count": 3,
        "top_namespace": "payments-prod",
        "top_namespace_cost": 3200.0,
        "trend": "stable",
        "monthly_change": 0.0
    },
    {
        "team_name": "Analytics",
        "total_cost": 15000.0,
        "waste": 4000.0,
        "potential_savings": 3500.0,
        "efficiency_score": 73,
        "resource_count": 120,
        "namespace_count": 5,
        "top_namespace": "analytics-prod",
        "top_namespace_cost": 8500.0,
        "trend": "increasing",
        "monthly_change": 12.5
    },
    {
        "team_name": "Platform",
        "total_cost": 8000.0,
        "waste": 1200.0,
        "potential_savings": 900.0,
        "efficiency_score": 85,
        "resource_count": 65,
        "namespace_count": 4,
        "top_namespace": "platform-infra",
        "top_namespace_cost": 4500.0,
        "trend": "decreasing",
        "monthly_change": -5.2
    },
    {
        "team_name": "Frontend",
        "total_cost": 3500.0,
        "waste": 600.0,
        "potential_savings": 450.0,
        "efficiency_score": 83,
        "resource_count": 35,
        "namespace_count": 2,
        "top_namespace": "frontend-prod",
        "top_namespace_cost": 2100.0,
        "trend": "stable",
        "monthly_change": 1.2
    },
    {
        "team_name": "Backend",
        "total_cost": 12000.0,
        "waste": 2500.0,
        "potential_savings": 2000.0,
        "efficiency_score": 79,
        "resource_count": 95,
        "namespace_count": 6,
        "top_namespace": "backend-api",
        "top_namespace_cost": 5800.0,
        "trend": "increasing",
        "monthly_change": 8.3
    },
    {
        "team_name": "ML-Engineering",
        "total_cost": 18000.0,
        "waste": 5000.0,
        "potential_savings": 4200.0,
        "efficiency_score": 72,
        "resource_count": 85,
        "namespace_count": 4,
        "top_namespace": "ml-training",
        "top_namespace_cost": 12000.0,
        "trend": "increasing",
        "monthly_change": 15.8
    },
    {
        "team_name": "DevOps",
        "total_cost": 6500.0,
        "waste": 800.0,
        "potential_savings": 600.0,
        "efficiency_score": 88,
        "resource_count": 55,
        "namespace_count": 5,
        "top_namespace": "devops-tools",
        "top_namespace_cost": 2800.0,
        "trend": "stable",
        "monthly_change": -1.5
    },
    {
        "team_name": "Security",
        "total_cost": 4000.0,
        "waste": 500.0,
        "potential_savings": 350.0,
        "efficiency_score": 87,
        "resource_count": 30,
        "namespace_count": 3,
        "top_namespace": "security-scanning",
        "top_namespace_cost": 2200.0,
        "trend": "stable",
        "monthly_change": 0.5
    }
]


@router.get("/teams", response_model=List[TeamCost])
async def get_team_costs():
    """Get cost breakdown for all teams from real K8s data"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch pods and recommendations
            pods_response = await client.get(f"{BASE_URL}/pods")
            recs_response = await client.get(f"{BASE_URL}/recommendations/")
            
            pods_data = (pods_response.json() if pods_response.status_code == 200
                        else [])
            recs_data = (recs_response.json() if recs_response.status_code == 200
                        else [])
        
        # Group pods by team (extracted from namespace)
        team_data = {}
        
        for pod in pods_data:
            namespace = pod.get('namespace', 'default')
            # Extract team name from namespace (e.g., "ibm-observe" -> "IBM")
            team_name = namespace.split('-')[0].upper()
            
            if team_name not in team_data:
                team_data[team_name] = {
                    'pods': [],
                    'namespaces': set(),
                    'total_cpu': 0,
                    'total_memory': 0,
                    'total_cost': 0
                }
            
            team_data[team_name]['pods'].append(pod)
            team_data[team_name]['namespaces'].add(namespace)
            
            # Calculate pod cost
            for container in pod.get('containers', []):
                cpu_req = container.get('cpu_request', '0')
                mem_req = container.get('memory_request', '0')
                
                # Parse CPU
                cpu_cores = 0
                if cpu_req.endswith('m'):
                    cpu_cores = float(cpu_req[:-1]) / 1000
                else:
                    cpu_cores = float(cpu_req or 0)
                
                # Parse Memory
                memory_gb = 0
                if mem_req.endswith('Mi'):
                    memory_gb = float(mem_req[:-2]) / 1024
                elif mem_req.endswith('Gi'):
                    memory_gb = float(mem_req[:-2])
                
                team_data[team_name]['total_cpu'] += cpu_cores
                team_data[team_name]['total_memory'] += memory_gb
                
                monthly_cost = (
                    cpu_cores * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH +
                    memory_gb * MEMORY_COST_PER_GB_HOUR * HOURS_PER_MONTH
                )
                team_data[team_name]['total_cost'] += monthly_cost
        
        # Calculate waste and savings from recommendations
        team_savings = {}
        for rec in recs_data:
            namespace = rec.get('namespace', 'default')
            team_name = namespace.split('-')[0].upper()
            
            if team_name not in team_savings:
                team_savings[team_name] = 0
            
            team_savings[team_name] += rec.get('estimated_monthly_savings', 0)
        
        # Build team cost list
        team_costs = []
        for team_name, data in sorted(team_data.items()):
            total_cost = data['total_cost']
            potential_savings = team_savings.get(team_name, 0)
            waste = potential_savings / 0.7 if potential_savings > 0 else 0
            
            # Calculate efficiency score (100 - waste percentage)
            efficiency = max(0, min(100, int(
                100 - (waste / total_cost * 100) if total_cost > 0 else 100
            )))
            
            # Find top namespace by cost
            ns_costs = {}
            for pod in data['pods']:
                ns = pod.get('namespace', 'default')
                if ns not in ns_costs:
                    ns_costs[ns] = 0
                # Simplified: divide team cost by number of namespaces
                ns_costs[ns] += total_cost / len(data['namespaces'])
            
            top_ns = max(ns_costs.items(), key=lambda x: x[1]) if ns_costs else ('N/A', 0)
            
            team_costs.append({
                "team_name": team_name,
                "total_cost": round(total_cost, 2),
                "waste": round(waste, 2),
                "potential_savings": round(potential_savings, 2),
                "efficiency_score": efficiency,
                "resource_count": len(data['pods']),
                "namespace_count": len(data['namespaces']),
                "top_namespace": top_ns[0],
                "top_namespace_cost": round(top_ns[1], 2),
                "trend": "stable",
                "monthly_change": 0.0
            })
        
        return sorted(team_costs, key=lambda x: x['total_cost'], reverse=True)
        
    except Exception as e:
        logger.error(f"Error calculating team costs: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Failed to calculate team costs: {str(e)}"
        )


@router.get("/teams/{team_name}", response_model=TeamDetails)
async def get_team_details(team_name: str):
    """Get detailed information for a specific team"""
    team = next((t for t in TEAM_COSTS if t["team_name"] == team_name), None)
    
    if not team:
        return {
            "team_name": team_name,
            "total_cost": 0,
            "waste": 0,
            "potential_savings": 0,
            "efficiency_score": 0,
            "members": [],
            "resources": [],
            "namespaces": [],
            "cost_trend": [],
            "recommendations": []
        }
    
    # Generate team members
    members = [
        {
            "name": f"{team_name} Lead",
            "email": f"lead@{team_name.lower()}.com",
            "role": "Team Lead",
            "resources_owned": team["resource_count"] // 3
        },
        {
            "name": f"{team_name} Engineer 1",
            "email": f"eng1@{team_name.lower()}.com",
            "role": "Senior Engineer",
            "resources_owned": team["resource_count"] // 3
        },
        {
            "name": f"{team_name} Engineer 2",
            "email": f"eng2@{team_name.lower()}.com",
            "role": "Engineer",
            "resources_owned": team["resource_count"] // 3
        }
    ]
    
    # Generate resources
    resources = [
        {
            "resource_type": "Deployments",
            "count": team["resource_count"] // 3,
            "cost": team["total_cost"] * 0.4,
            "waste": team["waste"] * 0.4
        },
        {
            "resource_type": "StatefulSets",
            "count": team["resource_count"] // 5,
            "cost": team["total_cost"] * 0.3,
            "waste": team["waste"] * 0.3
        },
        {
            "resource_type": "Services",
            "count": team["resource_count"] // 2,
            "cost": team["total_cost"] * 0.2,
            "waste": team["waste"] * 0.2
        },
        {
            "resource_type": "PVCs",
            "count": team["resource_count"] // 4,
            "cost": team["total_cost"] * 0.1,
            "waste": team["waste"] * 0.1
        }
    ]
    
    # Generate namespaces
    namespaces = []
    for i in range(team["namespace_count"]):
        ns_cost = team["total_cost"] / team["namespace_count"]
        namespaces.append({
            "namespace": f"{team_name.lower()}-ns-{i+1}",
            "cost": ns_cost,
            "waste": team["waste"] / team["namespace_count"],
            "pod_count": team["resource_count"] // team["namespace_count"],
            "efficiency_score": team["efficiency_score"] + (i * 2)
        })
    
    # Generate cost trend (6 months)
    cost_trend = []
    base_cost = team["total_cost"]
    for i in range(6, 0, -1):
        month_cost = base_cost * (1 - (i * 0.05))
        cost_trend.append({
            "month": (datetime.now() - timedelta(days=30*i)).strftime("%b %Y"),
            "cost": round(month_cost, 2)
        })
    
    # Generate recommendations
    recommendations = []
    if team["waste"] > 1000:
        recommendations.append(
            f"High waste detected: ${team['waste']:.0f}/month. "
            f"Review resource requests in {team['top_namespace']}"
        )
    if team["efficiency_score"] < 80:
        recommendations.append(
            f"Efficiency score is {team['efficiency_score']}. "
            "Consider implementing auto-scaling"
        )
    if team["trend"] == "increasing":
        recommendations.append(
            f"Cost increasing by {team['monthly_change']:.1f}%. "
            "Review recent deployments"
        )
    if team["potential_savings"] > 500:
        recommendations.append(
            f"Potential savings: ${team['potential_savings']:.0f}/month. "
            "Apply recommended optimizations"
        )
    
    return {
        "team_name": team["team_name"],
        "total_cost": team["total_cost"],
        "waste": team["waste"],
        "potential_savings": team["potential_savings"],
        "efficiency_score": team["efficiency_score"],
        "members": members,
        "resources": resources,
        "namespaces": namespaces,
        "cost_trend": cost_trend,
        "recommendations": recommendations
    }


@router.get("/allocation", response_model=List[CostAllocation])
async def get_cost_allocation():
    """Get cost allocation by different dimensions"""
    
    # By team
    team_breakdown = [
        {"name": t["team_name"], "value": t["total_cost"]}
        for t in TEAM_COSTS
    ]
    
    # By efficiency
    efficiency_breakdown = [
        {"name": "High Efficiency (>85)", "value": sum(
            t["total_cost"] for t in TEAM_COSTS
            if t["efficiency_score"] > 85
        )},
        {"name": "Medium Efficiency (75-85)", "value": sum(
            t["total_cost"] for t in TEAM_COSTS
            if 75 <= t["efficiency_score"] <= 85
        )},
        {"name": "Low Efficiency (<75)", "value": sum(
            t["total_cost"] for t in TEAM_COSTS
            if t["efficiency_score"] < 75
        )}
    ]
    
    # By waste level
    waste_breakdown = [
        {"name": "High Waste (>$3000)", "value": sum(
            t["total_cost"] for t in TEAM_COSTS if t["waste"] > 3000
        )},
        {"name": "Medium Waste ($1000-$3000)", "value": sum(
            t["total_cost"] for t in TEAM_COSTS
            if 1000 <= t["waste"] <= 3000
        )},
        {"name": "Low Waste (<$1000)", "value": sum(
            t["total_cost"] for t in TEAM_COSTS if t["waste"] < 1000
        )}
    ]
    
    return [
        {"dimension": "By Team", "breakdown": team_breakdown},
        {"dimension": "By Efficiency", "breakdown": efficiency_breakdown},
        {"dimension": "By Waste Level", "breakdown": waste_breakdown}
    ]


@router.get("/comparison", response_model=List[TeamComparison])
async def get_team_comparison():
    """Get team comparison with rankings"""
    
    # Sort by efficiency score
    sorted_teams = sorted(
        TEAM_COSTS,
        key=lambda x: x["efficiency_score"],
        reverse=True
    )
    
    comparisons = []
    for idx, team in enumerate(sorted_teams):
        comparisons.append({
            "team_name": team["team_name"],
            "cost": team["total_cost"],
            "waste": team["waste"],
            "efficiency_score": team["efficiency_score"],
            "rank": idx + 1
        })
    
    return comparisons


@router.get("/summary", response_model=AccountabilitySummary)
async def get_accountability_summary():
    """Get overall accountability summary from real data"""
    try:
        # Get team costs from real data (returns list of dicts)
        team_costs = await get_team_costs()
        
        if not team_costs:
            return {
                "total_teams": 0,
                "total_cost": 0.0,
                "total_waste": 0.0,
                "average_efficiency": 0,
                "most_efficient_team": "N/A",
                "least_efficient_team": "N/A",
                "highest_cost_team": "N/A",
                "highest_waste_team": "N/A",
                "team_comparisons": []
            }
        
        total_cost = sum(t['total_cost'] for t in team_costs)
        total_waste = sum(t['waste'] for t in team_costs)
        avg_efficiency = sum(
            t['efficiency_score'] for t in team_costs
        ) // len(team_costs)
        
        # Find extremes
        most_efficient = max(team_costs, key=lambda x: x['efficiency_score'])
        least_efficient = min(team_costs, key=lambda x: x['efficiency_score'])
        highest_cost = max(team_costs, key=lambda x: x['total_cost'])
        highest_waste = max(team_costs, key=lambda x: x['waste'])
        
        # Generate comparisons
        sorted_teams = sorted(
            team_costs,
            key=lambda x: x['efficiency_score'],
            reverse=True
        )
        
        comparisons = []
        for idx, team in enumerate(sorted_teams):
            comparisons.append({
                "team_name": team['team_name'],
                "cost": team['total_cost'],
                "waste": team['waste'],
                "efficiency_score": team['efficiency_score'],
                "rank": idx + 1
            })
        
        return {
            "total_teams": len(team_costs),
            "total_cost": round(total_cost, 2),
            "total_waste": round(total_waste, 2),
            "average_efficiency": avg_efficiency,
            "most_efficient_team": most_efficient['team_name'],
            "least_efficient_team": least_efficient['team_name'],
            "highest_cost_team": highest_cost['team_name'],
            "highest_waste_team": highest_waste['team_name'],
            "team_comparisons": comparisons
        }
    except Exception as e:
        logger.error(f"Error generating accountability summary: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Failed to generate summary: {str(e)}"
        )


@router.get("/leaderboard")
async def get_team_leaderboard():
    """Get team leaderboard by different metrics"""
    
    return {
        "by_efficiency": sorted(
            [
                {
                    "team": t["team_name"],
                    "score": t["efficiency_score"],
                    "cost": t["total_cost"]
                }
                for t in TEAM_COSTS
            ],
            key=lambda x: x["score"],
            reverse=True
        ),
        "by_savings": sorted(
            [
                {
                    "team": t["team_name"],
                    "savings": t["potential_savings"],
                    "cost": t["total_cost"]
                }
                for t in TEAM_COSTS
            ],
            key=lambda x: x["savings"],
            reverse=True
        ),
        "by_waste": sorted(
            [
                {
                    "team": t["team_name"],
                    "waste": t["waste"],
                    "waste_percentage": round(
                        (t["waste"] / t["total_cost"]) * 100, 1
                    )
                }
                for t in TEAM_COSTS
            ],
            key=lambda x: x["waste_percentage"],
            reverse=True
        )
    }

# Made with Bob
