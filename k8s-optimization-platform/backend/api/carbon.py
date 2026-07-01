"""
Carbon Footprint API - Feature 20
Tracks carbon emissions and environmental impact of Kubernetes infrastructure
Calculates savings from optimization recommendations
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)


# Carbon calculation constants
# Based on EPA and cloud provider data
KWH_PER_CPU_CORE_HOUR = 0.012  # Average power consumption per CPU core
KWH_PER_GB_MEMORY_HOUR = 0.0038  # Average power consumption per GB RAM
CO2_KG_PER_KWH = 0.385  # Average grid carbon intensity (kg CO2/kWh)
COST_PER_KWH = 0.12  # Average electricity cost ($/kWh)

# Environmental equivalents
KG_CO2_PER_TREE_YEAR = 21  # CO2 absorbed by one tree per year
KG_CO2_PER_MILE_DRIVEN = 0.404  # CO2 from driving one mile
KWH_PER_HOME_MONTH = 877  # Average home electricity usage per month


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


def calculate_energy_from_resources(
    cpu_cores: float,
    memory_gb: float,
    hours: float = 730
) -> float:
    """Calculate energy consumption in kWh from CPU and memory"""
    cpu_kwh = cpu_cores * KWH_PER_CPU_CORE_HOUR * hours
    memory_kwh = memory_gb * KWH_PER_GB_MEMORY_HOUR * hours
    return cpu_kwh + memory_kwh


def calculate_carbon_from_energy(energy_kwh: float) -> float:
    """Calculate CO2 emissions in kg from energy consumption"""
    return energy_kwh * CO2_KG_PER_KWH


async def fetch_recommendations() -> List[dict]:
    """Fetch recommendations from API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "http://localhost:8000/api/recommendations/"
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.error(f"Error fetching recommendations: {e}")
    return []


async def fetch_cost_savings() -> dict:
    """Fetch cost savings summary"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "http://localhost:8000/api/cost-savings/summary"
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.error(f"Error fetching cost savings: {e}")
    return {}


async def fetch_clusters() -> List[dict]:
    """Fetch cluster data"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "http://localhost:8000/api/clusters/"
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.error(f"Error fetching clusters: {e}")
    return []


@router.get("/summary", response_model=CarbonSummary)
async def get_summary():
    """
    Get comprehensive carbon footprint summary
    Calculates based on real cluster resource usage and savings
    """
    
    # Fetch real data
    recommendations = await fetch_recommendations()
    cost_data = await fetch_cost_savings()
    
    # Calculate current resource usage
    total_current_cpu = 0.0
    total_current_memory = 0.0
    total_optimized_cpu = 0.0
    total_optimized_memory = 0.0
    
    for rec in recommendations:
        cpu_data = rec.get('cpu', {})
        memory_data = rec.get('memory', {})
        
        # Current usage
        total_current_cpu += cpu_data.get('current_request', 0)
        total_current_memory += memory_data.get('current_request', 0) / 1024
        
        # Optimized usage
        total_optimized_cpu += cpu_data.get('recommended_request', 0)
        total_optimized_memory += (
            memory_data.get('recommended_request', 0) / 1024
        )
    
    # Calculate energy consumption (monthly = 730 hours)
    current_energy = calculate_energy_from_resources(
        total_current_cpu,
        total_current_memory,
        730
    )
    optimized_energy = calculate_energy_from_resources(
        total_optimized_cpu,
        total_optimized_memory,
        730
    )
    energy_saved = current_energy - optimized_energy
    
    # Calculate carbon emissions
    current_carbon = calculate_carbon_from_energy(current_energy)
    optimized_carbon = calculate_carbon_from_energy(optimized_energy)
    carbon_saved = current_carbon - optimized_carbon
    
    # Calculate cost savings from energy
    cost_saved = energy_saved * COST_PER_KWH
    
    # Use actual cost savings if available
    if cost_data:
        cost_saved = cost_data.get('potential_monthly_savings', cost_saved)
    
    # Calculate reduction percentage
    reduction_pct = 0.0
    if current_carbon > 0:
        reduction_pct = (carbon_saved / current_carbon) * 100
    
    # Calculate environmental equivalents
    trees_equivalent = int(carbon_saved / KG_CO2_PER_TREE_YEAR * 12)
    miles_not_driven = int(carbon_saved / KG_CO2_PER_MILE_DRIVEN)
    homes_powered = round(energy_saved / KWH_PER_HOME_MONTH, 1)
    
    return CarbonSummary(
        total_carbon_saved_kg=round(carbon_saved, 2),
        total_energy_saved_kwh=round(energy_saved, 2),
        total_cost_saved=round(cost_saved, 2),
        reduction_percentage=round(reduction_pct, 1),
        trees_equivalent=trees_equivalent,
        miles_not_driven=miles_not_driven,
        homes_powered=homes_powered,
        current_monthly_emissions_kg=round(current_carbon, 2),
        optimized_monthly_emissions_kg=round(optimized_carbon, 2)
    )


@router.get("/clusters", response_model=List[ClusterCarbon])
async def get_clusters():
    """
    Get carbon footprint data by cluster
    Calculates based on real cluster resources
    """
    
    recommendations = await fetch_recommendations()
    clusters_data = await fetch_clusters()
    
    # Group recommendations by cluster
    cluster_stats = {}
    
    for rec in recommendations:
        cluster = rec.get('cluster_id', 'unknown')
        if cluster == 'unknown':
            try:
                from services.k8s_client import k8s_client
                if k8s_client:
                    cluster = k8s_client.get_cluster_name()
            except Exception:
                cluster = 'xforce-devops'
        
        if cluster not in cluster_stats:
            cluster_stats[cluster] = {
                'current_cpu': 0.0,
                'current_memory': 0.0,
                'optimized_cpu': 0.0,
                'optimized_memory': 0.0,
                'count': 0
            }
        
        stats = cluster_stats[cluster]
        cpu_data = rec.get('cpu', {})
        memory_data = rec.get('memory', {})
        
        stats['current_cpu'] += cpu_data.get('current_request', 0)
        stats['current_memory'] += memory_data.get('current_request', 0) / 1024
        stats['optimized_cpu'] += cpu_data.get('recommended_request', 0)
        stats['optimized_memory'] += (
            memory_data.get('recommended_request', 0) / 1024
        )
        stats['count'] += 1
    
    # Calculate carbon for each cluster
    cluster_carbon = []
    
    for cluster, stats in cluster_stats.items():
        current_energy = calculate_energy_from_resources(
            stats['current_cpu'],
            stats['current_memory'],
            730
        )
        optimized_energy = calculate_energy_from_resources(
            stats['optimized_cpu'],
            stats['optimized_memory'],
            730
        )
        
        energy_saved = current_energy - optimized_energy
        current_carbon = calculate_carbon_from_energy(current_energy)
        optimized_carbon = calculate_carbon_from_energy(optimized_energy)
        carbon_saved = current_carbon - optimized_carbon
        cost_saved = energy_saved * COST_PER_KWH
        
        # Calculate efficiency score (0-100)
        efficiency = 0
        if current_carbon > 0:
            efficiency = int((1 - (carbon_saved / current_carbon)) * 100)
        
        cluster_carbon.append(ClusterCarbon(
            cluster=cluster,
            carbon_saved_kg=round(carbon_saved, 2),
            energy_saved_kwh=round(energy_saved, 2),
            cost_saved=round(cost_saved, 2),
            efficiency_score=efficiency,
            current_emissions_kg=round(current_carbon, 2),
            optimized_emissions_kg=round(optimized_carbon, 2)
        ))
    
    return cluster_carbon


@router.get("/trends", response_model=List[CarbonTrend])
async def get_trends(months: int = 6):
    """
    Get carbon footprint trends over time
    Simulates historical data based on current savings
    """
    
    # Get current summary
    summary = await get_summary()
    
    trends = []
    base_date = datetime.utcnow()
    
    # Generate trend data (simulating gradual improvement)
    for i in range(months, 0, -1):
        month_date = base_date - timedelta(days=30 * i)
        month_name = month_date.strftime("%b")
        
        # Simulate gradual reduction in emissions
        improvement_factor = 1 - (i / months * 0.15)
        
        carbon_kg = summary.current_monthly_emissions_kg * improvement_factor
        energy_kwh = summary.total_energy_saved_kwh / months * (months - i + 1)
        cost_saved = summary.total_cost_saved / months * (months - i + 1)
        optimizations = int((months - i + 1) * 3)
        
        trends.append(CarbonTrend(
            month=month_name,
            carbon_kg=round(carbon_kg, 2),
            energy_kwh=round(energy_kwh, 2),
            cost_saved=round(cost_saved, 2),
            optimizations_applied=optimizations
        ))
    
    return trends


@router.get("/namespaces", response_model=List[NamespaceCarbon])
async def get_namespaces():
    """
    Get carbon footprint by namespace
    Shows which namespaces have the highest environmental impact
    """
    
    recommendations = await fetch_recommendations()
    
    # Group by namespace
    namespace_stats = {}
    
    for rec in recommendations:
        namespace = rec.get('namespace', 'default')
        cluster = rec.get('cluster_id', 'xforce-devops')
        
        if cluster == 'unknown':
            try:
                from services.k8s_client import k8s_client
                if k8s_client:
                    cluster = k8s_client.get_cluster_name()
            except Exception:
                cluster = 'xforce-devops'
        
        key = f"{cluster}:{namespace}"
        
        if key not in namespace_stats:
            namespace_stats[key] = {
                'namespace': namespace,
                'cluster': cluster,
                'current_cpu': 0.0,
                'current_memory': 0.0,
                'optimized_cpu': 0.0,
                'optimized_memory': 0.0,
                'count': 0
            }
        
        stats = namespace_stats[key]
        cpu_data = rec.get('cpu', {})
        memory_data = rec.get('memory', {})
        
        stats['current_cpu'] += cpu_data.get('current_request', 0)
        stats['current_memory'] += memory_data.get('current_request', 0) / 1024
        stats['optimized_cpu'] += cpu_data.get('recommended_request', 0)
        stats['optimized_memory'] += (
            memory_data.get('recommended_request', 0) / 1024
        )
        stats['count'] += 1
    
    # Calculate carbon for each namespace
    namespace_carbon = []
    
    for key, stats in namespace_stats.items():
        current_energy = calculate_energy_from_resources(
            stats['current_cpu'],
            stats['current_memory'],
            730
        )
        optimized_energy = calculate_energy_from_resources(
            stats['optimized_cpu'],
            stats['optimized_memory'],
            730
        )
        
        energy_saved = current_energy - optimized_energy
        carbon_saved = calculate_carbon_from_energy(energy_saved)
        cost_saved = energy_saved * COST_PER_KWH
        
        namespace_carbon.append(NamespaceCarbon(
            namespace=stats['namespace'],
            cluster=stats['cluster'],
            carbon_saved_kg=round(carbon_saved, 2),
            energy_saved_kwh=round(energy_saved, 2),
            cost_saved=round(cost_saved, 2),
            workload_count=stats['count']
        ))
    
    # Sort by carbon saved (highest first)
    namespace_carbon.sort(key=lambda x: x.carbon_saved_kg, reverse=True)
    
    return namespace_carbon


@router.get("/impact")
async def get_environmental_impact():
    """
    Get detailed environmental impact metrics
    Provides various perspectives on carbon savings
    """
    
    summary = await get_summary()
    
    return {
        "carbon_metrics": {
            "total_saved_kg": summary.total_carbon_saved_kg,
            "total_saved_tons": round(summary.total_carbon_saved_kg / 1000, 3),
            "annual_projection_kg": round(summary.total_carbon_saved_kg * 12, 2),
            "annual_projection_tons": round(
                summary.total_carbon_saved_kg * 12 / 1000, 2
            )
        },
        "equivalents": {
            "trees_planted": summary.trees_equivalent,
            "miles_not_driven": summary.miles_not_driven,
            "homes_powered_monthly": summary.homes_powered,
            "smartphones_charged": int(
                summary.total_energy_saved_kwh / 0.012
            ),
            "led_bulbs_year": int(summary.total_energy_saved_kwh / 8.76)
        },
        "energy_metrics": {
            "kwh_saved": summary.total_energy_saved_kwh,
            "mwh_saved": round(summary.total_energy_saved_kwh / 1000, 3),
            "annual_kwh_projection": round(
                summary.total_energy_saved_kwh * 12, 2
            )
        },
        "financial_metrics": {
            "monthly_savings": summary.total_cost_saved,
            "annual_projection": round(summary.total_cost_saved * 12, 2)
        },
        "reduction_metrics": {
            "percentage": summary.reduction_percentage,
            "current_emissions_kg": summary.current_monthly_emissions_kg,
            "optimized_emissions_kg": summary.optimized_monthly_emissions_kg
        }
    }

# Made with Bob
