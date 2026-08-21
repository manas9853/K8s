"""
Hourly CI/CD pipeline re-sync — Celery Beat task.

Same reasoning as tasks/billing_sync_tasks.py: connecting once and never
refreshing goes stale immediately. CI/CD runs change far more often than
billing, hence hourly here vs. daily for billing.
"""
from __future__ import annotations

import logging

import httpx

from celery_app import celery_app
from database.db import db_manager

logger = logging.getLogger(__name__)

_BASE = "http://localhost:8000"


def _active_cicd_integrations() -> list[tuple[str, str]]:
    """Returns [(cluster_name, provider), ...] for every active integration."""
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT cluster_name, provider FROM cicd_integrations WHERE status = 'active'")
            rows = cur.fetchall()
            return [
                (r["cluster_name"], r["provider"]) if isinstance(r, dict) else (r[0], r[1])
                for r in rows
            ]
    except Exception as exc:
        logger.error(f"Could not list active CI/CD integrations: {exc}")
        return []


@celery_app.task(name="tasks.cicd_sync_tasks.hourly_cicd_sync", bind=True, max_retries=0)
def hourly_cicd_sync(self):
    integrations = _active_cicd_integrations()
    logger.info(f"hourly_cicd_sync: {len(integrations)} connected integration(s) to refresh")

    results = {"synced": [], "failed": []}
    with httpx.Client(timeout=60.0) as client:
        for cluster_name, provider in integrations:
            try:
                r = client.post(
                    f"{_BASE}/api/v1/cicd/sync",
                    params={"cluster": cluster_name, "provider": provider},
                )
                r.raise_for_status()
                results["synced"].append(f"{cluster_name}/{provider}")
            except Exception as exc:
                logger.warning(f"hourly_cicd_sync failed for {cluster_name}/{provider}: {exc}")
                results["failed"].append({"cluster": cluster_name, "provider": provider, "error": str(exc)})

    logger.info(f"hourly_cicd_sync done: {len(results['synced'])} ok, {len(results['failed'])} failed")
    return results
