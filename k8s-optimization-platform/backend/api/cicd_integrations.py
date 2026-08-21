"""
CI/CD Integrations API — connects a cluster to Jenkins / GitHub Actions /
GitLab CI so Platform Engineering's pipeline pages show real runs instead
of an empty list (the agent can't collect this — these are external SaaS
or self-hosted services outside the cluster network, so the backend polls
them directly using a customer-provided token, the same pattern as
api/discovery.py's cloud billing integrations).

Security:
- Tokens are Fernet-encrypted (utils/crypto.py, shared with discovery.py)
  before storage, never returned in responses.
- Read-only scope: GitHub PAT needs only `repo` (read) / `actions:read`,
  GitLab token needs `read_api`, Jenkins account needs only read access to
  the jobs you point it at. We never call any write endpoint.
"""
import logging
import time
import urllib.parse
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database.db import db_manager
from utils.crypto import encrypt_secret, decrypt_secret

router = APIRouter(tags=["CI/CD Integrations"])
logger = logging.getLogger(__name__)

PROVIDERS = ("GitHub Actions", "GitLab CI", "Jenkins")


# ── Pydantic models ────────────────────────────────────────────────────────────

class CicdConnectRequest(BaseModel):
    cluster_name: str
    provider: str               # "GitHub Actions" | "GitLab CI" | "Jenkins"
    token: str                  # PAT / private token / Jenkins API token
    project_ref: str            # "owner/repo" (GH) | project path or ID (GL) | job name (Jenkins)
    base_url: Optional[str] = None   # self-hosted GitLab/Jenkins; unset = gitlab.com
    username: Optional[str] = None   # Jenkins basic auth


class CicdValidateRequest(BaseModel):
    provider: str
    token: str
    project_ref: str
    base_url: Optional[str] = None
    username: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_cicd_status(cluster: str = Query(...)):
    """All CI/CD integrations connected for a cluster (a cluster can have
    more than one — e.g. GitHub Actions AND Jenkins at once)."""
    rows = _list_configs(cluster)
    return [
        {
            "provider":     r["provider"],
            "project_ref":  r["project_ref"],
            "connected":    r["status"] == "active" and r.get("last_sync_ok", False),
            "status":       r["status"],
            "last_sync_at": r.get("last_sync_at"),
            "last_sync_ok": r.get("last_sync_ok", False),
            "last_error":   r.get("last_error"),
        }
        for r in rows
    ]


@router.post("/connect")
async def connect_cicd(body: CicdConnectRequest):
    if body.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'. Supported: {PROVIDERS}")

    valid, err = await _validate_credentials(body.provider, body.token, body.project_ref, body.base_url, body.username)
    if not valid:
        raise HTTPException(status_code=422, detail=f"Credential validation failed: {err}")

    token_enc = encrypt_secret(body.token)
    _upsert_config(body.cluster_name, body.provider, body.base_url, body.username,
                   token_enc, body.project_ref, "pending")

    try:
        runs = await _sync_provider(body.provider, token_enc, body.project_ref, body.base_url, body.username)
        db_manager.upsert_cicd_pipeline_cache(body.cluster_name, body.provider, runs)
        _update_sync_status(body.cluster_name, body.provider, ok=True, error=None)
        _upsert_config(body.cluster_name, body.provider, body.base_url, body.username,
                       token_enc, body.project_ref, "active")
    except Exception as exc:
        _update_sync_status(body.cluster_name, body.provider, ok=False, error=str(exc))
        _upsert_config(body.cluster_name, body.provider, body.base_url, body.username,
                       token_enc, body.project_ref, "error")
        raise HTTPException(status_code=502, detail=f"Initial sync failed: {exc}")

    return {"status": "active", "message": f"{body.provider} connected and synced successfully"}


@router.post("/validate")
async def validate_cicd(body: CicdValidateRequest):
    if body.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'. Supported: {PROVIDERS}")
    valid, err = await _validate_credentials(body.provider, body.token, body.project_ref, body.base_url, body.username)
    return {"valid": valid, "error": err if not valid else None}


@router.post("/sync")
async def trigger_sync(cluster: str = Query(...), provider: str = Query(...)):
    row = _get_config(cluster, provider)
    if row is None or row["status"] not in ("active", "error"):
        raise HTTPException(status_code=404, detail=f"No active {provider} integration for cluster '{cluster}'")

    try:
        runs = await _sync_provider(
            provider, row["token_enc"], row["project_ref"], row.get("base_url"), row.get("username"),
        )
        db_manager.upsert_cicd_pipeline_cache(cluster, provider, runs)
        _update_sync_status(cluster, provider, ok=True, error=None)
    except Exception as exc:
        _update_sync_status(cluster, provider, ok=False, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}")

    return {"synced": True, "run_count": len(runs)}


@router.delete("/disconnect")
async def disconnect_cicd(cluster: str = Query(...), provider: str = Query(...)):
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM cicd_integrations WHERE cluster_name = %s AND provider = %s",
                (cluster, provider),
            )
            cur.execute(
                "DELETE FROM cicd_pipeline_cache WHERE cluster_name = %s AND provider = %s",
                (cluster, provider),
            )
            conn.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"disconnected": True}


# ── Credential validation dispatcher ───────────────────────────────────────────

async def _validate_credentials(
    provider: str, token: str, project_ref: str,
    base_url: Optional[str], username: Optional[str],
) -> tuple[bool, str]:
    try:
        if provider == "GitHub Actions":
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"https://api.github.com/repos/{project_ref}",
                    headers=_github_headers(token),
                )
                if resp.status_code == 404:
                    return False, f"Repo '{project_ref}' not found or token can't see it"
                if resp.status_code != 200:
                    return False, f"GitHub rejected the token (HTTP {resp.status_code})"
            return True, ""

        elif provider == "GitLab CI":
            gl_base = (base_url or "https://gitlab.com").rstrip("/")
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{gl_base}/api/v4/projects/{urllib.parse.quote_plus(project_ref)}",
                    headers={"PRIVATE-TOKEN": token},
                )
                if resp.status_code == 404:
                    return False, f"Project '{project_ref}' not found or token can't see it"
                if resp.status_code != 200:
                    return False, f"GitLab rejected the token (HTTP {resp.status_code})"
            return True, ""

        elif provider == "Jenkins":
            if not base_url:
                return False, "base_url is required for Jenkins"
            if not username:
                return False, "username is required for Jenkins (basic auth: username + API token)"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(f"{base_url.rstrip('/')}/api/json", auth=(username, token))
                if resp.status_code == 401:
                    return False, "Jenkins rejected the username/token"
                if resp.status_code != 200:
                    return False, f"Jenkins request failed (HTTP {resp.status_code})"
            return True, ""

        else:
            return False, f"Unsupported provider '{provider}'"

    except httpx.RequestError as exc:
        return False, f"Network error during validation: {exc}"
    except Exception as exc:
        logger.error(f"_validate_credentials error ({provider}): {exc}")
        return False, str(exc)


def _github_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


# ── Sync dispatcher + per-provider run fetchers ────────────────────────────────

async def _sync_provider(
    provider: str, token_enc: str, project_ref: str,
    base_url: Optional[str], username: Optional[str],
) -> list[dict]:
    if provider not in PROVIDERS:
        raise ValueError(f"Unsupported provider '{provider}'")
    token = decrypt_secret(token_enc)
    if provider == "GitHub Actions":
        return await _sync_github_actions(token, project_ref)
    elif provider == "GitLab CI":
        return await _sync_gitlab_ci(token, project_ref, base_url)
    elif provider == "Jenkins":
        return await _sync_jenkins(token, username, base_url)


def _gh_duration(started: Optional[str], updated: Optional[str]) -> str:
    if not started or not updated:
        return ""
    try:
        s = datetime.fromisoformat(started.replace("Z", "+00:00"))
        e = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        secs = max(int((e - s).total_seconds()), 0)
        return f"{secs // 60}m{secs % 60}s" if secs >= 60 else f"{secs}s"
    except Exception:
        return ""


async def _sync_github_actions(token: str, project_ref: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{project_ref}/actions/runs",
            headers=_github_headers(token),
            params={"per_page": 20},
        )
        if resp.status_code != 200:
            raise ValueError(f"GitHub Actions API failed: {resp.text[:300]}")
        runs = resp.json().get("workflow_runs", [])

    return [
        {
            "workflow":    r.get("name") or r.get("path") or "unknown",
            "repo":        project_ref,
            "branch":      r.get("head_branch") or "",
            "status":      r.get("status") or "unknown",
            "conclusion":  r.get("conclusion") or "",
            "duration":    _gh_duration(r.get("run_started_at"), r.get("updated_at")),
            "triggeredAt": r.get("run_started_at") or r.get("created_at") or "",
        }
        for r in runs
    ]


async def _sync_gitlab_ci(token: str, project_ref: str, base_url: Optional[str]) -> list[dict]:
    gl_base = (base_url or "https://gitlab.com").rstrip("/")
    encoded_ref = urllib.parse.quote_plus(project_ref)
    headers = {"PRIVATE-TOKEN": token}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{gl_base}/api/v4/projects/{encoded_ref}/pipelines",
            headers=headers, params={"per_page": 20, "order_by": "id", "sort": "desc"},
        )
        if resp.status_code != 200:
            raise ValueError(f"GitLab CI API failed: {resp.text[:300]}")
        pipelines = resp.json()

        # Per-pipeline detail call for duration/triggered-by — the list
        # endpoint doesn't include them. Capped at 10 to keep sync fast;
        # ponytail: bounded N+1, fine at this volume, would need batching
        # (or GraphQL) past a few dozen pipelines per sync.
        details = []
        for p in pipelines[:10]:
            d = await client.get(f"{gl_base}/api/v4/projects/{encoded_ref}/pipelines/{p['id']}", headers=headers)
            details.append(d.json() if d.status_code == 200 else p)

    return [
        {
            "project":     project_ref,
            "branch":      p.get("ref") or "",
            # GitLab's pipeline object has no single "current stage" field
            # (stages live under /pipelines/:id/jobs) — using status as a
            # stand-in rather than adding another N+1 call per pipeline.
            "stage":       p.get("status") or "",
            "status":      p.get("status") or "unknown",
            "duration":    f"{p['duration']}s" if p.get("duration") else "",
            "triggeredAt": p.get("created_at") or "",
            "triggeredBy": (p.get("user") or {}).get("name") or "",
        }
        for p in details
    ]


async def _sync_jenkins(token: str, username: Optional[str], base_url: Optional[str]) -> list[dict]:
    if not base_url or not username:
        raise ValueError("base_url and username are required for Jenkins")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{base_url.rstrip('/')}/api/json",
            auth=(username, token),
            params={"tree": "jobs[name,url,lastBuild[number,timestamp,duration,result,"
                             "actions[causes[shortDescription]]]]"},
        )
        if resp.status_code != 200:
            raise ValueError(f"Jenkins API failed: {resp.text[:300]}")
        jobs = resp.json().get("jobs", [])

    out = []
    for job in jobs:
        lb = job.get("lastBuild") or {}
        triggered_by = ""
        for action in (lb.get("actions") or []):
            for cause in (action.get("causes") or []):
                if cause.get("shortDescription"):
                    triggered_by = cause["shortDescription"]
                    break
            if triggered_by:
                break
        duration_ms = lb.get("duration") or 0
        out.append({
            "jobName":     job.get("name") or "unknown",
            "lastBuild":   f"#{lb.get('number')}" if lb.get("number") else "",
            "buildNumber": lb.get("number") or 0,
            # null result = still running (Jenkins omits `result` until done)
            "status":      lb.get("result") or "RUNNING",
            "duration":    f"{duration_ms // 1000}s" if duration_ms else "",
            "triggeredBy": triggered_by,
            "timestamp":   str(lb.get("timestamp") or ""),
        })
    return out


# ── Database helpers ───────────────────────────────────────────────────────────

def _get_config(cluster_name: str, provider: str) -> Optional[dict]:
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM cicd_integrations WHERE cluster_name = %s AND provider = %s",
                (cluster_name, provider),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        logger.debug(f"_get_config({cluster_name}, {provider}): {exc}")
        return None


def _list_configs(cluster_name: str) -> list[dict]:
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM cicd_integrations WHERE cluster_name = %s", (cluster_name,))
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        logger.debug(f"_list_configs({cluster_name}): {exc}")
        return []


def _upsert_config(
    cluster_name: str, provider: str, base_url: Optional[str], username: Optional[str],
    token_enc: str, project_ref: str, status: str,
) -> None:
    now = datetime.utcnow().isoformat() + "Z"
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO cicd_integrations
                    (cluster_name, provider, base_url, username, token_enc,
                     project_ref, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (cluster_name, provider) DO UPDATE SET
                    base_url    = EXCLUDED.base_url,
                    username    = EXCLUDED.username,
                    token_enc   = EXCLUDED.token_enc,
                    project_ref = EXCLUDED.project_ref,
                    status      = EXCLUDED.status,
                    updated_at  = EXCLUDED.updated_at
                """,
                (cluster_name, provider, base_url, username, token_enc, project_ref, status, now, now),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"_upsert_config({cluster_name}, {provider}): {exc}")
        raise


def _update_sync_status(cluster_name: str, provider: str, ok: bool, error: Optional[str]) -> None:
    now = datetime.utcnow().isoformat() + "Z"
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE cicd_integrations
                SET last_sync_at = %s, last_sync_ok = %s, last_error = %s, updated_at = %s
                WHERE cluster_name = %s AND provider = %s
                """,
                (now, ok, error, now, cluster_name, provider),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"_update_sync_status({cluster_name}, {provider}): {exc}")
        raise
