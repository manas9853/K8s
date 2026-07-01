"""
Cluster Registry — Single source of truth for cluster identity
==============================================================
Every API module that generates data imports get_clusters() from here.
Returns real agent-registered clusters from the database only.
No dummy/fallback data — if no real clusters exist, returns an empty list.
"""
from database.db import db_manager
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


def get_clusters() -> List[Dict[str, Any]]:
    """
    Return the live cluster list from the database.

    Returns only real agent-registered clusters.
    Returns an empty list when no real clusters are registered.
    """
    try:
        db_clusters = db_manager.get_all_clusters()
        if db_clusters:
            return [
                {
                    "id": c["cluster_name"],
                    "name": c["cluster_name"],
                    "environment": c.get("environment") or "unknown",
                    "region": c.get("region") or "unknown",
                    "provider": c.get("cloud_provider") or "unknown",
                    "version": c.get("version") or "unknown",
                }
                for c in db_clusters
            ]
    except Exception as e:
        logger.warning(f"cluster_registry: DB lookup failed: {e}")

    return []


def get_cluster_ids() -> List[str]:
    """Return just the cluster ID strings."""
    return [c["id"] for c in get_clusters()]


def filter_by_cluster(items: List[Dict], cluster_id: str, key: str = "cluster_id") -> List[Dict]:
    """
    Filter a list of dicts by cluster_id.
    If cluster_id is None / 'all', returns the full list.
    """
    if not cluster_id or cluster_id == "all":
        return items
    return [i for i in items if i.get(key) == cluster_id]


# Made with Bob
