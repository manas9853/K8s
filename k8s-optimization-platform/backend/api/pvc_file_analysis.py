"""
PVC File Analysis API
Analyses PVC usage using agent-collected metrics (used_bytes / avail_bytes
from kubelet stats).  No pod exec required — works entirely from the data
the cluster agent already sends every 60 s.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime, timezone

from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _fmt_bytes(b: float) -> str:
    if b <= 0:
        return "0 B"
    if b < 1024:
        return f"{int(b)} B"
    if b < 1024 ** 2:
        return f"{b / 1024:.1f} KB"
    if b < 1024 ** 3:
        return f"{b / 1024 ** 2:.1f} MB"
    return f"{b / 1024 ** 3:.2f} GB"


def _parse_k8s_size(s: str) -> float:
    """Convert Kubernetes storage string (e.g. '20Gi') → bytes."""
    s = (s or "0").strip()
    units = {
        "Ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "Ti": 1024**4,
        "K":  1000,  "M":  1000**2, "G":  1000**3, "T":  1000**4,
    }
    for suffix, mult in units.items():
        if s.endswith(suffix):
            try:
                return float(s[:-len(suffix)]) * mult
            except ValueError:
                return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _get_metrics(cluster_id: Optional[str]) -> tuple:
    """Return (cluster_name, latest_metrics) for the given cluster.
    Falls back to the most-recently-seen cluster when cluster_id is omitted."""
    if cluster_id:
        return cluster_id, (db_manager.get_latest_metrics(cluster_id) or {})
    clusters = db_manager.get_all_clusters()
    if not clusters:
        return "", {}
    name = clusters[0]["cluster_name"]
    return name, (db_manager.get_latest_metrics(name) or {})


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/storage/pvcs-analysis")
async def list_pvcs_for_analysis(
    cluster_id: Optional[str] = Query(None),
):
    """
    Return all PVCs with real usage data from the agent.
    Used by the PVC File Analysis page to populate the selector.
    Distinct from /storage/pvcs (storage.py) to avoid route shadowing.
    """
    try:
        resolved_cluster, metrics = _get_metrics(cluster_id)
        storage = metrics.get("storage", {})
        pvcs_data = storage.get("pvcs", {}).get("items", [])
        pods_data = metrics.get("pods", {}).get("items", [])

        # Build a lookup: pvc_name → list of pod names that mount it
        pvc_to_pods: Dict[str, List[str]] = {}
        for pod in pods_data:
            for pvc_name in pod.get("pvc_mounts", []):
                pvc_to_pods.setdefault(pvc_name, []).append(pod["name"])

        result = []
        for pvc in pvcs_data:
            name     = pvc.get("name", "")
            ns       = pvc.get("namespace", "")
            cap_str  = pvc.get("capacity") or pvc.get("size", "0")
            cap_b    = _parse_k8s_size(cap_str)
            used_b   = float(pvc.get("used_bytes") or 0)
            avail_b  = float(pvc.get("avail_bytes") or 0)
            util_pct = round(used_b / cap_b * 100, 1) if cap_b > 0 and used_b > 0 else 0.0

            result.append({
                "name":              name,
                "namespace":         ns,
                "cluster_id":        resolved_cluster,   # ← frontend echoes this back
                "status":            pvc.get("status", "Unknown"),
                "volume_name":       pvc.get("volume_name"),
                "storage_class":     pvc.get("storage_class"),
                "capacity":          cap_str,
                "capacity_bytes":    cap_b,
                "used_bytes":        used_b,
                "avail_bytes":       avail_b,
                "used_capacity":     _fmt_bytes(used_b) if used_b > 0 else "N/A",
                "free_capacity":     _fmt_bytes(avail_b) if avail_b > 0 else "N/A",
                "utilization_percent": util_pct,
                "access_modes":      pvc.get("access_modes", []),
                "volume_mode":       pvc.get("volume_mode", "Filesystem"),
                "labels":            pvc.get("labels", {}),
                "created":           pvc.get("created"),
                "used_by_pods":      pvc_to_pods.get(name, []),
                "bound_to_pod":      pvc_to_pods.get(name, [None])[0],
            })

        return result

    except Exception as e:
        logger.error(f"list_pvcs_for_analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage/pvcs-analysis/{namespace}/{pvc_name}")
async def analyze_pvc_files(
    namespace: str,
    pvc_name: str,
    cluster_id: Optional[str] = Query(None),
):
    """
    PVC usage analysis built entirely from agent-collected kubelet stats.

    Returns capacity / used / free / utilisation plus a breakdown by pod
    and actionable recommendations — no pod exec, no direct cluster access.
    """
    try:
        _resolved_cluster, metrics = _get_metrics(cluster_id)
        storage = metrics.get("storage", {})
        pvcs_data = storage.get("pvcs", {}).get("items", [])
        pods_data = metrics.get("pods", {}).get("items", [])

        # Find the requested PVC
        pvc = next(
            (p for p in pvcs_data
             if p.get("name") == pvc_name and p.get("namespace") == namespace),
            None,
        )
        if pvc is None:
            raise HTTPException(
                status_code=404,
                detail=f"PVC '{pvc_name}' not found in namespace '{namespace}'. "
                       "Ensure the agent has sent at least one metrics collection.",
            )

        cap_str  = pvc.get("capacity") or pvc.get("size", "0")
        cap_b    = _parse_k8s_size(cap_str)
        used_b   = float(pvc.get("used_bytes") or 0)
        avail_b  = float(pvc.get("avail_bytes") or 0)

        # Derive free bytes: prefer kubelet avail, fall back to cap - used
        if avail_b <= 0 and cap_b > 0:
            avail_b = max(cap_b - used_b, 0)

        util_pct = round(used_b / cap_b * 100, 1) if cap_b > 0 and used_b > 0 else 0.0

        # Pods that mount this PVC
        mounting_pods = [
            pod for pod in pods_data
            if pvc_name in pod.get("pvc_mounts", [])
        ]

        # ── per-pod breakdown ─────────────────────────────────────────────────
        pod_breakdown = []
        for pod in mounting_pods:
            cpu_req = pod.get("cpu_request", 0)
            mem_req = pod.get("memory_request_mb", 0)
            pod_breakdown.append({
                "pod_name":       pod.get("name"),
                "namespace":      pod.get("namespace"),
                "status":         pod.get("status", "Unknown"),
                "node":           pod.get("node"),
                "owner_kind":     pod.get("owner_kind"),
                "owner_name":     pod.get("owner_name"),
                "restarts":       pod.get("total_restarts", 0),
                "cpu_request":    cpu_req,
                "memory_request_mb": mem_req,
                "containers":     [c.get("name") for c in pod.get("containers", [])],
            })

        # ── recommendations ───────────────────────────────────────────────────
        recommendations = []

        if not mounting_pods:
            recommendations.append({
                "severity": "warning",
                "title":    "PVC not mounted by any running pod",
                "detail":   "This PVC is Bound but no running pod is currently mounting it. "
                            "Consider releasing it to free storage costs.",
                "action":   "Review and delete if unused",
            })

        if util_pct > 85:
            recommendations.append({
                "severity": "critical",
                "title":    "Disk usage critical",
                "detail":   f"PVC is {util_pct}% full ({_fmt_bytes(used_b)} of {cap_str}). "
                            "Pods may start failing with 'no space left on device'.",
                "action":   "Expand PVC or clean up old data immediately",
            })
        elif util_pct > 70:
            recommendations.append({
                "severity": "warning",
                "title":    "High disk usage",
                "detail":   f"PVC is {util_pct}% full. Consider expanding or cleaning up.",
                "action":   "Review logs, cache, and backup files inside the volume",
            })
        elif util_pct == 0 and used_b == 0:
            recommendations.append({
                "severity": "info",
                "title":    "No usage data available",
                "detail":   "The agent could not read kubelet stats for this PVC. "
                            "This is normal for ReadWriteMany volumes on IBM Cloud File Storage "
                            "— kubelet stats are not exposed for NFS-backed PVCs.",
                "action":   "Exec into the mounting pod and run 'df -h <mount_path>' for real usage",
            })
        else:
            recommendations.append({
                "severity": "ok",
                "title":    "Usage within healthy range",
                "detail":   f"PVC is {util_pct}% full ({_fmt_bytes(used_b)} used, {_fmt_bytes(avail_b)} free).",
                "action":   "No action required",
            })

        for pod in mounting_pods:
            if pod.get("total_restarts", 0) > 10:
                recommendations.append({
                    "severity": "warning",
                    "title":    f"Pod '{pod['name']}' has high restarts ({pod['total_restarts']})",
                    "detail":   "Frequent restarts may indicate the app is hitting disk-full errors.",
                    "action":   "Check pod logs for 'no space left on device'",
                })

        # ── summary ───────────────────────────────────────────────────────────
        return {
            "pvc_name":           pvc_name,
            "namespace":          namespace,
            "status":             pvc.get("status", "Unknown"),
            "storage_class":      pvc.get("storage_class"),
            "access_modes":       pvc.get("access_modes", []),
            "volume_mode":        pvc.get("volume_mode", "Filesystem"),
            "created":            pvc.get("created"),

            # Capacity
            "total_capacity":     cap_str,
            "capacity_bytes":     cap_b,
            "used_space":         _fmt_bytes(used_b) if used_b > 0 else "N/A",
            "free_space":         _fmt_bytes(avail_b) if avail_b > 0 else "N/A",
            "used_bytes":         used_b,
            "avail_bytes":        avail_b,
            "usage_percentage":   util_pct,
            "has_real_usage":     used_b > 0,

            # Pods
            "mounting_pods_count": len(mounting_pods),
            "pod_breakdown":      pod_breakdown,

            # Recommendations
            "recommendations":    recommendations,

            # Legacy fields (keep so frontend doesn't break)
            "file_count":         0,
            "old_files_count":    0,
            "potential_savings":  "N/A",
            "files":              [],

            # Data source note
            "data_source":        "agent_kubelet_stats",
            "note": (
                "File-level listing requires exec access to the pod. "
                "This view shows kubelet-reported disk usage collected by the agent."
                if used_b == 0 else
                "Usage data sourced from kubelet stats via the cluster agent."
            ),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"analyze_pvc_files: {e}")
        raise HTTPException(status_code=500, detail=str(e))




# Made with Bob
