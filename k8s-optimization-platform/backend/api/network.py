"""
Network API - Services, Ingress, Network Policies, and Traffic Analysis
Reads network data from agent_metrics stored in Supabase/Postgres (db_manager).
The complex audit (network-policy-audit) still requires live K8s; it returns 503
when the cluster is unreachable — that is acceptable for EC2.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import logging

from database.db import db_manager
from utils.dummy_data import get_dummy_data

logger = logging.getLogger(__name__)
router = APIRouter()


def _format_age(ts: Optional[str]) -> str:
    if not ts:
        return ""
    try:
        created = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - created
        minutes = max(int(delta.total_seconds() // 60), 0)
        if minutes < 60:    return f"{minutes}m"
        hours = minutes // 60
        if hours < 24:      return f"{hours}h"
        days = hours // 24
        if days < 30:       return f"{days}d"
        months = days // 30
        if months < 12:     return f"{months}mo"
        return f"{months // 12}y"
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ServiceModel(BaseModel):
    name: str
    namespace: str
    type: str
    cluster_ip: Optional[str] = None
    external_ips: List[str] = []
    load_balancer_ips: List[str] = []
    ports: List[Dict[str, Any]] = []
    selector: Dict[str, str] = {}
    age: str = ""
    endpoints_count: int = 0
    labels: Dict[str, str] = {}
    annotations: Dict[str, str] = {}
    created_at: str = ""
    session_affinity: Optional[str] = None
    load_balancer_ip: Optional[str] = None
    external_name: Optional[str] = None


class IngressModel(BaseModel):
    name: str
    namespace: str
    hosts: List[str]
    paths: List[Dict[str, Any]]
    tls_enabled: bool
    tls_hosts: List[str] = []
    ingress_class: Optional[str]
    address: str = ""
    ports: List[int] = []
    age: str
    labels: Dict[str, str]
    created_at: str


class NetworkPolicyModel(BaseModel):
    name: str
    namespace: str
    pod_selector: Dict[str, str]
    policy_types: List[str]
    ingress_rules_count: int
    egress_rules_count: int
    age: str
    labels: Dict[str, str]
    created_at: str


class AuditFinding(BaseModel):
    level: str          # PASS | FAIL | WARN | INFO
    check: str
    resource: str
    message: str


class NetworkPolicyAudit(BaseModel):
    score: int
    risk: str           # LOW | MEDIUM | HIGH
    cni: str
    total_namespaces: int
    covered_namespaces: int
    uncovered_namespaces: int
    total_policies: int
    findings: List[AuditFinding]


class ExternalExposureModel(BaseModel):
    service_name: str
    namespace: str
    type: str
    external_access: str
    ports: List[int]
    risk_level: str
    recommendation: str


class TrafficAnalysisModel(BaseModel):
    namespace: str
    service_count: int
    ingress_count: int
    external_services: int
    internal_services: int
    network_policies: int
    security_score: int


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_network_domain(cluster_id: Optional[str] = None) -> dict:
    if cluster_id:
        cluster_name = cluster_id
    else:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return {}
        cluster_name = clusters[0]["cluster_name"]

    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return {}

    net = metrics.get("network") or {}
    if isinstance(net, str):
        import json
        net = json.loads(net)
    return net


# ---------------------------------------------------------------------------
# Endpoints backed by agent_metrics
# ---------------------------------------------------------------------------

@router.get("/services", response_model=List[ServiceModel])
async def get_services(
    namespace: Optional[str] = None,
    cluster_id: Optional[str] = Query(None),
):
    """Get all Kubernetes Services from agent_metrics network domain."""
    try:
        net = _get_network_domain(cluster_id)
        items = (net.get("services") or {}).get("items", [])

        if not items:
            return []

        result = []
        for svc in items:
            if namespace and svc.get("namespace") != namespace:
                continue
            created = svc.get("created") or svc.get("created_at", "")
            result.append(ServiceModel(
                name=svc.get("name", ""),
                namespace=svc.get("namespace", ""),
                type=svc.get("type", "ClusterIP"),
                cluster_ip=svc.get("cluster_ip"),
                external_ips=svc.get("external_ips") or [],
                load_balancer_ips=svc.get("load_balancer_ips") or [],
                ports=svc.get("ports", []),
                selector=svc.get("selector", {}),
                age=_format_age(created),
                endpoints_count=svc.get("endpoints_count", 0),
                labels=svc.get("labels", {}),
                annotations=svc.get("annotations", {}),
                created_at=created,
                session_affinity=svc.get("session_affinity"),
                load_balancer_ip=svc.get("load_balancer_ip"),
                external_name=svc.get("external_name"),
            ))
        return result
    except Exception as e:
        logger.error(f"Error fetching services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ingress", response_model=List[IngressModel])
async def get_ingress(
    namespace: Optional[str] = None,
    cluster_id: Optional[str] = Query(None),
):
    """Get all Ingress resources from agent_metrics network domain."""
    try:
        net = _get_network_domain(cluster_id)
        items = (net.get("ingresses") or {}).get("items", [])

        if not items:
            return []

        result = []
        for ing in items:
            if namespace and ing.get("namespace") != namespace:
                continue
            created = ing.get("created") or ing.get("created_at", "")

            # Agent may store hosts directly or derive from rules
            hosts = ing.get("hosts") or []
            if not hosts:
                hosts = list({
                    r.get("host", "") for r in ing.get("rules", [])
                    if r.get("host")
                })

            # Paths: agent stores as list of {host,path,path_type,service,port}
            # or old format list of {host,path,service}
            paths = ing.get("paths") or []
            if not paths:
                paths = [
                    {
                        "host":      r.get("host", "*"),
                        "path":      r.get("path", "/"),
                        "path_type": r.get("path_type", "Prefix"),
                        "service":   r.get("service", ""),
                        "port":      r.get("port"),
                    }
                    for r in ing.get("rules", [])
                ]

            # TLS: agent may store bool directly or as list
            tls_enabled = ing.get("tls_enabled", False)
            if not tls_enabled:
                tls_enabled = bool(ing.get("tls"))

            # Ports: derive from TLS + having paths if not stored
            ports = ing.get("ports") or []
            if not ports:
                ports = [80]
                if tls_enabled:
                    ports.append(443)

            # Ingress class: agent stores as "ingress_class" or "class"
            ingress_class = (
                ing.get("ingress_class")
                or ing.get("class")
                or None
            )

            result.append(IngressModel(
                name=ing.get("name", ""),
                namespace=ing.get("namespace", ""),
                hosts=hosts,
                paths=paths,
                tls_enabled=tls_enabled,
                tls_hosts=ing.get("tls_hosts", []),
                ingress_class=ingress_class or None,
                address=ing.get("address", ""),
                ports=ports,
                age=_format_age(created),
                labels=ing.get("labels", {}),
                created_at=created,
            ))
        return result
    except Exception as e:
        logger.error(f"Error fetching ingress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/network-policies", response_model=List[NetworkPolicyModel])
async def get_network_policies(namespace: Optional[str] = None,
                                cluster_id: Optional[str] = Query(None)):
    """Get all Network Policies from agent_metrics network domain."""
    try:
        net = _get_network_domain(cluster_id)
        items = (net.get("network_policies") or {}).get("items", [])

        result = []
        for pol in items:
            if namespace and pol.get("namespace") != namespace:
                continue
            # Agent stores created_at as "created", rule counts as "ingress_rules"/"egress_rules"
            created = pol.get("created") or pol.get("created_at", "")
            ingress_count = pol.get("ingress_rules_count") or pol.get("ingress_rules", 0)
            egress_count  = pol.get("egress_rules_count")  or pol.get("egress_rules",  0)
            result.append(NetworkPolicyModel(
                name=pol.get("name", ""),
                namespace=pol.get("namespace", ""),
                pod_selector=pol.get("pod_selector", {}),
                policy_types=pol.get("policy_types", []),
                ingress_rules_count=ingress_count,
                egress_rules_count=egress_count,
                age=pol.get("age") or _format_age(created),
                labels=pol.get("labels", {}),
                created_at=created,
            ))
        return result
    except Exception as e:
        logger.error(f"Error fetching network policies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Audit helpers (static analysis from agent_metrics)
# ---------------------------------------------------------------------------

_SENSITIVE_NS = {
    "kube-system", "calico-system", "calico-apiserver",
    "ingress-nginx", "monitoring", "cert-manager",
}


def _labels_match(selector: dict, labels: Dict) -> bool:
    labels = labels or {}
    return all(labels.get(k) == v for k, v in (selector or {}).items())


@router.get("/network-policy-audit", response_model=NetworkPolicyAudit)
async def get_network_policy_audit(cluster_id: Optional[str] = Query(None)):
    """
    Full static network-policy security audit derived from agent_metrics.
    Checks: namespace coverage, default-deny, policy rule inspection,
    sensitive namespace coverage, CNI detection.
    """
    try:
        net = _get_network_domain(cluster_id)

        # Gather namespaces from pods domain
        clusters = db_manager.get_all_clusters()
        if not clusters:
            raise HTTPException(status_code=503, detail="No cluster data available")
        cn = cluster_id or clusters[0]["cluster_name"]
        metrics = db_manager.get_latest_metrics(cn)
        if not metrics:
            raise HTTPException(status_code=503, detail="No metrics available")

        # Namespaces from namespaces domain
        ns_domain = metrics.get("namespaces") or {}
        if isinstance(ns_domain, str):
            import json
            ns_domain = json.loads(ns_domain)
        namespaces = [n.get("name", "") for n in ns_domain.get("items", [])]

        # Pods list (flat, for pod-coverage check)
        pods_domain = metrics.get("pods") or {}
        if isinstance(pods_domain, str):
            import json
            pods_domain = json.loads(pods_domain)
        pods = pods_domain.get("items", [])

        policies = (net.get("network_policies") or {}).get("items", [])

        # Index policies by namespace
        pol_by_ns: Dict[str, list] = {}
        for p in policies:
            pol_by_ns.setdefault(p.get("namespace", ""), []).append(p)

        findings: List[AuditFinding] = []
        score = 100

        # Check 1 — Namespace coverage
        for ns in namespaces:
            if ns not in pol_by_ns:
                findings.append(AuditFinding(
                    level="FAIL", check="Namespace Coverage",
                    resource=ns, message="No NetworkPolicy in this namespace",
                ))
                score -= 2
            else:
                findings.append(AuditFinding(
                    level="PASS", check="Namespace Coverage",
                    resource=ns, message=f"{len(pol_by_ns[ns])} policy(s) present",
                ))

        # Check 2 — Default deny
        for ns, plist in pol_by_ns.items():
            has_default_deny = any(
                not (p.get("pod_selector") or {}) and p.get("policy_types")
                for p in plist
            )
            if has_default_deny:
                findings.append(AuditFinding(
                    level="PASS", check="Default Deny",
                    resource=ns, message="Default deny policy detected",
                ))
            else:
                findings.append(AuditFinding(
                    level="WARN", check="Default Deny",
                    resource=ns, message="No default deny policy found",
                ))
                score -= 1

        # Check 5 — Sensitive namespaces
        for ns in _SENSITIVE_NS:
            if ns in namespaces:
                if ns in pol_by_ns:
                    findings.append(AuditFinding(
                        level="PASS", check="Sensitive Namespaces",
                        resource=ns, message="Sensitive namespace has a NetworkPolicy",
                    ))
                else:
                    findings.append(AuditFinding(
                        level="FAIL", check="Sensitive Namespaces",
                        resource=ns, message="Sensitive namespace has NO NetworkPolicy",
                    ))
                    score -= 3

        # CNI detection from nodes domain
        nodes_domain = metrics.get("nodes") or {}
        if isinstance(nodes_domain, str):
            import json
            nodes_domain = json.loads(nodes_domain)
        cni = nodes_domain.get("cni", "Unknown")
        findings.append(AuditFinding(
            level="INFO", check="CNI Detection",
            resource="cluster", message=f"Detected CNI: {cni}",
        ))

        score = max(0, score)
        risk = "LOW" if score >= 90 else "MEDIUM" if score >= 70 else "HIGH"
        covered_ns = len([ns for ns in namespaces if ns in pol_by_ns])
        uncovered_ns = len(namespaces) - covered_ns

        return NetworkPolicyAudit(
            score=score, risk=risk, cni=cni,
            total_namespaces=len(namespaces),
            covered_namespaces=covered_ns,
            uncovered_namespaces=uncovered_ns,
            total_policies=len(policies),
            findings=findings,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running network policy audit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/external-exposure", response_model=List[ExternalExposureModel])
async def get_external_exposure(cluster_id: Optional[str] = Query(None)):
    """Analyze external exposure from agent_metrics network domain."""
    try:
        net = _get_network_domain(cluster_id)
        services = (net.get("services") or {}).get("items", [])

        result = []
        for svc in services:
            svc_type = svc.get("type", "ClusterIP")
            if svc_type not in ("LoadBalancer", "NodePort"):
                continue
            ports = [p.get("port", 0) for p in svc.get("ports", []) if p.get("port")]
            risk_level = "High" if svc_type == "LoadBalancer" else "Medium"
            recommendation = (
                "LoadBalancer exposes service to internet. Consider using Ingress with authentication."
                if svc_type == "LoadBalancer"
                else "NodePort exposes service on all nodes. Consider using ClusterIP with Ingress."
            )
            sensitive_ports = [22, 3306, 5432, 6379, 27017]
            if any(p in sensitive_ports for p in ports):
                risk_level = "Critical"
                recommendation = "Sensitive database/SSH ports exposed externally. Immediate action required!"
            result.append(ExternalExposureModel(
                service_name=svc.get("name", ""),
                namespace=svc.get("namespace", ""),
                type=svc_type,
                external_access="Public" if svc_type == "LoadBalancer" else "Node-level",
                ports=ports,
                risk_level=risk_level,
                recommendation=recommendation,
            ))
        return sorted(result, key=lambda x: {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}.get(x.risk_level, 4))
    except Exception as e:
        logger.error(f"Error analyzing external exposure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic-analysis", response_model=List[TrafficAnalysisModel])
async def get_traffic_analysis(cluster_id: Optional[str] = Query(None)):
    """Analyze network traffic patterns by namespace from agent_metrics."""
    try:
        net = _get_network_domain(cluster_id)
        services = (net.get("services") or {}).get("items", [])
        ingresses = (net.get("ingresses") or {}).get("items", [])
        policies = (net.get("network_policies") or {}).get("items", [])

        if not services:
            return []

        namespace_data: Dict[str, Dict[str, int]] = {}

        for svc in services:
            ns = svc.get("namespace", "default")
            if ns not in namespace_data:
                namespace_data[ns] = {
                    "service_count": 0, "external_services": 0,
                    "internal_services": 0, "ingress_count": 0, "network_policies": 0,
                }
            namespace_data[ns]["service_count"] += 1
            if svc.get("type") in ("LoadBalancer", "NodePort"):
                namespace_data[ns]["external_services"] += 1
            else:
                namespace_data[ns]["internal_services"] += 1

        for ing in ingresses:
            ns = ing.get("namespace", "default")
            namespace_data.setdefault(ns, {
                "service_count": 0, "external_services": 0,
                "internal_services": 0, "ingress_count": 0, "network_policies": 0,
            })
            namespace_data[ns]["ingress_count"] += 1

        for pol in policies:
            ns = pol.get("namespace", "default")
            if ns in namespace_data:
                namespace_data[ns]["network_policies"] += 1

        result = []
        for ns, data in namespace_data.items():
            score = 50
            if data.get("network_policies", 0) > 0:
                score += 30
            if data.get("external_services", 0) > 0:
                score -= 20
            if data.get("ingress_count", 0) > 0:
                score += 20
            score = max(0, min(100, score))
            result.append(TrafficAnalysisModel(
                namespace=ns,
                service_count=data["service_count"],
                ingress_count=data.get("ingress_count", 0),
                external_services=data.get("external_services", 0),
                internal_services=data.get("internal_services", 0),
                network_policies=data.get("network_policies", 0),
                security_score=score,
            ))
        return sorted(result, key=lambda x: x.service_count, reverse=True)
    except Exception as e:
        logger.error(f"Error in traffic analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob
