"""
Network API - Services, Ingress, Network Policies, and Traffic Analysis
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import logging
from utils.dummy_data import get_dummy_data, get_dummy_metrics

# Import Kubernetes client
try:
    from services.k8s_client import k8s_client
    K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()
except Exception as e:
    K8S_AVAILABLE = False
    k8s_client = None
    logging.warning(f"Kubernetes client not available: {e}")

logger = logging.getLogger(__name__)
router = APIRouter()


class ServiceModel(BaseModel):
    """Kubernetes Service model"""
    name: str
    namespace: str
    type: str
    cluster_ip: Optional[str] = None
    external_ips: List[str] = []
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
    """Kubernetes Ingress model"""
    name: str
    namespace: str
    hosts: List[str]
    paths: List[Dict[str, Any]]
    tls_enabled: bool
    ingress_class: Optional[str]
    age: str
    labels: Dict[str, str]
    created_at: str


class NetworkPolicyModel(BaseModel):
    """Network Policy model"""
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
    """A single finding from the network policy audit"""
    level: str          # PASS | FAIL | WARN | INFO
    check: str          # e.g. "Namespace Coverage"
    resource: str       # namespace or namespace/policy-name
    message: str


class NetworkPolicyAudit(BaseModel):
    """Full network policy audit result"""
    score: int
    risk: str           # LOW | MEDIUM | HIGH
    cni: str
    total_namespaces: int
    covered_namespaces: int
    uncovered_namespaces: int
    total_policies: int
    findings: List[AuditFinding]


class ExternalExposureModel(BaseModel):
    """External exposure analysis"""
    service_name: str
    namespace: str
    type: str
    external_access: str
    ports: List[int]
    risk_level: str
    recommendation: str


class TrafficAnalysisModel(BaseModel):
    """Traffic analysis model"""
    namespace: str
    service_count: int
    ingress_count: int
    external_services: int
    internal_services: int
    network_policies: int
    security_score: int


@router.get("/services", response_model=List[ServiceModel])
async def get_services(
    namespace: Optional[str] = None,
    cluster_id: Optional[str] = Query(None),
):
    """Get all Kubernetes Services — cluster-scoped."""
    if not K8S_AVAILABLE or k8s_client is None:
        raw = get_dummy_data("services", cluster_id)
        return [ServiceModel(**d) for d in raw]
    
    try:
        v1 = k8s_client.get_core_api()
        
        if namespace:
            services = v1.list_namespaced_service(namespace)
        else:
            services = v1.list_service_for_all_namespaces()
        
        result = []
        for svc in services.items:
            # Calculate age
            created = svc.metadata.creation_timestamp
            age_delta = datetime.now(created.tzinfo) - created
            age = f"{age_delta.days}d"
            
            # Get endpoints count
            endpoints_count = 0
            try:
                endpoints = v1.read_namespaced_endpoints(
                    svc.metadata.name,
                    svc.metadata.namespace
                )
                if endpoints.subsets:
                    for subset in endpoints.subsets:
                        if subset.addresses:
                            endpoints_count += len(subset.addresses)
            except Exception as e:
                logger.debug(f"No endpoints for {svc.metadata.name}: {e}")
            
            # Parse ports
            ports = []
            if svc.spec.ports:
                for port in svc.spec.ports:
                    ports.append({
                        "name": port.name or "",
                        "port": port.port,
                        "target_port": str(port.target_port) if port.target_port else "",
                        "protocol": port.protocol or "TCP",
                        "node_port": port.node_port if port.node_port else None
                    })
            
            result.append(ServiceModel(
                name=svc.metadata.name,
                namespace=svc.metadata.namespace,
                type=svc.spec.type or "ClusterIP",
                cluster_ip=svc.spec.cluster_ip,
                external_ips=svc.spec.external_i_ps or [],
                ports=ports,
                selector=svc.spec.selector or {},
                age=age,
                endpoints_count=endpoints_count,
                labels=svc.metadata.labels or {},
                created_at=created.isoformat()
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
    """Get all Ingress resources — cluster-scoped."""
    if not K8S_AVAILABLE or k8s_client is None:
        raw = get_dummy_data("ingresses", cluster_id)
        return [IngressModel(**d) for d in raw]
    
    try:
        networking_v1 = k8s_client.get_networking_api()
        
        if namespace:
            ingresses = networking_v1.list_namespaced_ingress(namespace)
        else:
            ingresses = networking_v1.list_ingress_for_all_namespaces()
        
        result = []
        for ing in ingresses.items:
            # Calculate age
            created = ing.metadata.creation_timestamp
            age_delta = datetime.now(created.tzinfo) - created
            age = f"{age_delta.days}d"
            
            # Parse hosts and paths
            hosts = []
            paths = []
            tls_enabled = False
            
            if ing.spec.rules:
                for rule in ing.spec.rules:
                    if rule.host:
                        hosts.append(rule.host)
                    if rule.http and rule.http.paths:
                        for path in rule.http.paths:
                            paths.append({
                                "path": path.path or "/",
                                "path_type": path.path_type or "Prefix",
                                "service": path.backend.service.name if path.backend.service else "N/A",
                                "port": path.backend.service.port.number if path.backend.service and path.backend.service.port else None
                            })
            
            if ing.spec.tls:
                tls_enabled = True
            
            result.append(IngressModel(
                name=ing.metadata.name,
                namespace=ing.metadata.namespace,
                hosts=hosts,
                paths=paths,
                tls_enabled=tls_enabled,
                ingress_class=ing.spec.ingress_class_name,
                age=age,
                labels=ing.metadata.labels or {},
                created_at=created.isoformat()
            ))
        
        return result
    except Exception as e:
        logger.error(f"Error fetching ingress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/network-policies", response_model=List[NetworkPolicyModel])
async def get_network_policies(namespace: Optional[str] = None):
    """Get all Network Policies"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return []
    
    try:
        networking_v1 = k8s_client.get_networking_api()
        
        if namespace:
            policies = networking_v1.list_namespaced_network_policy(namespace)
        else:
            policies = networking_v1.list_network_policy_for_all_namespaces()
        
        result = []
        for policy in policies.items:
            created = policy.metadata.creation_timestamp
            age_delta = datetime.now(created.tzinfo) - created
            age = f"{age_delta.days}d"
            
            ingress_count = len(policy.spec.ingress) if policy.spec.ingress else 0
            egress_count = len(policy.spec.egress) if policy.spec.egress else 0
            
            result.append(NetworkPolicyModel(
                name=policy.metadata.name,
                namespace=policy.metadata.namespace,
                pod_selector=policy.spec.pod_selector.match_labels or {} if policy.spec.pod_selector else {},
                policy_types=policy.spec.policy_types or [],
                ingress_rules_count=ingress_count,
                egress_rules_count=egress_count,
                age=age,
                labels=policy.metadata.labels or {},
                created_at=created.isoformat()
            ))
        
        return result
    except Exception as e:
        logger.error(f"Error fetching network policies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Audit helpers
# ---------------------------------------------------------------------------

_SENSITIVE_NS = {
    "kube-system", "calico-system", "calico-apiserver",
    "ingress-nginx", "monitoring", "cert-manager",
}

def _labels_match(selector, labels: Dict) -> bool:
    """Return True if all selector match_labels are present in labels."""
    if selector is None:
        return True
    ml = selector.match_labels or {}
    labels = labels or {}
    return all(labels.get(k) == v for k, v in ml.items())


@router.get("/network-policy-audit", response_model=NetworkPolicyAudit)
async def get_network_policy_audit():
    """
    Full static network-policy security audit — mirrors the 6-check audit script:
    1. Namespace coverage
    2. Default-deny presence
    3. Pod coverage
    4. Policy rule inspection (open CIDRs, empty selectors, missing ports/protocols)
    5. Sensitive namespace coverage
    6. CNI detection
    Returns a 0-100 score and risk band (LOW / MEDIUM / HIGH).
    """
    if not K8S_AVAILABLE or k8s_client is None:
        raise HTTPException(status_code=503, detail="Kubernetes cluster not available")

    try:
        v1          = k8s_client.get_core_api()
        networking  = k8s_client.get_networking_api()

        namespaces  = [n.metadata.name for n in v1.list_namespace().items]
        pods        = v1.list_pod_for_all_namespaces().items
        policies    = networking.list_network_policy_for_all_namespaces().items

        # Index policies by namespace
        pol_by_ns: Dict[str, list] = {}
        for p in policies:
            pol_by_ns.setdefault(p.metadata.namespace, []).append(p)

        findings: List[AuditFinding] = []
        score = 100

        # ------------------------------------------------------------------
        # Check 1 — Namespace coverage
        # ------------------------------------------------------------------
        for ns in namespaces:
            if ns not in pol_by_ns:
                findings.append(AuditFinding(
                    level="FAIL", check="Namespace Coverage",
                    resource=ns, message="No NetworkPolicy in this namespace"
                ))
                score -= 2
            else:
                findings.append(AuditFinding(
                    level="PASS", check="Namespace Coverage",
                    resource=ns,
                    message=f"{len(pol_by_ns[ns])} policy(s) present"
                ))

        # ------------------------------------------------------------------
        # Check 2 — Default deny
        # ------------------------------------------------------------------
        for ns, plist in pol_by_ns.items():
            has_default_deny = any(
                (not (p.spec.pod_selector.match_labels or {})) and p.spec.policy_types
                for p in plist
            )
            if has_default_deny:
                findings.append(AuditFinding(
                    level="PASS", check="Default Deny",
                    resource=ns, message="Default deny policy detected"
                ))
            else:
                findings.append(AuditFinding(
                    level="WARN", check="Default Deny",
                    resource=ns, message="No default deny policy found"
                ))
                score -= 1

        # ------------------------------------------------------------------
        # Check 3 — Pod coverage
        # ------------------------------------------------------------------
        for pod in pods:
            ns = pod.metadata.namespace
            covered = any(
                _labels_match(p.spec.pod_selector, pod.metadata.labels or {})
                for p in pol_by_ns.get(ns, [])
            )
            if not covered:
                findings.append(AuditFinding(
                    level="FAIL", check="Pod Coverage",
                    resource=f"{ns}/{pod.metadata.name}",
                    message="Pod not covered by any NetworkPolicy"
                ))
                score -= 1

        # ------------------------------------------------------------------
        # Check 4 — Policy rule inspection
        # ------------------------------------------------------------------
        for p in policies:
            pname = f"{p.metadata.namespace}/{p.metadata.name}"
            spec  = p.spec

            # Empty podSelector = applies to all pods (informational)
            if spec.pod_selector and not (spec.pod_selector.match_labels or {}):
                findings.append(AuditFinding(
                    level="INFO", check="Policy Inspection",
                    resource=pname, message="Empty podSelector — applies to all pods in namespace"
                ))

            # Ingress rules
            for rule in (spec.ingress or []):
                if not rule.ports:
                    findings.append(AuditFinding(
                        level="WARN", check="Policy Inspection",
                        resource=pname, message="Ingress rule has no explicit ports (all ports allowed)"
                    ))
                    score -= 1
                else:
                    for port in rule.ports:
                        if port.protocol is None:
                            findings.append(AuditFinding(
                                level="WARN", check="Policy Inspection",
                                resource=pname, message="Ingress port missing protocol"
                            ))
                            score -= 1

                for src in (rule._from or []):
                    if src.namespace_selector and not (src.namespace_selector.match_labels or {}):
                        findings.append(AuditFinding(
                            level="FAIL", check="Policy Inspection",
                            resource=pname, message="Ingress allows traffic from ANY namespace (empty namespaceSelector)"
                        ))
                        score -= 2
                    if src.ip_block and src.ip_block.cidr in ("0.0.0.0/0", "::/0"):
                        findings.append(AuditFinding(
                            level="FAIL", check="Policy Inspection",
                            resource=pname, message=f"World-open ingress CIDR: {src.ip_block.cidr}"
                        ))
                        score -= 5

            # Egress rules
            for rule in (spec.egress or []):
                if not rule.ports:
                    findings.append(AuditFinding(
                        level="WARN", check="Policy Inspection",
                        resource=pname, message="Egress rule has no explicit ports (all ports allowed)"
                    ))
                    score -= 1
                else:
                    for port in rule.ports:
                        if port.protocol is None:
                            findings.append(AuditFinding(
                                level="WARN", check="Policy Inspection",
                                resource=pname, message="Egress port missing protocol"
                            ))
                            score -= 1

                for dst in (rule.to or []):
                    if dst.namespace_selector and not (dst.namespace_selector.match_labels or {}):
                        findings.append(AuditFinding(
                            level="FAIL", check="Policy Inspection",
                            resource=pname, message="Egress allows traffic to ANY namespace (empty namespaceSelector)"
                        ))
                        score -= 2
                    if dst.ip_block:
                        if dst.ip_block.cidr in ("0.0.0.0/0", "::/0"):
                            findings.append(AuditFinding(
                                level="FAIL", check="Policy Inspection",
                                resource=pname, message=f"World-open egress CIDR: {dst.ip_block.cidr}"
                            ))
                            score -= 5
                        if dst.ip_block.cidr.startswith("169.254.169.254"):
                            findings.append(AuditFinding(
                                level="FAIL", check="Policy Inspection",
                                resource=pname, message="Egress allows access to metadata endpoint (169.254.169.254)"
                            ))
                            score -= 3

        # ------------------------------------------------------------------
        # Check 5 — Sensitive namespaces
        # ------------------------------------------------------------------
        for ns in _SENSITIVE_NS:
            if ns in namespaces:
                if ns in pol_by_ns:
                    findings.append(AuditFinding(
                        level="PASS", check="Sensitive Namespaces",
                        resource=ns, message="Sensitive namespace has a NetworkPolicy"
                    ))
                else:
                    findings.append(AuditFinding(
                        level="FAIL", check="Sensitive Namespaces",
                        resource=ns, message="Sensitive namespace has NO NetworkPolicy"
                    ))
                    score -= 3

        # ------------------------------------------------------------------
        # Check 6 — CNI detection
        # ------------------------------------------------------------------
        cni = "Unknown"
        try:
            kube_pods = v1.list_namespaced_pod("kube-system").items
            for kp in kube_pods:
                n = kp.metadata.name.lower()
                if "calico" in n:
                    cni = "Calico"; break
                elif "cilium" in n:
                    cni = "Cilium"; break
                elif "antrea" in n:
                    cni = "Antrea"; break
                elif "weave" in n:
                    cni = "Weave"; break
        except Exception:
            pass

        score = max(0, score)
        risk  = "LOW" if score >= 90 else "MEDIUM" if score >= 70 else "HIGH"

        covered_ns   = len([ns for ns in namespaces if ns in pol_by_ns])
        uncovered_ns = len(namespaces) - covered_ns

        return NetworkPolicyAudit(
            score=score,
            risk=risk,
            cni=cni,
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
async def get_external_exposure():
    """Analyze external exposure and security risks"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return []
    
    try:
        v1 = k8s_client.get_core_api()
        
        services = v1.list_service_for_all_namespaces()
        
        result = []
        for svc in services.items:
            # Check for external exposure
            if svc.spec.type in ["LoadBalancer", "NodePort"]:
                ports = [port.port for port in svc.spec.ports] if svc.spec.ports else []
                
                # Determine risk level
                risk_level = "Low"
                recommendation = "Service is externally exposed"
                
                if svc.spec.type == "LoadBalancer":
                    risk_level = "High"
                    recommendation = "LoadBalancer exposes service to internet. Consider using Ingress with authentication."
                elif svc.spec.type == "NodePort":
                    risk_level = "Medium"
                    recommendation = "NodePort exposes service on all nodes. Consider using ClusterIP with Ingress."
                
                # Check for sensitive ports
                sensitive_ports = [22, 3306, 5432, 6379, 27017]
                if any(port in sensitive_ports for port in ports):
                    risk_level = "Critical"
                    recommendation = "Sensitive database/SSH ports exposed externally. Immediate action required!"
                
                result.append(ExternalExposureModel(
                    service_name=svc.metadata.name,
                    namespace=svc.metadata.namespace,
                    type=svc.spec.type,
                    external_access="Public" if svc.spec.type == "LoadBalancer" else "Node-level",
                    ports=ports,
                    risk_level=risk_level,
                    recommendation=recommendation
                ))
        
        return sorted(result, key=lambda x: {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}[x.risk_level])
    except Exception as e:
        logger.error(f"Error analyzing external exposure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _build_traffic_from_dummy(cluster_id: Optional[str] = None) -> List[TrafficAnalysisModel]:
    """Build TrafficAnalysisModel list from dummy service/network-policy data."""
    import random
    services = get_dummy_data("services", cluster_id)
    ingresses = get_dummy_data("ingresses", cluster_id)
    policies = get_dummy_data("network_policies", cluster_id)

    ns_data: Dict[str, Dict[str, int]] = {}
    for svc in services:
        ns = svc["namespace"]
        ns_data.setdefault(ns, {"service_count": 0, "external_services": 0,
                                 "internal_services": 0, "ingress_count": 0, "network_policies": 0})
        ns_data[ns]["service_count"] += 1
        if svc.get("type") in ("LoadBalancer", "NodePort"):
            ns_data[ns]["external_services"] += 1
        else:
            ns_data[ns]["internal_services"] += 1
    for ing in ingresses:
        ns = ing["namespace"]
        ns_data.setdefault(ns, {"service_count": 0, "external_services": 0,
                                 "internal_services": 0, "ingress_count": 0, "network_policies": 0})
        ns_data[ns]["ingress_count"] += 1
    for pol in policies:
        ns = pol["namespace"]
        if ns in ns_data:
            ns_data[ns]["network_policies"] += 1

    result = []
    for ns, d in ns_data.items():
        score = 50
        if d["network_policies"] > 0:
            score += 30
        if d["external_services"] > 0:
            score -= 20
        if d["ingress_count"] > 0:
            score += 20
        score = max(0, min(100, score))
        result.append(TrafficAnalysisModel(
            namespace=ns,
            service_count=d["service_count"],
            ingress_count=d["ingress_count"],
            external_services=d["external_services"],
            internal_services=d["internal_services"],
            network_policies=d["network_policies"],
            security_score=score,
        ))
    return sorted(result, key=lambda x: x.service_count, reverse=True)


@router.get("/traffic-analysis", response_model=List[TrafficAnalysisModel])
async def get_traffic_analysis(cluster_id: Optional[str] = Query(None)):
    """Analyze network traffic patterns by namespace"""
    if not K8S_AVAILABLE or k8s_client is None:
        return _build_traffic_from_dummy(cluster_id)
    
    try:
        v1 = k8s_client.get_core_api()
        networking_v1 = k8s_client.get_networking_api()
        
        services = v1.list_service_for_all_namespaces()
        ingresses = networking_v1.list_ingress_for_all_namespaces()
        policies = networking_v1.list_network_policy_for_all_namespaces()
        
        # Group by namespace
        namespace_data: Dict[str, Dict[str, int]] = {}
        
        for svc in services.items:
            ns = svc.metadata.namespace
            if ns not in namespace_data:
                namespace_data[ns] = {
                    "service_count": 0,
                    "external_services": 0,
                    "internal_services": 0
                }
            namespace_data[ns]["service_count"] += 1
            if svc.spec.type in ["LoadBalancer", "NodePort"]:
                namespace_data[ns]["external_services"] += 1
            else:
                namespace_data[ns]["internal_services"] += 1
        
        # Count ingresses
        for ing in ingresses.items:
            ns = ing.metadata.namespace
            if ns in namespace_data:
                if "ingress_count" not in namespace_data[ns]:
                    namespace_data[ns]["ingress_count"] = 0
                namespace_data[ns]["ingress_count"] += 1
        
        # Count network policies
        for policy in policies.items:
            ns = policy.metadata.namespace
            if ns in namespace_data:
                if "network_policies" not in namespace_data[ns]:
                    namespace_data[ns]["network_policies"] = 0
                namespace_data[ns]["network_policies"] += 1
        
        result = []
        for ns, data in namespace_data.items():
            # Calculate security score (0-100)
            score = 50  # Base score
            
            # Add points for network policies
            if data.get("network_policies", 0) > 0:
                score += 30
            
            # Deduct points for external services
            if data.get("external_services", 0) > 0:
                score -= 20
            
            # Add points for using ingress
            if data.get("ingress_count", 0) > 0:
                score += 20
            
            score = max(0, min(100, score))  # Clamp between 0-100
            
            result.append(TrafficAnalysisModel(
                namespace=ns,
                service_count=data["service_count"],
                ingress_count=data.get("ingress_count", 0),
                external_services=data.get("external_services", 0),
                internal_services=data.get("internal_services", 0),
                network_policies=data.get("network_policies", 0),
                security_score=score
            ))
        
        return sorted(result, key=lambda x: x.service_count, reverse=True)
    except Exception as e:
        logger.error(f"Error analyzing traffic: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob
