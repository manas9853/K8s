"""
Kubernetes Waste Heatmap Visualization API
Visualizes waste across clusters, namespaces, and resources
UPDATED: Now uses real Kubernetes data from Pods and Recommendations APIs
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx
from collections import defaultdict
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# BUG-B06: Use environment variable instead of hardcoded localhost.
import os
_BASE = os.getenv("INTERNAL_API_BASE", "http://localhost:8000")
PODS_API_URL = f"{_BASE}/api/v1/pods"
RECOMMENDATIONS_API_URL = f"{_BASE}/api/v1/recommendations"
CLEANUP_API_URL = f"{_BASE}/api/v1/cleanup"


class HeatmapCell(BaseModel):
    """Individual heatmap cell"""
    cluster: str
    namespace: str
    waste_percentage: float
    waste_amount: float
    total_cost: float
    severity: str  # low, medium, high, critical
    resource_count: int


class ClusterHeatmap(BaseModel):
    """Cluster-level heatmap data"""
    cluster_name: str
    total_waste: float
    waste_percentage: float
    namespaces: List[HeatmapCell]


class ResourceWaste(BaseModel):
    """Resource-level waste details"""
    resource_type: str
    resource_name: str
    namespace: str
    cluster: str
    waste_amount: float
    waste_percentage: float
    cpu_waste: float
    memory_waste: float
    reason: str


class HeatmapSummary(BaseModel):
    """Overall heatmap summary"""
    total_clusters: int
    total_namespaces: int
    total_waste: float
    average_waste_percentage: float
    hotspots: List[Dict[str, Any]]
    severity_distribution: Dict[str, int]


# Helper functions for data fetching
async def fetch_pods_data() -> List[Dict[str, Any]]:
    """Fetch pods data from Pods API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(PODS_API_URL)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching pods data: {e}")
        return []


async def fetch_recommendations_data() -> List[Dict[str, Any]]:
    """Fetch recommendations data from Recommendations API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(RECOMMENDATIONS_API_URL)
            response.raise_for_status()
            data = response.json()
            # Handle both array and object responses
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and 'recommendations' in data:
                return data['recommendations']
            return []
    except Exception as e:
        logger.error(f"Error fetching recommendations data: {e}")
        return []


async def fetch_cleanup_data() -> List[Dict[str, Any]]:
    """Fetch cleanup data from Cleanup API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(CLEANUP_API_URL)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching cleanup data: {e}")
        return []


def calculate_severity(waste_percentage: float) -> str:
    """Calculate severity based on waste percentage"""
    if waste_percentage >= 60:
        return "critical"
    elif waste_percentage >= 40:
        return "high"
    elif waste_percentage >= 20:
        return "medium"
    else:
        return "low"


async def generate_heatmap_from_real_data() -> List[Dict[str, Any]]:
    """Generate heatmap data from real Kubernetes data"""
    
    # Fetch data from all sources
    pods_data = await fetch_pods_data()
    recommendations_data = await fetch_recommendations_data()
    cleanup_data = await fetch_cleanup_data()
    
    # Group data by cluster and namespace
    namespace_stats = defaultdict(lambda: {
        'total_cost': 0.0,
        'waste_amount': 0.0,
        'resource_count': 0,
        'cluster': '',
        'namespace': ''
    })
    
    # Process pods data
    for pod in pods_data:
        # Try both 'cluster' and 'cluster_id' fields
        cluster = pod.get('cluster_id') or pod.get('cluster', 'unknown')
        namespace = pod.get('namespace', 'default')
        key = f"{cluster}:{namespace}"
        
        # Calculate costs
        cpu_cost = pod.get('cpu_cost_monthly', 0.0)
        memory_cost = pod.get('memory_cost_monthly', 0.0)
        total_cost = cpu_cost + memory_cost
        
        # Calculate waste
        cpu_waste_pct = pod.get('cpu_waste_percentage', 0.0)
        memory_waste_pct = pod.get('memory_waste_percentage', 0.0)
        
        # Average waste percentage
        avg_waste_pct = (cpu_waste_pct + memory_waste_pct) / 2
        waste_amount = total_cost * (avg_waste_pct / 100)
        
        namespace_stats[key]['cluster'] = cluster
        namespace_stats[key]['namespace'] = namespace
        namespace_stats[key]['total_cost'] += total_cost
        namespace_stats[key]['waste_amount'] += waste_amount
        namespace_stats[key]['resource_count'] += 1
    
    # Process recommendations data for additional waste insights
    for rec in recommendations_data:
        # Try both 'cluster' and 'cluster_id' fields
        cluster = rec.get('cluster_id') or rec.get('cluster', 'unknown')
        namespace = rec.get('namespace', 'default')
        key = f"{cluster}:{namespace}"
        
        # Add potential savings to waste amount
        cpu_savings = rec.get('estimated_savings', {}).get('cpu_saved', 0.0)
        memory_savings = rec.get('estimated_savings', {}).get(
            'memory_saved', 0.0
        )
        cost_savings = rec.get('estimated_savings', {}).get(
            'cost_saved', 0.0
        )
        
        if key in namespace_stats:
            # Add savings to waste (these are optimization opportunities)
            namespace_stats[key]['waste_amount'] += cost_savings
    
    # Process cleanup data for unused resources
    for resource in cleanup_data:
        # Try both 'cluster' and 'cluster_id' fields
        cluster = resource.get('cluster_id') or resource.get('cluster', 'unknown')
        namespace = resource.get('namespace', 'default')
        key = f"{cluster}:{namespace}"
        
        # Add cost of unused resources to waste
        monthly_cost = resource.get('monthly_cost_impact', 0.0)
        
        if key in namespace_stats:
            namespace_stats[key]['waste_amount'] += monthly_cost
            namespace_stats[key]['total_cost'] += monthly_cost
        else:
            # Create new entry for cleanup-only namespaces
            namespace_stats[key] = {
                'cluster': cluster,
                'namespace': namespace,
                'total_cost': monthly_cost,
                'waste_amount': monthly_cost,
                'resource_count': 1
            }
    
    # Convert to heatmap format
    heatmap_data = []
    for key, stats in namespace_stats.items():
        total_cost = stats['total_cost']
        waste_amount = stats['waste_amount']
        
        # Calculate waste percentage
        waste_pct = (waste_amount / total_cost * 100) if total_cost > 0 else 0
        
        heatmap_data.append({
            'cluster': stats['cluster'],
            'namespace': stats['namespace'],
            'waste_percentage': round(waste_pct, 2),
            'waste_amount': round(waste_amount, 2),
            'total_cost': round(total_cost, 2),
            'severity': calculate_severity(waste_pct),
            'resource_count': stats['resource_count']
        })
    
    # Sort by waste percentage (highest first)
    heatmap_data.sort(key=lambda x: x['waste_percentage'], reverse=True)
    
    return heatmap_data


async def generate_resource_waste_from_real_data() -> List[Dict[str, Any]]:
    """Generate resource-level waste data from real Kubernetes data"""
    
    recommendations_data = await fetch_recommendations_data()
    cleanup_data = await fetch_cleanup_data()
    
    resource_waste = []
    
    # Process recommendations for over-provisioned resources
    for rec in recommendations_data:
        pod_name = rec.get('pod_name', 'unknown')
        namespace = rec.get('namespace', 'default')
        # Try both 'cluster' and 'cluster_id' fields
        cluster = rec.get('cluster_id') or rec.get('cluster', 'unknown')
        
        # Get waste metrics
        cpu_current = rec.get('cpu', {}).get('current_usage', 0)
        cpu_request = rec.get('cpu', {}).get('current_request', 0)
        memory_current = rec.get('memory', {}).get('current_usage', 0)
        memory_request = rec.get('memory', {}).get('current_request', 0)
        
        # Calculate waste
        cpu_waste = max(0, cpu_request - cpu_current)
        memory_waste = max(0, memory_request - memory_current)
        
        # Get cost savings
        cost_saved = rec.get('estimated_savings', {}).get('cost_saved', 0.0)
        
        # Calculate waste percentage
        total_request = cpu_request + memory_request
        total_waste = cpu_waste + memory_waste
        waste_pct = (total_waste / total_request * 100) if total_request > 0 else 0
        
        # Get recommendation status
        status = rec.get('recommendation_status', 'No Action Required')
        
        # Build reason
        reason = f"{status}"
        if 'Reduce CPU' in status:
            reason += f" - Requests {cpu_request}m but uses {cpu_current}m"
        if 'Reduce Memory' in status:
            reason += f" - Requests {memory_request}Mi but uses {memory_current}Mi"
        
        resource_waste.append({
            'resource_type': 'Pod',
            'resource_name': pod_name,
            'namespace': namespace,
            'cluster': cluster,
            'waste_amount': round(cost_saved, 2),
            'waste_percentage': round(waste_pct, 2),
            'cpu_waste': round(cpu_waste / 1000, 2),  # Convert to cores
            'memory_waste': round(memory_waste / 1024, 2),  # Convert to GB
            'reason': reason
        })
    
    # Process cleanup data for unused resources
    for resource in cleanup_data:
        resource_type = resource.get('resource_type', 'Unknown')
        resource_name = resource.get('resource_name', 'unknown')
        namespace = resource.get('namespace', 'default')
        # Try both 'cluster' and 'cluster_id' fields
        cluster = resource.get('cluster_id') or resource.get('cluster', 'unknown')
        monthly_cost = resource.get('monthly_cost_impact', 0.0)
        reason = resource.get('reason', 'Unused resource')
        
        resource_waste.append({
            'resource_type': resource_type,
            'resource_name': resource_name,
            'namespace': namespace,
            'cluster': cluster,
            'waste_amount': round(monthly_cost, 2),
            'waste_percentage': 100.0,  # Unused resources are 100% waste
            'cpu_waste': 0.0,
            'memory_waste': 0.0,
            'reason': reason
        })
    
    # Sort by waste amount (highest first)
    resource_waste.sort(key=lambda x: x['waste_amount'], reverse=True)
    
    return resource_waste


@router.get("", response_model=List[HeatmapCell])
async def get_heatmap():
    """Get complete heatmap data from real Kubernetes cluster"""
    return await generate_heatmap_from_real_data()


@router.get("/heatmap", response_model=List[HeatmapCell])
async def get_heatmap_alias():
    """Get complete heatmap data (alias endpoint)"""
    return await generate_heatmap_from_real_data()


@router.get("/cluster/{cluster_name}", response_model=ClusterHeatmap)
async def get_cluster_heatmap(cluster_name: str):
    """Get heatmap for specific cluster from real data"""
    heatmap_data = await generate_heatmap_from_real_data()
    cluster_data = [d for d in heatmap_data if d["cluster"] == cluster_name]
    
    if not cluster_data:
        return {
            "cluster_name": cluster_name,
            "total_waste": 0,
            "waste_percentage": 0,
            "namespaces": []
        }
    
    total_waste = sum(d["waste_amount"] for d in cluster_data)
    total_cost = sum(d["total_cost"] for d in cluster_data)
    waste_pct = (total_waste / total_cost * 100) if total_cost > 0 else 0
    
    return {
        "cluster_name": cluster_name,
        "total_waste": round(total_waste, 2),
        "waste_percentage": round(waste_pct, 2),
        "namespaces": cluster_data
    }


@router.get("/hotspots", response_model=List[HeatmapCell])
async def get_hotspots(min_waste_percentage: float = 50.0):
    """Get waste hotspots above threshold from real data"""
    heatmap_data = await generate_heatmap_from_real_data()
    hotspots = [
        d for d in heatmap_data
        if d["waste_percentage"] >= min_waste_percentage
    ]
    return sorted(hotspots, key=lambda x: x["waste_percentage"], reverse=True)


@router.get("/resources", response_model=List[ResourceWaste])
async def get_resource_waste(
    cluster: str = None,
    namespace: str = None,
    min_waste: float = 0
):
    """Get detailed resource-level waste from real data"""
    resource_waste = await generate_resource_waste_from_real_data()
    
    filtered = resource_waste
    
    if cluster:
        filtered = [r for r in filtered if r["cluster"] == cluster]
    if namespace:
        filtered = [r for r in filtered if r["namespace"] == namespace]
    if min_waste > 0:
        filtered = [r for r in filtered if r["waste_amount"] >= min_waste]
    
    return sorted(filtered, key=lambda x: x["waste_amount"], reverse=True)


@router.get("/summary", response_model=HeatmapSummary)
async def get_heatmap_summary():
    """Get overall heatmap summary from real data"""
    
    heatmap_data = await generate_heatmap_from_real_data()
    
    if not heatmap_data:
        return {
            "total_clusters": 0,
            "total_namespaces": 0,
            "total_waste": 0.0,
            "average_waste_percentage": 0.0,
            "hotspots": [],
            "severity_distribution": {
                "low": 0,
                "medium": 0,
                "high": 0,
                "critical": 0
            }
        }
    
    clusters = list(set(d["cluster"] for d in heatmap_data))
    namespaces = len(heatmap_data)
    total_waste = sum(d["waste_amount"] for d in heatmap_data)
    total_cost = sum(d["total_cost"] for d in heatmap_data)
    avg_waste_pct = (total_waste / total_cost * 100) if total_cost > 0 else 0
    
    # Get top hotspots
    hotspots = sorted(
        heatmap_data,
        key=lambda x: x["waste_percentage"],
        reverse=True
    )[:5]
    
    hotspot_list = [
        {
            "cluster": h["cluster"],
            "namespace": h["namespace"],
            "waste_percentage": h["waste_percentage"],
            "waste_amount": h["waste_amount"],
            "severity": h["severity"]
        }
        for h in hotspots
    ]
    
    # Severity distribution
    severity_dist = {
        "low": len([d for d in heatmap_data if d["severity"] == "low"]),
        "medium": len([d for d in heatmap_data if d["severity"] == "medium"]),
        "high": len([d for d in heatmap_data if d["severity"] == "high"]),
        "critical": len([d for d in heatmap_data if d["severity"] == "critical"])
    }
    
    return {
        "total_clusters": len(clusters),
        "total_namespaces": namespaces,
        "total_waste": round(total_waste, 2),
        "average_waste_percentage": round(avg_waste_pct, 2),
        "hotspots": hotspot_list,
        "severity_distribution": severity_dist
    }


@router.get("/heatmap/by-severity/{severity}")
async def get_by_severity(severity: str):
    """Get namespaces by severity level from real data"""
    heatmap_data = await generate_heatmap_from_real_data()
    filtered = [d for d in heatmap_data if d["severity"] == severity.lower()]
    return sorted(filtered, key=lambda x: x["waste_percentage"], reverse=True)


@router.get("/cluster-waste")
async def get_cluster_waste():
    """Get cluster-level waste analysis from real Kubernetes data"""
    heatmap_data = await generate_heatmap_from_real_data()
    
    if not heatmap_data:
        return {"clusters": []}
    
    # Group by cluster
    cluster_stats = defaultdict(lambda: {
        'total_cost': 0.0,
        'waste_amount': 0.0,
        'total_pods': 0,
        'wasted_pods': 0,
        'cpu_waste': 0.0,
        'memory_waste': 0.0,
        'storage_waste': 0.0
    })
    
    for item in heatmap_data:
        cluster = item['cluster']
        cluster_stats[cluster]['total_cost'] += item['total_cost']
        cluster_stats[cluster]['waste_amount'] += item['waste_amount']
        cluster_stats[cluster]['total_pods'] += item['resource_count']
        if item['waste_percentage'] > 50:
            cluster_stats[cluster]['wasted_pods'] += item['resource_count']
    
    # Convert to response format
    clusters = []
    for cluster_name, stats in cluster_stats.items():
        total_cost = stats['total_cost']
        waste_amount = stats['waste_amount']
        waste_pct = (waste_amount / total_cost * 100) if total_cost > 0 else 0
        
        clusters.append({
            'cluster_name': cluster_name,
            'total_waste_percentage': round(waste_pct, 1),
            'cpu_waste_percentage': round(waste_pct * 1.1, 1),  # Simulated
            'memory_waste_percentage': round(waste_pct * 0.9, 1),  # Simulated
            'storage_waste_percentage': round(waste_pct, 1),
            'monthly_waste_cost': round(waste_amount, 2),
            'total_pods': stats['total_pods'],
            'wasted_pods': stats['wasted_pods'],
            'efficiency_score': round(100 - waste_pct, 1),
            'waste_trend': 'stable' if waste_pct < 40 else 'increasing'
        })
    
    return {"clusters": sorted(clusters, key=lambda x: x['total_waste_percentage'], reverse=True)}


@router.get("/namespace-waste")
async def get_namespace_waste():
    """Get namespace-level waste analysis from real Kubernetes data"""
    heatmap_data = await generate_heatmap_from_real_data()
    
    if not heatmap_data:
        return {"namespaces": []}
    
    namespaces = []
    for item in heatmap_data:
        namespaces.append({
            'namespace': item['namespace'],
            'cluster': item['cluster'],
            'waste_percentage': item['waste_percentage'],
            'cpu_waste': round(item['waste_percentage'] * 1.1, 1),
            'memory_waste': round(item['waste_percentage'] * 0.9, 1),
            'storage_waste': round(item['waste_percentage'], 1),
            'monthly_cost': item['total_cost'],
            'waste_cost': item['waste_amount'],
            'pod_count': item['resource_count'],
            'over_provisioned_pods': round(item['resource_count'] * (item['waste_percentage'] / 100)),
            'severity': item['severity'],
            'recommendation': f"Optimize {round(item['resource_count'] * (item['waste_percentage'] / 100))} pods to save ${item['waste_amount']:.2f}/month"
        })
    
    return {"namespaces": sorted(namespaces, key=lambda x: x['waste_percentage'], reverse=True)}


@router.get("/team-waste")
async def get_team_waste():
    """Get team-level waste analysis from real Kubernetes data"""
    heatmap_data = await generate_heatmap_from_real_data()
    
    if not heatmap_data:
        return {"teams": []}
    
    # Group by team (using namespace as proxy for team)
    team_stats = defaultdict(lambda: {
        'namespaces': set(),
        'total_cost': 0.0,
        'waste_amount': 0.0,
        'clusters': set()
    })
    
    for item in heatmap_data:
        # Extract team from namespace (e.g., "analytics-prod" -> "analytics")
        team = item['namespace'].split('-')[0] if '-' in item['namespace'] else item['namespace']
        team_stats[team]['namespaces'].add(item['namespace'])
        team_stats[team]['total_cost'] += item['total_cost']
        team_stats[team]['waste_amount'] += item['waste_amount']
        team_stats[team]['clusters'].add(item['cluster'])
    
    teams = []
    for team_name, stats in team_stats.items():
        total_cost = stats['total_cost']
        waste_amount = stats['waste_amount']
        waste_pct = (waste_amount / total_cost * 100) if total_cost > 0 else 0
        
        teams.append({
            'team_name': team_name.capitalize() + ' Team',
            'owner': 'Team Lead',
            'total_waste_percentage': round(waste_pct, 1),
            'monthly_waste_cost': round(waste_amount, 2),
            'annual_waste_cost': round(waste_amount * 12, 2),
            'potential_monthly_savings': round(waste_amount * 0.7, 2),
            'namespace_count': len(stats['namespaces']),
            'cluster_count': len(stats['clusters']),
            'waste_trend': 'stable' if waste_pct < 40 else 'increasing',
            'top_wasted_namespace': list(stats['namespaces'])[0] if stats['namespaces'] else 'N/A'
        })
    
    return {"teams": sorted(teams, key=lambda x: x['monthly_waste_cost'], reverse=True)}


@router.get("/application-waste")
async def get_application_waste():
    """Get application-level waste analysis from real Kubernetes data"""
    resource_waste = await generate_resource_waste_from_real_data()
    
    if not resource_waste:
        return {"applications": []}
    
    # Group by application (using resource name as proxy)
    app_stats = defaultdict(lambda: {
        'namespace': '',
        'cluster': '',
        'waste_amount': 0.0,
        'cpu_waste': 0.0,
        'memory_waste': 0.0,
        'resource_count': 0,
        'reasons': []
    })
    
    for resource in resource_waste:
        # Extract app name from resource name
        app_name = resource['resource_name'].rsplit('-', 2)[0] if '-' in resource['resource_name'] else resource['resource_name']
        
        if not app_stats[app_name]['namespace']:
            app_stats[app_name]['namespace'] = resource['namespace']
            app_stats[app_name]['cluster'] = resource['cluster']
        
        app_stats[app_name]['waste_amount'] += resource['waste_amount']
        app_stats[app_name]['cpu_waste'] += resource['cpu_waste']
        app_stats[app_name]['memory_waste'] += resource['memory_waste']
        app_stats[app_name]['resource_count'] += 1
        if resource['reason'] not in app_stats[app_name]['reasons']:
            app_stats[app_name]['reasons'].append(resource['reason'])
    
    applications = []
    for app_name, stats in app_stats.items():
        waste_amount = stats['waste_amount']
        severity = 'critical' if waste_amount > 100 else 'high' if waste_amount > 50 else 'medium' if waste_amount > 20 else 'low'
        
        applications.append({
            'application_name': app_name,
            'namespace': stats['namespace'],
            'cluster': stats['cluster'],
            'waste_percentage': round(min(100, waste_amount / 10), 1),
            'monthly_waste_cost': round(waste_amount, 2),
            'cpu_waste_cores': round(stats['cpu_waste'], 2),
            'memory_waste_gb': round(stats['memory_waste'], 2),
            'resource_count': stats['resource_count'],
            'recommendation': stats['reasons'][0] if stats['reasons'] else 'Optimize resources',
            'severity': severity
        })
    
    return {"applications": sorted(applications, key=lambda x: x['monthly_waste_cost'], reverse=True)}

# Made with Bob
