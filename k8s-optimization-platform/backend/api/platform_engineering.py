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


# ── ArgoCD ─────────────────────────────────────────────────────────────────────

@router.get("/argocd/apps")
async def get_argocd_apps(cluster_id: Optional[str] = Query(None)):
    """Return ArgoCD application list from agent_metrics platform domain."""
    try:
        platform = _domain(cluster_id, "platform")
        apps = platform.get("argocd", {}).get("apps", [])
        return apps
    except Exception as e:
        logger.error(f"Error fetching ArgoCD apps: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── FluxCD ─────────────────────────────────────────────────────────────────────

@router.get("/fluxcd/kustomizations")
async def get_flux_kustomizations(cluster_id: Optional[str] = Query(None)):
    """Return Flux kustomization list from agent_metrics platform domain."""
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("fluxcd", {}).get("kustomizations", [])
    except Exception as e:
        logger.error(f"Error fetching FluxCD kustomizations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GitOps Drift ───────────────────────────────────────────────────────────────

@router.get("/gitops/drift")
async def get_gitops_drift(cluster_id: Optional[str] = Query(None)):
    """Return GitOps drift events from agent_metrics platform domain."""
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("gitops_drift", [])
    except Exception as e:
        logger.error(f"Error fetching GitOps drift: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── CI/CD pipelines ────────────────────────────────────────────────────────────

@router.get("/pipelines/github-actions")
async def get_github_actions(cluster_id: Optional[str] = Query(None)):
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("github_actions", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pipelines/gitlab-ci")
async def get_gitlab_ci(cluster_id: Optional[str] = Query(None)):
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("gitlab_ci", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pipelines/jenkins")
async def get_jenkins_jobs(cluster_id: Optional[str] = Query(None)):
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("jenkins", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pipelines/tekton")
async def get_tekton_pipelines(cluster_id: Optional[str] = Query(None)):
    try:
        platform = _domain(cluster_id, "platform")
        return platform.get("tekton", {}).get("pipelines", [])
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
        return platform.get("policy_as_code", [])
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
