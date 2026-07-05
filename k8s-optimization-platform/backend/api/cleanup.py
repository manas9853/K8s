"""
Cleanup API — Zombie / stale resource detection
Reads entirely from db_manager (agent_metrics in PostgreSQL).
k8s_client is NOT used — it cannot connect from EC2.
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import logging

from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)

# Cost constants (AWS-style estimates)
CPU_COST_PER_CORE_HOUR   = 0.04
MEM_COST_PER_GB_HOUR     = 0.005
STORAGE_COST_PER_GB_MO   = 0.10
HOURS_PER_MONTH          = 730


# ─── Models ──────────────────────────────────────────────────────────────────

class CleanupResource(BaseModel):
    resource_type:      str
    resource_name:      str
    namespace:          str
    cluster:            str
    last_used:          str
    days_unused:        int
    monthly_cost:       float
    reason:             str
    risk_level:         str   # Low | Medium | High
    dependencies:       int
    can_delete:         bool
    estimated_savings:  float
    # Optional extra fields (PVCs)
    capacity:           Optional[str] = None
    storage_class:      Optional[str] = None
    pvc_phase:          Optional[str] = None
    # Optional extra fields (Namespaces)
    pod_count:          Optional[int] = None
    deployment_count:   Optional[int] = None
    service_count:      Optional[int] = None
    pvc_count:          Optional[int] = None


class CleanupSummary(BaseModel):
    total_resources:        int
    safe_to_delete:         int
    requires_review:        int
    high_risk:              int
    total_monthly_savings:  float
    total_yearly_savings:   float
    resources_by_type:      dict
    resources_by_cluster:   dict


class CleanupResponse(BaseModel):
    summary:   CleanupSummary
    resources: List[CleanupResource]


class DeleteResourceRequest(BaseModel):
    resource_type: str
    resource_name: str
    namespace:     str
    dry_run:       bool = False


class DeleteResourceResult(BaseModel):
    success:       bool
    resource_type: str
    resource_name: str
    namespace:     str
    message:       str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _age_days(ts_str: Optional[str]) -> int:
    """Return whole days since ts_str (ISO-8601 / Z-suffix). 0 on error."""
    if not ts_str:
        return 0
    try:
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return max(0, (datetime.now(timezone.utc) - ts).days)
    except Exception:
        return 0


def _pod_monthly_cost(pod: dict) -> float:
    cpu  = pod.get("cpu_request", 0.0) or 0.0
    mem  = (pod.get("memory_request_mb", 0.0) or 0.0) / 1024  # → GB
    return round(
        cpu * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH
        + mem * MEM_COST_PER_GB_HOUR  * HOURS_PER_MONTH,
        2,
    )


def _storage_monthly_cost(size_bytes: float) -> float:
    gb = size_bytes / (1024 ** 3)
    return round(gb * STORAGE_COST_PER_GB_MO, 2)


def _get_metrics(cluster_id: Optional[str] = None) -> tuple:
    """Return (metrics_dict, cluster_name). metrics is {} on error."""
    try:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return {}, ""
        name = cluster_id or clusters[0]["cluster_name"]
        m = db_manager.get_latest_metrics(name) or {}
        return m, name
    except Exception as exc:
        logger.error("db_manager error: %s", exc)
        return {}, ""


# ─── Core scanner ────────────────────────────────────────────────────────────

def _find_all_candidates(cluster_id: Optional[str] = None) -> List[CleanupResource]:
    """
    Derive cleanup candidates from agent_metrics JSONB domains.
    Sources: pods, workloads (replicasets, jobs), storage, network.
    """
    metrics, cluster_name = _get_metrics(cluster_id)
    if not metrics:
        return []

    results: List[CleanupResource] = []

    # ── 1. Zombie pods (no owner, not Running, age > 7d) ─────────────────────
    pods = (metrics.get("pods") or {}).get("items", [])
    for pod in pods:
        owner_kind = pod.get("owner_kind", "") or ""
        status     = pod.get("status", "Unknown") or "Unknown"
        created    = pod.get("created") or pod.get("start_time", "")
        days       = _age_days(created)

        if owner_kind or status == "Running" or days <= 7:
            continue

        cost = _pod_monthly_cost(pod)
        can_del = status in ("Succeeded", "Failed", "Unknown")
        results.append(CleanupResource(
            resource_type     = "Pod",
            resource_name     = pod.get("name", ""),
            namespace         = pod.get("namespace", ""),
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = cost,
            reason            = f"Orphaned pod — status={status}, no owner, {days}d old",
            risk_level        = "Low" if status in ("Succeeded", "Failed") else "Medium",
            dependencies      = 0,
            can_delete        = can_del,
            estimated_savings = cost,
        ))

    # ── 2. Completed / failed jobs older than 7d ─────────────────────────────
    wl   = metrics.get("workloads") or {}
    jobs = (wl.get("jobs") or {}).get("items", [])
    for job in jobs:
        succeeded = job.get("succeeded", 0) or 0
        failed    = job.get("failed",    0) or 0
        active    = job.get("active",    0) or 0
        if active > 0 or (succeeded == 0 and failed == 0):
            continue
        created = job.get("created_at") or job.get("completion_time") or ""
        days    = _age_days(created)
        if days <= 7:
            continue
        status_str = "Succeeded" if succeeded > 0 else "Failed"
        results.append(CleanupResource(
            resource_type     = "Job",
            resource_name     = job.get("name", ""),
            namespace         = job.get("namespace", ""),
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = 0.0,
            reason            = f"{status_str} job, {days}d old",
            risk_level        = "Low",
            dependencies      = 0,
            can_delete        = True,
            estimated_savings = 0.0,
        ))

    # ── 3. Old ReplicaSets (0 replicas, owned by Deployment) ─────────────────
    # Agent pre-filters these into workloads.replicasets.orphaned
    orphaned_rs = (wl.get("replicasets") or {}).get("orphaned", [])
    for rs in orphaned_rs:
        created    = rs.get("created") or rs.get("created_at", "")
        days       = _age_days(created)
        owner_name = rs.get("owner_name", "")
        reason     = (
            f"Superseded by deployment/{owner_name}, 0 replicas, {days}d old"
            if owner_name else
            f"Old ReplicaSet — 0 replicas, {days}d old"
        )
        results.append(CleanupResource(
            resource_type     = "ReplicaSet",
            resource_name     = rs.get("name", ""),
            namespace         = rs.get("namespace", ""),
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = 0.0,
            reason            = reason,
            risk_level        = "Low",
            dependencies      = 0,
            can_delete        = True,
            estimated_savings = 0.0,
        ))

    # ── 4. Unattached PVCs ────────────────────────────────────────────────────
    # Agent stores phase != Bound PVCs in storage.orphaned_pvcs
    storage       = metrics.get("storage") or {}
    orphaned_pvcs = storage.get("orphaned_pvcs", [])

    # Also scan all PVCs for those not mounted by any running pod
    active_pvcs: set = set()
    for pod in pods:
        if pod.get("status") == "Running":
            for pvc_name in (pod.get("pvc_mounts") or []):
                active_pvcs.add(f"{pod.get('namespace','')}/{pvc_name}")

    all_pvcs = (storage.get("pvcs") or {}).get("items", [])
    for pvc in all_pvcs:
        key     = f"{pvc.get('namespace','')}/{pvc.get('name','')}"
        phase   = pvc.get("status", "Pending") or "Pending"
        created = pvc.get("created", "")
        days    = _age_days(created)
        if key in active_pvcs or days <= 30:
            continue
        size_bytes = pvc.get("size_bytes", 0) or pvc.get("capacity_bytes", 0) or 0
        cost = _storage_monthly_cost(size_bytes)
        results.append(CleanupResource(
            resource_type     = "PersistentVolumeClaim",
            resource_name     = pvc.get("name", ""),
            namespace         = pvc.get("namespace", ""),
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = cost,
            reason            = f"Not mounted by any running pod, {days}d old",
            risk_level        = "High",
            dependencies      = 0,
            can_delete        = False,  # data loss risk — require manual review
            estimated_savings = cost,
            capacity          = pvc.get("capacity") or pvc.get("size") or "Unknown",
            storage_class     = pvc.get("storage_class") or "Unknown",
            pvc_phase         = phase,
        ))

    # ── 5. Services with no endpoints (age > 14d, skip system namespaces) ─────
    net      = metrics.get("network") or {}
    services = (net.get("services") or {}).get("items", [])
    SKIP_NS  = {"kube-system", "kube-public", "kube-node-lease"}
    for svc in services:
        ns = svc.get("namespace", "")
        if ns in SKIP_NS:
            continue
        if (svc.get("endpoints_count") or 0) > 0:
            continue
        svc_type = svc.get("type", "ClusterIP")
        created  = svc.get("created_at") or svc.get("created", "")
        days     = _age_days(created)
        if days <= 14:
            continue
        lb_cost = 18.0 if svc_type == "LoadBalancer" else 0.0
        results.append(CleanupResource(
            resource_type     = "Service",
            resource_name     = svc.get("name", ""),
            namespace         = ns,
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = lb_cost,
            reason            = f"{svc_type} service with no endpoints, {days}d old",
            risk_level        = "Medium",
            dependencies      = 0,
            can_delete        = False,
            estimated_savings = lb_cost,
        ))

    # ── 6. Idle namespaces (no running pods) ──────────────────────────────────
    all_ns      = (metrics.get("namespaces") or {}).get("items", [])
    running_ns: set = {p.get("namespace") for p in pods if p.get("status") == "Running"}

    # Build per-namespace resource counts from other domains
    wl         = metrics.get("workloads") or {}
    all_deps   = (wl.get("deployments") or {}).get("items", [])
    all_svcs   = (metrics.get("network") or {}).get("services", {}).get("items", [])
    all_pvcs_s = (metrics.get("storage") or {}).get("pvcs", {}).get("items", [])

    from collections import Counter as _Counter
    _dep_ns  = _Counter(d.get("namespace") for d in all_deps)
    _svc_ns  = _Counter(s.get("namespace") for s in all_svcs)
    _pvc_ns  = _Counter(p.get("namespace") for p in all_pvcs_s)
    _pod_ns  = _Counter(p.get("namespace") for p in pods)

    SKIP_IDLE = {"kube-system", "kube-public", "kube-node-lease", "default"}
    for ns_item in all_ns:
        ns_name = ns_item.get("name", "")
        if ns_name in SKIP_IDLE or ns_name in running_ns:
            continue
        created = ns_item.get("created", "")
        days    = _age_days(created)
        if days <= 30:
            continue
        n_pods = _pod_ns.get(ns_name, 0)
        n_deps = _dep_ns.get(ns_name, 0)
        n_svcs = _svc_ns.get(ns_name, 0)
        n_pvcs = _pvc_ns.get(ns_name, 0)
        total_res = n_deps + n_svcs + n_pvcs
        reason_parts = [f"No running pods, {days}d old"]
        if total_res > 0:
            bits = []
            if n_deps: bits.append(f"{n_deps} deployment{'s' if n_deps>1 else ''}")
            if n_svcs: bits.append(f"{n_svcs} service{'s' if n_svcs>1 else ''}")
            if n_pvcs: bits.append(f"{n_pvcs} PVC{'s' if n_pvcs>1 else ''}")
            reason_parts.append(f"has {', '.join(bits)}")
        results.append(CleanupResource(
            resource_type     = "Namespace",
            resource_name     = ns_name,
            namespace         = ns_name,
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = 0.0,
            reason            = " — ".join(reason_parts),
            risk_level        = "Medium",
            dependencies      = total_res,
            can_delete        = False,
            estimated_savings = 0.0,
            pod_count         = n_pods,
            deployment_count  = n_deps,
            service_count     = n_svcs,
            pvc_count         = n_pvcs,
        ))

    logger.info("Cleanup scan found %d candidates for cluster %s", len(results), cluster_name)
    return results


def _build_response(resources: List[CleanupResource], cluster_id: Optional[str] = None) -> dict:
    cluster_name = resources[0].cluster if resources else ""
    safe     = sum(1 for r in resources if r.can_delete and r.risk_level == "Low")
    review   = sum(1 for r in resources if not r.can_delete or r.risk_level == "Medium")
    high     = sum(1 for r in resources if r.risk_level == "High")
    savings  = sum(r.estimated_savings for r in resources)
    by_type  = {}
    for r in resources:
        by_type[r.resource_type] = by_type.get(r.resource_type, 0) + 1
    by_cluster = {cluster_name: len(resources)} if cluster_name else {}
    return {
        "summary": {
            "total_resources":       len(resources),
            "safe_to_delete":        safe,
            "requires_review":       review,
            "high_risk":             high,
            "total_monthly_savings": round(savings, 2),
            "total_yearly_savings":  round(savings * 12, 2),
            "resources_by_type":     by_type,
            "resources_by_cluster":  by_cluster,
        },
        "resources": [r.dict() for r in resources],
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=CleanupResponse)
async def get_cleanup_resources(
    cluster:       Optional[str] = Query(None),
    namespace:     Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    risk_level:    Optional[str] = Query(None),
    cluster_id:    Optional[str] = Query(None),
):
    """All cleanup candidates from agent_metrics data."""
    cid = cluster_id or cluster
    try:
        resources = _find_all_candidates(cid)
        if namespace:
            resources = [r for r in resources if r.namespace == namespace]
        if resource_type:
            resources = [r for r in resources if r.resource_type == resource_type]
        if risk_level:
            resources = [r for r in resources if r.risk_level == risk_level]
        return _build_response(resources, cid)
    except Exception as exc:
        logger.error("Error in get_cleanup_resources: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/summary", response_model=CleanupSummary)
async def get_cleanup_summary(cluster_id: Optional[str] = Query(None)):
    resp = await get_cleanup_resources(cluster_id=cluster_id)
    return resp["summary"]


@router.get("/zombie-resources")
async def get_zombie_resources(cluster_id: Optional[str] = Query(None)):
    """Pods and Services with no owners / no endpoints."""
    resources = _find_all_candidates(cluster_id)
    filtered  = [r for r in resources if r.resource_type in ("Pod", "Service")]
    return _build_response(filtered, cluster_id)


@router.get("/unused-deployments")
async def get_unused_deployments(cluster_id: Optional[str] = Query(None)):
    """
    Deployments that have desired > 0 replicas but 0 ready for > 7 days.
    Returns a richer shape that includes full deployment detail so the
    frontend can show replica counts, images, containers, conditions, etc.
    """
    metrics, cluster_name = _get_metrics(cluster_id)
    wl   = metrics.get("workloads") or {}
    deps = (wl.get("deployments") or {}).get("items", [])

    items = []
    for d in deps:
        replicas_desired   = d.get("replicas", 0) or 0
        replicas_ready     = d.get("ready_replicas", 0) or 0
        replicas_available = d.get("available_replicas", 0) or 0
        replicas_updated   = d.get("updated_replicas", 0) or 0
        unavailable        = d.get("unavailable_replicas", 0) or 0

        # Only flag: desired > 0 AND none ready
        if replicas_desired == 0 or replicas_ready > 0:
            continue

        created = d.get("created") or d.get("created_at", "")
        days    = _age_days(created)
        if days <= 7:
            continue

        # Cost estimate: sum container CPU requests
        containers  = d.get("containers", [])
        total_cpu   = sum(c.get("cpu_request", 0) or 0 for c in containers)
        total_mem   = sum(c.get("memory_request_mb", 0) or 0 for c in containers)  # MB
        monthly_cost = round(
            total_cpu * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH
            + (total_mem / 1024) * MEM_COST_PER_GB_HOUR * HOURS_PER_MONTH,
            2,
        )

        images = list({c.get("image", "") for c in containers if c.get("image")})

        items.append({
            # identity
            "name":               d.get("name", ""),
            "namespace":          d.get("namespace", ""),
            "cluster":            cluster_name,
            # replica state
            "replicas_desired":   replicas_desired,
            "replicas_ready":     replicas_ready,
            "replicas_available": replicas_available,
            "replicas_updated":   replicas_updated,
            "replicas_unavailable": unavailable,
            # time
            "created_at":         created or "Unknown",
            "idle_days":          days,
            # strategy / labels
            "strategy":           d.get("strategy", "RollingUpdate"),
            "labels":             d.get("labels", {}),
            "paused":             bool(d.get("paused", False)),
            # containers
            "containers":         containers,
            "images":             images,
            # conditions
            "conditions":         d.get("conditions", []),
            # cost
            "monthly_cost":       monthly_cost,
            "estimated_savings":  monthly_cost,
            # classification
            "reason":             f"desired={replicas_desired} replicas, 0 ready for {days}d",
            "risk_level":         "Medium",
            "can_delete":         False,
        })

    total_savings = sum(i["monthly_cost"] for i in items)
    return {
        "summary": {
            "total_deployments":     len(items),
            "total_idle_replicas":   sum(i["replicas_desired"] for i in items),
            "total_monthly_savings": round(total_savings, 2),
            "total_yearly_savings":  round(total_savings * 12, 2),
        },
        "deployments": items,
    }


@router.get("/stale-configmaps")
async def get_stale_configmaps(cluster_id: Optional[str] = Query(None)):
    """
    Return ConfigMaps that are not referenced by any running pod
    (not via volume, envFrom, or env.valueFrom.configMapKeyRef).
    Skips system-managed ConfigMaps.
    """
    metrics, cluster_name = _get_metrics(cluster_id)
    if not metrics:
        return _build_response([], cluster_id)

    cm_domain = metrics.get("configmaps") or {}
    stale_items = cm_domain.get("stale_items") or []

    # If the new domain isn't present yet (agent not updated), fall back to
    # scanning all configmaps from items and computing staleness ourselves.
    if not stale_items and cm_domain.get("items"):
        SYSTEM_PREFIXES = (
            "kube-", "extension-apiserver-", "coredns", "cluster-info",
            "kubernetes-", "ibm-", "calico-", "cert-manager", "istio-",
            "prometheus-", "grafana-", "oauth-", "open-cluster-", "bootstrap-",
        )
        for item in cm_domain.get("items", []):
            if not item.get("is_referenced") and not item.get("is_system"):
                if not any(item.get("name", "").startswith(p) for p in SYSTEM_PREFIXES):
                    stale_items.append(item)

    resources: List[CleanupResource] = []
    for cm in stale_items:
        name    = cm.get("name", "")
        ns      = cm.get("namespace", "")
        created = cm.get("created") or ""
        days    = _age_days(created)
        keys    = cm.get("key_count", 0) or len(cm.get("data_keys", [])) + len(cm.get("binary_keys", []))
        size_b  = cm.get("size_bytes", 0) or 0
        size_kb = round(size_b / 1024, 1)

        # Low risk: configmaps have no direct cost but waste etcd space / cause confusion
        risk = "Low"
        if days > 180:
            risk = "Medium"
        if days > 365 and keys == 0:
            risk = "Low"   # empty + old = definitely safe

        reason_parts = [f"Not referenced by any pod"]
        if days > 0:
            reason_parts.append(f"{days}d old")
        if keys > 0:
            reason_parts.append(f"{keys} key(s), {size_kb} KB")
        else:
            reason_parts.append("empty")

        resources.append(CleanupResource(
            resource_type     = "ConfigMap",
            resource_name     = name,
            namespace         = ns,
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = 0.0,
            reason            = ", ".join(reason_parts),
            risk_level        = risk,
            dependencies      = 0,
            can_delete        = True,
            estimated_savings = 0.0,
        ))

    # Sort: oldest first, then by namespace
    resources.sort(key=lambda r: (-r.days_unused, r.namespace, r.resource_name))
    return _build_response(resources, cluster_id)


@router.get("/stale-secrets")
async def get_stale_secrets(cluster_id: Optional[str] = Query(None)):
    """
    Return Secrets not referenced by any pod, service account or imagePullSecret.
    Auto-managed types (service-account-token, dockercfg, helm) are excluded.
    """
    metrics, cluster_name = _get_metrics(cluster_id)
    if not metrics:
        return _build_response([], cluster_id)

    sd = metrics.get("secrets_domain") or {}
    stale_items = sd.get("stale_items") or []

    resources: List[CleanupResource] = []
    for s in stale_items:
        name    = s.get("name", "")
        ns      = s.get("namespace", "")
        created = s.get("created") or ""
        days    = _age_days(created)
        stype   = s.get("type", "Opaque")
        keys    = s.get("key_count", 0) or len(s.get("data_keys", []))

        # Secrets carry higher risk than configmaps — may contain credentials
        if days > 365:
            risk = "High"
        elif days > 90:
            risk = "Medium"
        else:
            risk = "Low"

        reason_parts = ["Not referenced by any pod or service account"]
        if days > 0:
            reason_parts.append(f"{days}d old")
        if keys > 0:
            reason_parts.append(f"{keys} key(s)")
        else:
            reason_parts.append("empty")

        resources.append(CleanupResource(
            resource_type     = "Secret",
            resource_name     = name,
            namespace         = ns,
            cluster           = cluster_name,
            last_used         = created or "Unknown",
            days_unused       = days,
            monthly_cost      = 0.0,
            reason            = ", ".join(reason_parts),
            risk_level        = risk,
            dependencies      = 0,
            can_delete        = risk != "High",
            estimated_savings = 0.0,
        ))

    resources.sort(key=lambda r: (-r.days_unused, r.namespace, r.resource_name))
    return _build_response(resources, cluster_id)


@router.get("/old-replicasets")
async def get_old_replicasets(cluster_id: Optional[str] = Query(None)):
    resources = _find_all_candidates(cluster_id)
    return _build_response(
        [r for r in resources if r.resource_type == "ReplicaSet"], cluster_id
    )


@router.get("/unattached-pvcs")
async def get_unattached_pvcs(cluster_id: Optional[str] = Query(None)):
    resources = _find_all_candidates(cluster_id)
    return _build_response(
        [r for r in resources if r.resource_type == "PersistentVolumeClaim"], cluster_id
    )


@router.get("/idle-namespaces")
async def get_idle_namespaces(cluster_id: Optional[str] = Query(None)):
    resources = _find_all_candidates(cluster_id)
    return _build_response(
        [r for r in resources if r.resource_type == "Namespace"], cluster_id
    )


@router.delete("/delete", response_model=DeleteResourceResult)
async def delete_resource(req: DeleteResourceRequest):
    """
    Enqueue a delete command for the in-cluster agent to execute.
    The agent polls /api/agents/commands/pending and runs the deletion.
    """
    from api.workloads import _enqueue
    cmd_map = {
        "pod":                    "delete_pod",
        "replicaset":             "delete_replicaset",
        "job":                    "delete_job",
        "service":                "delete_service",
        "persistentvolumeclaim":  "delete_pvc",
        "pvc":                    "delete_pvc",
    }
    rtype = req.resource_type.lower().replace(" ", "")
    cmd   = cmd_map.get(rtype)
    if not cmd:
        raise HTTPException(status_code=400, detail=f"Unsupported resource type: {req.resource_type}")

    if req.dry_run:
        return DeleteResourceResult(
            success=True, resource_type=req.resource_type,
            resource_name=req.resource_name, namespace=req.namespace,
            message=f"[DRY-RUN] Would delete {req.resource_type} '{req.resource_name}'",
        )

    result = _enqueue(None, cmd, {"namespace": req.namespace, "name": req.resource_name})
    return DeleteResourceResult(
        success=True, resource_type=req.resource_type,
        resource_name=req.resource_name, namespace=req.namespace,
        message=f"Delete command enqueued (id={result.get('command_id')}). Agent will execute shortly.",
    )

# Made with Bob
