"""
Recommendations API - Smart Resource Optimization
Reads real pod resource data from agent DB (db_manager).
Uses actual cpu_usage_cores / memory_usage_mb from metrics-server
to compute right-sizing recommendations.
"""
from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from enum import Enum
import json
import logging

from database.db import db_manager

router = APIRouter()
logger = logging.getLogger(__name__)


class RecommendationStatus(str, Enum):
    INCREASE_CPU    = "increase_cpu"
    REDUCE_CPU      = "reduce_cpu"
    INCREASE_MEMORY = "increase_memory"
    REDUCE_MEMORY   = "reduce_memory"
    NO_ACTION       = "no_action"


class ConfidenceLevel(str, Enum):
    LOW_RISK    = "low_risk"
    MEDIUM_RISK = "medium_risk"
    HIGH_RISK   = "high_risk"


class CPURecommendation(BaseModel):
    current_usage:       float
    current_request:     float
    current_limit:       float
    recommended_request: float
    recommended_limit:   float
    cpu_saved:           float
    cost_saved:          float


class MemoryRecommendation(BaseModel):
    current_usage:       float
    peak_usage:          float
    current_request:     float
    current_limit:       float
    recommended_request: float
    recommended_limit:   float
    memory_saved:        float
    cost_saved:          float


class WorkloadRecommendation(BaseModel):
    cluster_id:                 str
    namespace:                  str
    workload_type:              str
    workload_name:              str
    status:                     RecommendationStatus
    confidence:                 ConfidenceLevel
    cpu:                        CPURecommendation
    memory:                     MemoryRecommendation
    estimated_monthly_savings:  float
    performance_impact:         str
    created_at:                 datetime


# ── cost constants ────────────────────────────────────────────────────────────
from utils.cost_engine import CPU_COST_PER_CORE_HOUR, MEMORY_COST_PER_GB_HOUR, HOURS_PER_MONTH

# ── sizing thresholds (from audit.sh logic) ───────────────────────────────────
MIN_CPU_CORES  = 0.010   # 10m minimum
MIN_MEMORY_MB  = 16.0    # 16 MiB minimum
BUFFER         = 1.3     # 30 % headroom above measured usage
WASTE_THRESH   = 0.50    # flag if >50 % of request is idle


# ---------------------------------------------------------------------------
# Helper: resolve cluster from db
# ---------------------------------------------------------------------------

def _get_pods(cluster_id: Optional[str] = None) -> tuple[str, list]:
    """
    Return (cluster_name, pod_items_list).
    pod_items_list entries have shape from agent _pods():
      name, namespace, status, cpu_request, memory_request_mb,
      cpu_usage_cores, memory_usage_mb, cpu_limit, memory_limit_mb,
      owner_kind, owner_name, total_restarts, qos_class, ...
    """
    if cluster_id:
        cluster_name = cluster_id
    else:
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return ("", [])
        cluster_name = clusters[0]["cluster_name"]

    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return (cluster_name, [])

    pods_domain = metrics.get("pods") or {}
    if isinstance(pods_domain, str):
        pods_domain = json.loads(pods_domain)

    items = pods_domain.get("items", []) if isinstance(pods_domain, dict) else []
    return (cluster_name, items)


# ---------------------------------------------------------------------------
# Core algorithm
# ---------------------------------------------------------------------------

def _build_recommendations(
    pods: list,
    cluster_name: str,
) -> List[WorkloadRecommendation]:
    recs: List[WorkloadRecommendation] = []
    now = datetime.now()

    for pod in pods:
        if pod.get("status") != "Running":
            continue

        namespace  = pod.get("namespace", "default")
        pod_name   = pod.get("name", "unknown")
        owner_kind = pod.get("owner_kind", "Pod")

        cpu_req  = float(pod.get("cpu_request",       0.0))
        mem_req  = float(pod.get("memory_request_mb", 0.0))
        cpu_lim  = float(pod.get("cpu_limit",         0.0))
        mem_lim  = float(pod.get("memory_limit_mb",   0.0))

        # Skip pods with no requests set (BestEffort QoS — nothing to right-size)
        if cpu_req == 0 and mem_req == 0:
            continue

        cpu_use = float(pod.get("cpu_usage_cores", 0.0))
        mem_use = float(pod.get("memory_usage_mb",  0.0))

        # When metrics-server data is absent (cpu_use == mem_use == 0) we can
        # still flag pods whose requests are large enough to right-size by
        # assuming a conservative 30 % utilisation baseline. This avoids
        # producing an empty recommendations page on clusters without
        # metrics-server while staying honest about the estimate source.
        no_usage_data = (cpu_use == 0.0 and mem_use == 0.0)
        if no_usage_data:
            # Assume 30 % utilisation of whatever was requested.
            # Only flag pods that are meaningfully over-provisioned (>0.5 CPU or >512 MiB).
            if cpu_req < 0.5 and mem_req < 512.0:
                continue   # too small to bother flagging
            cpu_use = cpu_req * 0.30
            mem_use = mem_req * 0.30

        # ── recommended values: usage × 1.3 headroom, bounded by minimum ──
        rec_cpu = max(MIN_CPU_CORES, cpu_use * BUFFER)
        rec_mem = max(MIN_MEMORY_MB, mem_use * BUFFER)

        # Limits: 1.5× request (or existing limit if already larger)
        rec_cpu_lim = max(rec_cpu * 1.5, cpu_lim if cpu_lim > 0 else 0.0)
        rec_mem_lim = max(rec_mem * 1.5, mem_lim if mem_lim > 0 else 0.0)

        # ── savings ──────────────────────────────────────────────────────────
        cpu_saved = cpu_req - rec_cpu          # positive → we free cores
        mem_saved = mem_req - rec_mem          # positive → we free MB

        cpu_cost_saved = max(cpu_saved, 0.0) * CPU_COST_PER_CORE_HOUR * HOURS_PER_MONTH
        mem_cost_saved = max(mem_saved, 0.0) / 1024 * MEMORY_COST_PER_GB_HOUR * HOURS_PER_MONTH
        total_savings  = cpu_cost_saved + mem_cost_saved

        # ── waste percentages ────────────────────────────────────────────────
        cpu_waste_pct = ((cpu_req - cpu_use) / cpu_req) if cpu_req > 0 else 0.0
        mem_waste_pct = ((mem_req - mem_use) / mem_req) if mem_req > 0 else 0.0

        # ── status ───────────────────────────────────────────────────────────
        cpu_near_limit = cpu_use >= cpu_req * 0.9 if cpu_req > 0 else False
        mem_near_limit = mem_use >= mem_req * 0.9 if mem_req > 0 else False

        if cpu_near_limit:
            status = RecommendationStatus.INCREASE_CPU
        elif mem_near_limit:
            status = RecommendationStatus.INCREASE_MEMORY
        elif cpu_waste_pct > WASTE_THRESH and mem_waste_pct > WASTE_THRESH:
            status = RecommendationStatus.REDUCE_CPU     # dual-waste → show as CPU reduction
        elif cpu_waste_pct > WASTE_THRESH:
            status = RecommendationStatus.REDUCE_CPU
        elif mem_waste_pct > WASTE_THRESH:
            status = RecommendationStatus.REDUCE_MEMORY
        else:
            status = RecommendationStatus.NO_ACTION

        # ── confidence ───────────────────────────────────────────────────────
        max_waste = max(cpu_waste_pct, mem_waste_pct)
        if max_waste > 0.70:
            confidence = ConfidenceLevel.LOW_RISK
        elif max_waste > 0.50:
            confidence = ConfidenceLevel.MEDIUM_RISK
        else:
            confidence = ConfidenceLevel.HIGH_RISK

        # ── performance impact text ───────────────────────────────────────────
        est_note = " (estimated — metrics-server unavailable)" if no_usage_data else ""
        if status in (RecommendationStatus.REDUCE_CPU,
                      RecommendationStatus.REDUCE_MEMORY):
            pct_used = int((1.0 - max_waste) * 100)
            if max_waste > 0.70:
                perf = f"Minimal — workload uses ~{pct_used}% of requested resources{est_note}"
            else:
                perf = f"Low — resource usage consistently below {pct_used+20}%{est_note}"
        elif status in (RecommendationStatus.INCREASE_CPU,
                        RecommendationStatus.INCREASE_MEMORY):
            perf = f"Prevents throttling/OOMKills — resource usage near limits{est_note}"
        else:
            perf = f"Optimal — resources well-sized{est_note}"

        # ── only emit if there is something actionable ───────────────────────
        if total_savings < 0.50 and status == RecommendationStatus.NO_ACTION:
            continue

        recs.append(WorkloadRecommendation(
            cluster_id=cluster_name,
            namespace=namespace,
            workload_type=owner_kind,
            workload_name=pod_name,
            status=status,
            confidence=confidence,
            cpu=CPURecommendation(
                current_usage=round(cpu_use, 4),
                current_request=round(cpu_req, 4),
                current_limit=round(cpu_lim if cpu_lim > 0 else cpu_req * 2, 4),
                recommended_request=round(rec_cpu, 4),
                recommended_limit=round(rec_cpu_lim, 4),
                cpu_saved=round(cpu_saved, 4),
                cost_saved=round(cpu_cost_saved, 2),
            ),
            memory=MemoryRecommendation(
                current_usage=round(mem_use, 1),
                peak_usage=round(mem_use * 1.15, 1),  # estimated peak = 15% above observed
                current_request=round(mem_req, 1),
                current_limit=round(mem_lim if mem_lim > 0 else mem_req * 2, 1),
                recommended_request=round(rec_mem, 1),
                recommended_limit=round(rec_mem_lim, 1),
                memory_saved=round(mem_saved, 1),
                cost_saved=round(mem_cost_saved, 2),
            ),
            estimated_monthly_savings=round(total_savings, 2),
            performance_impact=perf,
            created_at=now,
        ))

    recs.sort(key=lambda x: x.estimated_monthly_savings, reverse=True)
    return recs


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[WorkloadRecommendation])
async def list_recommendations(
    cluster_id: Optional[str] = Query(None),
    namespace:  Optional[str] = Query(None),
    confidence: Optional[ConfidenceLevel] = Query(None),
    min_savings: Optional[float] = Query(None),
):
    """List right-sizing recommendations derived from real agent pod metrics."""
    try:
        cluster_name, pods = _get_pods(cluster_id)
        if not pods:
            logger.warning("No pod data in DB for cluster_id=%s", cluster_id)
            return []

        recs = _build_recommendations(pods, cluster_name)
        logger.info("Generated %d recommendations from %d pods", len(recs), len(pods))

        if namespace:
            recs = [r for r in recs if r.namespace == namespace]
        if confidence:
            recs = [r for r in recs if r.confidence == confidence]
        if min_savings is not None:
            recs = [r for r in recs if r.estimated_monthly_savings >= min_savings]

        return recs

    except Exception as e:
        logger.error("Error generating recommendations: %s", e)
        return []


@router.get("/summary")
async def get_recommendations_summary(cluster_id: Optional[str] = Query(None)):
    """Summary statistics for all recommendations."""
    try:
        cluster_name, pods = _get_pods(cluster_id)
        if not pods:
            return {
                "total_recommendations": 0,
                "total_potential_monthly_savings": 0.0,
                "total_potential_annual_savings": 0.0,
                "by_status": {},
                "by_confidence": {},
                "top_namespaces_by_savings": [],
            }

        recs = _build_recommendations(pods, cluster_name)

        total_savings = sum(r.estimated_monthly_savings for r in recs)

        by_status: dict = {}
        for r in recs:
            by_status[r.status.value] = by_status.get(r.status.value, 0) + 1

        by_conf: dict = {}
        for r in recs:
            by_conf[r.confidence.value] = by_conf.get(r.confidence.value, 0) + 1

        ns_savings: dict = {}
        for r in recs:
            ns_savings[r.namespace] = ns_savings.get(r.namespace, 0.0) + r.estimated_monthly_savings

        top_ns = sorted(ns_savings.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "total_recommendations": len(recs),
            "total_potential_monthly_savings": round(total_savings, 2),
            "total_potential_annual_savings":  round(total_savings * 12, 2),
            "by_status": by_status,
            "by_confidence": by_conf,
            "top_namespaces_by_savings": [
                {"namespace": ns, "potential_savings": round(s, 2)}
                for ns, s in top_ns
            ],
        }

    except Exception as e:
        logger.error("Error generating recommendations summary: %s", e)
        return {
            "total_recommendations": 0,
            "total_potential_monthly_savings": 0.0,
            "total_potential_annual_savings":  0.0,
            "by_status": {},
            "by_confidence": {},
            "top_namespaces_by_savings": [],
        }


@router.get("/{workload_id}", response_model=WorkloadRecommendation)
async def get_recommendation(workload_id: str):
    """Detailed recommendation for a specific pod/workload."""
    recs = await list_recommendations()
    for rec in recs:
        if rec.workload_name == workload_id:
            return rec
    raise HTTPException(status_code=404, detail="Recommendation not found")
