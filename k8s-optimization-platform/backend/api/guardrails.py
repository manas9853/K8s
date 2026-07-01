"""
CI/CD Cost Guardrails API
Prevent waste before deployment by analyzing resource requests
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

router = APIRouter()


class ResourceRequest(BaseModel):
    """Resource request definition"""
    cpu: str
    memory: str
    replicas: int = 1


class DeploymentSpec(BaseModel):
    """Deployment specification for analysis"""
    name: str
    namespace: str
    cluster: str
    containers: List[Dict[str, Any]]
    replicas: int = 1


class GuardrailViolation(BaseModel):
    """Guardrail violation"""
    severity: str  # critical, high, medium, low
    rule: str
    message: str
    current_value: Any
    recommended_value: Any
    potential_savings: float
    impact: str


class GuardrailAnalysis(BaseModel):
    """Complete guardrail analysis result"""
    deployment_name: str
    namespace: str
    cluster: str
    passed: bool
    total_violations: int
    critical_violations: int
    high_violations: int
    medium_violations: int
    low_violations: int
    violations: List[GuardrailViolation]
    estimated_monthly_cost: float
    optimized_monthly_cost: float
    potential_savings: float
    recommendations: List[str]


class GuardrailPolicy(BaseModel):
    """Guardrail policy definition"""
    policy_id: str
    name: str
    description: str
    severity: str
    enabled: bool
    threshold: Dict[str, Any]


class PolicyViolationSummary(BaseModel):
    """Summary of policy violations"""
    total_deployments_analyzed: int
    passed: int
    failed: int
    total_violations: int
    potential_monthly_savings: float
    top_violations: List[Dict[str, Any]]


# Demo guardrail policies
GUARDRAIL_POLICIES = [
    {
        "policy_id": "cpu-overprovisioning",
        "name": "CPU Overprovisioning",
        "description": "Prevent excessive CPU requests",
        "severity": "high",
        "enabled": True,
        "threshold": {
            "max_cpu_per_container": "4",
            "max_cpu_per_pod": "8"
        }
    },
    {
        "policy_id": "memory-overprovisioning",
        "name": "Memory Overprovisioning",
        "description": "Prevent excessive memory requests",
        "severity": "high",
        "enabled": True,
        "threshold": {
            "max_memory_per_container": "8Gi",
            "max_memory_per_pod": "16Gi"
        }
    },
    {
        "policy_id": "missing-limits",
        "name": "Missing Resource Limits",
        "description": "Ensure all containers have resource limits",
        "severity": "medium",
        "enabled": True,
        "threshold": {}
    },
    {
        "policy_id": "missing-requests",
        "name": "Missing Resource Requests",
        "description": "Ensure all containers have resource requests",
        "severity": "high",
        "enabled": True,
        "threshold": {}
    },
    {
        "policy_id": "excessive-replicas",
        "name": "Excessive Replicas",
        "description": "Prevent too many replicas for non-prod",
        "severity": "medium",
        "enabled": True,
        "threshold": {
            "max_replicas_dev": 3,
            "max_replicas_staging": 5,
            "max_replicas_prod": 20
        }
    },
    {
        "policy_id": "cost-threshold",
        "name": "Monthly Cost Threshold",
        "description": "Alert when deployment exceeds cost threshold",
        "severity": "high",
        "enabled": True,
        "threshold": {
            "max_monthly_cost_dev": 500,
            "max_monthly_cost_staging": 2000,
            "max_monthly_cost_prod": 10000
        }
    }
]

# Demo analysis results
DEMO_ANALYSES = [
    {
        "deployment_name": "analytics-worker",
        "namespace": "analytics-prod",
        "cluster": "prod-cluster-a",
        "passed": False,
        "total_violations": 3,
        "critical_violations": 0,
        "high_violations": 2,
        "medium_violations": 1,
        "low_violations": 0,
        "violations": [
            {
                "severity": "high",
                "rule": "CPU Overprovisioning",
                "message": "CPU request of 8 cores exceeds recommended 4 cores",
                "current_value": "8",
                "recommended_value": "4",
                "potential_savings": 240.0,
                "impact": "High cost with low utilization"
            },
            {
                "severity": "high",
                "rule": "Memory Overprovisioning",
                "message": "Memory request of 16Gi exceeds recommended 8Gi",
                "current_value": "16Gi",
                "recommended_value": "8Gi",
                "potential_savings": 180.0,
                "impact": "Wasted memory allocation"
            },
            {
                "severity": "medium",
                "rule": "Missing Resource Limits",
                "message": "Container 'worker' missing CPU limit",
                "current_value": None,
                "recommended_value": "4",
                "potential_savings": 0,
                "impact": "Potential resource contention"
            }
        ],
        "estimated_monthly_cost": 1200.0,
        "optimized_monthly_cost": 780.0,
        "potential_savings": 420.0,
        "recommendations": [
            "Reduce CPU request from 8 to 4 cores",
            "Reduce memory request from 16Gi to 8Gi",
            "Add CPU limit of 4 cores",
            "Monitor actual usage after deployment"
        ]
    },
    {
        "deployment_name": "frontend-app",
        "namespace": "frontend-prod",
        "cluster": "prod-cluster-a",
        "passed": True,
        "total_violations": 0,
        "critical_violations": 0,
        "high_violations": 0,
        "medium_violations": 0,
        "low_violations": 0,
        "violations": [],
        "estimated_monthly_cost": 450.0,
        "optimized_monthly_cost": 450.0,
        "potential_savings": 0,
        "recommendations": [
            "Resource allocation is optimal",
            "Continue monitoring usage patterns"
        ]
    }
]


@router.post("/analyze", response_model=GuardrailAnalysis)
async def analyze_deployment(spec: DeploymentSpec):
    """Analyze deployment spec against guardrails"""
    
    violations = []
    total_cpu = 0
    total_memory = 0
    
    # Analyze each container
    for container in spec.containers:
        resources = container.get("resources", {})
        requests = resources.get("requests", {})
        limits = resources.get("limits", {})
        
        cpu_request = requests.get("cpu", "0")
        memory_request = requests.get("memory", "0")
        
        # Check CPU overprovisioning
        if cpu_request and float(cpu_request.replace("m", "")) > 4000:
            violations.append({
                "severity": "high",
                "rule": "CPU Overprovisioning",
                "message": f"CPU request {cpu_request} exceeds 4 cores",
                "current_value": cpu_request,
                "recommended_value": "4",
                "potential_savings": 200.0,
                "impact": "High cost with potential low utilization"
            })
        
        # Check memory overprovisioning
        if memory_request and "Gi" in memory_request:
            mem_value = float(memory_request.replace("Gi", ""))
            if mem_value > 8:
                violations.append({
                    "severity": "high",
                    "rule": "Memory Overprovisioning",
                    "message": f"Memory request {memory_request} exceeds 8Gi",
                    "current_value": memory_request,
                    "recommended_value": "8Gi",
                    "potential_savings": 150.0,
                    "impact": "Wasted memory allocation"
                })
        
        # Check missing limits
        if not limits.get("cpu"):
            violations.append({
                "severity": "medium",
                "rule": "Missing Resource Limits",
                "message": f"Container '{container.get('name')}' missing CPU limit",
                "current_value": None,
                "recommended_value": "Set appropriate limit",
                "potential_savings": 0,
                "impact": "Potential resource contention"
            })
    
    # Calculate costs
    estimated_cost = 800.0  # Demo value
    optimized_cost = estimated_cost - sum(v["potential_savings"] for v in violations)
    
    passed = len(violations) == 0
    
    return {
        "deployment_name": spec.name,
        "namespace": spec.namespace,
        "cluster": spec.cluster,
        "passed": passed,
        "total_violations": len(violations),
        "critical_violations": len([v for v in violations if v["severity"] == "critical"]),
        "high_violations": len([v for v in violations if v["severity"] == "high"]),
        "medium_violations": len([v for v in violations if v["severity"] == "medium"]),
        "low_violations": len([v for v in violations if v["severity"] == "low"]),
        "violations": violations,
        "estimated_monthly_cost": estimated_cost,
        "optimized_monthly_cost": optimized_cost,
        "potential_savings": estimated_cost - optimized_cost,
        "recommendations": [
            "Review and optimize resource requests",
            "Add resource limits to all containers",
            "Monitor actual usage after deployment"
        ]
    }


@router.get("/policies", response_model=List[GuardrailPolicy])
async def get_policies():
    """Get all guardrail policies"""
    return GUARDRAIL_POLICIES


@router.get("/policies/{policy_id}", response_model=GuardrailPolicy)
async def get_policy(policy_id: str):
    """Get specific guardrail policy"""
    for policy in GUARDRAIL_POLICIES:
        if policy["policy_id"] == policy_id:
            return policy
    raise HTTPException(status_code=404, detail="Policy not found")


@router.put("/policies/{policy_id}")
async def update_policy(policy_id: str, policy: GuardrailPolicy):
    """Update guardrail policy"""
    return {
        "success": True,
        "message": f"Policy {policy_id} updated successfully",
        "policy": policy
    }


@router.get("/analyses", response_model=List[GuardrailAnalysis])
async def get_analyses(
    cluster: str = None,
    namespace: str = None,
    passed: bool = None
):
    """Get historical guardrail analyses"""
    analyses = DEMO_ANALYSES
    
    if cluster:
        analyses = [a for a in analyses if a["cluster"] == cluster]
    if namespace:
        analyses = [a for a in analyses if a["namespace"] == namespace]
    if passed is not None:
        analyses = [a for a in analyses if a["passed"] == passed]
    
    return analyses


@router.get("/summary", response_model=PolicyViolationSummary)
async def get_violation_summary():
    """Get summary of policy violations"""
    
    total = len(DEMO_ANALYSES)
    passed = len([a for a in DEMO_ANALYSES if a["passed"]])
    failed = total - passed
    total_violations = sum(a["total_violations"] for a in DEMO_ANALYSES)
    potential_savings = sum(a["potential_savings"] for a in DEMO_ANALYSES)
    
    # Get top violations
    all_violations = []
    for analysis in DEMO_ANALYSES:
        for violation in analysis["violations"]:
            all_violations.append({
                "deployment": analysis["deployment_name"],
                "namespace": analysis["namespace"],
                "rule": violation["rule"],
                "severity": violation["severity"],
                "savings": violation["potential_savings"]
            })
    
    top_violations = sorted(
        all_violations,
        key=lambda x: x["savings"],
        reverse=True
    )[:10]
    
    return {
        "total_deployments_analyzed": total,
        "passed": passed,
        "failed": failed,
        "total_violations": total_violations,
        "potential_monthly_savings": potential_savings,
        "top_violations": top_violations
    }


@router.post("/webhook")
async def webhook_handler(payload: Dict[str, Any]):
    """
    Webhook endpoint for CI/CD integration
    Receives deployment specs from CI/CD pipelines
    """
    
    # Extract deployment info
    deployment_name = payload.get("deployment", {}).get("name", "unknown")
    namespace = payload.get("namespace", "default")
    
    # Analyze deployment
    violations = []
    
    # Demo violation
    if "prod" in namespace:
        violations.append({
            "severity": "high",
            "rule": "CPU Overprovisioning",
            "message": "CPU request exceeds recommended limits",
            "potential_savings": 300.0
        })
    
    passed = len(violations) == 0
    
    return {
        "success": True,
        "deployment": deployment_name,
        "namespace": namespace,
        "passed": passed,
        "violations": violations,
        "message": "Deployment passed guardrails" if passed else "Deployment has violations",
        "action": "proceed" if passed else "review_required"
    }


@router.get("/integration/github")
async def get_github_integration():
    """Get GitHub Actions integration config"""
    return {
        "integration_type": "github_actions",
        "webhook_url": "/api/v1/guardrails/webhook",
        "sample_workflow": """
name: K8s Cost Guardrails
on: [pull_request]
jobs:
  cost-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Analyze K8s Manifests
        run: |
          curl -X POST https://your-platform.com/api/v1/guardrails/analyze \\
            -H "Content-Type: application/json" \\
            -d @deployment.json
        """
    }


@router.get("/integration/gitlab")
async def get_gitlab_integration():
    """Get GitLab CI integration config"""
    return {
        "integration_type": "gitlab_ci",
        "webhook_url": "/api/v1/guardrails/webhook",
        "sample_pipeline": """
cost-guardrails:
  stage: validate
  script:
    - curl -X POST https://your-platform.com/api/v1/guardrails/analyze \\
        -H "Content-Type: application/json" \\
        -d @deployment.json
  only:
    - merge_requests
        """
    }


@router.get("/stats")
async def get_guardrail_stats():
    """Get guardrail statistics"""
    return {
        "total_checks_today": 45,
        "passed_today": 32,
        "failed_today": 13,
        "total_savings_prevented": 12500.0,
        "most_common_violation": "CPU Overprovisioning",
        "avg_check_time_ms": 150,
        "policies_enabled": len([p for p in GUARDRAIL_POLICIES if p["enabled"]]),
        "total_policies": len(GUARDRAIL_POLICIES)
    }

# Made with Bob
