"""
Daily cloud billing re-sync — Celery Beat task.

Billing data isn't static: RI/Savings Plan utilization, discount tiers, and
month-end true-ups all shift day to day. The Phase-2-connected estimate
must be refreshed on a schedule, not just once at connect time — see
api/discovery.py's docstring for the invoice-vs-estimate design.

Runs once daily (see celery_app.py's beat_schedule), hits the backend's
own /sync endpoint per active cluster — same pattern as compliance_tasks.py,
avoids importing async FastAPI internals into a sync Celery worker.
"""
from __future__ import annotations

import logging

import httpx

from celery_app import celery_app
from database.db import db_manager

logger = logging.getLogger(__name__)

_BASE = "http://localhost:8000"


def _active_discovery_clusters() -> list[str]:
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT cluster_name FROM cloud_discovery_config WHERE status = 'active'")
            rows = cur.fetchall()
            return [r["cluster_name"] if isinstance(r, dict) else r[0] for r in rows]
    except Exception as exc:
        logger.error(f"Could not list active discovery clusters: {exc}")
        return []


@celery_app.task(name="tasks.billing_sync_tasks.daily_billing_sync", bind=True, max_retries=0)
def daily_billing_sync(self):
    clusters = _active_discovery_clusters()
    logger.info(f"daily_billing_sync: {len(clusters)} connected cluster(s) to refresh")

    results = {"synced": [], "failed": []}
    with httpx.Client(timeout=60.0) as client:
        for cluster_name in clusters:
            try:
                r = client.post(f"{_BASE}/api/v1/discovery/sync", params={"cluster": cluster_name})
                r.raise_for_status()
                results["synced"].append(cluster_name)
            except Exception as exc:
                logger.warning(f"daily_billing_sync failed for {cluster_name}: {exc}")
                results["failed"].append({"cluster": cluster_name, "error": str(exc)})

    logger.info(f"daily_billing_sync done: {len(results['synced'])} ok, {len(results['failed'])} failed")
    return results
