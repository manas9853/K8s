"""
Root Cause Analysis API (Phase A — Workload agent, Phase B — Networking
agent active verification, Phase C — validated apply, Phase D — outcome
tracking, Phase E — LLM-assisted fallback for unrecognized failures).

Multi-hypothesis, evidence-ranked root cause analysis for failing pods —
see services/rca_engine.py for the Investigator framework. Additive: does
not replace api/incidents.py's existing resource-pressure correlation
endpoints, which stay as-is.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict, List, Optional
import asyncio
import logging
import os
import time

from database.db import db_manager

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_cluster(cluster_id: Optional[str]) -> str:
    clusters = db_manager.get_all_clusters()
    if not clusters:
        raise HTTPException(status_code=503, detail="No registered clusters")
    if cluster_id:
        return cluster_id
    return clusters[0]["cluster_name"]


def _pods_and_events(cluster_name: str) -> tuple:
    metrics = db_manager.get_latest_metrics(cluster_name)
    if not metrics:
        return [], []
    pods_domain = metrics.get("pods") or {}
    if isinstance(pods_domain, str):
        import json
        pods_domain = json.loads(pods_domain) if pods_domain else {}
    obs_domain = metrics.get("observability") or {}
    if isinstance(obs_domain, str):
        import json
        obs_domain = json.loads(obs_domain) if obs_domain else {}
    return pods_domain.get("items", []), obs_domain.get("warning_events", [])


async def _llm_fallback_for(pod: Dict[str, Any], events: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    """Phase E — only calls the LLM when the pod actually has an
    unrecognized failure signal and OPENAI_API_KEY is configured; any
    error degrades to None (the honest "no LLM" note in add_llm_fallback)
    rather than breaking the whole RCA response."""
    from services.rca_engine import has_unrecognized_failure_signal, llm_investigate
    if not has_unrecognized_failure_signal(pod):
        return None
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return None
    try:
        return await llm_investigate(pod, events, api_key)
    except Exception as e:
        logger.warning(f"Phase E LLM investigation failed for {pod.get('name')}: {e}")
        return None


@router.get("/pod/{pod_name}")
async def get_pod_rca(pod_name: str, namespace: Optional[str] = Query(None),
                       cluster_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    """Multi-hypothesis root cause analysis for one pod."""
    from services.rca_engine import investigate_pod, apply_fix_confidence, add_llm_fallback
    cluster_name = _resolve_cluster(cluster_id)
    pods, events = _pods_and_events(cluster_name)

    pod = next((p for p in pods if p.get("name") == pod_name
                and (namespace is None or p.get("namespace") == namespace)), None)
    if not pod:
        raise HTTPException(status_code=404, detail=f"Pod {pod_name} not found in latest metrics for {cluster_name}")

    result = investigate_pod(pod, events)
    result = apply_fix_confidence(result, "oom_killed", db_manager.get_rca_fix_success_rate("oom_killed"))
    if not result["findings"]:
        result = add_llm_fallback(result, pod, await _llm_fallback_for(pod, events))
    result["cluster_name"] = cluster_name
    return result


@router.get("/cluster")
async def get_cluster_rca(cluster_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    """Root cause analysis for every currently-failing pod in the cluster."""
    from services.rca_engine import investigate_pod, apply_fix_confidence, add_llm_fallback
    cluster_name = _resolve_cluster(cluster_id)
    pods, events = _pods_and_events(cluster_name)
    oom_success_rate = db_manager.get_rca_fix_success_rate("oom_killed")

    results: List[Dict[str, Any]] = []
    for pod in pods:
        r = investigate_pod(pod, events)
        if not r["findings"]:
            # N unrecognized pods = N LLM calls — fine for typical failure
            # counts; batch if this ever becomes a real bottleneck.
            r = add_llm_fallback(r, pod, await _llm_fallback_for(pod, events))
        if not r["healthy"]:
            r = apply_fix_confidence(r, "oom_killed", oom_success_rate)
            results.append(r)

    # Highest top-hypothesis confidence first
    results.sort(
        key=lambda r: max((h["confidence"] for f in r["findings"] for h in f["hypotheses"]), default=0),
        reverse=True,
    )

    return {
        "cluster_name": cluster_name,
        "pods_analyzed": len(pods),
        "pods_with_findings": len(results),
        "results": results,
    }


@router.post("/pod/{pod_name}/verify-network")
async def verify_pod_network(pod_name: str, namespace: Optional[str] = Query(None),
                              cluster_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    """
    Active verification (Phase B — Networking agent). Enqueues the agent's
    diagnose_image_pull probe (real registry/DNS/pull-secret checks — see
    agent/agent.py:_diagnose_image_pull), waits for the result, and returns
    the pod's RCA with the image_pull hypotheses replaced by validated
    ones. This is the Coordinator's cross-domain handoff: the Workload
    agent's own hypotheses for this pod stay unvalidated until this runs.
    """
    from services.rca_engine import investigate_pod, apply_network_validation

    cluster_name = _resolve_cluster(cluster_id)
    pods, events = _pods_and_events(cluster_name)
    pod = next((p for p in pods if p.get("name") == pod_name
                and (namespace is None or p.get("namespace") == namespace)), None)
    if not pod:
        raise HTTPException(status_code=404, detail=f"Pod {pod_name} not found in latest metrics for {cluster_name}")

    cmd_id = db_manager.enqueue_command(
        cluster_name, "diagnose_image_pull",
        {"namespace": pod.get("namespace", "default"), "name": pod_name},
    )
    if not cmd_id:
        raise HTTPException(status_code=500, detail="Failed to enqueue diagnostic command")

    deadline = time.time() + 90
    while time.time() < deadline:
        await asyncio.sleep(1.5)
        row = db_manager.get_command(cmd_id)
        if not row:
            continue
        if row["status"] == "done":
            probe = row.get("result") or {}
            result = investigate_pod(pod, events)
            result = apply_network_validation(result, probe)
            result["cluster_name"] = cluster_name
            return result
        if row["status"] == "failed":
            err = (row.get("result") or {}).get("error", "Command failed")
            raise HTTPException(status_code=500, detail=f"Agent diagnostic failed: {err}")

    raise HTTPException(status_code=504, detail="Timed out waiting for agent to run the diagnostic probe")


@router.post("/pod/{pod_name}/apply-fix")
async def apply_pod_fix(pod_name: str, namespace: Optional[str] = Query(None),
                         cluster_id: Optional[str] = Query(None)) -> Dict[str, Any]:
    """
    Phase C — validated apply. Wired for the oom_killed failure class only:
    it's the one hypothesis with a well-defined, mechanical fix (raise the
    memory limit to a computed value) — the others (wrong image tag,
    missing credentials, missing ConfigMap/Secret) need a human to supply
    something we don't have, so they stay recommendation-only.

    Recomputes the fix from CURRENT real pod data server-side — never
    trusts a client-supplied target value. The agent validates with a
    server-side dry-run before applying for real, then re-reads the
    Deployment to confirm the change actually took effect (see
    agent.py's patch_deployment_resources handler) — that result is
    returned here, and an SSE broadcast fires immediately so the UI
    reflects the real cluster state without waiting for the next
    collection cycle.
    """
    from services.rca_engine import investigate_pod, deployment_target, recommended_memory_limit_mb

    cluster_name = _resolve_cluster(cluster_id)
    pods, events = _pods_and_events(cluster_name)
    pod = next((p for p in pods if p.get("name") == pod_name
                and (namespace is None or p.get("namespace") == namespace)), None)
    if not pod:
        raise HTTPException(status_code=404, detail=f"Pod {pod_name} not found in latest metrics for {cluster_name}")

    result = investigate_pod(pod, events)
    if not any(f["failure_class"] == "oom_killed" for f in result["findings"]):
        raise HTTPException(status_code=400, detail="No oom_killed finding for this pod — nothing to apply")

    target = deployment_target(pod)
    if not target:
        raise HTTPException(
            status_code=400,
            detail=f"Pod is owned by {pod.get('owner_kind') or 'nothing'}, not a ReplicaSet — "
                   f"auto-apply only supports Deployment-managed pods for now",
        )

    mem_req = float(pod.get("memory_request_mb") or 0)
    mem_lim = float(pod.get("memory_limit_mb") or 0)
    rec_limit = recommended_memory_limit_mb(mem_req, mem_lim)

    cmd_id = db_manager.enqueue_command(
        cluster_name, "patch_deployment_resources",
        {"namespace": pod.get("namespace", "default"), "name": target["deployment"],
         "container_name": target["container"], "memory_limit": f"{round(rec_limit)}Mi"},
    )
    if not cmd_id:
        raise HTTPException(status_code=500, detail="Failed to enqueue fix command")

    deadline = time.time() + 90
    while time.time() < deadline:
        await asyncio.sleep(1.5)
        row = db_manager.get_command(cmd_id)
        if not row:
            continue
        if row["status"] == "done":
            from api.agent_receiver import _broadcast
            _broadcast(cluster_name)
            db_manager.record_rca_fix_applied(
                cluster_name, pod_name, pod.get("namespace", "default"), "oom_killed",
                {"deployment": target["deployment"], "container": target["container"],
                 "memory_limit": f"{round(rec_limit)}Mi"},
                baseline_restarts=int(pod.get("total_restarts") or 0),
            )
            return {
                "applied": True,
                "deployment": target["deployment"],
                "container": target["container"],
                "memory_limit": f"{round(rec_limit)}Mi",
                "result": row.get("result") or {},
            }
        if row["status"] == "failed":
            err = (row.get("result") or {}).get("error", "Command failed")
            raise HTTPException(status_code=500, detail=f"Apply failed: {err}")

    raise HTTPException(status_code=504, detail="Timed out waiting for agent to apply the fix")
