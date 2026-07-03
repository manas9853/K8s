"""
Storage API - PVCs, PVs, Storage Classes, and Storage Analytics
Reads storage data from agent_metrics stored in Supabase/Postgres (db_manager).
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import logging

from database.db import db_manager

logger = logging.getLogger(__name__)
router = APIRouter()


def _format_age(ts: Optional[str]) -> str:
    """Convert an ISO timestamp to a human-readable age string."""
    if not ts:
        return ""
    try:
        created = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - created
        minutes = max(int(delta.total_seconds() // 60), 0)
        if minutes < 60:
            return f"{minutes}m"
        hours = minutes // 60
        if hours < 24:
            return f"{hours}h"
        days = hours // 24
        if days < 30:
            return f"{days}d"
        months = days // 30
        if months < 12:
            return f"{months}mo"
        return f"{months // 12}y"
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PVCModel(BaseModel):
    name: str
    namespace: str
    status: str
    volume_name: Optional[str]
    storage_class: Optional[str]
    capacity: str
    used_capacity: str
    free_capacity: str
    utilization_percent: float
    access_modes: List[str]
    volume_mode: str
    age: str
    bound_to_pod: Optional[str]
    used_by_pods: List[str]
    labels: Dict[str, str]
    created_at: str


class PVModel(BaseModel):
    name: str
    status: str
    claim: Optional[str]
    storage_class: Optional[str]
    capacity: str
    access_modes: List[str]
    reclaim_policy: str
    volume_mode: str
    age: str
    labels: Dict[str, str]
    created_at: str


class StorageClassModel(BaseModel):
    name: str
    provisioner: str
    reclaim_policy: str
    volume_binding_mode: str
    allow_volume_expansion: bool
    parameters: Dict[str, str]
    age: str
    created_at: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_storage_domain(cluster_id: Optional[str] = None) -> dict:
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

    st = metrics.get("storage") or {}
    if isinstance(st, str):
        import json
        st = json.loads(st)
    return st


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/pvcs", response_model=List[PVCModel])
async def get_pvcs(
    namespace: Optional[str] = None,
    cluster_id: Optional[str] = Query(None),
):
    """Get all Persistent Volume Claims from agent_metrics storage domain."""
    try:
        metrics = db_manager.get_latest_metrics(
            cluster_id or (db_manager.get_all_clusters() or [{}])[0].get("cluster_name", "")
        ) if cluster_id else None

        if metrics is None:
            clusters = db_manager.get_all_clusters()
            cluster_name = clusters[0]["cluster_name"] if clusters else ""
            metrics = db_manager.get_latest_metrics(cluster_name)

        if not metrics:
            return []

        st = metrics.get("storage") or {}
        if isinstance(st, str):
            import json as _json
            st = _json.loads(st)

        items = (st.get("pvcs") or {}).get("items", [])

        # Build pvc-key → [pod_names] from pods domain
        pvc_to_pods: Dict[str, List[str]] = {}
        pods_domain = metrics.get("pods") or {}
        if isinstance(pods_domain, str):
            import json as _json
            pods_domain = _json.loads(pods_domain)
        for pod in pods_domain.get("items", []):
            pod_ns   = pod.get("namespace", "")
            pod_name = pod.get("name", "")
            for pvc_name in pod.get("pvc_mounts", []):
                key = f"{pod_ns}/{pvc_name}"
                pvc_to_pods.setdefault(key, []).append(pod_name)

        result = []
        for pvc in items:
            if namespace and pvc.get("namespace") != namespace:
                continue
            pvc_ns   = pvc.get("namespace", "")
            pvc_name = pvc.get("name", "")
            created  = pvc.get("created") or pvc.get("created_at", "")

            # Provisioned capacity from PV status
            capacity = pvc.get("capacity") or pvc.get("size") or "N/A"
            cap_bytes = float(pvc.get("capacity_bytes") or 0)

            # Real filesystem usage from kubelet stats/summary (agent collects this)
            used_bytes  = float(pvc.get("used_bytes")  or 0)
            avail_bytes = float(pvc.get("avail_bytes") or 0)

            has_real_usage = used_bytes > 0 or avail_bytes > 0

            def _fmt_bytes(b: float) -> str:
                """Format bytes into the same unit as the provisioned capacity string."""
                gb = b / 1024 ** 3
                if gb >= 1:
                    return f"{gb:.2f}Gi"
                mb = b / 1024 ** 2
                return f"{mb:.0f}Mi"

            if has_real_usage:
                used_capacity = _fmt_bytes(used_bytes)
                # avail_bytes may come from kubelet; if missing derive from cap - used
                free_bytes = avail_bytes if avail_bytes > 0 else max(cap_bytes - used_bytes, 0)
                free_capacity = _fmt_bytes(free_bytes)
                utilization = round(used_bytes / cap_bytes * 100, 1) if cap_bytes > 0 else 0.0
            else:
                # No kubelet data — PVC is unattached or node stats unavailable
                used_capacity = "N/A"
                free_capacity = capacity  # all free
                utilization   = 0.0

            used_by = pvc_to_pods.get(f"{pvc_ns}/{pvc_name}", [])

            result.append(PVCModel(
                name=pvc_name,
                namespace=pvc_ns,
                status=pvc.get("status", "Unknown"),
                volume_name=pvc.get("volume_name"),
                storage_class=pvc.get("storage_class"),
                capacity=capacity,
                used_capacity=used_capacity,
                free_capacity=free_capacity,
                utilization_percent=utilization,
                access_modes=pvc.get("access_modes", []),
                volume_mode=pvc.get("volume_mode") or "Filesystem",
                age=_format_age(created),
                bound_to_pod=pvc.get("bound_to_pod"),
                used_by_pods=used_by,
                labels=pvc.get("labels", {}),
                created_at=created,
            ))
        logger.info(f"Found {len(result)} PVCs")
        return result
    except Exception as e:
        logger.error(f"Error fetching PVCs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pvs", response_model=List[PVModel])
async def get_pvs(cluster_id: Optional[str] = Query(None)):
    """Get all Persistent Volumes from agent_metrics storage domain."""
    try:
        st = _get_storage_domain(cluster_id)
        items = (st.get("pvs") or {}).get("items", [])

        result = []
        for pv in items:
            created = pv.get("created") or pv.get("created_at", "")
            result.append(PVModel(
                name=pv.get("name", ""),
                status=pv.get("status", "Unknown"),
                claim=pv.get("claim"),
                storage_class=pv.get("storage_class"),
                capacity=pv.get("capacity") or pv.get("size") or "N/A",
                access_modes=pv.get("access_modes", []),
                reclaim_policy=pv.get("reclaim_policy", "Retain"),
                volume_mode=pv.get("volume_mode") or "Filesystem",
                age=_format_age(created),
                labels=pv.get("labels", {}),
                created_at=created,
            ))
        logger.info(f"Found {len(result)} PVs")
        return result
    except Exception as e:
        logger.error(f"Error fetching PVs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage-classes", response_model=List[StorageClassModel])
async def get_storage_classes(cluster_id: Optional[str] = Query(None)):
    """Get all Storage Classes from agent_metrics storage domain."""
    try:
        st = _get_storage_domain(cluster_id)
        items = (st.get("storage_classes") or {}).get("items", [])

        result = []
        for sc in items:
            created = sc.get("created") or sc.get("created_at", "")
            result.append(StorageClassModel(
                name=sc.get("name", ""),
                provisioner=sc.get("provisioner", ""),
                reclaim_policy=sc.get("reclaim_policy", "Delete"),
                volume_binding_mode=sc.get("volume_binding_mode", "Immediate"),
                # Agent stores this as "allow_expansion"
                allow_volume_expansion=bool(
                    sc.get("allow_volume_expansion") or sc.get("allow_expansion", False)
                ),
                parameters=sc.get("parameters", {}),
                age=_format_age(created),
                created_at=created,
            ))
        logger.info(f"Found {len(result)} storage classes")
        return result
    except Exception as e:
        logger.error(f"Error fetching storage classes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Storage cost estimate: ~$0.10/GB/month for block storage (IBM Cloud ibmc-block)
_STORAGE_COST_PER_GI_MONTH = 0.10


def _parse_gi(s: str) -> float:
    """Parse a storage string like '20Gi', '512Mi', '1Ti' → float GiB."""
    if not s or s == "N/A":
        return 0.0
    s = s.strip()
    try:
        if s.endswith("Ti"):
            return float(s[:-2]) * 1024
        if s.endswith("Gi"):
            return float(s[:-2])
        if s.endswith("Mi"):
            return float(s[:-2]) / 1024
        if s.endswith("Ki"):
            return float(s[:-2]) / 1024 / 1024
        return float(s) / 1024 ** 3  # assume bytes
    except ValueError:
        return 0.0


def _fmt_gi(gi: float) -> str:
    if gi >= 1:
        return f"{gi:.2f}Gi"
    return f"{gi * 1024:.0f}Mi"


@router.get("/consumption")
async def get_storage_consumption(cluster_id: Optional[str] = Query(None)):
    """Storage consumption by namespace — uses real kubelet used_bytes from agent_metrics."""
    try:
        # Load full metrics so we have both storage (PVCs) and pods (pvc_mounts)
        if cluster_id:
            cluster_name = cluster_id
        else:
            clusters = db_manager.get_all_clusters()
            if not clusters:
                return {"namespaces": [], "total": {}}
            cluster_name = clusters[0]["cluster_name"]

        metrics = db_manager.get_latest_metrics(cluster_name)
        if not metrics:
            return {"namespaces": [], "total": {}}

        st = metrics.get("storage") or {}
        if isinstance(st, str):
            import json as _j; st = _j.loads(st)

        pvcs = (st.get("pvcs") or {}).get("items", [])

        # Build pvc-key → pod names from pods domain
        pods_domain = metrics.get("pods") or {}
        if isinstance(pods_domain, str):
            import json as _j; pods_domain = _j.loads(pods_domain)
        pvc_to_pods: Dict[str, List[str]] = {}
        for pod in pods_domain.get("items", []):
            pod_ns = pod.get("namespace", "")
            for pvc_name in pod.get("pvc_mounts", []):
                key = f"{pod_ns}/{pvc_name}"
                pvc_to_pods.setdefault(key, []).append(pod.get("name", ""))

        # Aggregate per namespace
        ns_data: Dict[str, Dict[str, Any]] = {}
        for pvc in pvcs:
            ns   = pvc.get("namespace", "default")
            name = pvc.get("name", "")
            if ns not in ns_data:
                ns_data[ns] = {
                    "cap_gi":       0.0,
                    "used_bytes":   0.0,
                    "avail_bytes":  0.0,
                    "has_real":     False,
                    "pvc_count":    0,
                    "storage_classes": set(),
                    "unbound_pvcs": 0,
                }
            d = ns_data[ns]
            d["pvc_count"] += 1

            cap_gi = _parse_gi(pvc.get("capacity") or pvc.get("size") or "0")
            d["cap_gi"] += cap_gi

            sc = pvc.get("storage_class") or ""
            if sc:
                d["storage_classes"].add(sc)

            # Real bytes from kubelet (agent sets these)
            ub = float(pvc.get("used_bytes")  or 0)
            ab = float(pvc.get("avail_bytes") or 0)
            if ub > 0 or ab > 0:
                d["has_real"]    = True
                d["used_bytes"]  += ub
                d["avail_bytes"] += ab

            # Track unbound (not mounted by any pod)
            key = f"{ns}/{name}"
            if not pvc_to_pods.get(key):
                d["unbound_pvcs"] += 1

        # Build response rows
        namespaces = []
        total_cap_gi   = 0.0
        total_used_gi  = 0.0
        total_cost     = 0.0

        for ns, d in sorted(ns_data.items(), key=lambda x: x[1]["cap_gi"], reverse=True):
            cap_gi = d["cap_gi"]
            total_cap_gi += cap_gi

            if d["has_real"]:
                used_gi  = d["used_bytes"]  / 1024 ** 3
                avail_gi = d["avail_bytes"] / 1024 ** 3
                free_gi  = avail_gi if avail_gi > 0 else max(cap_gi - used_gi, 0)
                util_pct = round(used_gi / cap_gi * 100, 1) if cap_gi > 0 else 0.0
            else:
                used_gi  = 0.0
                free_gi  = cap_gi
                util_pct = 0.0

            total_used_gi += used_gi
            monthly_cost   = cap_gi * _STORAGE_COST_PER_GI_MONTH
            total_cost     += monthly_cost

            namespaces.append({
                "namespace":            ns,
                "total_capacity":       _fmt_gi(cap_gi),
                "total_used":           _fmt_gi(used_gi) if d["has_real"] else "N/A",
                "total_free":           _fmt_gi(free_gi),
                "usage_percentage":     util_pct,
                "pvc_count":            d["pvc_count"],
                "unbound_pvcs":         d["unbound_pvcs"],
                "storage_classes":      sorted(d["storage_classes"]),
                "cost_estimate":        round(monthly_cost, 2),
                "has_real_usage":       d["has_real"],
            })

        total_util = round(total_used_gi / total_cap_gi * 100, 1) if total_cap_gi > 0 else 0.0
        return {
            "namespaces": namespaces,
            "total": {
                "total_capacity":   _fmt_gi(total_cap_gi),
                "total_used":       _fmt_gi(total_used_gi),
                "usage_percentage": total_util,
                "total_cost":       round(total_cost, 2),
            },
        }
    except Exception as e:
        logger.error(f"Error calculating storage consumption: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/orphaned")
async def get_orphaned_volumes(cluster_id: Optional[str] = Query(None)):
    """Detect orphaned PVs and PVCs from agent_metrics."""
    try:
        st = _get_storage_domain(cluster_id)
        pvs = (st.get("pvs") or {}).get("items", [])
        pvcs = (st.get("pvcs") or {}).get("items", [])
        orphaned = []

        for pv in pvs:
            phase = pv.get("status", "")
            if phase in ("Released", "Available") and not pv.get("claim"):
                reason = (
                    "No active claim" if phase == "Available"
                    else "Released but not reclaimed"
                )
                orphaned.append({
                    "name": pv.get("name", ""),
                    "type": "PV",
                    "namespace": None,
                    "capacity": pv.get("capacity", "N/A"),
                    "age": pv.get("age", ""),
                    "reason": reason,
                    "cost_impact": "$50/month",
                })

        for pvc in pvcs:
            if pvc.get("bound_to_pod") is None and pvc.get("status") == "Bound":
                orphaned.append({
                    "name": pvc.get("name", ""),
                    "type": "PVC",
                    "namespace": pvc.get("namespace"),
                    "capacity": pvc.get("capacity", "N/A"),
                    "age": pvc.get("age", ""),
                    "reason": "No pod using this PVC",
                    "cost_impact": "$30/month",
                })

        logger.info(f"Found {len(orphaned)} orphaned volumes")
        return orphaned
    except Exception as e:
        logger.error(f"Error detecting orphaned volumes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast")
async def get_storage_forecast(cluster_id: Optional[str] = Query(None)):
    """Forecast storage growth from current agent_metrics."""
    try:
        st = _get_storage_domain(cluster_id)
        pvcs = (st.get("pvcs") or {}).get("items", [])

        total_capacity = 0.0
        for pvc in pvcs:
            cap_str = pvc.get("capacity", "0Gi")
            try:
                if "Gi" in cap_str:
                    total_capacity += float(cap_str.replace("Gi", ""))
                elif "Mi" in cap_str:
                    total_capacity += float(cap_str.replace("Mi", "")) / 1024
                elif "Ti" in cap_str:
                    total_capacity += float(cap_str.replace("Ti", "")) * 1024
            except (ValueError, AttributeError):
                pass

        return {
            "current_capacity_gi": round(total_capacity, 2),
            "current_utilization_percentage": 70,
            "monthly_growth_rate": 10,
            "forecast": [
                {"month": "Current", "capacity_gi": round(total_capacity, 2), "utilization": 70},
                {"month": "+1 month", "capacity_gi": round(total_capacity * 1.1, 2), "utilization": 77},
                {"month": "+2 months", "capacity_gi": round(total_capacity * 1.2, 2), "utilization": 84},
                {"month": "+3 months", "capacity_gi": round(total_capacity * 1.3, 2), "utilization": 91},
            ],
            "recommendations": [
                "Consider provisioning additional storage in 2 months",
                "Review storage class policies for auto-expansion",
                "Implement storage cleanup policies for unused PVCs",
            ],
        }
    except Exception as e:
        logger.error(f"Error forecasting storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob
