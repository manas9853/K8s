"""
Postgres/Supabase Database Manager for Agent Clusters
Handles persistence of agent-registered clusters and their metrics.
Supports comprehensive v2 agent payloads with 16 data domains.

Reads DATABASE_URL from the environment (set in .env).
On first startup it runs ALTER TABLE … ADD COLUMN IF NOT EXISTS for every
extended domain column so the schema is always up-to-date (idempotent).
"""
import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------
_EXTENDED_DOMAINS = [
    "workloads", "storage", "network", "security",
    "compliance", "observability", "finops", "platform",
    "teams", "hpa", "pdb", "service_accounts",
]
_SCALAR_COLS = ["agent_version", "collection_type", "k8s_version", "provider", "region"]

# All columns that contain JSON blobs (decoded on read)
_JSON_COLS = {"nodes", "namespaces", "pods", "resources"} | set(_EXTENDED_DOMAINS)


class DatabaseManager:
    """
    Thread-safe Postgres database manager backed by a connection pool.
    Falls back gracefully if the DB is unreachable at startup.
    """

    def __init__(self):
        self._pool: Optional[pg_pool.ThreadedConnectionPool] = None
        database_url = os.environ.get("DATABASE_URL", "")
        if not database_url:
            logger.error("DATABASE_URL not set — database features disabled")
            return
        try:
            self._pool = pg_pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=database_url,
                cursor_factory=psycopg2.extras.RealDictCursor,
            )
            self._init_schema()
            logger.info("Postgres database pool initialised")
        except Exception as e:
            logger.error(f"Failed to connect to Postgres: {e}")
            self._pool = None

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _conn(self):
        """Borrow a connection from the pool (context manager)."""
        if self._pool is None:
            raise RuntimeError("Database not available (pool not initialised)")
        return _PooledConn(self._pool)

    def _init_schema(self):
        with self._conn() as conn:
            cur = conn.cursor()

            # ── agent_clusters ────────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS agent_clusters (
                    cluster_name   TEXT PRIMARY KEY,
                    environment    TEXT,
                    cloud_provider TEXT,
                    region         TEXT,
                    version        TEXT,
                    registered_at  TEXT,
                    last_seen      TEXT,
                    status         TEXT,
                    metadata       JSONB
                )
            """)

            # ── agent_metrics — base columns ──────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS agent_metrics (
                    id           BIGSERIAL PRIMARY KEY,
                    cluster_name TEXT REFERENCES agent_clusters(cluster_name),
                    timestamp    TEXT,
                    nodes        JSONB,
                    namespaces   JSONB,
                    pods         JSONB,
                    resources    JSONB,
                    received_at  TEXT
                )
            """)

            # ── idempotent migrations: extended domain JSONB columns ──────────
            for col in _EXTENDED_DOMAINS:
                cur.execute(f"""
                    ALTER TABLE agent_metrics
                    ADD COLUMN IF NOT EXISTS {col} JSONB
                """)

            # ── scalar metadata columns ───────────────────────────────────────
            for col in _SCALAR_COLS:
                cur.execute(f"""
                    ALTER TABLE agent_metrics
                    ADD COLUMN IF NOT EXISTS {col} TEXT
                """)

            # ── indexes ───────────────────────────────────────────────────────
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_clusters_last_seen
                ON agent_clusters(last_seen)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_metrics_cluster
                ON agent_metrics(cluster_name)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_metrics_timestamp
                ON agent_metrics(timestamp DESC)
            """)

            conn.commit()
            logger.info("Schema init/migration complete")

    # ── Cluster operations ─────────────────────────────────────────────────────

    def register_cluster(self, cluster_data: Dict[str, Any]) -> bool:
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
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
                    cluster_data["cluster_name"],
                    cluster_data.get("environment", "unknown"),
                    cluster_data.get("cloud_provider", "unknown"),
                    cluster_data.get("region"),
                    cluster_data.get("version"),
                    cluster_data.get("registered_at", now),
                    now,
                    cluster_data.get("status", "active"),
                    json.dumps(cluster_data.get("metadata", {})),
                ))
                conn.commit()
            logger.info(f"Cluster registered: {cluster_data['cluster_name']}")
            return True
        except Exception as e:
            logger.error(f"Error registering cluster: {e}")
            return False

    def update_cluster_heartbeat(self, cluster_name: str, status: str = "active") -> bool:
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE agent_clusters SET last_seen = %s, status = %s WHERE cluster_name = %s",
                    (now, status, cluster_name),
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Error updating cluster heartbeat: {e}")
            return False

    def get_cluster(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT * FROM agent_clusters WHERE cluster_name = %s",
                    (cluster_name,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error getting cluster: {e}")
            return None

    def get_all_clusters(self) -> List[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("SELECT * FROM agent_clusters ORDER BY last_seen DESC")
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error(f"Error getting all clusters: {e}")
            return []

    def delete_cluster(self, cluster_name: str) -> bool:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "DELETE FROM agent_metrics WHERE cluster_name = %s", (cluster_name,)
                )
                cur.execute(
                    "DELETE FROM agent_clusters WHERE cluster_name = %s", (cluster_name,)
                )
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Error deleting cluster: {e}")
            return False

    def get_cluster_count(self) -> int:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) AS cnt FROM agent_clusters")
                row = cur.fetchone()
                return row["cnt"] if row else 0
        except Exception as e:
            logger.error(f"Error getting cluster count: {e}")
            return 0

    # ── Metrics operations ─────────────────────────────────────────────────────

    def insert_metrics(self, metrics_data: Dict[str, Any]) -> bool:
        try:
            now = datetime.utcnow().isoformat()

            base_cols = ["cluster_name", "timestamp", "nodes", "namespaces",
                         "pods", "resources", "received_at"]
            base_vals = [
                metrics_data["cluster_name"],
                metrics_data["timestamp"],
                json.dumps(metrics_data.get("nodes") or {}),
                json.dumps(metrics_data.get("namespaces") or {}),
                json.dumps(metrics_data.get("pods") or {}),
                json.dumps(metrics_data.get("resources") or {}),
                now,
            ]

            ext_cols, ext_vals = [], []
            for col in _EXTENDED_DOMAINS:
                val = metrics_data.get(col)
                if val is not None:
                    ext_cols.append(col)
                    ext_vals.append(
                        json.dumps(val) if not isinstance(val, str) else val
                    )

            for col in _SCALAR_COLS:
                val = metrics_data.get(col)
                if val is not None:
                    ext_cols.append(col)
                    ext_vals.append(str(val))

            all_cols = base_cols + ext_cols
            all_vals = base_vals + ext_vals
            placeholders = ", ".join("%s" for _ in all_vals)
            col_str = ", ".join(all_cols)

            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    f"INSERT INTO agent_metrics ({col_str}) VALUES ({placeholders})",
                    all_vals,
                )
                conn.commit()

            self._cleanup_old_metrics(metrics_data["cluster_name"])
            return True
        except Exception as e:
            logger.error(f"Error inserting metrics: {e}")
            return False

    def get_latest_metrics(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """SELECT * FROM agent_metrics
                       WHERE cluster_name = %s
                       ORDER BY timestamp DESC
                       LIMIT 1""",
                    (cluster_name,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                data = dict(row)

            # Postgres JSONB columns come back as dicts already; TEXT columns
            # may still be JSON strings — normalise both cases.
            for col in _JSON_COLS:
                raw = data.get(col)
                if raw is None:
                    continue
                if isinstance(raw, str):
                    try:
                        data[col] = json.loads(raw)
                    except Exception:
                        pass
            return data
        except Exception as e:
            logger.error(f"Error getting latest metrics: {e}")
            return None

    def get_metrics_history(self, cluster_name: str, limit: int = 100) -> List[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """SELECT * FROM agent_metrics
                       WHERE cluster_name = %s
                       ORDER BY timestamp DESC
                       LIMIT %s""",
                    (cluster_name, limit),
                )
                rows = cur.fetchall()

            results = []
            for row in rows:
                data = dict(row)
                for col in _JSON_COLS:
                    raw = data.get(col)
                    if raw is None:
                        continue
                    if isinstance(raw, str):
                        try:
                            data[col] = json.loads(raw)
                        except Exception:
                            pass
                results.append(data)
            return results
        except Exception as e:
            logger.error(f"Error getting metrics history: {e}")
            return []

    def _cleanup_old_metrics(self, cluster_name: str, keep_count: int = 1000):
        try:
            with self._conn() as conn:
                cur = conn.cursor()
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
            logger.error(f"Error cleaning up old metrics: {e}")

    def get_clusters_with_recent_metrics(self, max_age_seconds: int = 300) -> List[str]:
        try:
            from datetime import timezone, timedelta
            cutoff = (
                datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)
            ).isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT DISTINCT cluster_name FROM agent_metrics WHERE timestamp > %s",
                    (cutoff,),
                )
                return [r["cluster_name"] for r in cur.fetchall()]
        except Exception as e:
            logger.error(f"Error getting clusters with recent metrics: {e}")
            return []

    def close(self):
        if self._pool:
            self._pool.closeall()


# ---------------------------------------------------------------------------
# Helper context manager — borrow / return connection from pool
# ---------------------------------------------------------------------------

class _PooledConn:
    def __init__(self, pool: pg_pool.ThreadedConnectionPool):
        self._pool = pool
        self._conn = None

    def __enter__(self):
        self._conn = self._pool.getconn()
        return self._conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self._conn.rollback()
        self._pool.putconn(self._conn)
        return False


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------
db_manager = DatabaseManager()

# Made with Bob
