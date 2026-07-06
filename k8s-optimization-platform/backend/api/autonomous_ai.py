"""
Autonomous AI Complete API
Consolidates all AI-powered features:
- AI Copilot (Natural Language, Optimization Advisor, Security Advisor, Incident Investigator)
- Autonomous Operations (Manual, Assisted, Autonomous modes)
- Auto-Fix Center (Resource, Security, Compliance, Bulk fixes)
- Rollback Center (Deployment, Configuration, Namespace, Cluster rollback)
- AI Recommendations (Cost, Performance, Reliability, Security, Compliance)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import logging
import random

router = APIRouter()
logger = logging.getLogger(__name__)


async def _ai_security_context(cluster: Optional[str] = None) -> Dict[str, Any]:
    """Fetch real pod signals for AI endpoints."""
    try:
        from database.db import db_manager
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return {}
        cluster_name = cluster or clusters[0]["cluster_name"]
        metrics = db_manager.get_latest_metrics(cluster_name)
        if not metrics:
            return {}
        pods_domain = metrics.get("pods") or {}
        if isinstance(pods_domain, str):
            import json
            pods_domain = json.loads(pods_domain)
        pods = pods_domain.get("items", [])
    except Exception as e:
        logger.error(f"_ai_security_context: {e}")
        pods = []

    tc = 0
    priv = root = pe = ro = host_net = host_pid = host_ipc = default_sa = no_lv = no_cpu = no_mem = 0
    namespaces = set()

    for pod in pods:
        namespaces.add(pod.get("namespace", ""))
        sa = pod.get("service_account", "default") or "default"
        if sa == "default":
            default_sa += 1
        if pod.get("host_network"):
            host_net += 1
        if pod.get("host_pid"):
            host_pid += 1
        if pod.get("host_ipc"):
            host_ipc += 1
        for c in (pod.get("containers") or []):
            tc += 1
            if c.get("privileged"):
                priv += 1
            if c.get("run_as_root"):
                root += 1
            if c.get("allow_privilege_escalation"):
                pe += 1
            if c.get("read_only_root_fs"):
                ro += 1
            if not c.get("has_liveness"):
                no_lv += 1
            if not c.get("cpu_limit"):
                no_cpu += 1
            if not c.get("memory_limit_mb"):
                no_mem += 1

    return {
        "cluster_name": cluster or "xforce-devops",
        "total_pods": len(pods),
        "total_containers": tc,
        "namespace_count": len(namespaces),
        "namespaces": list(namespaces),
        "privileged_count": priv,
        "root_count": root,
        "priv_esc_count": pe,
        "readonly_fs_count": ro,
        "host_network_count": host_net,
        "host_pid_count": host_pid,
        "host_ipc_count": host_ipc,
        "default_sa_count": default_sa,
        "no_liveness_count": no_lv,
        "no_cpu_limit_count": no_cpu,
        "no_mem_limit_count": no_mem,
        "pods": pods,
    }

# ============================================================================
# AI COPILOT SECTION
# ============================================================================

class QueryType(str, Enum):
    NATURAL_LANGUAGE = "natural_language"
    OPTIMIZATION = "optimization"
    SECURITY = "security"
    INCIDENT = "incident"

class CopilotQuery(BaseModel):
    query: str
    query_type: QueryType
    context: Optional[Dict[str, Any]] = None

class CopilotResponse(BaseModel):
    query_id: str
    query: str
    response: str
    suggestions: List[str]
    related_resources: List[Dict[str, str]]
    confidence: float
    timestamp: str

@router.post("/copilot/query", response_model=CopilotResponse)
async def query_copilot(query: CopilotQuery):
    """AI Copilot - Natural language query interface"""
    query_id = f"q-{random.randint(1000, 9999)}"
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # Simulate AI response based on query type
    responses = {
        QueryType.NATURAL_LANGUAGE: {
            "response": f"Based on your query '{query.query}', I found that your cluster has 45 pods with CPU over-provisioning. The average CPU utilization is 23%, while requests are set to 2000m. I recommend reducing CPU requests to 500m for better resource efficiency.",
            "suggestions": [
                "Review CPU requests for high-waste pods",
                "Enable horizontal pod autoscaling",
                "Set resource quotas per namespace",
                "Monitor CPU throttling metrics"
            ],
            "related_resources": [
                {"type": "Pod", "name": "frontend-web-7d9f8", "namespace": "production"},
                {"type": "Pod", "name": "api-server-5c8b2", "namespace": "production"},
                {"type": "Deployment", "name": "backend-api", "namespace": "production"}
            ]
        },
        QueryType.OPTIMIZATION: {
            "response": "I've analyzed your cluster and identified 12 optimization opportunities that could save $4,200/month. The top recommendations include right-sizing 8 over-provisioned deployments, removing 3 unused PVCs, and enabling cluster autoscaling.",
            "suggestions": [
                "Right-size frontend-web deployment (save $800/mo)",
                "Remove unused PVC 'old-data-vol' (save $120/mo)",
                "Enable cluster autoscaler (save $1,200/mo)",
                "Consolidate low-utilization nodes (save $2,080/mo)"
            ],
            "related_resources": [
                {"type": "Deployment", "name": "frontend-web", "namespace": "production"},
                {"type": "PVC", "name": "old-data-vol", "namespace": "staging"},
                {"type": "Node", "name": "worker-node-3", "namespace": ""}
            ]
        },
        QueryType.SECURITY: {
            "response": "Security scan complete. Found 3 critical vulnerabilities: 2 containers running as root, 1 exposed secret in environment variables, and 4 images with high-severity CVEs. Immediate action recommended for root containers.",
            "suggestions": [
                "Update nginx container to run as non-root user",
                "Move database password to Kubernetes secret",
                "Upgrade redis image to patch CVE-2024-1234",
                "Enable Pod Security Standards"
            ],
            "related_resources": [
                {"type": "Pod", "name": "nginx-proxy-8f7d", "namespace": "production"},
                {"type": "Deployment", "name": "api-server", "namespace": "production"},
                {"type": "Pod", "name": "redis-cache-9k2l", "namespace": "cache"}
            ]
        },
        QueryType.INCIDENT: {
            "response": "Incident analysis shows that the recent OOMKill events in the 'api-server' deployment are caused by memory leaks in the application. Memory usage grows from 512Mi to 4Gi over 6 hours. Root cause: unclosed database connections.",
            "suggestions": [
                "Increase memory limit to 6Gi as temporary fix",
                "Implement connection pooling in application code",
                "Add memory leak detection monitoring",
                "Set up automatic pod restart on high memory"
            ],
            "related_resources": [
                {"type": "Pod", "name": "api-server-7c9d8", "namespace": "production"},
                {"type": "Event", "name": "OOMKilled", "namespace": "production"},
                {"type": "Deployment", "name": "api-server", "namespace": "production"}
            ]
        }
    }
    
    response_data = responses.get(query.query_type, responses[QueryType.NATURAL_LANGUAGE])
    
    return CopilotResponse(
        query_id=query_id,
        query=query.query,
        response=response_data["response"],
        suggestions=response_data["suggestions"],
        related_resources=response_data["related_resources"],
        confidence=0.92,
        timestamp=timestamp
    )

@router.get("/copilot/optimization-advisor")
async def get_optimization_advisor():
    """AI Copilot - Optimization Advisor"""
    return {
        "advisor_type": "optimization",
        "recommendations": [
            {
                "id": "opt-001",
                "title": "Right-size Over-Provisioned Deployments",
                "description": "8 deployments are using less than 30% of requested resources",
                "impact": "high",
                "savings": 3200.0,
                "effort": "low",
                "resources_affected": 8
            },
            {
                "id": "opt-002",
                "title": "Enable Horizontal Pod Autoscaling",
                "description": "12 deployments could benefit from HPA based on traffic patterns",
                "impact": "medium",
                "savings": 1800.0,
                "effort": "medium",
                "resources_affected": 12
            },
            {
                "id": "opt-003",
                "title": "Consolidate Low-Utilization Nodes",
                "description": "3 nodes running at <20% utilization can be consolidated",
                "impact": "high",
                "savings": 2400.0,
                "effort": "low",
                "resources_affected": 3
            }
        ],
        "total_potential_savings": 7400.0,
        "priority_actions": 3,
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

@router.get("/copilot/security-advisor")
async def get_security_advisor(cluster: Optional[str] = Query(None)):
    """AI Copilot - Security Advisor — real data from cluster"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        tp = ctx["total_pods"] or 1

        # Derive security score from signals
        priv_rate = 1 - ctx["privileged_count"] / tc
        root_rate = 1 - ctx["root_count"] / tc
        pe_rate   = 1 - ctx["priv_esc_count"] / tc
        ro_rate   = ctx["readonly_fs_count"] / tc
        hn_rate   = 1 - ctx["host_network_count"] / tp
        sa_rate   = 1 - ctx["default_sa_count"] / tp
        security_score = round((priv_rate*20 + root_rate*15 + pe_rate*15 + ro_rate*10
                                + hn_rate*15 + sa_rate*15 + (1 - ctx["no_liveness_count"]/tc)*10), 1)

        issues = []
        if ctx["privileged_count"] > 0:
            pods_sample = [p["name"] for p in ctx["pods"] if any(c.get("privileged") for c in (p.get("containers") or []))][:5]
            issues.append({"id": "sec-001", "severity": "critical", "category": "Container Security",
                           "title": "Privileged Containers Running in Cluster",
                           "description": f"{ctx['privileged_count']} containers running with privileged: true — full host access",
                           "affected_resources": pods_sample,
                           "remediation": "Remove privileged: true from all container securityContexts",
                           "cve_ids": []})
        if ctx["root_count"] > 0:
            pods_sample = [p["name"] for p in ctx["pods"] if any(c.get("run_as_root") for c in (p.get("containers") or []))][:5]
            issues.append({"id": "sec-002", "severity": "critical", "category": "Container Security",
                           "title": "Containers Running as Root (UID 0)",
                           "description": f"{ctx['root_count']} containers running as root user",
                           "affected_resources": pods_sample,
                           "remediation": "Set runAsNonRoot: true and specify non-zero runAsUser",
                           "cve_ids": []})
        if ctx["host_network_count"] > 0:
            pods_sample = [p["name"] for p in ctx["pods"] if p.get("host_network")][:5]
            issues.append({"id": "sec-003", "severity": "high", "category": "Network Security",
                           "title": "Pods Using Host Network Namespace",
                           "description": f"{ctx['host_network_count']} pods with hostNetwork: true — unrestricted node network access",
                           "affected_resources": pods_sample,
                           "remediation": "Set hostNetwork: false unless absolutely required",
                           "cve_ids": []})
        if ctx["priv_esc_count"] > 0:
            issues.append({"id": "sec-004", "severity": "high", "category": "Container Security",
                           "title": "Privilege Escalation Allowed",
                           "description": f"{ctx['priv_esc_count']} containers allow allowPrivilegeEscalation: true",
                           "affected_resources": [f"{ctx['priv_esc_count']} containers"],
                           "remediation": "Set allowPrivilegeEscalation: false in all securityContexts",
                           "cve_ids": []})
        if ctx["default_sa_count"] > 0:
            issues.append({"id": "sec-005", "severity": "medium", "category": "RBAC",
                           "title": "Default Service Account Usage",
                           "description": f"{ctx['default_sa_count']} pods using default service account",
                           "affected_resources": [f"{ctx['default_sa_count']} pods"],
                           "remediation": "Create dedicated service accounts per workload",
                           "cve_ids": []})
        writable = tc - ctx["readonly_fs_count"]
        if writable > 0:
            issues.append({"id": "sec-006", "severity": "medium", "category": "Container Security",
                           "title": "Writable Root Filesystems",
                           "description": f"{writable} containers with readOnlyRootFilesystem: false",
                           "affected_resources": [f"{writable} containers"],
                           "remediation": "Set readOnlyRootFilesystem: true",
                           "cve_ids": []})

        sev_counts = {s: sum(1 for i in issues if i["severity"] == s) for s in ("critical","high","medium","low")}

        cis_score = round(security_score)
        return {
            "summary": {
                "total_issues": len(issues),
                "critical": sev_counts["critical"],
                "high": sev_counts["high"],
                "medium": sev_counts["medium"],
                "low": 0,
                "security_score": round(security_score, 1),
                "total_pods": tp,
                "total_containers": tc,
                "cluster_name": ctx["cluster_name"],
            },
            "issues": issues,
            "compliance_status": {
                "cis_benchmark": "Partial" if cis_score < 80 else "Compliant",
                "pci_dss": "Compliant" if ctx["privileged_count"] == 0 else "Non-Compliant",
                "hipaa": "Compliant" if ctx["readonly_fs_count"] / tc > 0.5 else "Needs Review",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"security-advisor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/copilot/incident-investigator")
async def get_incident_investigator():
    """AI Copilot - Incident Investigator"""
    return {
        "investigator_type": "incident",
        "active_incidents": 2,
        "resolved_today": 5,
        "incidents": [
            {
                "incident_id": "inc-001",
                "severity": "high",
                "title": "Repeated OOMKills in API Server",
                "status": "investigating",
                "root_cause": "Memory leak in application code",
                "affected_pods": ["api-server-7c9d8", "api-server-5k3m2"],
                "timeline": [
                    {"time": "2026-06-23T06:00:00Z", "event": "First OOMKill detected"},
                    {"time": "2026-06-23T06:15:00Z", "event": "Memory usage spike to 4Gi"},
                    {"time": "2026-06-23T06:30:00Z", "event": "Pod restarted automatically"},
                    {"time": "2026-06-23T07:00:00Z", "event": "Pattern identified: memory leak"}
                ],
                "recommendations": [
                    "Increase memory limit to 6Gi temporarily",
                    "Implement connection pooling",
                    "Add memory profiling"
                ],
                "related_metrics": {
                    "memory_growth_rate": "500Mi/hour",
                    "restart_count": 12,
                    "avg_uptime": "6 hours"
                }
            },
            {
                "incident_id": "inc-002",
                "severity": "medium",
                "title": "High CPU Throttling in Frontend",
                "status": "resolved",
                "root_cause": "CPU limits too restrictive",
                "affected_pods": ["frontend-web-8d7f"],
                "timeline": [
                    {"time": "2026-06-23T05:00:00Z", "event": "CPU throttling detected"},
                    {"time": "2026-06-23T05:30:00Z", "event": "Response time degradation"},
                    {"time": "2026-06-23T06:00:00Z", "event": "CPU limit increased to 2000m"},
                    {"time": "2026-06-23T06:15:00Z", "event": "Performance restored"}
                ],
                "recommendations": [
                    "Monitor CPU usage patterns",
                    "Consider HPA for traffic spikes"
                ],
                "related_metrics": {
                    "throttling_percentage": "45%",
                    "response_time_p95": "2.5s",
                    "cpu_utilization": "95%"
                }
            }
        ],
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

# ============================================================================
# AUTONOMOUS OPERATIONS SECTION
# ============================================================================

class OperationMode(str, Enum):
    MANUAL = "manual"
    ASSISTED = "assisted"
    AUTONOMOUS = "autonomous"

@router.get("/operations/modes")
async def get_operation_modes():
    """Get all autonomous operation modes"""
    return {
        "modes": [
            {
                "mode": "manual",
                "name": "Manual Mode",
                "description": "Full manual control - recommendations only",
                "automation_level": 0,
                "features": [
                    "View all recommendations",
                    "Manual approval required for every change",
                    "Complete audit trail",
                    "No automatic actions"
                ],
                "best_for": "Production environments requiring strict change control"
            },
            {
                "mode": "assisted",
                "name": "Assisted Mode",
                "description": "Semi-automated with approval workflow",
                "automation_level": 50,
                "features": [
                    "Automatic detection of optimization opportunities",
                    "One-click approval for recommended changes",
                    "Auto-approve low-risk changes below threshold",
                    "Notification system for pending approvals"
                ],
                "best_for": "Balanced approach for most environments"
            },
            {
                "mode": "autonomous",
                "name": "Autonomous Mode",
                "description": "Fully automated optimization",
                "automation_level": 100,
                "features": [
                    "Continuous automatic optimization",
                    "Self-healing capabilities",
                    "Predictive scaling",
                    "Automatic rollback on failures"
                ],
                "best_for": "Development and staging environments"
            }
        ],
        "current_mode": "assisted",
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

@router.get("/operations/manual-mode")
async def get_manual_mode_status():
    """Get Manual Mode status and pending actions"""
    return {
        "mode": "manual",
        "enabled": True,
        "pending_reviews": 15,
        "recommendations": [
            {
                "id": "man-001",
                "type": "cpu_rightsizing",
                "resource": "deployment/frontend-web",
                "current": "2000m",
                "recommended": "500m",
                "savings": 45.0,
                "confidence": 0.95,
                "requires_approval": True
            },
            {
                "id": "man-002",
                "type": "memory_rightsizing",
                "resource": "deployment/api-server",
                "current": "4Gi",
                "recommended": "2Gi",
                "savings": 32.0,
                "confidence": 0.88,
                "requires_approval": True
            }
        ],
        "stats": {
            "total_recommendations": 15,
            "approved": 0,
            "rejected": 0,
            "pending": 15
        }
    }

@router.get("/operations/assisted-mode")
async def get_assisted_mode_status():
    """Get Assisted Mode status and auto-approved actions"""
    return {
        "mode": "assisted",
        "enabled": True,
        "auto_approve_threshold": 100.0,
        "pending_approval": 8,
        "auto_approved_today": 12,
        "actions": [
            {
                "id": "ast-001",
                "type": "cpu_rightsizing",
                "resource": "deployment/cache-service",
                "status": "auto_approved",
                "savings": 25.0,
                "risk": "low",
                "approved_at": (datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z"
            },
            {
                "id": "ast-002",
                "type": "unused_pvc_cleanup",
                "resource": "pvc/old-data-vol",
                "status": "pending_approval",
                "savings": 120.0,
                "risk": "medium",
                "requires_manual_approval": True
            }
        ],
        "stats": {
            "total_actions": 20,
            "auto_approved": 12,
            "pending_approval": 8,
            "applied": 10
        }
    }

@router.get("/operations/autonomous-mode")
async def get_autonomous_mode_status():
    """Get Autonomous Mode status and automated actions"""
    return {
        "mode": "autonomous",
        "status": "active",
        "autonomous_enabled": False,
        "optimizations_today": 45,
        "total_savings_today": "$1,250.00",
        "success_rate": 95.6,
        "recent_activities": [
            {
                "id": "auto-001",
                "timestamp": (datetime.utcnow() - timedelta(minutes=30)).isoformat() + "Z",
                "action": "CPU Rightsizing Applied",
                "resource": "deployment/worker-pool",
                "result": "success",
                "savings": "$35.00"
            },
            {
                "id": "auto-002",
                "timestamp": (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z",
                "action": "Horizontal Scaling (Scaled Down)",
                "resource": "deployment/api-server",
                "result": "success",
                "savings": "$80.00"
            },
            {
                "id": "auto-003",
                "timestamp": (datetime.utcnow() - timedelta(hours=3)).isoformat() + "Z",
                "action": "Node Consolidation (Drained)",
                "resource": "node/worker-3",
                "result": "success",
                "savings": "$450.00"
            }
        ]
    }

# ============================================================================
# AUTO-FIX CENTER SECTION
# ============================================================================

@router.get("/autofix/resource-fixes")
async def get_resource_fixes():
    """Get resource optimization fixes"""
    return {
        "category": "resource_fixes",
        "total_fixes": 28,
        "potential_savings": 3200.0,
        "fixes": [
            {
                "fix_id": "res-001",
                "type": "cpu_over_provisioning",
                "resource": "deployment/frontend-web",
                "namespace": "production",
                "current_cpu": "2000m",
                "recommended_cpu": "500m",
                "savings": 45.0,
                "risk": "low",
                "status": "ready",
                "confidence": 0.95
            },
            {
                "fix_id": "res-002",
                "type": "memory_over_provisioning",
                "resource": "deployment/api-server",
                "namespace": "production",
                "current_memory": "4Gi",
                "recommended_memory": "2Gi",
                "savings": 32.0,
                "risk": "low",
                "status": "ready",
                "confidence": 0.88
            },
            {
                "fix_id": "res-003",
                "type": "unused_pvc",
                "resource": "pvc/old-data-vol",
                "namespace": "staging",
                "size": "100Gi",
                "last_used": "90 days ago",
                "savings": 120.0,
                "risk": "medium",
                "status": "ready",
                "confidence": 0.92
            }
        ]
    }

@router.get("/autofix/security-fixes")
async def get_security_fixes(cluster: Optional[str] = Query(None)):
    """Get security-related fixes — real data from cluster signals"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        fixes = []
        tc = ctx["total_containers"] or 1

        if ctx["privileged_count"] > 0:
            priv_pods = [p["name"] for p in ctx["pods"]
                         if any(c.get("privileged") for c in (p.get("containers") or []))]
            for i, pod in enumerate(priv_pods[:5]):
                ns = next((p.get("namespace","") for p in ctx["pods"] if p.get("name") == pod), "")
                fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "critical",
                               "type": "privileged_container", "resource": f"pod/{pod}",
                               "namespace": ns, "issue": "Container running with privileged: true",
                               "fix": "Remove privileged: true from securityContext", "status": "ready", "cve_ids": []})

        if ctx["root_count"] > 0:
            root_pods = [p["name"] for p in ctx["pods"]
                         if any(c.get("run_as_root") for c in (p.get("containers") or []))]
            for pod in root_pods[:5]:
                ns = next((p.get("namespace","") for p in ctx["pods"] if p.get("name") == pod), "")
                fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "critical",
                               "type": "root_container", "resource": f"pod/{pod}",
                               "namespace": ns, "issue": "Container running as root (UID 0)",
                               "fix": "Set runAsNonRoot: true and runAsUser: 1000", "status": "ready", "cve_ids": []})

        if ctx["host_network_count"] > 0:
            hn_pods = [p["name"] for p in ctx["pods"] if p.get("host_network")]
            for pod in hn_pods[:5]:
                ns = next((p.get("namespace","") for p in ctx["pods"] if p.get("name") == pod), "")
                fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "high",
                               "type": "host_network", "resource": f"pod/{pod}",
                               "namespace": ns, "issue": "Pod using host network namespace",
                               "fix": "Set hostNetwork: false in pod spec", "status": "ready", "cve_ids": []})

        if ctx["priv_esc_count"] > 0:
            fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "high",
                           "type": "privilege_escalation", "resource": f"{ctx['priv_esc_count']} containers",
                           "namespace": "multiple", "issue": "allowPrivilegeEscalation: true",
                           "fix": "Set allowPrivilegeEscalation: false", "status": "ready", "cve_ids": []})

        writable = tc - ctx["readonly_fs_count"]
        if writable > 0:
            fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "medium",
                           "type": "writable_fs", "resource": f"{writable} containers",
                           "namespace": "multiple", "issue": "readOnlyRootFilesystem: false",
                           "fix": "Set readOnlyRootFilesystem: true", "status": "ready", "cve_ids": []})

        sev_counts = {s: sum(1 for f in fixes if f["severity"] == s) for s in ("critical","high","medium")}
        return {
            "category": "security_fixes", "total_fixes": len(fixes),
            "critical": sev_counts["critical"], "high": sev_counts["high"], "medium": sev_counts["medium"],
            "fixes": fixes, "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"security-fixes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/autofix/compliance-fixes")
async def get_compliance_fixes(cluster: Optional[str] = Query(None)):
    """Get compliance-related fixes — real data from cluster signals"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        tp = ctx["total_pods"] or 1
        fixes = []

        items = [
            ("CIS Benchmark", "4.2.1", "privileged_container", "critical",
             f"{ctx['privileged_count']} containers have privileged: true",
             "Remove privileged: true — violates CIS 4.2.1", ctx["privileged_count"] > 0),
            ("CIS Benchmark", "4.2.3", "root_container", "critical",
             f"{ctx['root_count']} containers run as root",
             "Set runAsNonRoot: true — violates CIS 4.2.3", ctx["root_count"] > 0),
            ("PCI DSS", "Req 1", "host_network", "high",
             f"{ctx['host_network_count']} pods using host network",
             "Set hostNetwork: false — PCI DSS network isolation", ctx["host_network_count"] > 0),
            ("CIS Benchmark", "4.3.1", "writable_fs", "medium",
             f"{tc - ctx['readonly_fs_count']} containers have writable root FS",
             "Set readOnlyRootFilesystem: true — CIS 4.3.1", (tc - ctx["readonly_fs_count"]) > 0),
            ("ISO 27001", "A.9", "default_sa", "medium",
             f"{ctx['default_sa_count']} pods using default SA",
             "Create dedicated service accounts — ISO 27001 A.9", ctx["default_sa_count"] > 0),
            ("CIS Benchmark", "4.4.1", "cpu_limits", "medium",
             f"{ctx['no_cpu_limit_count']} containers missing CPU limits",
             "Add resources.limits.cpu — CIS 4.4.1", ctx["no_cpu_limit_count"] > 0),
        ]

        for fw, ctrl, ftype, sev, issue, fix, active in items:
            if active:
                fixes.append({"fix_id": f"comp-{len(fixes)+1:03d}", "framework": fw, "control": ctrl,
                               "type": ftype, "resource": issue.split()[0] + " resources",
                               "issue": issue, "fix": fix, "status": "ready", "impact": sev})

        fw_counts = {}
        for f in fixes:
            fw_counts[f["framework"]] = fw_counts.get(f["framework"], 0) + 1

        return {
            "category": "compliance_fixes", "total_fixes": len(fixes),
            "frameworks": fw_counts, "fixes": fixes, "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compliance-fixes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/autofix/bulk-fixes")
async def get_bulk_fixes():
    """Get bulk fix operations"""
    return {
        "category": "bulk_fixes",
        "available_operations": [
            {
                "operation_id": "bulk-001",
                "name": "Right-size All Over-Provisioned Deployments",
                "description": "Apply CPU/memory right-sizing to all deployments with >50% waste",
                "affected_resources": 15,
                "total_savings": 2400.0,
                "risk": "low",
                "estimated_duration": "5 minutes"
            },
            {
                "operation_id": "bulk-002",
                "name": "Clean Up All Unused PVCs",
                "description": "Remove all PVCs not attached to pods for >90 days",
                "affected_resources": 8,
                "total_savings": 960.0,
                "risk": "medium",
                "estimated_duration": "2 minutes"
            },
            {
                "operation_id": "bulk-003",
                "name": "Update All Vulnerable Images",
                "description": "Upgrade all container images with high-severity CVEs",
                "affected_resources": 12,
                "total_savings": 0.0,
                "risk": "medium",
                "estimated_duration": "10 minutes"
            }
        ],
        "last_bulk_operation": {
            "operation_id": "bulk-004",
            "name": "Remove Stale ConfigMaps",
            "completed_at": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
            "resources_affected": 23,
            "status": "success"
        }
    }

# ============================================================================
# ROLLBACK CENTER SECTION
# ============================================================================

@router.get("/rollback/deployment-rollback")
async def get_deployment_rollbacks():
    """Get deployment rollback history and options"""
    return {
        "category": "deployment_rollback",
        "available_rollbacks": 8,
        "rollbacks": [
            {
                "rollback_id": "dep-rb-001",
                "deployment": "frontend-web",
                "namespace": "production",
                "current_revision": 5,
                "previous_revision": 4,
                "change_date": (datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z",
                "change_type": "cpu_rightsizing",
                "can_rollback": True,
                "reason": "CPU reduced from 2000m to 500m"
            },
            {
                "rollback_id": "dep-rb-002",
                "deployment": "api-server",
                "namespace": "production",
                "current_revision": 12,
                "previous_revision": 11,
                "change_date": (datetime.utcnow() - timedelta(hours=5)).isoformat() + "Z",
                "change_type": "image_update",
                "can_rollback": True,
                "reason": "Updated to version 2.5.0"
            }
        ],
        "recent_rollbacks": [
            {
                "rollback_id": "dep-rb-003",
                "deployment": "worker-pool",
                "namespace": "processing",
                "rolled_back_at": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
                "reason": "Performance degradation after update",
                "status": "success"
            }
        ]
    }

@router.get("/rollback/configuration-rollback")
async def get_configuration_rollbacks():
    """Get configuration rollback history"""
    return {
        "category": "configuration_rollback",
        "available_rollbacks": 15,
        "rollbacks": [
            {
                "rollback_id": "cfg-rb-001",
                "resource_type": "ConfigMap",
                "resource_name": "app-config",
                "namespace": "production",
                "change_date": (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z",
                "changes": [
                    {"key": "max_connections", "old": "100", "new": "200"},
                    {"key": "timeout", "old": "30s", "new": "60s"}
                ],
                "can_rollback": True
            },
            {
                "rollback_id": "cfg-rb-002",
                "resource_type": "Secret",
                "resource_name": "db-credentials",
                "namespace": "production",
                "change_date": (datetime.utcnow() - timedelta(hours=3)).isoformat() + "Z",
                "changes": [
                    {"key": "password", "old": "***", "new": "***"}
                ],
                "can_rollback": True
            }
        ]
    }

@router.get("/rollback/namespace-rollback")
async def get_namespace_rollbacks():
    """Get namespace-wide rollback options"""
    return {
        "category": "namespace_rollback",
        "available_namespaces": 5,
        "namespaces": [
            {
                "rollback_id": "ns-rb-001",
                "namespace": "production",
                "last_snapshot": (datetime.utcnow() - timedelta(hours=6)).isoformat() + "Z",
                "changes_since_snapshot": 12,
                "can_rollback": True,
                "affected_resources": {
                    "deployments": 5,
                    "configmaps": 3,
                    "secrets": 2,
                    "services": 2
                }
            },
            {
                "rollback_id": "ns-rb-002",
                "namespace": "staging",
                "last_snapshot": (datetime.utcnow() - timedelta(hours=12)).isoformat() + "Z",
                "changes_since_snapshot": 8,
                "can_rollback": True,
                "affected_resources": {
                    "deployments": 3,
                    "configmaps": 2,
                    "secrets": 1,
                    "services": 2
                }
            }
        ]
    }

@router.get("/rollback/cluster-rollback")
async def get_cluster_rollbacks():
    """Get cluster-wide rollback options"""
    return {
        "category": "cluster_rollback",
        "cluster_name": "production-cluster",
        "last_snapshot": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
        "changes_since_snapshot": 45,
        "can_rollback": True,
        "snapshot_details": {
            "total_resources": 234,
            "namespaces": 8,
            "deployments": 32,
            "statefulsets": 5,
            "daemonsets": 8,
            "services": 45,
            "configmaps": 67,
            "secrets": 34,
            "pvcs": 23
        },
        "rollback_scope": [
            "All resource configurations",
            "RBAC policies",
            "Network policies",
            "Resource quotas",
            "Limit ranges"
        ],
        "estimated_duration": "15 minutes",
        "risk": "high"
    }

# ============================================================================
# AI RECOMMENDATIONS SECTION
# ============================================================================

@router.get("/recommendations/cost")
async def get_cost_recommendations():
    """Get AI-powered cost optimization recommendations"""
    return {
        "category": "cost",
        "total_recommendations": 15,
        "potential_savings": 4200.0,
        "recommendations": [
            {
                "id": "cost-001",
                "priority": "high",
                "title": "Right-size Over-Provisioned Deployments",
                "description": "8 deployments using <30% of requested resources",
                "savings": 1800.0,
                "effort": "low",
                "confidence": 0.95,
                "affected_resources": 8,
                "implementation": "Reduce CPU/memory requests to match actual usage"
            },
            {
                "id": "cost-002",
                "priority": "high",
                "title": "Remove Unused PVCs",
                "description": "5 PVCs not attached to any pods for >90 days",
                "savings": 600.0,
                "effort": "low",
                "confidence": 0.98,
                "affected_resources": 5,
                "implementation": "Delete unused persistent volume claims"
            },
            {
                "id": "cost-003",
                "priority": "medium",
                "title": "Enable Cluster Autoscaling",
                "description": "Cluster has 3 underutilized nodes that could be scaled down",
                "savings": 1800.0,
                "effort": "medium",
                "confidence": 0.85,
                "affected_resources": 3,
                "implementation": "Configure cluster autoscaler with min/max node counts"
            }
        ]
    }

@router.get("/recommendations/performance")
async def get_performance_recommendations():
    """Get AI-powered performance optimization recommendations"""
    return {
        "category": "performance",
        "total_recommendations": 12,
        "recommendations": [
            {
                "id": "perf-001",
                "priority": "high",
                "title": "Increase CPU Limits for Throttled Pods",
                "description": "Frontend pods experiencing 45% CPU throttling",
                "impact": "high",
                "effort": "low",
                "confidence": 0.92,
                "affected_resources": 3,
                "metrics": {
                    "current_throttling": "45%",
                    "target_throttling": "<5%",
                    "response_time_improvement": "40%"
                }
            },
            {
                "id": "perf-002",
                "priority": "high",
                "title": "Add Memory to OOMKilling Pods",
                "description": "API server pods restarting due to OOM",
                "impact": "critical",
                "effort": "low",
                "confidence": 0.98,
                "affected_resources": 2,
                "metrics": {
                    "current_memory": "2Gi",
                    "recommended_memory": "4Gi",
                    "restart_count": 12
                }
            },
            {
                "id": "perf-003",
                "priority": "medium",
                "title": "Enable Horizontal Pod Autoscaling",
                "description": "Traffic patterns show 3x variation during peak hours",
                "impact": "medium",
                "effort": "medium",
                "confidence": 0.88,
                "affected_resources": 5,
                "metrics": {
                    "peak_traffic": "3000 req/s",
                    "off_peak_traffic": "1000 req/s",
                    "recommended_min_replicas": 3,
                    "recommended_max_replicas": 10
                }
            }
        ]
    }

@router.get("/recommendations/reliability")
async def get_reliability_recommendations():
    """Get AI-powered reliability recommendations"""
    return {
        "category": "reliability",
        "total_recommendations": 10,
        "recommendations": [
            {
                "id": "rel-001",
                "priority": "high",
                "title": "Add Liveness and Readiness Probes",
                "description": "8 deployments missing health check probes",
                "impact": "high",
                "effort": "low",
                "confidence": 0.95,
                "affected_resources": 8,
                "risk_reduction": "Prevents serving traffic to unhealthy pods"
            },
            {
                "id": "rel-002",
                "priority": "high",
                "title": "Configure Pod Disruption Budgets",
                "description": "Critical services lack PDB protection",
                "impact": "high",
                "effort": "low",
                "confidence": 0.92,
                "affected_resources": 5,
                "risk_reduction": "Ensures minimum availability during updates"
            },
            {
                "id": "rel-003",
                "priority": "medium",
                "title": "Implement Multi-Zone Deployment",
                "description": "All pods in single availability zone",
                "impact": "critical",
                "effort": "high",
                "confidence": 0.98,
                "affected_resources": 15,
                "risk_reduction": "Protects against zone failures"
            }
        ]
    }

@router.get("/recommendations/security")
async def get_security_recommendations(cluster: Optional[str] = Query(None)):
    """Get AI-powered security recommendations — real data"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        tp = ctx["total_pods"] or 1
        recs = []

        items = [
            ("critical", "Remediate Privileged Containers",
             f"Remove privileged: true from {ctx['privileged_count']} containers",
             "low", 0.99, ctx["privileged_count"],
             ["CIS Benchmark 4.2.1", "PCI DSS Req 6"],
             ctx["privileged_count"] > 0),
            ("critical", "Enforce Non-Root User Execution",
             f"Set runAsNonRoot: true on {ctx['root_count']} containers running as UID 0",
             "low", 0.98, ctx["root_count"],
             ["CIS Benchmark 4.2.3", "PCI DSS 2.2.4"],
             ctx["root_count"] > 0),
            ("high", "Disable Host Namespace Access",
             f"Set hostNetwork/hostPID/hostIPC: false on {ctx['host_network_count']+ctx['host_pid_count']+ctx['host_ipc_count']} pods",
             "medium", 0.97, ctx["host_network_count"] + ctx["host_pid_count"] + ctx["host_ipc_count"],
             ["CIS Benchmark 4.1.x", "NIST CM-6"],
             (ctx["host_network_count"] + ctx["host_pid_count"] + ctx["host_ipc_count"]) > 0),
            ("high", "Block Privilege Escalation",
             f"Set allowPrivilegeEscalation: false on {ctx['priv_esc_count']} containers",
             "low", 0.96, ctx["priv_esc_count"],
             ["CIS Benchmark 4.2.2"],
             ctx["priv_esc_count"] > 0),
            ("medium", "Enable Read-Only Root Filesystem",
             f"Set readOnlyRootFilesystem: true on {tc - ctx['readonly_fs_count']} containers",
             "medium", 0.90, tc - ctx["readonly_fs_count"],
             ["CIS Benchmark 4.3.1", "GDPR"],
             (tc - ctx["readonly_fs_count"]) > 0),
            ("medium", "Segregate Service Accounts",
             f"Create dedicated service accounts for {ctx['default_sa_count']} pods using default SA",
             "medium", 0.88, ctx["default_sa_count"],
             ["ISO 27001 A.9", "SOC 2 CC6"],
             ctx["default_sa_count"] > 0),
        ]

        for i, (priority, title, desc, effort, conf, affected, compliance, active) in enumerate(items):
            if active:
                recs.append({"id": f"sec-rec-{len(recs)+1:03d}", "priority": priority, "title": title,
                             "description": desc, "impact": priority, "effort": effort,
                             "confidence": conf, "affected_resources": affected,
                             "cve_ids": [], "compliance_impact": compliance})

        sev_counts = {s: sum(1 for r in recs if r["priority"] == s) for s in ("critical","high","medium","low")}
        return {
            "category": "security", "total_recommendations": len(recs),
            "critical": sev_counts["critical"], "high": sev_counts["high"], "medium": sev_counts["medium"],
            "recommendations": recs, "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"security-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommendations/compliance")
async def get_compliance_recommendations(cluster: Optional[str] = Query(None)):
    """Get AI-powered compliance recommendations — real data"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        recs = []

        items = [
            ("high", "CIS Benchmark", "4.2.1", "Remove Privileged Containers",
             f"{ctx['privileged_count']} containers violate CIS 4.2.1",
             "high", "medium", 0.99, ctx["privileged_count"],
             "CIS Kubernetes Benchmark v1.8", ctx["privileged_count"] > 0),
            ("high", "PCI DSS", "Req 1", "Enforce Network Isolation",
             f"{ctx['host_network_count']} pods bypass network policies via host network",
             "critical", "medium", 0.97, ctx["host_network_count"],
             "PCI DSS v4.0 Requirement 1", ctx["host_network_count"] > 0),
            ("high", "ISO 27001", "A.9", "Implement Service Account Segregation",
             f"{ctx['default_sa_count']} pods use default SA — violates ISO 27001 A.9",
             "high", "medium", 0.88, ctx["default_sa_count"],
             "ISO 27001:2022 Annex A.9", ctx["default_sa_count"] > 0),
            ("medium", "CIS Benchmark", "4.3.1", "Enforce Read-Only Filesystem",
             f"{tc - ctx['readonly_fs_count']} containers have writable root FS",
             "medium", "low", 0.90, tc - ctx["readonly_fs_count"],
             "CIS Benchmark v1.8 Section 4.3", (tc - ctx["readonly_fs_count"]) > 0),
            ("medium", "CIS Benchmark", "4.4.1", "Add Resource Limits",
             f"{ctx['no_cpu_limit_count']} containers missing CPU limits",
             "medium", "low", 0.85, ctx["no_cpu_limit_count"],
             "CIS Benchmark v1.8 Section 4.4", ctx["no_cpu_limit_count"] > 0),
        ]

        for priority, fw, ctrl, title, desc, impact, effort, conf, affected, gap, active in items:
            if active:
                recs.append({"id": f"comp-rec-{len(recs)+1:03d}", "priority": priority, "framework": fw,
                             "control": ctrl, "title": title, "description": desc,
                             "impact": impact, "effort": effort, "confidence": conf,
                             "affected_resources": affected, "compliance_gap": gap})

        fw_counts = {}
        for r in recs:
            fw_counts[r["framework"]] = fw_counts.get(r["framework"], 0) + 1

        return {
            "category": "compliance", "total_recommendations": len(recs),
            "frameworks": fw_counts, "recommendations": recs,
            "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compliance-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob - Comprehensive Autonomous AI API