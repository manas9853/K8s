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
from typing import Dict, List, Optional, Any, Tuple

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
    "teams", "hpa", "pdb", "service_accounts", "configmaps", "secrets_domain",
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
            # Idempotent: add org_id column if it doesn't exist yet
            cur.execute("""
                ALTER TABLE agent_clusters
                ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default'
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

            # ── agent_commands — write-back queue ─────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS agent_commands (
                    id           BIGSERIAL PRIMARY KEY,
                    cluster_name TEXT NOT NULL,
                    command      TEXT NOT NULL,
                    params       JSONB NOT NULL DEFAULT '{}',
                    status       TEXT NOT NULL DEFAULT 'pending',
                    result       JSONB,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_commands_cluster_status
                ON agent_commands(cluster_name, status)
            """)

            # ── agent_network_flows — one row per flow_collector.py batch ──────
            # (a DaemonSet pod posts once per node per collection cycle; the
            # "flows" column holds that node's aggregated connection tuples —
            # never packet content, see agent/flow_collector.py)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS agent_network_flows (
                    id           BIGSERIAL PRIMARY KEY,
                    cluster_name TEXT NOT NULL,
                    node_name    TEXT NOT NULL,
                    timestamp    TEXT NOT NULL,
                    flows        JSONB NOT NULL DEFAULT '[]',
                    received_at  TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_network_flows_cluster_time
                ON agent_network_flows(cluster_name, received_at DESC)
            """)

            # ── node_image_scans — node-local Trivy scans (node_scanner.py) ────
            # One row per (cluster, image): each new scan replaces the old one,
            # same as trivy_scanner.py's in-memory cache but persisted/shared.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS node_image_scans (
                    cluster_name  TEXT NOT NULL,
                    image         TEXT NOT NULL,
                    node_name     TEXT NOT NULL,
                    scan_status   TEXT NOT NULL,
                    parsed_report JSONB,
                    error_message TEXT,
                    scanned_at    DOUBLE PRECISION NOT NULL,
                    received_at   TEXT NOT NULL,
                    PRIMARY KEY (cluster_name, image)
                )
            """)

            # ── cis_control_exceptions ─────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cis_control_exceptions (
                    id BIGSERIAL PRIMARY KEY,
                    cluster_name TEXT NOT NULL,
                    control_id TEXT NOT NULL,
                    title TEXT,
                    justification TEXT NOT NULL,
                    owner TEXT NOT NULL,
                    review_date TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'accepted',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_cis_control_exceptions_cluster_control
                ON cis_control_exceptions(cluster_name, control_id, status)
            """)

            # ── nlq_feedback — NLQ 👍/👎 feedback log ─────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS nlq_feedback (
                    id          BIGSERIAL PRIMARY KEY,
                    query_id    TEXT NOT NULL,
                    query       TEXT NOT NULL,
                    response    TEXT NOT NULL,
                    rating      TEXT NOT NULL,   -- 'up' or 'down'
                    cluster     TEXT,
                    created_at  TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_nlq_feedback_query_id
                ON nlq_feedback(query_id)
            """)

            # ── cloud_discovery_config — Phase 2 billing API credentials ──────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cloud_discovery_config (
                    cluster_name  TEXT PRIMARY KEY REFERENCES agent_clusters(cluster_name),
                    provider      TEXT NOT NULL,
                    status        TEXT NOT NULL DEFAULT 'pending',
                    api_key_enc   TEXT,
                    account_id    TEXT,
                    cluster_tag   TEXT,
                    last_sync_at  TEXT,
                    last_sync_ok  BOOLEAN DEFAULT FALSE,
                    last_error    TEXT,
                    created_at    TEXT NOT NULL,
                    updated_at    TEXT NOT NULL
                )
            """)
            # AWS uses cross-account IAM role assumption instead of a stored
            # API key — neither value is secret on its own (only our
            # platform's own AWS identity assuming the role can use them),
            # so no encryption needed, unlike api_key_enc.
            cur.execute("""
                ALTER TABLE cloud_discovery_config
                ADD COLUMN IF NOT EXISTS role_arn TEXT
            """)
            cur.execute("""
                ALTER TABLE cloud_discovery_config
                ADD COLUMN IF NOT EXISTS external_id TEXT
            """)
            # GCP (billing_table) and Azure (tenant_id, client_id) — none of
            # these are secret on their own; the actual GCP service-account
            # key / Azure client_secret goes in api_key_enc (same encrypted
            # column IBM's key already uses — one secret column, not three).
            cur.execute("""
                ALTER TABLE cloud_discovery_config
                ADD COLUMN IF NOT EXISTS billing_table TEXT
            """)
            cur.execute("""
                ALTER TABLE cloud_discovery_config
                ADD COLUMN IF NOT EXISTS tenant_id TEXT
            """)
            cur.execute("""
                ALTER TABLE cloud_discovery_config
                ADD COLUMN IF NOT EXISTS client_id TEXT
            """)

            # ── cluster_billing_cache — hourly billing data from cloud APIs ───
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cluster_billing_cache (
                    cluster_name   TEXT NOT NULL,
                    billing_month  TEXT NOT NULL,
                    total_cost     FLOAT NOT NULL,
                    compute_cost   FLOAT DEFAULT 0,
                    storage_cost   FLOAT DEFAULT 0,
                    network_cost   FLOAT DEFAULT 0,
                    control_plane  FLOAT DEFAULT 0,
                    currency       TEXT DEFAULT 'USD',
                    line_items     JSONB DEFAULT '[]',
                    source         TEXT NOT NULL,
                    fetched_at     TEXT NOT NULL,
                    PRIMARY KEY (cluster_name, billing_month)
                )
            """)

            # ── cicd_integrations — Jenkins/GitHub Actions/GitLab CI credentials ──
            # Composite key (not single-provider-per-cluster like
            # cloud_discovery_config) — a cluster can have GitHub Actions AND
            # Jenkins connected at once. token_enc uses the same Fernet
            # encryption as cloud_discovery_config.api_key_enc.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cicd_integrations (
                    cluster_name  TEXT NOT NULL REFERENCES agent_clusters(cluster_name),
                    provider      TEXT NOT NULL,   -- 'GitHub Actions' | 'GitLab CI' | 'Jenkins'
                    base_url      TEXT,            -- self-hosted GitLab/Jenkins; null = gitlab.com
                    username      TEXT,            -- Jenkins basic auth
                    token_enc     TEXT,
                    project_ref   TEXT,             -- "owner/repo" (GH) | project path/ID (GL)
                    status        TEXT NOT NULL DEFAULT 'pending',
                    last_sync_at  TEXT,
                    last_sync_ok  BOOLEAN DEFAULT FALSE,
                    last_error    TEXT,
                    created_at    TEXT NOT NULL,
                    updated_at    TEXT NOT NULL,
                    PRIMARY KEY (cluster_name, provider)
                )
            """)

            # ── cicd_pipeline_cache — last-polled runs per integration ────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cicd_pipeline_cache (
                    cluster_name TEXT NOT NULL,
                    provider     TEXT NOT NULL,
                    runs         JSONB NOT NULL DEFAULT '[]',
                    fetched_at   TEXT NOT NULL,
                    PRIMARY KEY (cluster_name, provider)
                )
            """)

            # ── falco_alerts — real runtime/behavioral events (Phase 6) ───────
            # Pushed directly by Falco's own http_output — see
            # docs/falco-setup.md. Falco can't send custom auth headers, so
            # the per-cluster token travels in the URL path instead (same
            # trick Slack/GitHub webhooks use), see /falco-alerts/{cluster}/{token}.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS falco_alerts (
                    id           BIGSERIAL PRIMARY KEY,
                    cluster_name TEXT NOT NULL,
                    rule         TEXT NOT NULL,
                    priority     TEXT NOT NULL,
                    output       TEXT NOT NULL,
                    fields       JSONB NOT NULL DEFAULT '{}',
                    alert_time   TEXT NOT NULL,
                    received_at  TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_falco_alerts_cluster_time
                ON falco_alerts(cluster_name, received_at DESC)
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
                         registered_at, last_seen, status, metadata, org_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (cluster_name) DO UPDATE SET
                        environment    = EXCLUDED.environment,
                        cloud_provider = EXCLUDED.cloud_provider,
                        region         = EXCLUDED.region,
                        version        = EXCLUDED.version,
                        last_seen      = EXCLUDED.last_seen,
                        status         = EXCLUDED.status,
                        metadata       = EXCLUDED.metadata,
                        org_id         = EXCLUDED.org_id
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
                    cluster_data.get("org_id", "default"),
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

    def get_clusters_by_org(self, org_id: str) -> List[Dict[str, Any]]:
        """Return clusters belonging to org_id.
        
        'default' returns all clusters (backward-compat).
        Any other org_id returns its own clusters PLUS any clusters tagged
        'default' — these are clusters registered by agents whose token was
        not found in the in-memory token store (e.g. after a backend restart),
        so they fall back to 'default'. Without this, users with a real org_id
        see nothing after a backend restart.
        """
        if org_id == "default":
            return self.get_all_clusters()
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT * FROM agent_clusters WHERE org_id = %s OR org_id = 'default' ORDER BY last_seen DESC",
                    (org_id,),
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error(f"Error getting clusters by org: {e}")
            return []

    def delete_cluster(self, cluster_name: str) -> bool:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "DELETE FROM agent_metrics WHERE cluster_name = %s", (cluster_name,)
                )
                cur.execute(
                    "DELETE FROM cloud_discovery_config WHERE cluster_name = %s", (cluster_name,)
                )
                cur.execute(
                    "DELETE FROM cicd_integrations WHERE cluster_name = %s", (cluster_name,)
                )
                cur.execute(
                    "DELETE FROM cicd_pipeline_cache WHERE cluster_name = %s", (cluster_name,)
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

    # ── network flows (flow_collector.py DaemonSet) ─────────────────────────

    def insert_network_flows(self, cluster_name: str, node_name: str,
                              timestamp: str, flows: List[Dict[str, Any]]) -> bool:
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO agent_network_flows
                       (cluster_name, node_name, timestamp, flows, received_at)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (cluster_name, node_name, timestamp, json.dumps(flows), now),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error inserting network flows: {e}")
            return False

    def get_recent_network_flows(self, cluster_name: str, minutes: int = 15) -> List[Dict[str, Any]]:
        """Merge the last N minutes of per-node batches into one edge list,
        summing connection_count for the same (src, dst, port, protocol)
        tuple across nodes and collection cycles. This is what
        DependencyMapping.tsx should consume for real (observed) traffic
        edges, as opposed to the Service/Ingress-spec-inferred edges it
        likely falls back to today."""
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """SELECT flows FROM agent_network_flows
                       WHERE cluster_name = %s
                         AND received_at > (NOW() AT TIME ZONE 'utc' - INTERVAL '1 minute' * %s)::text
                       ORDER BY received_at DESC""",
                    (cluster_name, minutes),
                )
                rows = cur.fetchall()

            merged: Dict[Tuple[str, str, str, str, int, str], int] = {}
            for row in rows:
                raw = row["flows"] if isinstance(row, dict) else row[0]
                batch = raw if isinstance(raw, list) else json.loads(raw or "[]")
                for f in batch:
                    key = (
                        f.get("src_namespace"), f.get("src_pod"),
                        f.get("dst_namespace"), f.get("dst_pod"),
                        f.get("dst_port"), f.get("protocol"),
                    )
                    merged[key] = merged.get(key, 0) + int(f.get("connection_count", 0))

            return [
                {
                    "src_namespace": k[0], "src_pod": k[1],
                    "dst_namespace": k[2], "dst_pod": k[3],
                    "dst_port": k[4], "protocol": k[5],
                    "connection_count": v,
                }
                for k, v in merged.items()
            ]
        except Exception as e:
            logger.error(f"Error getting network flows: {e}")
            return []

    def upsert_cicd_pipeline_cache(self, cluster_name: str, provider: str, runs: List[Dict[str, Any]]) -> bool:
        """Store one poll cycle's runs for one CI/CD integration, replacing the previous cache."""
        now = datetime.utcnow().isoformat()
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO cicd_pipeline_cache (cluster_name, provider, runs, fetched_at)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (cluster_name, provider) DO UPDATE SET
                         runs = EXCLUDED.runs, fetched_at = EXCLUDED.fetched_at""",
                    (cluster_name, provider, json.dumps(runs), now),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error storing CI/CD pipeline cache ({cluster_name}/{provider}): {e}")
            return False

    def get_cicd_pipeline_cache(self, cluster_name: str, provider: str) -> List[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT runs FROM cicd_pipeline_cache WHERE cluster_name = %s AND provider = %s",
                    (cluster_name, provider),
                )
                row = cur.fetchone()
                if not row:
                    return []
                runs = row["runs"] if isinstance(row, dict) else row[0]
                return runs if isinstance(runs, list) else json.loads(runs or "[]")
        except Exception as e:
            logger.error(f"Error reading CI/CD pipeline cache ({cluster_name}/{provider}): {e}")
            return []

    def upsert_node_image_scans(self, cluster_name: str, node_name: str,
                                 scanned_at: float, results: List[Dict[str, Any]]) -> bool:
        """Store one node_scanner.py cycle's results — one row per image,
        replacing that image's previous scan (upsert on cluster+image)."""
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                for r in results:
                    cur.execute(
                        """INSERT INTO node_image_scans
                           (cluster_name, image, node_name, scan_status,
                            parsed_report, error_message, scanned_at, received_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (cluster_name, image) DO UPDATE SET
                             node_name     = EXCLUDED.node_name,
                             scan_status   = EXCLUDED.scan_status,
                             parsed_report = EXCLUDED.parsed_report,
                             error_message = EXCLUDED.error_message,
                             scanned_at    = EXCLUDED.scanned_at,
                             received_at   = EXCLUDED.received_at""",
                        (
                            cluster_name, r["image"], node_name, r["scan_status"],
                            json.dumps(r.get("parsed_report")) if r.get("parsed_report") else None,
                            r.get("error_message"), scanned_at, now,
                        ),
                    )
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error storing node image scans: {e}")
            return False

    def get_node_image_scans(self, cluster_name: str) -> Dict[str, Dict[str, Any]]:
        """All node-local scans for a cluster, keyed by image ref — this is
        real data (scanned from the node's local containerd store, works
        for private registries) and should be preferred over the
        network-pull-based trivy_scanner.py path whenever present."""
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """SELECT image, node_name, scan_status, parsed_report,
                              error_message, scanned_at
                       FROM node_image_scans WHERE cluster_name = %s""",
                    (cluster_name,),
                )
                rows = cur.fetchall()
            out = {}
            for row in rows:
                d = dict(row) if isinstance(row, dict) else {
                    "image": row[0], "node_name": row[1], "scan_status": row[2],
                    "parsed_report": row[3], "error_message": row[4], "scanned_at": row[5],
                }
                report = d["parsed_report"]
                if isinstance(report, str):
                    report = json.loads(report) if report else None
                out[d["image"]] = {**d, "parsed_report": report}
            return out
        except Exception as e:
            logger.error(f"Error reading node image scans: {e}")
            return {}

    # ── falco_alerts — real runtime events pushed by Falco's http_output ────

    def insert_falco_alert(self, cluster_name: str, rule: str, priority: str,
                            output: str, fields: Dict[str, Any], alert_time: str) -> bool:
        """One alert = one Falco http_output POST. Trims to the most recent
        2000 rows per cluster on every insert so this table can't grow
        unbounded — ponytail: fixed cap, add a Celery-scheduled prune if a
        customer's alert volume makes per-insert trimming too slow."""
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO falco_alerts
                       (cluster_name, rule, priority, output, fields, alert_time, received_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (cluster_name, rule, priority, output, json.dumps(fields), alert_time, now),
                )
                cur.execute(
                    """DELETE FROM falco_alerts WHERE cluster_name = %s AND id NOT IN (
                           SELECT id FROM falco_alerts WHERE cluster_name = %s
                           ORDER BY received_at DESC LIMIT 2000
                       )""",
                    (cluster_name, cluster_name),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error inserting falco alert: {e}")
            return False

    def get_falco_alerts(self, cluster_name: str, hours: int = 24, limit: int = 500) -> List[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """SELECT rule, priority, output, fields, alert_time, received_at
                       FROM falco_alerts
                       WHERE cluster_name = %s
                         AND received_at > (NOW() AT TIME ZONE 'utc' - INTERVAL '1 hour' * %s)::text
                       ORDER BY received_at DESC LIMIT %s""",
                    (cluster_name, hours, limit),
                )
                rows = cur.fetchall()
            out = []
            for row in rows:
                d = dict(row) if isinstance(row, dict) else {
                    "rule": row[0], "priority": row[1], "output": row[2],
                    "fields": row[3], "alert_time": row[4], "received_at": row[5],
                }
                fields = d["fields"]
                if isinstance(fields, str):
                    fields = json.loads(fields) if fields else {}
                out.append({**d, "fields": fields})
            return out
        except Exception as e:
            logger.error(f"Error reading falco alerts: {e}")
            return []

    def get_pod_utilization_history(self, cluster_name: str, namespace: str,
                                     pod_name: str, days: int = 7) -> Dict[str, Any]:
        """A REAL utilization report for one pod: every stored collection-cycle
        sample over the lookback window, built from agent-reported live
        metrics-server readings only (has_live_metrics = true) — never the
        old 50%-of-request guess. This is what should back rightsizing
        decisions instead of analyze_pod_resources()'s single latest-snapshot
        reading, which is only one instant and can be misleadingly high/low
        depending on when it happened to be sampled.

        Returns min/avg/p95/max for CPU and memory, the sample count actually
        used, and how many collection cycles existed but had no live data
        (so the caller can see data quality, not just the numbers)."""
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT
                        timestamp,
                        (item->>'cpu_usage_cores')::float   AS cpu_cores,
                        (item->>'memory_usage_mb')::float   AS mem_mb,
                        COALESCE((item->>'has_live_metrics')::boolean, false) AS has_live
                    FROM agent_metrics,
                         jsonb_array_elements(pods->'items') AS item
                    WHERE cluster_name = %s
                      AND item->>'namespace' = %s
                      AND item->>'name' = %s
                      AND received_at > (NOW() AT TIME ZONE 'utc' - INTERVAL '1 day' * %s)::text
                    ORDER BY timestamp ASC
                    """,
                    (cluster_name, namespace, pod_name, days),
                )
                rows = cur.fetchall()

            total_cycles = len(rows)
            live = [r for r in rows if r["has_live"]]
            no_data_cycles = total_cycles - len(live)

            if not live:
                return {
                    "namespace": namespace, "pod_name": pod_name, "window_days": days,
                    "sample_count": 0, "no_data_cycles": no_data_cycles,
                    "data_quality": "insufficient_data",
                    "cpu": None, "memory": None,
                }

            cpu_samples = sorted(r["cpu_cores"] for r in live if r["cpu_cores"] is not None)
            mem_samples = sorted(r["mem_mb"] for r in live if r["mem_mb"] is not None)

            def _stats(samples: List[float]) -> Optional[Dict[str, float]]:
                if not samples:
                    return None
                n = len(samples)
                p95_idx = min(n - 1, int(round(0.95 * (n - 1))))
                return {
                    "min": round(samples[0], 4),
                    "avg": round(sum(samples) / n, 4),
                    "p95": round(samples[p95_idx], 4),
                    "max": round(samples[-1], 4),
                }

            return {
                "namespace": namespace, "pod_name": pod_name, "window_days": days,
                "sample_count": len(live), "no_data_cycles": no_data_cycles,
                "data_quality": "full" if no_data_cycles == 0 else "partial",
                "cpu": _stats(cpu_samples),
                "memory": _stats(mem_samples),
            }
        except Exception as e:
            logger.error(f"Error getting pod utilization history: {e}")
            return {
                "namespace": namespace, "pod_name": pod_name, "window_days": days,
                "sample_count": 0, "no_data_cycles": 0,
                "data_quality": "error", "cpu": None, "memory": None,
            }

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

    def get_cluster_onboarding_date(self, cluster_name: str) -> str | None:
        """
        Returns the first agent_metrics timestamp for a cluster (= onboarding date).
        Falls back to agent_clusters.registered_at.
        Used by finops endpoints to show 'cost data available from X'.
        Never fabricates pre-onboarding history.
        """
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT MIN(timestamp) AS first_ts FROM agent_metrics WHERE cluster_name = %s",
                    (cluster_name,),
                )
                row = cur.fetchone()
                if row and row["first_ts"]:
                    return row["first_ts"]
                # Fallback: registered_at from clusters table
                cur.execute(
                    "SELECT registered_at FROM agent_clusters WHERE cluster_name = %s",
                    (cluster_name,),
                )
                row = cur.fetchone()
                return row["registered_at"] if row else None
        except Exception as e:
            logger.error(f"get_cluster_onboarding_date error: {e}")
            return None

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

    # ── Command queue operations ───────────────────────────────────────────────

    def enqueue_command(self, cluster_name: str, command: str,
                        params: Dict[str, Any]) -> Optional[int]:
        """Insert a pending command and return its id."""
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO agent_commands (cluster_name, command, params, status, created_at, updated_at)
                    VALUES (%s, %s, %s, 'pending', %s, %s)
                    RETURNING id
                """, (cluster_name, command, json.dumps(params), now, now))
                row = cur.fetchone()
                conn.commit()
                return row["id"] if row else None
        except Exception as e:
            logger.error(f"enqueue_command error: {e}")
            return None

    def get_pending_commands(self, cluster_name: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch pending commands for the agent to execute."""
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT id, command, params
                    FROM agent_commands
                    WHERE cluster_name = %s AND status = 'pending'
                    ORDER BY id ASC
                    LIMIT %s
                """, (cluster_name, limit))
                rows = cur.fetchall()
                result = []
                for r in rows:
                    params = r["params"]
                    if isinstance(params, str):
                        params = json.loads(params)
                    result.append({"id": r["id"], "command": r["command"], "params": params})
                return result
        except Exception as e:
            logger.error(f"get_pending_commands error: {e}")
            return []

    def ack_command(self, command_id: int, success: bool,
                    result: Optional[Dict[str, Any]] = None) -> bool:
        """Mark a command as done or failed with an optional result payload."""
        try:
            now = datetime.utcnow().isoformat()
            status = "done" if success else "failed"
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    UPDATE agent_commands
                    SET status = %s, result = %s, updated_at = %s
                    WHERE id = %s
                """, (status, json.dumps(result or {}), now, command_id))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"ack_command error: {e}")
            return False

    def get_command(self, command_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a single command row (used by the backend to poll for result)."""
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT id, cluster_name, command, params, status, result, created_at, updated_at
                    FROM agent_commands WHERE id = %s
                """, (command_id,))
                row = cur.fetchone()
                if not row:
                    return None
                d = dict(row)
                for field in ("params", "result"):
                    if isinstance(d.get(field), str):
                        d[field] = json.loads(d[field])
                return d
        except Exception as e:
            logger.error(f"get_command error: {e}")
            return None

    def list_cis_control_exceptions(self, cluster_name: str) -> List[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT id, cluster_name, control_id, title, justification, owner, review_date, status, created_at, updated_at
                    FROM cis_control_exceptions
                    WHERE cluster_name = %s
                    ORDER BY updated_at DESC
                """, (cluster_name,))
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error(f"list_cis_control_exceptions error: {e}")
            return []

    def upsert_cis_control_exception(self, cluster_name: str, control_id: str, title: str,
                                     justification: str, owner: str, review_date: str) -> Optional[Dict[str, Any]]:
        try:
            now = datetime.utcnow().isoformat()
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    UPDATE cis_control_exceptions
                    SET title = %s, justification = %s, owner = %s, review_date = %s,
                        status = 'accepted', updated_at = %s
                    WHERE cluster_name = %s AND control_id = %s AND status = 'accepted'
                    RETURNING id, cluster_name, control_id, title, justification, owner, review_date, status, created_at, updated_at
                """, (title, justification, owner, review_date, now, cluster_name, control_id))
                row = cur.fetchone()
                if not row:
                    cur.execute("""
                        INSERT INTO cis_control_exceptions
                        (cluster_name, control_id, title, justification, owner, review_date, status, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, 'accepted', %s, %s)
                        RETURNING id, cluster_name, control_id, title, justification, owner, review_date, status, created_at, updated_at
                    """, (cluster_name, control_id, title, justification, owner, review_date, now, now))
                    row = cur.fetchone()
                conn.commit()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"upsert_cis_control_exception error: {e}")
            return None

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
