"""
AI Incident Correlation API
Correlate resource issues with incidents (OOMKills, restarts, throttling)
NOW WITH REAL KUBERNETES DATA INTEGRATION
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging
import httpx
import os

# Import Kubernetes client
from services.k8s_client import k8s_client

router = APIRouter()
logger = logging.getLogger(__name__)

# Check if Kubernetes is available
K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()


class Incident(BaseModel):
    """Incident definition"""
    incident_id: str
    type: str  # oomkill, restart, throttling, eviction, crash
    severity: str  # critical, high, medium, low
    pod_name: str
    namespace: str
    cluster: str
    timestamp: str
    count: int
    message: str
    resource_correlation: Dict[str, Any]


class CorrelationAnalysis(BaseModel):
    """Correlation analysis result"""
    incident_id: str
    incident_type: str
    pod_name: str
    namespace: str
    cluster: str
    root_cause: str
    confidence: float  # 0-100
    correlated_metrics: Dict[str, Any]
    recommendation: str
    estimated_fix_time: str
    priority: str


class IncidentPattern(BaseModel):
    """Incident pattern"""
    pattern_id: str
    pattern_type: str
    description: str
    frequency: int
    affected_pods: List[str]
    common_cause: str
    prevention_steps: List[str]


class IncidentTimeline(BaseModel):
    """Incident timeline"""
    timestamp: str
    incident_type: str
    pod_name: str
    namespace: str
    severity: str
    message: str


def parse_cpu(cpu_str: str) -> float:
    """Parse CPU string to cores"""
    if not cpu_str or cpu_str == '0':
        return 0.0
    try:
        cpu_str = str(cpu_str).strip()
        if cpu_str.endswith('n'):
            return float(cpu_str[:-1]) / 1_000_000_000
        elif cpu_str.endswith('u'):
            return float(cpu_str[:-1]) / 1_000_000
        elif cpu_str.endswith('m'):
            return float(cpu_str[:-1]) / 1000
        else:
            return float(cpu_str)
    except:
        return 0.0


def parse_memory(mem_str: str) -> float:
    """Parse memory string to MB"""
    if not mem_str or mem_str == '0':
        return 0.0
    try:
        mem_str = str(mem_str).strip()
        if mem_str.endswith('Ki'):
            return float(mem_str[:-2]) / 1024
        elif mem_str.endswith('Mi'):
            return float(mem_str[:-2])
        elif mem_str.endswith('Gi'):
            return float(mem_str[:-2]) * 1024
        elif mem_str.endswith('Ti'):
            return float(mem_str[:-2]) * 1024 * 1024
        elif mem_str.endswith('K'):
            return float(mem_str[:-1]) / 1024
        elif mem_str.endswith('M'):
            return float(mem_str[:-1])
        elif mem_str.endswith('G'):
            return float(mem_str[:-1]) * 1024
        elif mem_str.endswith('T'):
            return float(mem_str[:-1]) * 1024 * 1024
        else:
            return float(mem_str) / (1024 * 1024)
    except:
        return 0.0


async def fetch_pods_data() -> List[dict]:
    """Fetch real pod data from Pods API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("http://localhost:8000/api/v1/pods")
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to fetch pods data: {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error fetching pods data: {e}")
        return []


async def fetch_recommendations_data() -> List[dict]:
    """Fetch recommendations from Recommendations API"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("http://localhost:8000/api/v1/recommendations")
            if response.status_code == 200:
                data = response.json()
                return data if isinstance(data, list) else []
            else:
                logger.error(f"Failed to fetch recommendations: {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error fetching recommendations: {e}")
        return []


def analyze_incidents_from_pods(pods_data: List[dict], recommendations: List[dict], cluster_id: str) -> tuple:
    """Analyze pods to detect incidents (OOMKills, restarts, throttling)"""
    
    incidents = []
    correlations = []
    incident_counter = 1
    
    # Create recommendation lookup for correlation
    rec_lookup = {}
    for rec in recommendations:
        key = f"{rec.get('namespace', '')}:{rec.get('pod_name', '')}"
        rec_lookup[key] = rec
    
    for pod in pods_data:
        pod_name = pod.get('pod_name', 'unknown')
        namespace = pod.get('namespace', 'default')
        restarts = pod.get('smart_analysis', {}).get('issue', '').split()[0] if 'restart' in pod.get('smart_analysis', {}).get('issue', '').lower() else '0'
        
        # Extract restart count
        try:
            restart_count = int(restarts) if restarts.isdigit() else 0
        except:
            restart_count = 0
        
        # Get resource metrics
        cpu_metrics = pod.get('cpu_metrics', {})
        memory_metrics = pod.get('memory_metrics', {})
        
        cpu_utilization = cpu_metrics.get('utilization_percent', 0)
        memory_utilization = memory_metrics.get('utilization_percent', 0)
        
        cpu_requested = cpu_metrics.get('requested', 0)
        cpu_limit = cpu_metrics.get('limit', 0)
        cpu_current = cpu_metrics.get('current', 0)
        
        memory_requested = memory_metrics.get('requested', 0)
        memory_limit = memory_metrics.get('limit', 0)
        memory_current = memory_metrics.get('current', 0)
        memory_peak = memory_metrics.get('peak', 0)
        
        # Get recommendation for this pod
        rec_key = f"{namespace}:{pod_name}"
        recommendation = rec_lookup.get(rec_key, {})
        
        # Detect OOMKill risk (memory usage > 90% of limit)
        if memory_limit > 0 and memory_peak > 0:
            memory_usage_percent = (memory_peak / memory_limit) * 100
            if memory_usage_percent > 90:
                incident_id = f"inc-{incident_counter:03d}"
                incident_counter += 1
                
                # Estimate OOMKill count based on restarts and memory pressure
                oomkill_count = max(1, restart_count // 2) if restart_count > 0 else 1
                
                severity = "critical" if memory_usage_percent > 95 else "high"
                
                incidents.append({
                    "incident_id": incident_id,
                    "type": "oomkill",
                    "severity": severity,
                    "pod_name": pod_name,
                    "namespace": namespace,
                    "cluster": cluster_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": oomkill_count,
                    "message": f"High OOMKill risk: Memory usage at {memory_usage_percent:.1f}% of limit",
                    "resource_correlation": {
                        "memory_request": f"{memory_requested:.0f}Mi",
                        "memory_limit": f"{memory_limit:.0f}Mi",
                        "peak_memory_usage": f"{memory_peak:.0f}Mi",
                        "avg_memory_usage": f"{memory_current:.0f}Mi",
                        "memory_trend": "critical" if memory_usage_percent > 95 else "high"
                    }
                })
                
                # Create correlation
                mem_rec = recommendation.get('memory', {})
                recommended_limit = mem_rec.get('recommended_limit', memory_limit * 1.3)
                
                correlations.append({
                    "incident_id": incident_id,
                    "incident_type": "oomkill",
                    "pod_name": pod_name,
                    "namespace": namespace,
                    "cluster": cluster_id,
                    "root_cause": "Memory limit too low for workload requirements",
                    "confidence": 95.0 if memory_usage_percent > 95 else 85.0,
                    "correlated_metrics": {
                        "memory_usage_trend": f"Peak at {memory_usage_percent:.1f}% of limit",
                        "peak_usage": f"{memory_peak:.0f}Mi (exceeds safe threshold)",
                        "avg_usage": f"{memory_current:.0f}Mi ({memory_utilization:.1f}% of limit)",
                        "oomkill_risk": "Very High" if memory_usage_percent > 95 else "High",
                        "restart_count": restart_count
                    },
                    "recommendation": f"Increase memory limit to {recommended_limit:.0f}Mi",
                    "estimated_fix_time": "5 minutes",
                    "priority": severity
                })
        
        # Detect restart incidents (restarts > 3)
        # Calculate restart rate: restarts per day based on pod age
        age_days = pod.get('age_days', 1)
        if age_days < 1:
            age_days = 1  # Minimum 1 day to avoid division by zero
        
        restarts_per_day = restart_count / age_days if age_days > 0 else restart_count
        
        # Only flag as incident if restart rate is high (>1 per day) OR recent high restarts
        # This avoids false positives for old pods with historical restarts
        if restart_count > 10 and restarts_per_day > 1:
            incident_id = f"inc-{incident_counter:03d}"
            incident_counter += 1
            
            # Severity based on restart rate, not total count
            if restarts_per_day > 10:
                severity = "critical"
            elif restarts_per_day > 5:
                severity = "high"
            else:
                severity = "medium"
            
            # Determine restart reason
            restart_reason = "Unknown"
            if memory_peak > memory_limit * 0.9:
                restart_reason = "OOMKilled"
            elif cpu_current > cpu_limit * 0.9:
                restart_reason = "CPU throttling"
            else:
                restart_reason = "CrashLoopBackOff"
            
            incidents.append({
                "incident_id": incident_id,
                "type": "restart",
                "severity": severity,
                "pod_name": pod_name,
                "namespace": namespace,
                "cluster": cluster_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": restart_count,
                "message": f"Pod restarted {restart_count} times",
                "resource_correlation": {
                    "cpu_request": f"{cpu_requested:.3f}",
                    "cpu_limit": f"{cpu_limit:.3f}",
                    "cpu_usage": f"{cpu_current:.3f}",
                    "restart_reason": restart_reason
                }
            })
            
            # Create correlation
            root_cause = "Resource constraints causing application crashes"
            if restart_reason == "OOMKilled":
                root_cause = "Memory exhaustion causing OOMKills"
            elif restart_reason == "CPU throttling":
                root_cause = "CPU throttling causing application timeouts"
            
            correlations.append({
                "incident_id": incident_id,
                "incident_type": "restart",
                "pod_name": pod_name,
                "namespace": namespace,
                "cluster": cluster_id,
                "root_cause": root_cause,
                "confidence": 88.0,
                "correlated_metrics": {
                    "restart_count": restart_count,
                    "restart_reason": restart_reason,
                    "cpu_utilization": f"{cpu_utilization:.1f}%",
                    "memory_utilization": f"{memory_utilization:.1f}%"
                },
                "recommendation": recommendation.get('smart_analysis', {}).get('recommendation', 'Increase resource limits'),
                "estimated_fix_time": "3 minutes",
                "priority": severity
            })
        
        # Detect CPU throttling (CPU usage > 85% of limit)
        if cpu_limit > 0 and cpu_current > 0:
            cpu_usage_percent = (cpu_current / cpu_limit) * 100
            if cpu_usage_percent > 85:
                incident_id = f"inc-{incident_counter:03d}"
                incident_counter += 1
                
                severity = "high" if cpu_usage_percent > 95 else "medium"
                throttling_events = int((cpu_usage_percent - 85) * 10)  # Estimate
                
                incidents.append({
                    "incident_id": incident_id,
                    "type": "throttling",
                    "severity": severity,
                    "pod_name": pod_name,
                    "namespace": namespace,
                    "cluster": cluster_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": throttling_events,
                    "message": f"CPU throttling detected: {throttling_events} estimated events",
                    "resource_correlation": {
                        "cpu_request": f"{cpu_requested:.3f}",
                        "cpu_limit": f"{cpu_limit:.3f}",
                        "cpu_usage": f"{cpu_current:.3f}",
                        "throttling_percentage": f"{cpu_usage_percent:.1f}%",
                        "performance_impact": "high" if cpu_usage_percent > 95 else "medium"
                    }
                })
                
                # Create correlation
                cpu_rec = recommendation.get('cpu', {})
                recommended_limit = cpu_rec.get('recommended_limit', cpu_limit * 1.5)
                
                correlations.append({
                    "incident_id": incident_id,
                    "incident_type": "throttling",
                    "pod_name": pod_name,
                    "namespace": namespace,
                    "cluster": cluster_id,
                    "root_cause": "CPU limit too restrictive for workload",
                    "confidence": 92.0,
                    "correlated_metrics": {
                        "cpu_usage": f"At {cpu_usage_percent:.1f}% of limit",
                        "throttling_events": f"{throttling_events} estimated",
                        "performance_impact": "High latency and slow response times",
                        "utilization": f"{cpu_utilization:.1f}%"
                    },
                    "recommendation": f"Increase CPU limit to {recommended_limit:.3f} cores",
                    "estimated_fix_time": "2 minutes",
                    "priority": severity
                })
    
    return incidents, correlations


def generate_incident_patterns(incidents: List[dict]) -> List[dict]:
    """Generate incident patterns from incidents"""
    
    patterns = []
    
    # Group by type
    by_type = {}
    for incident in incidents:
        incident_type = incident['type']
        if incident_type not in by_type:
            by_type[incident_type] = []
        by_type[incident_type].append(incident)
    
    pattern_counter = 1
    
    # OOMKill pattern
    if 'oomkill' in by_type:
        oomkill_incidents = by_type['oomkill']
        affected_pods = list(set([i['pod_name'] for i in oomkill_incidents]))
        
        patterns.append({
            "pattern_id": f"pattern-{pattern_counter:03d}",
            "pattern_type": "oomkill",
            "description": "Memory exhaustion across multiple pods",
            "frequency": len(oomkill_incidents),
            "affected_pods": affected_pods[:5],  # Top 5
            "common_cause": "Insufficient memory allocation for workload requirements",
            "prevention_steps": [
                "Increase memory limits for affected pods",
                "Implement memory-efficient data processing",
                "Add memory monitoring and alerts",
                "Consider horizontal scaling for memory-intensive workloads"
            ]
        })
        pattern_counter += 1
    
    # Restart pattern
    if 'restart' in by_type:
        restart_incidents = by_type['restart']
        affected_pods = list(set([i['pod_name'] for i in restart_incidents]))
        
        patterns.append({
            "pattern_id": f"pattern-{pattern_counter:03d}",
            "pattern_type": "restart",
            "description": "Frequent pod restarts due to resource constraints",
            "frequency": len(restart_incidents),
            "affected_pods": affected_pods[:5],
            "common_cause": "Application crashes under resource pressure",
            "prevention_steps": [
                "Increase resource limits",
                "Implement graceful degradation",
                "Add health checks and readiness probes",
                "Improve error handling in application"
            ]
        })
        pattern_counter += 1
    
    # Throttling pattern
    if 'throttling' in by_type:
        throttling_incidents = by_type['throttling']
        affected_pods = list(set([i['pod_name'] for i in throttling_incidents]))
        
        patterns.append({
            "pattern_id": f"pattern-{pattern_counter:03d}",
            "pattern_type": "throttling",
            "description": "CPU throttling affecting performance",
            "frequency": len(throttling_incidents),
            "affected_pods": affected_pods[:5],
            "common_cause": "CPU limits too restrictive for workload demands",
            "prevention_steps": [
                "Increase CPU limits for affected services",
                "Implement horizontal pod autoscaling",
                "Optimize application code for CPU efficiency",
                "Use burst-capable resource configurations"
            ]
        })
    
    return patterns


# Demo incidents data removed (BUG-B03) — use real cluster data.
# Kept as empty list so any remaining fallback references return no fake data.
DEMO_INCIDENTS = []
DEMO_CORRELATIONS = []
DEMO_PATTERNS = []


@router.get("/incidents", response_model=List[Incident])
async def get_incidents(
    cluster: Optional[str] = None,
    namespace: Optional[str] = None,
    incident_type: Optional[str] = None,
    severity: Optional[str] = None,
    hours: int = 24
):
    """Get recent incidents from real Kubernetes data"""
    if not K8S_AVAILABLE:
        logger.info("K8s not available, returning empty incidents")
        incidents = []
    else:
        try:
            # Get cluster ID
            cluster_id = os.getenv('CLUSTER_ID', 'xforce-devops')
            
            # Fetch real data
            pods_data = await fetch_pods_data()
            recommendations = await fetch_recommendations_data()
            
            # Analyze incidents
            incidents, _ = analyze_incidents_from_pods(
                pods_data, recommendations, cluster_id
            )
            
            logger.info(f"Generated {len(incidents)} incidents from real data")
        except Exception as e:
            logger.error(f"Error generating incidents: {e}")
            incidents = []
    
    # Apply filters
    if cluster:
        incidents = [i for i in incidents if i["cluster"] == cluster]
    if namespace:
        incidents = [i for i in incidents if i["namespace"] == namespace]
    if incident_type:
        incidents = [i for i in incidents if i["type"] == incident_type]
    if severity:
        incidents = [i for i in incidents if i["severity"] == severity]
    
    return incidents


@router.get("/incidents/{incident_id}", response_model=Incident)
async def get_incident(incident_id: str):
    """Get specific incident"""
    incidents = await get_incidents()
    for incident in incidents:
        if incident["incident_id"] == incident_id:
            return incident
    return {"error": "Incident not found"}


@router.get("/correlations", response_model=List[CorrelationAnalysis])
async def get_correlations(
    cluster: Optional[str] = None,
    namespace: Optional[str] = None,
    min_confidence: float = 0
):
    """Get incident correlations with resource issues from real data"""
    if not K8S_AVAILABLE:
        logger.info("K8s not available, returning empty correlations")
        correlations = []
    else:
        try:
            # Get cluster info
            cluster_id = os.getenv('CLUSTER_ID', 'xforce-devops')
            
            # Fetch real data
            pods_data = await fetch_pods_data()
            recommendations = await fetch_recommendations_data()
            
            # Analyze incidents and get correlations
            _, correlations = analyze_incidents_from_pods(
                pods_data, recommendations, cluster_id
            )
            
            logger.info(f"Generated {len(correlations)} correlations")
        except Exception as e:
            logger.error(f"Error generating correlations: {e}")
            correlations = []
    
    # Apply filters
    if cluster:
        correlations = [c for c in correlations if c["cluster"] == cluster]
    if namespace:
        correlations = [
            c for c in correlations if c["namespace"] == namespace
        ]
    if min_confidence > 0:
        correlations = [
            c for c in correlations
            if c["confidence"] >= min_confidence
        ]
    
    return sorted(
        correlations, key=lambda x: x["confidence"], reverse=True
    )


@router.get("/correlations/{incident_id}", response_model=CorrelationAnalysis)
async def get_correlation(incident_id: str):
    """Get correlation analysis for specific incident"""
    correlations = await get_correlations()
    for correlation in correlations:
        if correlation["incident_id"] == incident_id:
            return correlation
    return {"error": "Correlation not found"}


@router.get("/patterns", response_model=List[IncidentPattern])
async def get_patterns():
    """Get incident patterns from real data"""
    if not K8S_AVAILABLE:
        logger.info("K8s not available, returning empty patterns")
        return []
    
    try:
        # Get incidents first
        incidents = await get_incidents()
        
        # Generate patterns
        patterns = generate_incident_patterns(incidents)
        
        logger.info(f"Generated {len(patterns)} incident patterns")
        return patterns
    except Exception as e:
        logger.error(f"Error generating patterns: {e}")
        return []


@router.get("/patterns/{pattern_id}", response_model=IncidentPattern)
async def get_pattern(pattern_id: str):
    """Get specific incident pattern"""
    patterns = await get_patterns()
    for pattern in patterns:
        if pattern["pattern_id"] == pattern_id:
            return pattern
    return {"error": "Pattern not found"}


@router.get("/timeline")
async def get_incident_timeline(hours: int = 24):
    """Get incident timeline from real data"""
    incidents = await get_incidents()
    
    timeline = []
    for incident in incidents:
        timeline.append({
            "timestamp": incident["timestamp"],
            "incident_type": incident["type"],
            "pod_name": incident["pod_name"],
            "namespace": incident["namespace"],
            "severity": incident["severity"],
            "message": incident["message"]
        })
    
    # Sort by timestamp
    timeline.sort(key=lambda x: x["timestamp"], reverse=True)
    
    return timeline


@router.get("/summary")
async def get_incident_summary():
    """Get incident summary statistics from real data"""
    incidents = await get_incidents()
    
    total_incidents = len(incidents)
    
    by_type = {}
    by_severity = {}
    by_cluster = {}
    
    for incident in incidents:
        # By type
        incident_type = incident["type"]
        by_type[incident_type] = by_type.get(incident_type, 0) + 1
        
        # By severity
        severity = incident["severity"]
        by_severity[severity] = by_severity.get(severity, 0) + 1
        
        # By cluster
        cluster = incident["cluster"]
        by_cluster[cluster] = by_cluster.get(cluster, 0) + 1
    
    # Most affected pods
    pod_counts = {}
    for incident in incidents:
        pod = incident["pod_name"]
        pod_counts[pod] = pod_counts.get(pod, 0) + incident["count"]
    
    top_pods = sorted(
        pod_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )[:5]
    
    return {
        "total_incidents": total_incidents,
        "by_type": by_type,
        "by_severity": by_severity,
        "by_cluster": by_cluster,
        "top_affected_pods": [
            {"pod": pod, "count": count}
            for pod, count in top_pods
        ],
        "total_oomkills": sum(
            i["count"] for i in incidents if i["type"] == "oomkill"
        ),
        "total_restarts": sum(
            i["count"] for i in incidents if i["type"] == "restart"
        ),
        "total_throttling_events": sum(
            i["count"] for i in incidents if i["type"] == "throttling"
        )
    }


@router.post("/analyze")
async def analyze_incident(incident_data: Dict[str, Any]):
    """Analyze a new incident and correlate with resources"""
    
    pod_name = incident_data.get("pod_name", "unknown")
    namespace = incident_data.get("namespace", "default")
    incident_type = incident_data.get("type", "unknown")
    
    # Get correlations for this pod
    correlations = await get_correlations(namespace=namespace)
    
    # Find matching correlation
    matching_correlation = None
    for corr in correlations:
        if corr["pod_name"] == pod_name:
            matching_correlation = corr
            break
    
    if matching_correlation:
        return {
            "success": True,
            "correlation": matching_correlation,
            "message": "Incident analyzed successfully"
        }
    else:
        # Generic response
        correlation = {
            "incident_id": f"inc-new-{datetime.now().timestamp()}",
            "incident_type": incident_type,
            "pod_name": pod_name,
            "namespace": namespace,
            "root_cause": "Resource constraint detected",
            "confidence": 75.0,
            "recommendation": "Increase resource limits",
            "priority": "medium"
        }
        
        return {
            "success": True,
            "correlation": correlation,
            "message": "Incident analyzed with generic correlation"
        }


@router.get("/recommendations")
async def get_incident_recommendations():
    """Get recommendations based on incident patterns from real data"""
    patterns = await get_patterns()
    
    recommendations = []
    
    for pattern in patterns:
        recommendations.append({
            "pattern": pattern["pattern_type"],
            "affected_count": pattern["frequency"],
            "recommendation": pattern["prevention_steps"][0],
            "priority": "high" if pattern["frequency"] > 5 else "medium",
            "estimated_impact": (
                f"Prevent {pattern['frequency']} incidents/month"
            )
        })
    
    return sorted(
        recommendations, key=lambda x: x["affected_count"], reverse=True
    )

# Made with Bob
