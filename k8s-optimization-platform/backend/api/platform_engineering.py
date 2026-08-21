"""
Platform Engineering API — reads CI/CD and GitOps data from agent_metrics.

Each endpoint tries to read from the live agent_metrics snapshot collected by
the K8s agent.  If the cluster has no data yet (DB empty) the endpoint returns
an empty list rather than falling back to fake data.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from database.db import db_manager
from api.workloads import _format_age as _age_from_iso

router = APIRouter(tags=["platform-engineering"])
logger = logging.getLogger(__name__)


# ── helpers ────────────────────────────────────────────────────────────────────

def _get_metrics(cluster_id: Optional[str]) -> Dict[str, Any]:
    """Return the latest agent_metrics dict for the requested cluster."""
    clusters = db_manager.get_all_clusters()
    if not clusters:
        return {}
    cn = cluster_id or clusters[0]["cluster_name"]
    row = db_manager.get_latest_metrics(cn)
    if not row:
        return {}
    return row if isinstance(row, dict) else {}


def _domain(cluster_id: Optional[str], key: str) -> Dict[str, Any]:
    """Return a specific domain dict from agent_metrics."""
    m = _get_metrics(cluster_id)
    val = m.get(key) or {}
    if isinstance(val, str):
        import json
        try:
            val = json.loads(val)
        except Exception:
            val = {}
    return val


def _cluster_name(cluster_id: Optional[str]) -> str:
    clusters = db_manager.get_all_clusters()
    if not clusters:
        return cluster_id or "unknown"
    return cluster_id or clusters[0]["cluster_name"]


# ── ArgoCD ─────────────────────────────────────────────────────────────────────

@router.get("/argocd/apps")
async def get_argocd_apps(cluster_id: Optional[str] = Query(None)):
    """Return ArgoCD application list from agent_metrics platform domain."""
    try:
        platform = _domain(cluster_id, "platform")
        apps = platform.get("argocd", {}).get("apps", [])
        cluster = _cluster_name(cluster_id)
        return [
            {
                "appName":        a.get("name"),
                "repoUrl":        a.get("repo"),
                "targetRevision": a.get("target_revision"),
                "syncStatus":     a.get("sync_status"),
                "healthStatus":   a.get("health_status"),
                "lastSyncTime":   a.get("last_sync_at"),
                "cluster":        cluster,
            }
            for a in apps
        ]
    except Exception as e:
        logger.error(f"Error fetching ArgoCD apps: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── FluxCD ─────────────────────────────────────────────────────────────────────

@router.get("/fluxcd/kustomizations")
async def get_flux_kustomizations(cluster_id: Optional[str] = Query(None)):
    """Return Flux kustomization list from agent_metrics platform domain."""
    try:
        platform = _domain(cluster_id, "platform")
        items = platform.get("fluxcd", {}).get("kustomizations", [])
        return [
            {
                "name":                   k.get("name"),
                "namespace":              k.get("namespace"),
                "sourceRef":              k.get("source"),
                "ready":                  k.get("ready", False),
                "suspended":              k.get("suspended", False),
                "lastAppliedRevision":    k.get("revision"),
                "lastAttemptedRevision":  k.get("last_attempted_revision"),
                "age":                    _age_from_iso(k.get("created")),
            }
            for k in items
        ]
    except Exception as e:
        logger.error(f"Error fetching FluxCD kustomizations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GitOps Drift ───────────────────────────────────────────────────────────────

@router.get("/gitops/drift")
async def get_gitops_drift(cluster_id: Optional[str] = Query(None)):
    """
    Return GitOps drift events, derived from ArgoCD applications whose live
    cluster state has diverged from git (sync_status == OutOfSync).
    Resource-level diffs aren't available — ArgoCD's own API only exposes
    "in sync or not" at the Application level, not a field-by-field diff.
    """
    try:
        platform = _domain(cluster_id, "platform")
        drift = platform.get("gitops_drift", [])
        return [
            {
                "resourceName":  d.get("name"),
                "kind":          "Application",
                "namespace":     d.get("namespace"),
                "expectedState": "Synced",
                "currentState":  f"{d.get('sync_status')} ({d.get('health_status')})",
                "driftStatus":   "Drifted",
                "detectedAt":    None,
            }
            for d in drift
        ]
    except Exception as e:
        logger.error(f"Error fetching GitOps drift: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── CI/CD pipelines ────────────────────────────────────────────────────────────

@router.get("/pipelines/github-actions")
async def get_github_actions(cluster_id: Optional[str] = Query(None)):
    """
    Real GitHub Actions runs, polled by the backend (see
    api/cicd_integrations.py — these are external SaaS the agent can't
    reach from inside the cluster's own scope of concern). Empty list
    means "not connected yet", not an error.
    """
    try:
        return db_manager.get_cicd_pipeline_cache(_cluster_name(cluster_id), "GitHub Actions")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pipelines/gitlab-ci")
async def get_gitlab_ci(cluster_id: Optional[str] = Query(None)):
    try:
        return db_manager.get_cicd_pipeline_cache(_cluster_name(cluster_id), "GitLab CI")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pipelines/jenkins")
async def get_jenkins_jobs(cluster_id: Optional[str] = Query(None)):
    try:
        return db_manager.get_cicd_pipeline_cache(_cluster_name(cluster_id), "Jenkins")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _tekton_duration(start: Optional[str], end: Optional[str]) -> str:
    if not start or not end:
        return ""
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end.replace("Z", "+00:00"))
        secs = max(int((e - s).total_seconds()), 0)
        return f"{secs // 60}m{secs % 60}s" if secs >= 60 else f"{secs}s"
    except Exception:
        return ""


@router.get("/pipelines/tekton")
async def get_tekton_pipelines(cluster_id: Optional[str] = Query(None)):
    try:
        platform = _domain(cluster_id, "platform")
        runs = platform.get("tekton", {}).get("pipelines", [])
        return [
            {
                "name":           r.get("name"),
                "namespace":      r.get("namespace"),
                "status":         r.get("status"),
                "taskCount":      r.get("task_count", 0),
                "duration":       _tekton_duration(r.get("start_time"), r.get("completion_time")),
                "startTime":      r.get("start_time"),
                "completionTime": r.get("completion_time"),
            }
            for r in runs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Policy / IaC ───────────────────────────────────────────────────────────────

@router.get("/policy/standards")
async def get_platform_standards(cluster_id: Optional[str] = Query(None)):
    """Return OPA/Kyverno policy standard results."""
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("policy_standards", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/policy/code")
async def get_policy_as_code(cluster_id: Optional[str] = Query(None)):
    """Return policy-as-code (OPA/Kyverno) violations."""
    try:
        platform = _domain(cluster_id, "platform")
        violations = platform.get("policy_as_code", [])
        return [
            {
                "policy":     v.get("policy"),
                "kind":       v.get("kind"),
                "resource":   v.get("resource"),
                "namespace":  v.get("namespace"),
                "severity":   v.get("severity"),
                "message":    v.get("message"),
                "detectedAt": v.get("detected_at"),
            }
            for v in violations
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/iac")
async def get_infra_as_code(cluster_id: Optional[str] = Query(None)):
    """Return IaC (Terraform/Pulumi) resource list."""
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("iac", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Deployment Intelligence ────────────────────────────────────────────────────

@router.get("/deployment-intelligence")
async def get_deployment_intelligence(cluster_id: Optional[str] = Query(None)):
    """Return deployment frequency, lead time, DORA metrics."""
    try:
        platform = _domain(cluster_id, "platform")
        deployments = platform.get("deployments", [])
        if not deployments:
            # Derive from workloads domain
            workloads = _domain(cluster_id, "workloads")
            items = workloads.get("deployments", {}).get("items", [])
            deployments = [
                {
                    "name": d.get("name"),
                    "namespace": d.get("namespace"),
                    "replicas": d.get("replicas", 0),
                    "ready_replicas": d.get("ready_replicas", 0),
                    "strategy": d.get("strategy", "RollingUpdate"),
                    "age": d.get("age", "—"),
                }
                for d in items
            ]
        return deployments
    except Exception as e:
        logger.error(f"Error fetching deployment intelligence: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Made with Bob
