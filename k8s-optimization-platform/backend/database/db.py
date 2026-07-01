"""
Database Manager — Supabase (Postgres) + Upstash Redis
- agent_clusters and agent_metrics are persisted in Supabase
- Latest metrics are cached in Upstash Redis (TTL 5 min, fast reads)
- Falls back gracefully if Redis is unavailable
"""
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

import psycopg2
import psycopg2.extras
import psycopg2.pool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Redis cache (Upstash) — optional, falls back silently
# ---------------------------------------------------------------------------
_redis_client = None

def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis as redis_lib
        url = os.environ.get("REDIS_URL", "")
        if not url:
            return None
        _redis_client = redis_lib.from_url(url, decode_responses=True, socket_timeout=2)
        _redis_client.ping()
        logger.info("Redis cache connected (Upstash)")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis unavailable, continuing without cache: {e}")
        return None


# ---------------------------------------------------------------------------
# Postgres connection pool (Supabase)
# ---------------------------------------------------------------------------
_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None

def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL env var not set")
    _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, db_url)
    logger.info("Postgres connection pool created (Supabase)")
    return _pool


class DatabaseManager:
    """
    Persistent storage for agent clusters and metrics.
    Clusters + metrics → Supabase (Postgres)
    Latest metrics cache → Upstash Redis
    """

    def __init__(self):
        self._init_schema()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _conn(self):
        """Get a connection from the pool (caller must return it)."""
        return _get_pool().getconn()

    def _put(self, conn):
        _get_pool().putconn(conn)

    def _init_schema(self):
        """Create tables if they don't exist (idempotent)."""
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS agent_clusters (
                        cluster_name  TEXT PRIMARY KEY,
                        environment   TEXT,
                        cloud_provider TEXT,
                        region        TEXT,
                        version       TEXT,
                        registered_at TIMESTAMPTZ DEFAULT NOW(),
                        last_seen     TIMESTAMPTZ DEFAULT NOW(),
                        status        TEXT DEFAULT 'active',
                        metadata      JSONB DEFAULT '{}'
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS agent_metrics (
                        id            BIGSERIAL PRIMARY KEY,
                        cluster_name  TEXT NOT NULL REFERENCES agent_clusters(cluster_name) ON DELETE CASCADE,
                        timestamp     TIMESTAMPTZ NOT NULL,
                        nodes         JSONB DEFAULT '{}',
                        namespaces    JSONB DEFAULT '{}',
                        pods          JSONB DEFAULT '{}',
                        resources     JSONB DEFAULT '{}',
                        received_at   TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_agent_metrics_cluster_ts
                    ON agent_metrics(cluster_name, timestamp DESC)
                """)
            conn.commit()
            logger.info("Supabase schema ready (agent_clusters, agent_metrics)")
        except Exception as e:
            conn.rollback()
            logger.error(f"Schema init error: {e}")
        finally:
            self._put(conn)

    # ------------------------------------------------------------------
    # Cluster operations
    # ------------------------------------------------------------------

    def register_cluster(self, cluster_data: Dict[str, Any]) -> bool:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                now = datetime.utcnow()
                cur.execute("""
                    INSERT INTO agent_clusters
                        (cluster_name, environment, cloud_provider, region, version,
                         registered_at, last_seen, status, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (cluster_name) DO UPDATE SET
                        environment    = EXCLUDED.environment,
                        cloud_provider = EXCLUDED.cloud_provider,
                        region         = EXCLUDED.region,
                        version        = EXCLUDED.version,
                        last_seen      = EXCLUDED.last_seen,
                        status         = EXCLUDED.status,
                        metadata       = EXCLUDED.metadata
                """, (
                    cluster_data['cluster_name'],
                    cluster_data.get('environment', 'unknown'),
                    cluster_data.get('cloud_provider', 'unknown'),
                    cluster_data.get('region'),
                    cluster_data.get('version'),
                    cluster_data.get('registered_at', now),
                    now,
                    cluster_data.get('status', 'active'),
                    json.dumps(cluster_data.get('metadata', {})),
                ))
            conn.commit()
            logger.info(f"Cluster registered: {cluster_data['cluster_name']}")
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Error registering cluster: {e}")
            return False
        finally:
            self._put(conn)

    def update_cluster_heartbeat(self, cluster_name: str, status: str = 'active') -> bool:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE agent_clusters
                    SET last_seen = %s, status = %s
                    WHERE cluster_name = %s
                """, (datetime.utcnow(), status, cluster_name))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Error updating heartbeat: {e}")
            return False
        finally:
            self._put(conn)

    def get_cluster(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM agent_clusters WHERE cluster_name = %s",
                    (cluster_name,)
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error getting cluster: {e}")
            return None
        finally:
            self._put(conn)

    def get_all_clusters(self) -> List[Dict[str, Any]]:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM agent_clusters ORDER BY last_seen DESC"
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error(f"Error getting all clusters: {e}")
            return []
        finally:
            self._put(conn)

    def delete_cluster(self, cluster_name: str) -> bool:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                # ON DELETE CASCADE handles agent_metrics automatically
                cur.execute(
                    "DELETE FROM agent_clusters WHERE cluster_name = %s",
                    (cluster_name,)
                )
                deleted = cur.rowcount > 0
            conn.commit()
            if deleted:
                logger.info(f"Cluster deleted: {cluster_name}")
                # Evict Redis cache
                r = _get_redis()
                if r:
                    r.delete(f"latest_metrics:{cluster_name}")
            return deleted
        except Exception as e:
            conn.rollback()
            logger.error(f"Error deleting cluster: {e}")
            return False
        finally:
            self._put(conn)

    def get_cluster_count(self) -> int:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM agent_clusters")
                return cur.fetchone()[0]
        except Exception as e:
            logger.error(f"Error getting cluster count: {e}")
            return 0
        finally:
            self._put(conn)

    # ------------------------------------------------------------------
    # Metrics operations
    # ------------------------------------------------------------------

    def insert_metrics(self, metrics_data: Dict[str, Any]) -> bool:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO agent_metrics
                        (cluster_name, timestamp, nodes, namespaces, pods, resources, received_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    metrics_data['cluster_name'],
                    metrics_data['timestamp'],
                    json.dumps(metrics_data.get('nodes', {})),
                    json.dumps(metrics_data.get('namespaces', {})),
                    json.dumps(metrics_data.get('pods', {})),
                    json.dumps(metrics_data.get('resources', {})),
                    datetime.utcnow(),
                ))
            conn.commit()

            # Cache latest in Redis (TTL 5 min)
            r = _get_redis()
            if r:
                cache_key = f"latest_metrics:{metrics_data['cluster_name']}"
                r.set(cache_key, json.dumps(metrics_data), ex=300)

            # Prune old rows (keep last 1000 per cluster)
            self._cleanup_old_metrics(metrics_data['cluster_name'])
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Error inserting metrics: {e}")
            return False
        finally:
            self._put(conn)

    def get_latest_metrics(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        # 1. Try Redis cache first
        r = _get_redis()
        if r:
            try:
                cached = r.get(f"latest_metrics:{cluster_name}")
                if cached:
                    data = json.loads(cached)
                    # Ensure nested fields are dicts (may be double-encoded)
                    for field in ('nodes', 'namespaces', 'pods', 'resources'):
                        if isinstance(data.get(field), str):
                            data[field] = json.loads(data[field])
                    return data
            except Exception as e:
                logger.warning(f"Redis get failed, falling back to DB: {e}")

        # 2. Fall back to Postgres
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM agent_metrics
                    WHERE cluster_name = %s
                    ORDER BY timestamp DESC
                    LIMIT 1
                """, (cluster_name,))
                row = cur.fetchone()
                if not row:
                    return None
                data = dict(row)
                for field in ('nodes', 'namespaces', 'pods', 'resources'):
                    if isinstance(data.get(field), str):
                        data[field] = json.loads(data[field])
                # Back-fill Redis
                if r:
                    try:
                        r.set(f"latest_metrics:{cluster_name}", json.dumps(data, default=str), ex=300)
                    except Exception:
                        pass
                return data
        except Exception as e:
            logger.error(f"Error getting latest metrics: {e}")
            return None
        finally:
            self._put(conn)

    def get_metrics_history(self, cluster_name: str, limit: int = 100) -> List[Dict[str, Any]]:
        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM agent_metrics
                    WHERE cluster_name = %s
                    ORDER BY timestamp DESC
                    LIMIT %s
                """, (cluster_name, limit))
                results = []
                for row in cur.fetchall():
                    data = dict(row)
                    for field in ('nodes', 'namespaces', 'pods', 'resources'):
                        if isinstance(data.get(field), str):
                            data[field] = json.loads(data[field])
                    results.append(data)
                return results
        except Exception as e:
            logger.error(f"Error getting metrics history: {e}")
            return []
        finally:
            self._put(conn)

    def _cleanup_old_metrics(self, cluster_name: str, keep_count: int = 1000):
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM agent_metrics
                    WHERE cluster_name = %s
                      AND id NOT IN (
                          SELECT id FROM agent_metrics
                          WHERE cluster_name = %s
                          ORDER BY timestamp DESC
                          LIMIT %s
                      )
                """, (cluster_name, cluster_name, keep_count))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Metrics cleanup error: {e}")
        finally:
            self._put(conn)

    def get_clusters_with_recent_metrics(self, max_age_seconds: int = 300) -> List[str]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT cluster_name FROM agent_metrics
                    WHERE received_at > NOW() - INTERVAL '%s seconds'
                """, (max_age_seconds,))
                return [row[0] for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Error getting clusters with recent metrics: {e}")
            return []
        finally:
            self._put(conn)

    def close(self):
        global _pool
        if _pool:
            _pool.closeall()
            _pool = None


# Global instance
db_manager = DatabaseManager()

# Made with Bob
