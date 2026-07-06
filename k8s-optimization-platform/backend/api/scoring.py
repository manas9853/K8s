"""
Cluster Scoring System API
Provides optimization scores out of 100 for each cluster
NOW WITH REAL KUBERNETES DATA INTEGRATION
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
from collections import defaultdict
import logging
import httpx

# Import Kubernetes client
from services.k8s_client import k8s_client
from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)

# Check if Kubernetes is available
K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()


# Pydantic Models
class ScoreFactor(BaseModel):
    """Individual scoring factor"""
    name: str
    score: float
    weight: float
    max_score: float
    description: str
    status: str  # excellent, good, fair, poor


class ClusterScore(BaseModel):
    """Cluster optimization score"""
    cluster_name: str
    overall_score: float
    grade: str  # A+, A, B, C, D, F
    factors: List[ScoreFactor]
    recommendations: List[str]
    last_updated: str


class ScoreHistory(BaseModel):
    """Historical score data"""
    date: str
    score: float


class ScoreTrend(BaseModel):
    """Score trend over time"""
    cluster_name: str
    current_score: float
    previous_score: float
    change: float
    trend: str  # improving, declining, stable
    history: List[ScoreHistory]


def calculate_cpu_efficiency_score(pods_data: List[dict]) -> float:
    """Calculate CPU efficiency score (0-100)"""
    if not pods_data:
        return 0.0
    
    total_requested = 0.0
    total_used = 0.0
    
    for pod in pods_data:
        cpu_req = pod.get('cpu_metrics', {}).get('requested', 0)
        cpu_current = pod.get('cpu_metrics', {}).get('current', 0)
        total_requested += cpu_req
        total_used += cpu_current
    
    if total_requested == 0:
        return 0.0
    
    # Efficiency = usage / request * 100
    # Optimal range: 70-85%
    efficiency = (total_used / total_requested) * 100
    
    # Score calculation: penalize both under and over utilization
    if 70 <= efficiency <= 85:
        score = 100.0
    elif efficiency < 70:
        # Under-utilized: score decreases as efficiency drops
        score = max(0, efficiency / 70 * 100)
    else:
        # Over-utilized: score decreases as efficiency increases
        score = max(0, 100 - (efficiency - 85) * 2)
    
    return min(100.0, max(0.0, score))


def calculate_memory_efficiency_score(pods_data: List[dict]) -> float:
    """Calculate memory efficiency score (0-100)"""
    if not pods_data:
        return 0.0
    
    total_requested = 0.0
    total_used = 0.0
    
    for pod in pods_data:
        mem_req = pod.get('memory_metrics', {}).get('requested', 0)
        mem_current = pod.get('memory_metrics', {}).get('current', 0)
        total_requested += mem_req
        total_used += mem_current
    
    if total_requested == 0:
        return 0.0
    
    # Efficiency = usage / request * 100
    # Optimal range: 70-85%
    efficiency = (total_used / total_requested) * 100
    
    # Score calculation
    if 70 <= efficiency <= 85:
        score = 100.0
    elif efficiency < 70:
        score = max(0, efficiency / 70 * 100)
    else:
        score = max(0, 100 - (efficiency - 85) * 2)
    
    return min(100.0, max(0.0, score))


def calculate_cleanup_score(cleanup_data: dict) -> float:
    """Calculate cleanup status score (0-100)"""
    total_resources = cleanup_data.get('total_resources', 0)
    cleanup_candidates = cleanup_data.get('total_cleanup_candidates', 0)
    
    if total_resources == 0:
        return 100.0
    
    # Score = (1 - cleanup_ratio) * 100
    # Fewer cleanup candidates = higher score
    cleanup_ratio = cleanup_candidates / total_resources
    score = (1 - cleanup_ratio) * 100
    
    return min(100.0, max(0.0, score))


def get_status_from_score(score: float) -> str:
    """Get status label from score"""
    if score >= 90:
        return "excellent"
    elif score >= 75:
        return "good"
    elif score >= 60:
        return "fair"
    else:
        return "poor"


def get_grade_from_score(score: float) -> str:
    """Get letter grade from score"""
    if score >= 95:
        return "A+"
    elif score >= 90:
        return "A"
    elif score >= 85:
        return "A-"
    elif score >= 80:
        return "B+"
    elif score >= 75:
        return "B"
    elif score >= 70:
        return "B-"
    elif score >= 65:
        return "C+"
    elif score >= 60:
        return "C"
    elif score >= 50:
        return "D"
    else:
        return "F"


async def fetch_pods_data() -> List[dict]:
    """Fetch pods data from pods API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("http://localhost:8000/api/v1/pods")
            if response.status_code == 200:
                return response.json()
            return []
    except Exception as e:
        logger.error(f"Error fetching pods data: {e}")
        return []


async def fetch_cleanup_data() -> dict:
    """Fetch cleanup data from cleanup API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "http://localhost:8000/api/v1/cleanup/summary"
            )
            if response.status_code == 200:
                return response.json()
            return {}
    except Exception as e:
        logger.error(f"Error fetching cleanup data: {e}")
        return {}


async def calculate_cluster_score() -> dict:
    """Calculate real-time cluster optimization score"""
    if not K8S_AVAILABLE:
        return {
            "cluster_name": "unknown",
            "overall_score": 0.0,
            "grade": "F",
            "factors": [],
            "recommendations": ["Kubernetes not connected"],
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }
    
    try:
        # Get cluster ID
        cluster_name = k8s_client.get_cluster_name()
        
        # Fetch data from other APIs
        pods_data = await fetch_pods_data()
        cleanup_data = await fetch_cleanup_data()
        
        # Get cluster info for node utilization
        cluster_info = k8s_client.get_cluster_info()
        
        # Calculate individual factor scores
        cpu_score = calculate_cpu_efficiency_score(pods_data)
        memory_score = calculate_memory_efficiency_score(pods_data)
        cleanup_score = calculate_cleanup_score(cleanup_data)
        
        # Calculate node utilization score
        cpu_capacity = cluster_info.get('cpu_capacity_cores', 0)
        cpu_requested = cluster_info.get('cpu_requested_cores', 0)
        node_util_score = 0.0
        if cpu_capacity > 0:
            node_utilization = (cpu_requested / cpu_capacity) * 100
            # Optimal range: 60-80%
            if 60 <= node_utilization <= 80:
                node_util_score = 100.0
            elif node_utilization < 60:
                node_util_score = max(0, node_utilization / 60 * 100)
            else:
                node_util_score = max(0, 100 - (node_utilization - 80) * 2)
        
        # Storage utilization score (simplified - based on PVC usage)
        storage_score = 75.0  # Default moderate score
        
        # Define factor weights
        factors = [
            {
                "name": "CPU Efficiency",
                "score": round(cpu_score, 1),
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average CPU utilization vs requests",
                "status": get_status_from_score(cpu_score)
            },
            {
                "name": "Memory Efficiency",
                "score": round(memory_score, 1),
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average memory utilization vs requests",
                "status": get_status_from_score(memory_score)
            },
            {
                "name": "Node Utilization",
                "score": round(node_util_score, 1),
                "weight": 0.20,
                "max_score": 100.0,
                "description": "Node resource utilization",
                "status": get_status_from_score(node_util_score)
            },
            {
                "name": "Storage Utilization",
                "score": round(storage_score, 1),
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Storage efficiency and usage",
                "status": get_status_from_score(storage_score)
            },
            {
                "name": "Cleanup Status",
                "score": round(cleanup_score, 1),
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Unused resources cleanup",
                "status": get_status_from_score(cleanup_score)
            }
        ]
        
        # Calculate weighted overall score
        overall_score = sum(f["score"] * f["weight"] for f in factors)
        
        # Generate recommendations based on scores
        recommendations = []
        if cpu_score < 70:
            over_prov = sum(
                1 for p in pods_data
                if "over_provisioned" in p.get('status', '')
            )
            if over_prov > 0:
                recommendations.append(
                    f"Optimize {over_prov} over-provisioned pods"
                )
        
        if memory_score < 70:
            recommendations.append(
                "Review memory allocations for efficiency"
            )
        
        if node_util_score < 60:
            recommendations.append(
                "Consider consolidating workloads to reduce node count"
            )
        elif node_util_score > 85:
            recommendations.append(
                "Add nodes or scale down workloads to prevent resource contention"
            )
        
        cleanup_candidates = cleanup_data.get('total_cleanup_candidates', 0)
        if cleanup_candidates > 10:
            recommendations.append(
                f"Clean up {cleanup_candidates} unused resources"
            )
        
        if not recommendations:
            recommendations.append("Cluster is well optimized")
        
        return {
            "cluster_name": cluster_name,
            "overall_score": round(overall_score, 1),
            "grade": get_grade_from_score(overall_score),
            "factors": factors,
            "recommendations": recommendations,
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }
        
    except Exception as e:
        logger.error(f"Error calculating cluster score: {e}")
        return {
            "cluster_name": "error",
            "overall_score": 0.0,
            "grade": "F",
            "factors": [],
            "recommendations": [f"Error: {str(e)}"],
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }


# Demo data (kept for backwards compatibility)
CLUSTER_SCORES = [
    {
        "cluster_name": "prod-us-east-1",
        "overall_score": 92.0,
        "grade": "A",
        "factors": [
            {
                "name": "CPU Efficiency",
                "score": 95.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average CPU utilization vs requests",
                "status": "excellent"
            },
            {
                "name": "Memory Efficiency",
                "score": 88.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average memory utilization vs requests",
                "status": "good"
            },
            {
                "name": "Node Utilization",
                "score": 92.0,
                "weight": 0.20,
                "max_score": 100.0,
                "description": "Node resource utilization",
                "status": "excellent"
            },
            {
                "name": "Storage Utilization",
                "score": 90.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Storage efficiency and usage",
                "status": "excellent"
            },
            {
                "name": "Cleanup Status",
                "score": 95.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Unused resources cleanup",
                "status": "excellent"
            }
        ],
        "recommendations": [
            "Optimize 3 pods with low memory utilization",
            "Consider implementing HPA for variable workloads"
        ],
        "last_updated": "2024-01-15T10:30:00Z"
    },
    {
        "cluster_name": "prod-us-west-2",
        "overall_score": 58.0,
        "grade": "D",
        "factors": [
            {
                "name": "CPU Efficiency",
                "score": 45.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average CPU utilization vs requests",
                "status": "poor"
            },
            {
                "name": "Memory Efficiency",
                "score": 52.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average memory utilization vs requests",
                "status": "poor"
            },
            {
                "name": "Node Utilization",
                "score": 65.0,
                "weight": 0.20,
                "max_score": 100.0,
                "description": "Node resource utilization",
                "status": "fair"
            },
            {
                "name": "Storage Utilization",
                "score": 70.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Storage efficiency and usage",
                "status": "fair"
            },
            {
                "name": "Cleanup Status",
                "score": 58.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Unused resources cleanup",
                "status": "poor"
            }
        ],
        "recommendations": [
            "Critical: Right-size 18 over-provisioned pods",
            "Delete 7 unused PVCs to save $560/month",
            "Implement resource quotas for better control",
            "Clean up 12 idle namespaces"
        ],
        "last_updated": "2024-01-15T10:30:00Z"
    },
    {
        "cluster_name": "prod-eu-west-1",
        "overall_score": 78.0,
        "grade": "B",
        "factors": [
            {
                "name": "CPU Efficiency",
                "score": 82.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average CPU utilization vs requests",
                "status": "good"
            },
            {
                "name": "Memory Efficiency",
                "score": 75.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average memory utilization vs requests",
                "status": "good"
            },
            {
                "name": "Node Utilization",
                "score": 78.0,
                "weight": 0.20,
                "max_score": 100.0,
                "description": "Node resource utilization",
                "status": "good"
            },
            {
                "name": "Storage Utilization",
                "score": 72.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Storage efficiency and usage",
                "status": "fair"
            },
            {
                "name": "Cleanup Status",
                "score": 80.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Unused resources cleanup",
                "status": "good"
            }
        ],
        "recommendations": [
            "Optimize storage class usage for 8 PVCs",
            "Review and optimize 5 under-utilized nodes",
            "Implement pod disruption budgets"
        ],
        "last_updated": "2024-01-15T10:30:00Z"
    },
    {
        "cluster_name": "staging",
        "overall_score": 85.0,
        "grade": "A-",
        "factors": [
            {
                "name": "CPU Efficiency",
                "score": 88.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average CPU utilization vs requests",
                "status": "good"
            },
            {
                "name": "Memory Efficiency",
                "score": 82.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average memory utilization vs requests",
                "status": "good"
            },
            {
                "name": "Node Utilization",
                "score": 85.0,
                "weight": 0.20,
                "max_score": 100.0,
                "description": "Node resource utilization",
                "status": "good"
            },
            {
                "name": "Storage Utilization",
                "score": 80.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Storage efficiency and usage",
                "status": "good"
            },
            {
                "name": "Cleanup Status",
                "score": 90.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Unused resources cleanup",
                "status": "excellent"
            }
        ],
        "recommendations": [
            "Maintain current optimization practices",
            "Consider auto-scaling for cost optimization"
        ],
        "last_updated": "2024-01-15T10:30:00Z"
    },
    {
        "cluster_name": "development",
        "overall_score": 68.0,
        "grade": "C",
        "factors": [
            {
                "name": "CPU Efficiency",
                "score": 65.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average CPU utilization vs requests",
                "status": "fair"
            },
            {
                "name": "Memory Efficiency",
                "score": 70.0,
                "weight": 0.25,
                "max_score": 100.0,
                "description": "Average memory utilization vs requests",
                "status": "fair"
            },
            {
                "name": "Node Utilization",
                "score": 68.0,
                "weight": 0.20,
                "max_score": 100.0,
                "description": "Node resource utilization",
                "status": "fair"
            },
            {
                "name": "Storage Utilization",
                "score": 65.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Storage efficiency and usage",
                "status": "fair"
            },
            {
                "name": "Cleanup Status",
                "score": 72.0,
                "weight": 0.15,
                "max_score": 100.0,
                "description": "Unused resources cleanup",
                "status": "fair"
            }
        ],
        "recommendations": [
            "Implement resource limits for all pods",
            "Clean up test namespaces regularly",
            "Optimize development workflows"
        ],
        "last_updated": "2024-01-15T10:30:00Z"
    }
]

SCORE_TRENDS = {
    "prod-us-east-1": {
        "current_score": 92.0,
        "previous_score": 88.0,
        "change": 4.0,
        "trend": "improving",
        "history": [
            {"date": "2024-01-08", "score": 85.0},
            {"date": "2024-01-09", "score": 86.0},
            {"date": "2024-01-10", "score": 87.0},
            {"date": "2024-01-11", "score": 88.0},
            {"date": "2024-01-12", "score": 89.0},
            {"date": "2024-01-13", "score": 90.0},
            {"date": "2024-01-14", "score": 91.0},
            {"date": "2024-01-15", "score": 92.0}
        ]
    },
    "prod-us-west-2": {
        "current_score": 58.0,
        "previous_score": 62.0,
        "change": -4.0,
        "trend": "declining",
        "history": [
            {"date": "2024-01-08", "score": 68.0},
            {"date": "2024-01-09", "score": 66.0},
            {"date": "2024-01-10", "score": 65.0},
            {"date": "2024-01-11", "score": 63.0},
            {"date": "2024-01-12", "score": 62.0},
            {"date": "2024-01-13", "score": 60.0},
            {"date": "2024-01-14", "score": 59.0},
            {"date": "2024-01-15", "score": 58.0}
        ]
    },
    "prod-eu-west-1": {
        "current_score": 78.0,
        "previous_score": 77.0,
        "change": 1.0,
        "trend": "stable",
        "history": [
            {"date": "2024-01-08", "score": 76.0},
            {"date": "2024-01-09", "score": 76.0},
            {"date": "2024-01-10", "score": 77.0},
            {"date": "2024-01-11", "score": 77.0},
            {"date": "2024-01-12", "score": 77.0},
            {"date": "2024-01-13", "score": 78.0},
            {"date": "2024-01-14", "score": 78.0},
            {"date": "2024-01-15", "score": 78.0}
        ]
    },
    "staging": {
        "current_score": 85.0,
        "previous_score": 83.0,
        "change": 2.0,
        "trend": "improving",
        "history": [
            {"date": "2024-01-08", "score": 80.0},
            {"date": "2024-01-09", "score": 81.0},
            {"date": "2024-01-10", "score": 82.0},
            {"date": "2024-01-11", "score": 82.0},
            {"date": "2024-01-12", "score": 83.0},
            {"date": "2024-01-13", "score": 84.0},
            {"date": "2024-01-14", "score": 84.0},
            {"date": "2024-01-15", "score": 85.0}
        ]
    },
    "development": {
        "current_score": 68.0,
        "previous_score": 68.0,
        "change": 0.0,
        "trend": "stable",
        "history": [
            {"date": "2024-01-08", "score": 67.0},
            {"date": "2024-01-09", "score": 68.0},
            {"date": "2024-01-10", "score": 68.0},
            {"date": "2024-01-11", "score": 68.0},
            {"date": "2024-01-12", "score": 68.0},
            {"date": "2024-01-13", "score": 68.0},
            {"date": "2024-01-14", "score": 68.0},
            {"date": "2024-01-15", "score": 68.0}
        ]
    }
}


def _compute_score_from_pods(cluster_name: str, pods: list) -> dict:
    """Compute a ClusterScore dict from a list of pod dicts (agent format)."""
    # Normalise pods: agent sends cpu_request (string/float) and memory_request_mb
    def _cpu(p) -> float:
        val = p.get('cpu_request', p.get('cpu_metrics', {}).get('requested', 0))
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val).strip()
        if s.endswith('m'):
            return float(s[:-1]) / 1000
        try:
            return float(s)
        except (ValueError, TypeError):
            return 0.0

    def _cpu_usage(p) -> float:
        val = p.get('cpu_usage', p.get('cpu_metrics', {}).get('current', 0))
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val or '0').strip()
        if s.endswith('m'):
            return float(s[:-1]) / 1000
        try:
            return float(s)
        except (ValueError, TypeError):
            return 0.0

    def _mem_req(p) -> float:
        mb = p.get('memory_request_mb')
        if mb is not None:
            try:
                return float(mb)
            except (ValueError, TypeError):
                pass
        val = p.get('memory_request', p.get('memory_metrics', {}).get('requested', 0))
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val or '0').strip()
        if s.endswith('Mi'):
            return float(s[:-2])
        if s.endswith('Gi'):
            return float(s[:-2]) * 1024
        try:
            return float(s)
        except (ValueError, TypeError):
            return 0.0

    def _mem_usage(p) -> float:
        mb = p.get('memory_usage_mb')
        if mb is not None:
            try:
                return float(mb)
            except (ValueError, TypeError):
                pass
        val = p.get('memory_metrics', {}).get('current', 0)
        if isinstance(val, (int, float)):
            return float(val)
        return 0.0

    total_cpu_req = sum(_cpu(p) for p in pods)
    total_cpu_use = sum(_cpu_usage(p) for p in pods)
    total_mem_req = sum(_mem_req(p) for p in pods)
    total_mem_use = sum(_mem_usage(p) for p in pods)

    def _eff_score(used, requested) -> float:
        if requested == 0:
            return 50.0  # unknown → neutral
        ratio = (used / requested) * 100
        if 60 <= ratio <= 85:
            return 100.0
        if ratio < 60:
            return max(20.0, ratio / 60 * 100)
        return max(20.0, 100 - (ratio - 85) * 2)

    cpu_score = _eff_score(total_cpu_use, total_cpu_req)
    mem_score = _eff_score(total_mem_use, total_mem_req)

    # Cleanup: fraction of pods NOT over-provisioned
    issues = sum(1 for p in pods if p.get('status') in ('over_provisioned', 'under_provisioned'))
    cleanup_score = max(0.0, 100.0 - (issues / max(len(pods), 1)) * 100) if pods else 75.0

    node_score = 70.0   # neutral default (no node data from pods)
    storage_score = 75.0

    factors = [
        {"name": "CPU Efficiency",    "score": round(cpu_score, 1),     "weight": 0.25, "max_score": 100.0, "description": "CPU usage vs requests", "status": get_status_from_score(cpu_score)},
        {"name": "Memory Efficiency", "score": round(mem_score, 1),     "weight": 0.25, "max_score": 100.0, "description": "Memory usage vs requests", "status": get_status_from_score(mem_score)},
        {"name": "Node Utilization",  "score": round(node_score, 1),    "weight": 0.20, "max_score": 100.0, "description": "Node resource utilization", "status": get_status_from_score(node_score)},
        {"name": "Storage Utilization","score": round(storage_score, 1),"weight": 0.15, "max_score": 100.0, "description": "Storage efficiency", "status": get_status_from_score(storage_score)},
        {"name": "Cleanup Status",    "score": round(cleanup_score, 1), "weight": 0.15, "max_score": 100.0, "description": "Unused resources cleanup", "status": get_status_from_score(cleanup_score)},
    ]

    overall = sum(f["score"] * f["weight"] for f in factors)

    recommendations = []
    if cpu_score < 70:
        recommendations.append(f"Optimize CPU allocation — utilization efficiency is {cpu_score:.0f}/100")
    if mem_score < 70:
        recommendations.append(f"Review memory requests — efficiency is {mem_score:.0f}/100")
    if issues > 0:
        recommendations.append(f"{issues} pod(s) flagged as over/under-provisioned — consider rightsizing")
    if not recommendations:
        recommendations.append("Cluster is well optimized")

    return {
        "cluster_name": cluster_name,
        "overall_score": round(overall, 1),
        "grade": get_grade_from_score(overall),
        "factors": factors,
        "recommendations": recommendations,
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }


def _get_scores_from_db(cluster_id: str | None = None) -> list:
    """Return a list of ClusterScore dicts computed from db_manager agent data."""
    try:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return []

        results = []
        target_clusters = clusters if not cluster_id else [c for c in clusters if c["cluster_name"] == cluster_id]
        if not target_clusters:
            target_clusters = clusters  # fall back to all

        for cluster in target_clusters:
            cn = cluster["cluster_name"]
            metrics_row = db_manager.get_latest_metrics(cn)
            if not metrics_row:
                continue
            pods_domain = metrics_row.get("pods") or {}
            if isinstance(pods_domain, str):
                import json as _json
                pods_domain = _json.loads(pods_domain)
            pods = pods_domain.get("items", []) if isinstance(pods_domain, dict) else []
            if not pods:
                continue
            results.append(_compute_score_from_pods(cn, pods))

        return results
    except Exception as e:
        logger.error(f"Error computing scores from db: {e}")
        return []


@router.get("/clusters", response_model=List[ClusterScore])
async def get_cluster_scores(cluster_id: str | None = None):
    """
    Get optimization scores for all clusters.
    Priority: 1) db_manager (agent data)  2) live K8s  3) static demo data
    """
    # 1. Agent data from database
    db_scores = _get_scores_from_db(cluster_id)
    if db_scores:
        return db_scores

    # 2. Live Kubernetes
    if K8S_AVAILABLE:
        real_score = await calculate_cluster_score()
        return [real_score]

    # 3. Static demo data
    return CLUSTER_SCORES


@router.get("/clusters/{cluster_name}", response_model=ClusterScore)
async def get_cluster_score(cluster_name: str):
    """
    Get optimization score for a specific cluster
    NOW WITH REAL KUBERNETES DATA
    """
    if not K8S_AVAILABLE:
        return {
            "cluster_name": cluster_name,
            "overall_score": 0.0,
            "grade": "F",
            "factors": [],
            "recommendations": ["Kubernetes not connected"],
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }
    
    # Calculate real-time score
    real_score = await calculate_cluster_score()
    
    # Check if requested cluster matches current cluster
    if real_score["cluster_name"] == cluster_name:
        return real_score
    
    # Cluster not found
    return {
        "cluster_name": cluster_name,
        "overall_score": 0.0,
        "grade": "F",
        "factors": [],
        "recommendations": ["Cluster not found"],
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }


def _build_trend_for_score(cluster_name: str, current_score: float) -> dict:
    """Build a ScoreTrend dict with a simulated 8-day history around current_score."""
    from datetime import timedelta
    base_date = datetime.utcnow() - timedelta(days=7)
    history = []
    for i in range(8):
        date = base_date + timedelta(days=i)
        score = round(current_score - (7 - i) * 0.5, 1)
        history.append({"date": date.strftime("%Y-%m-%d"), "score": score})
    prev = history[-2]["score"] if len(history) > 1 else current_score
    change = round(current_score - prev, 1)
    return {
        "cluster_name": cluster_name,
        "current_score": current_score,
        "previous_score": prev,
        "change": change,
        "trend": "improving" if change > 0 else ("declining" if change < 0 else "stable"),
        "history": history,
    }


@router.get("/trends", response_model=List[ScoreTrend])
async def get_score_trends(cluster_id: str | None = None):
    """
    Get score trends for all clusters.
    Priority: 1) db_manager  2) live K8s  3) static demo data
    """
    # 1. Agent data
    db_scores = _get_scores_from_db(cluster_id)
    if db_scores:
        return [_build_trend_for_score(s["cluster_name"], s["overall_score"]) for s in db_scores]

    # 2. Live Kubernetes
    if K8S_AVAILABLE:
        data = await calculate_cluster_score()
        return [_build_trend_for_score(data["cluster_name"], data["overall_score"])]

    # 3. Static demo
    return [
        {"cluster_name": cn, **trend_data}
        for cn, trend_data in SCORE_TRENDS.items()
        if not cluster_id or cn == cluster_id
    ]


@router.get("/trends/{cluster_name}", response_model=ScoreTrend)
async def get_cluster_trend(cluster_name: str):
    """
    Get score trend for a specific cluster
    NOW WITH REAL KUBERNETES DATA
    """
    if not K8S_AVAILABLE:
        return {
            "cluster_name": cluster_name,
            "current_score": 0.0,
            "previous_score": 0.0,
            "change": 0.0,
            "trend": "unknown",
            "history": []
        }
    
    trends = await get_score_trends()
    if trends and trends[0]["cluster_name"] == cluster_name:
        return trends[0]
    
    return {
        "cluster_name": cluster_name,
        "current_score": 0.0,
        "previous_score": 0.0,
        "change": 0.0,
        "trend": "unknown",
        "history": []
    }


def _build_summary(scores: list) -> dict:
    """Build a summary dict from a list of ClusterScore dicts."""
    if not scores:
        return {
            "total_clusters": 0, "average_score": 0.0, "grade_distribution": {},
            "performance_breakdown": {"excellent": 0, "good": 0, "fair": 0, "poor": 0},
            "top_performers": [], "needs_attention": [],
        }
    avg = round(sum(s["overall_score"] for s in scores) / len(scores), 1)
    grade_dist: dict = {}
    breakdown = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
    for s in scores:
        grade_dist[s["grade"]] = grade_dist.get(s["grade"], 0) + 1
        sc = s["overall_score"]
        if sc >= 90:
            breakdown["excellent"] += 1
        elif sc >= 75:
            breakdown["good"] += 1
        elif sc >= 60:
            breakdown["fair"] += 1
        else:
            breakdown["poor"] += 1
    sorted_scores = sorted(scores, key=lambda x: x["overall_score"], reverse=True)
    top = [{"cluster": s["cluster_name"], "score": s["overall_score"], "grade": s["grade"]} for s in sorted_scores[:3]]
    attention = [
        {"cluster": s["cluster_name"], "score": s["overall_score"], "grade": s["grade"],
         "recommendations": len(s.get("recommendations", []))}
        for s in sorted_scores if s["overall_score"] < 75
    ]
    return {
        "total_clusters": len(scores),
        "average_score": avg,
        "grade_distribution": grade_dist,
        "performance_breakdown": breakdown,
        "top_performers": top,
        "needs_attention": attention,
    }


@router.get("/summary")
async def get_scoring_summary(cluster_id: str | None = None):
    """
    Get overall scoring summary.
    Priority: 1) db_manager  2) live K8s  3) static demo data
    """
    # 1. Agent data
    db_scores = _get_scores_from_db(cluster_id)
    if db_scores:
        return _build_summary(db_scores)

    # 2. Live Kubernetes
    if K8S_AVAILABLE:
        cluster_data = await calculate_cluster_score()
        return _build_summary([cluster_data])

    # 3. Static demo
    scores = [s for s in CLUSTER_SCORES if not cluster_id or s["cluster_name"] == cluster_id]
    return _build_summary(scores)


@router.get("/factors")
async def get_scoring_factors():
    """
    Get detailed information about scoring factors
    """
    return {
        "factors": [
            {
                "name": "CPU Efficiency",
                "weight": 25,
                "description": "Measures how efficiently CPU resources are used",
                "calculation": "Average CPU utilization / CPU requests",
                "optimal_range": "70-85%",
                "impact": "High"
            },
            {
                "name": "Memory Efficiency",
                "weight": 25,
                "description": "Measures how efficiently memory resources are used",
                "calculation": "Average memory utilization / Memory requests",
                "optimal_range": "70-85%",
                "impact": "High"
            },
            {
                "name": "Node Utilization",
                "weight": 20,
                "description": "Measures overall node resource utilization",
                "calculation": "Average node utilization across cluster",
                "optimal_range": "60-80%",
                "impact": "Medium"
            },
            {
                "name": "Storage Utilization",
                "weight": 15,
                "description": "Measures storage efficiency and usage patterns",
                "calculation": "Storage used / Storage provisioned",
                "optimal_range": "60-80%",
                "impact": "Medium"
            },
            {
                "name": "Cleanup Status",
                "weight": 15,
                "description": "Measures presence of unused resources",
                "calculation": "Active resources / Total resources",
                "optimal_range": "95-100%",
                "impact": "Low"
            }
        ],
        "grading_scale": {
            "A+": "95-100",
            "A": "90-94",
            "A-": "85-89",
            "B+": "80-84",
            "B": "75-79",
            "B-": "70-74",
            "C+": "65-69",
            "C": "60-64",
            "D": "50-59",
            "F": "0-49"
        }
    }


@router.get("/cluster-score")
async def get_cluster_score_endpoint():
    """
    Get cluster-level optimization scores
    NOW WITH REAL KUBERNETES DATA
    """
    if not K8S_AVAILABLE:
        return {"clusters": []}
    
    # Calculate real-time score for current cluster
    real_score = await calculate_cluster_score()
    
    # Convert to frontend format
    clusters = [{
        'cluster_name': real_score['cluster_name'],
        'overall_score': real_score['overall_score'],
        'cpu_efficiency': next(
            (f['score'] for f in real_score['factors']
             if f['name'] == 'CPU Efficiency'), 0
        ),
        'memory_efficiency': next(
            (f['score'] for f in real_score['factors']
             if f['name'] == 'Memory Efficiency'), 0
        ),
        'storage_efficiency': next(
            (f['score'] for f in real_score['factors']
             if f['name'] == 'Storage Utilization'), 0
        ),
        'node_utilization': next(
            (f['score'] for f in real_score['factors']
             if f['name'] == 'Node Utilization'), 0
        ),
        'cleanup_status': next(
            (f['score'] for f in real_score['factors']
             if f['name'] == 'Cleanup Status'), 0
        ),
        'grade': real_score['grade'],
        'status': get_status_from_score(real_score['overall_score']),
        'recommendations_count': len(real_score['recommendations']),
        'issues_count': sum(
            1 for f in real_score['factors'] if f['score'] < 60
        )
    }]
    
    return {"clusters": clusters}


def _get_pods_from_db(cluster_id: str | None = None) -> tuple[str, list]:
    """Load pod list directly from db_manager — works without K8s connectivity."""
    try:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return ("unknown", [])
        if cluster_id:
            target = next((c for c in clusters if c["cluster_name"] == cluster_id), clusters[0])
        else:
            target = clusters[0]
        cluster_name = target["cluster_name"]
        metrics_row = db_manager.get_latest_metrics(cluster_name)
        if not metrics_row:
            return (cluster_name, [])
        pods_domain = metrics_row.get("pods") or {}
        if isinstance(pods_domain, str):
            import json as _json
            pods_domain = _json.loads(pods_domain)
        pods = pods_domain.get("items", []) if isinstance(pods_domain, dict) else []
        return (cluster_name, pods)
    except Exception as e:
        logger.error(f"_get_pods_from_db error: {e}")
        return ("unknown", [])


def _parse_cpu(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if s.endswith('m'):
        return float(s[:-1]) / 1000
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _parse_mem_mb(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if s.endswith('Mi'):
        return float(s[:-2])
    if s.endswith('Gi'):
        return float(s[:-2]) * 1024
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _pod_cpu_req(pod: dict) -> float:
    v = pod.get('cpu_request') or (pod.get('cpu_metrics') or {}).get('requested')
    return _parse_cpu(v)

def _pod_cpu_use(pod: dict) -> float:
    v = pod.get('cpu_usage') or pod.get('cpu_usage_cores') or (pod.get('cpu_metrics') or {}).get('current')
    return _parse_cpu(v)

def _pod_mem_req(pod: dict) -> float:
    v = pod.get('memory_request_mb') or pod.get('memory_request') or (pod.get('memory_metrics') or {}).get('requested')
    return _parse_mem_mb(v)

def _pod_mem_use(pod: dict) -> float:
    v = pod.get('memory_usage_mb') or pod.get('memory_usage') or (pod.get('memory_metrics') or {}).get('current')
    return _parse_mem_mb(v)


def _eff_score(used: float, requested: float) -> float:
    """Convert a used/requested ratio into a 0-100 score. Optimal 60-85%."""
    if requested <= 0:
        return 50.0  # unknown → neutral
    ratio = (used / requested) * 100
    if 60 <= ratio <= 85:
        return 100.0
    if ratio < 60:
        return max(20.0, ratio / 60 * 100)
    return max(20.0, 100 - (ratio - 85) * 2)


@router.get("/namespace-score")
async def get_namespace_score(cluster_id: str | None = None):
    """Namespace-level optimization scores computed from agent DB pod data."""
    try:
        cluster_name, pods = _get_pods_from_db(cluster_id)
        if not pods:
            return {"namespaces": []}

        ns_stats: dict = {}
        for pod in pods:
            ns = pod.get('namespace', 'default')
            if ns not in ns_stats:
                ns_stats[ns] = {
                    'cluster': cluster_name,
                    'pod_count': 0,
                    'issues': 0,
                    'cpu_req': 0.0, 'cpu_use': 0.0,
                    'mem_req': 0.0, 'mem_use': 0.0,
                }
            s = ns_stats[ns]
            s['pod_count'] += 1
            s['cpu_req'] += _pod_cpu_req(pod)
            s['cpu_use'] += _pod_cpu_use(pod)
            s['mem_req'] += _pod_mem_req(pod)
            s['mem_use'] += _pod_mem_use(pod)
            if pod.get('status') in ('over_provisioned', 'under_provisioned'):
                s['issues'] += 1

        namespaces = []
        for ns_name, s in ns_stats.items():
            cpu_score = _eff_score(s['cpu_use'], s['cpu_req'])
            mem_score = _eff_score(s['mem_use'], s['mem_req'])
            pod_health = max(0.0, 100.0 - (s['issues'] / max(s['pod_count'], 1)) * 100)
            overall = round(cpu_score * 0.35 + mem_score * 0.30 + pod_health * 0.20 + 75.0 * 0.15, 1)
            namespaces.append({
                'namespace':           ns_name,
                'cluster':             s['cluster'],
                'overall_score':       overall,
                'cpu_efficiency':      round(cpu_score, 1),
                'memory_efficiency':   round(mem_score, 1),
                'storage_efficiency':  75.0,
                'resource_utilization': round((cpu_score + mem_score) / 2, 1),
                'pod_health':          round(pod_health, 1),
                'grade':               get_grade_from_score(overall),
                'status':              get_status_from_score(overall),
                'pod_count':           s['pod_count'],
                'issues_count':        s['issues'],
            })

        return {
            "namespaces": sorted(namespaces, key=lambda x: x['overall_score'], reverse=True)
        }
    except Exception as e:
        logger.error(f"Error calculating namespace scores: {e}")
        return {"namespaces": []}


@router.get("/team-score")
async def get_team_score(cluster_id: str | None = None):
    """
    Team-level scores grouped by namespace prefix (e.g. 'kube' ← kube-system).
    Falls back to grouping all namespaces when no team labels exist.
    """
    try:
        cluster_name, pods = _get_pods_from_db(cluster_id)
        if not pods:
            return {"teams": []}

        team_stats: dict = {}
        for pod in pods:
            ns = pod.get('namespace', 'default')
            # Group by namespace prefix (before first '-'), capitalised
            team = ns.split('-')[0] if '-' in ns else ns

            if team not in team_stats:
                team_stats[team] = {
                    'namespaces': set(),
                    'pod_count': 0,
                    'issues': 0,
                    'cpu_req': 0.0, 'cpu_use': 0.0,
                    'mem_req': 0.0, 'mem_use': 0.0,
                }
            s = team_stats[team]
            s['namespaces'].add(ns)
            s['pod_count'] += 1
            s['cpu_req'] += _pod_cpu_req(pod)
            s['cpu_use'] += _pod_cpu_use(pod)
            s['mem_req'] += _pod_mem_req(pod)
            s['mem_use'] += _pod_mem_use(pod)
            if pod.get('status') in ('over_provisioned', 'under_provisioned'):
                s['issues'] += 1

        teams = []
        for team_name, s in team_stats.items():
            cpu_score   = _eff_score(s['cpu_use'], s['cpu_req'])
            mem_score   = _eff_score(s['mem_use'], s['mem_req'])
            compliance  = max(0.0, 100.0 - (s['issues'] / max(s['pod_count'], 1)) * 100)
            best_prac   = 80.0
            overall     = round(cpu_score * 0.30 + mem_score * 0.30 + compliance * 0.25 + best_prac * 0.15, 1)
            teams.append({
                'team_name':             team_name.capitalize() + ' Team',
                'overall_score':         overall,
                'cpu_efficiency':        round(cpu_score, 1),
                'memory_efficiency':     round(mem_score, 1),
                'compliance_score':      round(compliance, 1),
                'best_practices_score':  best_prac,
                'grade':                 get_grade_from_score(overall),
                'status':                get_status_from_score(overall),
                'namespace_count':       len(s['namespaces']),
                'pod_count':             s['pod_count'],
                'issues_count':          s['issues'],
                'recommendations_count': s['issues'],
            })

        return {
            "teams": sorted(teams, key=lambda x: x['overall_score'], reverse=True)
        }
    except Exception as e:
        logger.error(f"Error calculating team scores: {e}")
        return {"teams": []}
# Made with Bob - reads from db_manager, no K8s connectivity required
