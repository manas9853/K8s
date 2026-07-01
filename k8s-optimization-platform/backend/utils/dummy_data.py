"""
Shared dummy data generator for all API endpoints.
Uses cluster_registry.get_clusters() so every endpoint always returns
data tagged to the same cluster IDs that /api/v1/clusters returns.

Usage in any API module:
    from utils.dummy_data import get_dummy_data, filter_by_cluster

    @router.get("/deployments")
    async def list_deployments(cluster_id: Optional[str] = Query(None)):
        data = get_dummy_data("deployments", cluster_id)
        return data
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from utils.cluster_registry import get_clusters, filter_by_cluster
import random

# ── Namespaces shared across all clusters ────────────────────────────────────
NAMESPACES = ["payments", "analytics", "frontend", "backend", "monitoring", "data", "infra", "security"]

# ── Workload templates ────────────────────────────────────────────────────────
WORKLOAD_NAMES = {
    "deployments": ["api-gateway", "auth-service", "payment-processor", "analytics-engine",
                    "notification-service", "user-service", "order-service", "catalog-service",
                    "inventory-service", "recommendation-engine"],
    "statefulsets": ["postgres-primary", "redis-cluster", "kafka-broker",
                     "elasticsearch", "mongodb-replica"],
    "daemonsets":   ["fluentd-logger", "node-exporter", "datadog-agent", "calico-node"],
    "jobs":         ["db-migration", "data-export", "cache-warmup", "report-gen"],
    "cronjobs":     ["cleanup-job", "backup-job", "sync-job", "metric-rollup"],
    "services":     ["api-gateway-svc", "auth-svc", "payment-svc", "analytics-svc",
                     "frontend-svc", "backend-svc", "db-svc", "cache-svc"],
    "ingresses":    ["api-ingress", "frontend-ingress", "admin-ingress"],
    "pvcs":         ["postgres-data", "redis-data", "kafka-logs",
                     "elasticsearch-data", "mongodb-data", "prometheus-data"],
    "pvs":          ["pv-postgres", "pv-redis", "pv-kafka", "pv-elastic"],
}


def _base_ts(offset_days: int = 0) -> str:
    return (datetime.utcnow() - timedelta(days=offset_days)).isoformat()


def _seed_rand(cluster_id: str, name: str, offset: int = 0) -> random.Random:
    """Deterministic random generator — same cluster+name always produces same values."""
    rng = random.Random()
    rng.seed(hash(f"{cluster_id}-{name}-{offset}"))
    return rng


# ── Per-cluster data builders ─────────────────────────────────────────────────

def _build_deployments(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    env = cluster["environment"]
    items = []
    names = WORKLOAD_NAMES["deployments"][:6] if env == "production" else WORKLOAD_NAMES["deployments"][4:]
    for i, name in enumerate(names):
        rng = _seed_rand(cid, name)
        ns = NAMESPACES[i % len(NAMESPACES)]
        replicas = rng.choice([2, 3, 5]) if env == "production" else rng.choice([1, 2])
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": ns,
            "replicas_desired": replicas,
            "replicas_current": replicas,
            "replicas_ready": replicas,
            "replicas_available": replicas,
            "replicas_unavailable": 0,
            "strategy": "RollingUpdate",
            "age": f"{rng.randint(10, 90)}d",
            "labels": {"app": name, "env": env, "cluster": cid},
            "selector": {"app": name},
            "containers": [{"name": name, "image": f"registry.io/{name}:latest",
                            "resources": {"requests": {"cpu": "250m", "memory": "256Mi"},
                                          "limits": {"cpu": "500m", "memory": "512Mi"}}}],
            "conditions": [{"type": "Available", "status": "True"}],
            "created_at": _base_ts(rng.randint(10, 90)),
        })
    return items


def _build_statefulsets(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    env = cluster["environment"]
    items = []
    names = WORKLOAD_NAMES["statefulsets"][:4 if env == "production" else 2]
    for i, name in enumerate(names):
        rng = _seed_rand(cid, name)
        ns = NAMESPACES[i % 3]
        replicas = rng.choice([3, 5]) if env == "production" else 1
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": ns,
            "replicas_desired": replicas,
            "replicas_current": replicas,
            "replicas_ready": replicas,
            "service_name": f"{name}-headless",
            "age": f"{rng.randint(20, 120)}d",
            "labels": {"app": name, "env": env},
            "selector": {"app": name},
            "containers": [{"name": name, "image": f"registry.io/{name}:stable",
                            "resources": {"requests": {"cpu": "500m", "memory": "1Gi"}}}],
            "volume_claim_templates": [{"name": "data", "storage_class": "standard",
                                         "access_modes": ["ReadWriteOnce"], "storage": "10Gi"}],
            "created_at": _base_ts(rng.randint(20, 120)),
        })
    return items


def _build_daemonsets(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    env = cluster["environment"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["daemonsets"]):
        rng = _seed_rand(cid, name)
        nodes = {"production": 5, "staging": 3, "qa": 2, "development": 2}.get(env, 2)
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": "kube-system" if "node" in name else "monitoring",
            "desired_number_scheduled": nodes,
            "current_number_scheduled": nodes,
            "number_ready": nodes,
            "number_available": nodes,
            "number_misscheduled": 0,
            "age": f"{rng.randint(30, 180)}d",
            "labels": {"app": name, "cluster": cid},
            "selector": {"app": name},
            "containers": [{"name": name, "image": f"registry.io/{name}:latest"}],
            "created_at": _base_ts(rng.randint(30, 180)),
        })
    return items


def _build_jobs(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["jobs"]):
        rng = _seed_rand(cid, name)
        ns = NAMESPACES[i % len(NAMESPACES)]
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}-{rng.randint(100,999)}",
            "namespace": ns,
            "completions": 1,
            "parallelism": 1,
            "active": 0,
            "succeeded": 1,
            "failed": 0,
            "start_time": _base_ts(rng.randint(1, 10)),
            "completion_time": _base_ts(0),
            "duration": f"{rng.randint(10, 300)}s",
            "age": f"{rng.randint(1, 30)}d",
            "labels": {"job": name, "cluster": cid},
            "selector": {},
            "containers": [{"name": name, "image": f"registry.io/jobs/{name}:latest"}],
            "conditions": [{"type": "Complete", "status": "True"}],
            "created_at": _base_ts(rng.randint(1, 30)),
        })
    return items


def _build_cronjobs(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    schedules = ["0 * * * *", "0 0 * * *", "*/15 * * * *", "0 0 * * 0"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["cronjobs"]):
        rng = _seed_rand(cid, name)
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": NAMESPACES[i % len(NAMESPACES)],
            "schedule": schedules[i % len(schedules)],
            "suspend": False,
            "active": 0,
            "last_schedule_time": _base_ts(1),
            "last_successful_time": _base_ts(1),
            "age": f"{rng.randint(10, 60)}d",
            "labels": {"cron": name, "cluster": cid},
            "job_template": {"completions": 1, "parallelism": 1},
            "created_at": _base_ts(rng.randint(10, 60)),
        })
    return items


def _build_services(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    svc_types = ["ClusterIP", "ClusterIP", "LoadBalancer", "ClusterIP"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["services"]):
        rng = _seed_rand(cid, name)
        svc_type = svc_types[i % len(svc_types)]
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": NAMESPACES[i % len(NAMESPACES)],
            "type": svc_type,
            "cluster_ip": f"10.96.{rng.randint(0,255)}.{rng.randint(1,254)}",
            "external_ips": [f"34.{rng.randint(0,255)}.{rng.randint(0,255)}.{rng.randint(1,254)}"] if svc_type == "LoadBalancer" else [],
            # Use target_port (snake_case) to match ServiceModel Pydantic field
            "ports": [{"name": "http", "port": 80, "target_port": "8080", "protocol": "TCP", "node_port": None}],
            "selector": {"app": name.replace("-svc", "")},
            "age": f"{rng.randint(10, 90)}d",
            "endpoints_count": rng.randint(1, 5),
            "labels": {"app": name, "cluster": cid},
            "annotations": {},
            "session_affinity": "None",
            "load_balancer_ip": None,
            "external_name": None,
            "created_at": _base_ts(rng.randint(10, 90)),
        })
    return items


def _build_ingresses(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["ingresses"]):
        rng = _seed_rand(cid, name)
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": NAMESPACES[i % 3],
            "hosts": [f"{name.replace('-ingress','')}.{cid}.example.com"],
            "paths": [{"path": "/", "pathType": "Prefix", "backend": name}],
            "tls_enabled": rng.choice([True, False]),
            "ingress_class": "nginx",
            "age": f"{rng.randint(5, 60)}d",
            "labels": {"ingress": name, "cluster": cid},
            "created_at": _base_ts(rng.randint(5, 60)),
        })
    return items


def _build_network_policies(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    items = []
    for i, ns in enumerate(NAMESPACES[:4]):
        rng = _seed_rand(cid, ns)
        items.append({
            "cluster_id": cid,
            "name": f"allow-{ns}-{cid[:4]}",
            "namespace": ns,
            "pod_selector": {"app": ns},
            "policy_types": ["Ingress", "Egress"],
            "ingress_rules_count": rng.randint(1, 5),
            "egress_rules_count": rng.randint(1, 3),
            "age": f"{rng.randint(5, 60)}d",
            "labels": {"policy": ns, "cluster": cid},
            "created_at": _base_ts(rng.randint(5, 60)),
        })
    return items


def _build_pvcs(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["pvcs"]):
        rng = _seed_rand(cid, name)
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "namespace": NAMESPACES[i % len(NAMESPACES)],
            "status": "Bound",
            "volume_name": f"pv-{name}-{cid[:4]}",
            "storage_class": "standard",
            "capacity": f"{rng.choice([5, 10, 20, 50])}Gi",
            "access_modes": ["ReadWriteOnce"],
            "volume_mode": "Filesystem",
            "age": f"{rng.randint(10, 180)}d",
            "bound_to_pod": f"{name.split('-')[0]}-pod-{cid[:4]}",
            "labels": {"app": name.split("-")[0], "cluster": cid},
            "created_at": _base_ts(rng.randint(10, 180)),
        })
    return items


def _build_pvs(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    items = []
    for i, name in enumerate(WORKLOAD_NAMES["pvs"]):
        rng = _seed_rand(cid, name)
        items.append({
            "cluster_id": cid,
            "name": f"{name}-{cid[:4]}",
            "status": "Bound",
            "claim": f"default/{name.replace('pv-','')}-{cid[:4]}",
            "storage_class": "standard",
            "capacity": f"{rng.choice([10, 20, 50])}Gi",
            "access_modes": ["ReadWriteOnce"],
            "reclaim_policy": "Retain",
            "volume_mode": "Filesystem",
            "age": f"{rng.randint(10, 180)}d",
            "labels": {"cluster": cid},
            "created_at": _base_ts(rng.randint(10, 180)),
        })
    return items


def _build_nodes(cluster: Dict) -> List[Dict]:
    """Generate realistic node data scoped to this cluster."""
    cid = cluster["id"]
    env = cluster["environment"]
    # Number of nodes scales with environment
    node_counts = {"production": 5, "staging": 3, "qa": 2, "development": 2}
    count = node_counts.get(env, 2)
    items = []
    for i in range(1, count + 1):
        rng = _seed_rand(cid, f"node-{i}")
        role = ["control-plane"] if i == 1 else ["worker"]
        cpu_pct = rng.uniform(45, 80)
        mem_pct = rng.uniform(50, 78)
        items.append({
            "cluster_id": cid,
            "name": f"{cid}-node-{i}",
            "status": "Ready",
            "roles": role,
            "age": f"{rng.randint(10, 180)}d",
            "version": cluster.get("version", "1.28.0"),
            "os_image": "Ubuntu 22.04.3 LTS",
            "kernel_version": "5.15.0-91-generic",
            "container_runtime": "containerd://1.7.2",
            "cpu_capacity": "4 cores",
            "memory_capacity": "16 GB",
            "cpu_allocatable": "3.8 cores",
            "memory_allocatable": "15.2 GB",
            "cpu_usage": round(cpu_pct, 1),
            "memory_usage": round(mem_pct, 1),
            "pod_count": rng.randint(10, 40),
            "pod_capacity": 110,
            "conditions": [
                {"type": "Ready", "status": "True"},
                {"type": "MemoryPressure", "status": "False"},
                {"type": "DiskPressure", "status": "False"},
            ],
        })
    return items


def _build_health(cluster: Dict) -> Dict:
    """Generate cluster health data scoped to this cluster."""
    cid = cluster["id"]
    env = cluster["environment"]
    rng = _seed_rand(cid, "health")
    cpu_eff = rng.uniform(55, 80)
    mem_eff = rng.uniform(55, 78)
    avg = (cpu_eff + mem_eff) / 2
    if 60 <= avg <= 80:
        score = rng.uniform(90, 97)
    elif 50 <= avg < 60 or 80 < avg <= 85:
        score = rng.uniform(80, 90)
    else:
        score = rng.uniform(65, 80)
    issues = []
    recs = []
    if cpu_eff > 80:
        issues.append(f"High CPU utilization ({cpu_eff:.1f}%) — consider scaling")
    if mem_eff > 78:
        issues.append(f"High memory utilization ({mem_eff:.1f}%) — OOM risk")
    if env in ("staging", "development"):
        issues.append("Non-production environment — resources may be over-provisioned")
        recs.append("Review resource requests vs actual usage")
    if cpu_eff < 60:
        recs.append("Reduce CPU requests to improve efficiency")
    if mem_eff < 60:
        recs.append("Reduce memory requests to save costs")
    return {
        "cluster_id": cid,
        "health_score": round(score, 1),
        "cpu_efficiency": round(cpu_eff, 1),
        "memory_efficiency": round(mem_eff, 1),
        "node_utilization": round(rng.uniform(55, 80), 1),
        "storage_utilization": round(rng.uniform(40, 70), 1),
        "issues": issues,
        "recommendations": recs,
    }


def _build_metrics(cluster: Dict) -> Dict:
    cid = cluster["id"]
    rng = _seed_rand(cid, "metrics")
    return {
        "cluster_id": cid,
        "cluster_name": cluster["name"],
        "cpu_usage_percent": rng.uniform(45, 80),
        "memory_usage_percent": rng.uniform(50, 75),
        "network_in_mbps": rng.uniform(100, 500),
        "network_out_mbps": rng.uniform(80, 400),
        "disk_read_iops": rng.randint(500, 2000),
        "disk_write_iops": rng.randint(300, 1500),
        "pod_count": rng.randint(50, 200),
        "node_count": rng.randint(3, 15),
        "timestamp": datetime.utcnow().isoformat(),
    }


def _build_events(cluster: Dict) -> List[Dict]:
    cid = cluster["id"]
    event_types = [
        ("Warning", "BackOff", "Back-off restarting failed container"),
        ("Normal", "Scheduled", "Successfully assigned pod to node"),
        ("Warning", "OOMKilling", "Memory limit exceeded"),
        ("Normal", "Pulled", "Successfully pulled image"),
        ("Warning", "FailedMount", "Unable to attach volume"),
    ]
    items = []
    for i, (etype, reason, msg) in enumerate(event_types):
        rng = _seed_rand(cid, reason)
        ns = NAMESPACES[i % len(NAMESPACES)]
        items.append({
            "cluster_id": cid,
            "type": etype,
            "reason": reason,
            "message": msg,
            "namespace": ns,
            "object": f"pod/{ns}-app-{cid[:4]}-{rng.randint(100,999)}",
            "count": rng.randint(1, 50),
            "first_time": _base_ts(rng.randint(1, 7)),
            "last_time": _base_ts(0),
        })
    return items


# ── Master registry ────────────────────────────────────────────────────────────

_BUILDERS = {
    "deployments": _build_deployments,
    "statefulsets": _build_statefulsets,
    "daemonsets": _build_daemonsets,
    "jobs": _build_jobs,
    "cronjobs": _build_cronjobs,
    "services": _build_services,
    "ingresses": _build_ingresses,
    "network_policies": _build_network_policies,
    "pvcs": _build_pvcs,
    "pvs": _build_pvs,
    "events": _build_events,
    "nodes": _build_nodes,
    "health": _build_health,
}


def get_dummy_data(resource_type: str, cluster_id: Optional[str] = None) -> List[Dict]:
    """
    Build and return dummy data for the given resource type,
    sourced from the live cluster list so IDs are always consistent.

    Args:
        resource_type: one of 'deployments', 'services', 'pvcs', etc.
        cluster_id: if provided, returns only data for that cluster.
                    None / 'all' returns data for all clusters.
    """
    builder = _BUILDERS.get(resource_type)
    if builder is None:
        return []

    clusters = get_clusters()
    if cluster_id and cluster_id != "all":
        clusters = [c for c in clusters if c["id"] == cluster_id]

    all_items: List[Dict] = []
    for cluster in clusters:
        all_items.extend(builder(cluster))

    return all_items


def get_dummy_metrics(cluster_id: Optional[str] = None) -> List[Dict]:
    """Return cluster-level metrics for one or all clusters."""
    clusters = get_clusters()
    if cluster_id and cluster_id != "all":
        clusters = [c for c in clusters if c["id"] == cluster_id]
    return [_build_metrics(c) for c in clusters]


def get_dummy_nodes(cluster_id: Optional[str] = None) -> List[Dict]:
    """Return node data scoped to live clusters."""
    return get_dummy_data("nodes", cluster_id)


def get_dummy_health(cluster_id: Optional[str] = None) -> List[Dict]:
    """
    Return cluster health data scoped to live clusters.

    _build_health returns a single Dict (one entry per cluster), so we must
    use append rather than extend to avoid iterating over dict keys.
    """
    clusters = get_clusters()
    if cluster_id and cluster_id != "all":
        clusters = [c for c in clusters if c["id"] == cluster_id]
    return [_build_health(c) for c in clusters]


# Made with Bob
