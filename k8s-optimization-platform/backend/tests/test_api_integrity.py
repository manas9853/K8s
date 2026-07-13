"""
Backend API Integration Tests — Data Integrity & Endpoint Validation
Tests every registered FastAPI router for:
  1. Correct HTTP status codes
  2. Correct response structure (fields / types)
  3. No hardcoded dummy names leaking into responses when a real cluster is absent
  4. Proper 503/404 (not 500) when data is legitimately unavailable
"""
import sys, os

# ── CI env guard: force valid values before pydantic-settings reads the .env ──
# The local .env may set DEBUG=release which pydantic rejects as not a boolean.
# os.environ takes priority over .env files in pydantic-settings (env_file has
# lower precedence than actual env vars).
os.environ["DEBUG"] = "false"
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("OPENAI_API_KEY", "")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

# ──────────────────────────────────────────────────────────────────────────────
# Patch heavy external imports BEFORE loading main
# ──────────────────────────────────────────────────────────────────────────────

# Celery / Redis — not available in CI
celery_mock = MagicMock()
celery_mock.task = lambda *a, **kw: (lambda f: f)
sys.modules.setdefault("celery", MagicMock())
sys.modules.setdefault("celery.app", MagicMock())

# psycopg2
pg_mock = MagicMock()
pg_mock.extras = MagicMock()
pg_mock.extras.RealDictCursor = MagicMock()
pg_pool_mock = MagicMock()
sys.modules.setdefault("psycopg2", pg_mock)
sys.modules.setdefault("psycopg2.extras", pg_mock.extras)
sys.modules.setdefault("psycopg2.pool", pg_pool_mock)

# kubernetes — fully stub out the entire package tree.
# services/k8s_client.py uses kubernetes.client.CoreV1Api, AppsV1Api, etc.
# We build real ModuleType objects (not MagicMock) to allow sub-module dotted imports,
# then attach MagicMock attributes for every class the code references.
import types as _types

def _make_module(name: str, parent=None):
    """Create and register a sys.modules entry that behaves like a real package."""
    m = _types.ModuleType(name)
    # Make every attribute access return a MagicMock so type annotations resolve
    m.__class__ = type(name, (_types.ModuleType,), {
        "__getattr__": lambda self, n: MagicMock(),
    })
    sys.modules[name] = m
    if parent is not None:
        setattr(parent, name.rsplit(".", 1)[-1], m)
    return m

_k8s         = _make_module("kubernetes")
_k8s_cli     = _make_module("kubernetes.client", _k8s)
_k8s_rest    = _make_module("kubernetes.client.rest", _k8s_cli)
_k8s_rest.ApiException = Exception                   # type: ignore
_k8s_cfg_m   = _make_module("kubernetes.client.configuration", _k8s_cli)
_k8s_exc_m   = _make_module("kubernetes.client.exceptions", _k8s_cli)
_k8s_conf    = _make_module("kubernetes.config", _k8s)
_k8s_watch   = _make_module("kubernetes.watch", _k8s)
_make_module("kubernetes.client.api", _k8s_cli)
_make_module("kubernetes.client.models", _k8s_cli)
_k8s_async   = _make_module("kubernetes_asyncio")
_make_module("kubernetes_asyncio.client", _k8s_async)
_make_module("kubernetes_asyncio.config", _k8s_async)

# Patch the entire services package so nothing tries to import kubernetes
_svc = _make_module("services")
_k8s_client_svc = _make_module("services.k8s_client")
_k8s_client_svc.k8s_client = None  # type: ignore — signals "not available"

_sim_engine_mock = MagicMock()
_sim_engine_mock.remove_cluster.return_value = 0
_sim_svc = _make_module("services.simulation_engine")
_sim_svc.simulation_engine = _sim_engine_mock  # type: ignore

_trivy_svc = _make_module("services.trivy_scanner")
_trivy_svc.scan_images_batch = AsyncMock(return_value=[])   # type: ignore
_trivy_svc.cache_stats = MagicMock(return_value={})         # type: ignore

_real_data_svc = _make_module("services.real_data_helper")

# redis / aioredis
sys.modules.setdefault("redis", MagicMock())
sys.modules.setdefault("aioredis", MagicMock())

# openai
sys.modules.setdefault("openai", MagicMock())

# scikit-learn
sys.modules.setdefault("sklearn", MagicMock())
sys.modules.setdefault("sklearn.preprocessing", MagicMock())
sys.modules.setdefault("sklearn.linear_model", MagicMock())

# pandas / numpy
sys.modules.setdefault("pandas", MagicMock())
sys.modules.setdefault("numpy", MagicMock())

# firebase / google-cloud
sys.modules.setdefault("firebase_admin", MagicMock())
sys.modules.setdefault("google.cloud", MagicMock())
sys.modules.setdefault("google.cloud.storage", MagicMock())

# httpx (keep real for TestClient, but mock openai calls)
import httpx  # noqa: ensure loaded

# trivy scanner
sys.modules.setdefault("services.trivy_scanner", MagicMock(
    scan_images_batch=AsyncMock(return_value=[]),
    cache_stats=MagicMock(return_value={}),
))

# celery app + tasks
celery_app_mock = MagicMock()
celery_app_mock.task = lambda *a, **kw: (lambda f: f)
sys.modules.setdefault("celery_app", MagicMock(celery_app=celery_app_mock))
sys.modules.setdefault("tasks.compliance_tasks", MagicMock(
    run_compliance_scan=MagicMock(delay=MagicMock())
))

# Patch DatabaseManager to return empty / no-cluster state
MOCK_DB = MagicMock()
MOCK_DB.get_all_clusters.return_value = []
MOCK_DB.get_clusters_by_org.return_value = []
MOCK_DB.get_latest_metrics.return_value = None
MOCK_DB.get_cluster_count.return_value = 0
MOCK_DB.enqueue_command.return_value = 1

# Patch cluster_registry
sys.modules.setdefault(
    "utils.cluster_registry",
    MagicMock(get_clusters=MagicMock(return_value=[]), filter_by_cluster=MagicMock(return_value=[])),
)

# Patch cost_engine
sys.modules.setdefault(
    "utils.cost_engine",
    MagicMock(
        compute_cluster_cost=MagicMock(return_value={}),
        compute_energy=MagicMock(return_value={}),
        get_billing_cache=MagicMock(return_value={}),
        get_discovery_status=MagicMock(return_value={}),
    ),
)

# ──────────────────────────────────────────────────────────────────────────────
# Now import the FastAPI app with patched dependencies
# ──────────────────────────────────────────────────────────────────────────────

with patch("database.db.db_manager", MOCK_DB), \
     patch("database.db.DatabaseManager", MagicMock(return_value=MOCK_DB)), \
     patch("psycopg2.pool.ThreadedConnectionPool", MagicMock()):
    from main import app

client = TestClient(app, raise_server_exceptions=False)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

# Strings that must never appear in any API response body when running without
# a real cluster — they indicate unguarded hardcoded dummy data.
DUMMY_SENTINEL_VALUES = {
    "lorem ipsum",
    "test user",
    "sample data",
    "dummy",
    "fake cluster",
    "acme corp",       # used in PlatformEngineering dummy arrays
    "payments-service", # ArgoCD DUMMY_DATA
    "prod-us-east-1",   # ArgoCD DUMMY_DATA cluster name (not a valid agent cluster)
}

ALLOWED_STATUS_CODES = {200, 201, 400, 404, 422, 503}  # 500 is never acceptable


def assert_no_dummy_leakage(body: str, endpoint: str):
    """Assert no sentinel dummy strings appear in a real-data API response."""
    body_lower = body.lower()
    for sentinel in DUMMY_SENTINEL_VALUES:
        assert sentinel not in body_lower, (
            f"DUMMY DATA LEAKAGE: '{sentinel}' found in response of {endpoint}"
        )


def assert_valid_status(resp, endpoint: str):
    assert resp.status_code in ALLOWED_STATUS_CODES, (
        f"Unexpected status {resp.status_code} from {endpoint}: {resp.text[:200]}"
    )
    assert resp.status_code != 500, (
        f"Server error (500) from {endpoint} — this is a bug: {resp.text[:200]}"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Health checks
# ──────────────────────────────────────────────────────────────────────────────

class TestHealthEndpoints:
    def test_health_root(self):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data

    def test_health_db_no_connection(self):
        """DB health returns 503 when database is unavailable — not 500."""
        r = client.get("/health/db")
        assert r.status_code in (200, 503), f"Unexpected: {r.status_code}"

    def test_health_k8s_no_agents(self):
        r = client.get("/health/k8s")
        assert r.status_code in (200, 503)

    def test_root_info(self):
        r = client.get("/")
        assert r.status_code == 200
        data = r.json()
        assert "name" in data
        assert "version" in data


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard API
# ──────────────────────────────────────────────────────────────────────────────

class TestDashboardAPI:
    BASE = "/api/v1/dashboard"

    def test_executive_no_cluster_returns_503(self):
        """Without cluster data, /dashboard/executive must return 503, not dummy data.
        Fix 8 resolved the HTTPException swallowing bug — endpoint now correctly returns 503.
        """
        r = client.get(f"{self.BASE}/executive")
        assert r.status_code == 503, (
            f"Expected 503 when no cluster exists, got {r.status_code}: {r.text[:200]}"
        )
        body = r.json()
        assert "detail" in body

    def test_kpis_no_cluster_returns_503(self):
        r = client.get(f"{self.BASE}/kpis")
        assert r.status_code == 503

    def test_insights_no_cluster_returns_empty_list(self):
        r = client.get(f"{self.BASE}/insights")
        assert r.status_code == 200
        assert r.json() == []

    def test_waste_contributors_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/waste-contributors")
        assert r.status_code == 200
        assert r.json() == []

    def test_cost_trend_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/cost-trend")
        assert r.status_code == 200
        assert r.json() == []


# ──────────────────────────────────────────────────────────────────────────────
# Clusters API
# ──────────────────────────────────────────────────────────────────────────────

class TestClustersAPI:
    BASE = "/api/v1/clusters"

    def test_list_no_header_returns_empty(self):
        """Without X-Clerk-User-Id, org isolation returns empty list — not dummy data."""
        r = client.get(self.BASE)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 0, (
            f"Expected empty list without auth header, got {len(data)} items"
        )

    def test_summary_no_k8s_returns_zeros(self):
        r = client.get(f"{self.BASE}/summary")
        assert_valid_status(r, f"{self.BASE}/summary")
        if r.status_code == 200:
            data = r.json()
            assert data["total_clusters"] == 0
            assert data["monthly_cost"] == 0.0

    def test_nodes_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/nodes")
        assert r.status_code == 200
        assert r.json() == []

    def test_worker_pools_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/worker-pools")
        assert r.status_code == 200
        assert r.json() == []

    def test_health_all_structure(self):
        r = client.get(f"{self.BASE}/health/all")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # If dummy data is returned, every item must have the required fields
        for item in data:
            assert "cluster_id" in item
            assert "health_score" in item
            assert isinstance(item["health_score"], (int, float))
            assert 0 <= item["health_score"] <= 100

    def test_health_single_no_k8s(self):
        """Single-cluster health without K8s returns 503, not 500."""
        r = client.get(f"{self.BASE}/health")
        assert r.status_code in (200, 503)


# ──────────────────────────────────────────────────────────────────────────────
# Pods API
# ──────────────────────────────────────────────────────────────────────────────

class TestPodsAPI:
    BASE = "/api/v1/pods"

    def test_list_no_cluster_returns_empty(self):
        r = client.get(self.BASE)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 0

    def test_summary_no_cluster_returns_zeros(self):
        r = client.get(f"{self.BASE}/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["total_pods"] == 0
        assert data["total_potential_savings"] == 0.0

    def test_cpu_analysis_empty(self):
        r = client.get(f"{self.BASE}/cpu-analysis")
        assert r.status_code == 200
        assert r.json() == []

    def test_memory_analysis_empty(self):
        r = client.get(f"{self.BASE}/memory-analysis")
        assert r.status_code == 200
        assert r.json() == []

    def test_restart_analysis_empty(self):
        r = client.get(f"{self.BASE}/restart-analysis")
        assert r.status_code == 200
        assert r.json() == []

    def test_oom_events_empty(self):
        r = client.get(f"{self.BASE}/oom-events")
        assert r.status_code == 200
        assert r.json() == []

    def test_pod_health_empty(self):
        r = client.get(f"{self.BASE}/pod-health")
        assert r.status_code == 200
        assert r.json() == []


# ──────────────────────────────────────────────────────────────────────────────
# Pods API — with mock cluster data (real-data path)
# ──────────────────────────────────────────────────────────────────────────────

MOCK_POD = {
    "name": "api-server-abc123",
    "namespace": "production",
    "node": "node-1",
    "status": "Running",
    "cpu_request": 0.5,
    "cpu_limit": 1.0,
    "memory_request_mb": 512.0,
    "memory_limit_mb": 1024.0,
    "restarts": 0,
    "creation_timestamp": "2024-01-01T00:00:00Z",
    "containers": [],
    "container_statuses": [],
}

MOCK_METRICS = {
    "pods": {"items": [MOCK_POD], "total": 1},
    "nodes": {"count": 1, "items": []},
    "resources": {},
    "namespaces": {"count": 1},
}


class TestPodsAPIWithMockCluster:
    BASE = "/api/v1/pods"

    @pytest.fixture(autouse=True)
    def mock_db_with_cluster(self):
        cluster = [{"cluster_name": "test-cluster", "last_seen": "2024-01-01T00:00:00"}]
        import api.pods as _pods_mod
        mock_db = MagicMock()
        mock_db.get_all_clusters.return_value = cluster
        mock_db.get_latest_metrics.return_value = MOCK_METRICS
        original = _pods_mod.db_manager
        _pods_mod.db_manager = mock_db
        yield mock_db
        _pods_mod.db_manager = original

    def test_list_returns_real_pod(self):
        r = client.get(self.BASE)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        pod = data[0]
        assert pod["pod_name"] == "api-server-abc123"
        assert pod["namespace"] == "production"
        assert "cpu_metrics" in pod
        assert "memory_metrics" in pod
        assert "smart_analysis" in pod

    def test_pod_fields_are_numbers_not_strings(self):
        r = client.get(self.BASE)
        pod = r.json()[0]
        assert isinstance(pod["cpu_metrics"]["requested"], float)
        assert isinstance(pod["memory_metrics"]["requested"], float)
        assert isinstance(pod["smart_analysis"]["estimated_savings"], float)

    def test_no_dummy_strings_in_pod_response(self):
        r = client.get(self.BASE)
        assert_no_dummy_leakage(r.text, self.BASE)

    def test_summary_reflects_real_pod_count(self):
        r = client.get(f"{self.BASE}/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["total_pods"] == 1


# ──────────────────────────────────────────────────────────────────────────────
# Workloads API
# ──────────────────────────────────────────────────────────────────────────────

class TestWorkloadsAPI:
    BASE = "/api/v1/workloads"

    def test_deployments_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/deployments")
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_statefulsets_no_cluster(self):
        r = client.get(f"{self.BASE}/statefulsets")
        assert r.status_code in (200, 503)

    def test_daemonsets_no_cluster(self):
        r = client.get(f"{self.BASE}/daemonsets")
        assert r.status_code in (200, 503)

    def test_jobs_no_cluster(self):
        r = client.get(f"{self.BASE}/jobs")
        assert r.status_code in (200, 503)

    def test_cronjobs_no_cluster(self):
        r = client.get(f"{self.BASE}/cronjobs")
        assert r.status_code in (200, 503)


# ──────────────────────────────────────────────────────────────────────────────
# Cost Savings API
# ──────────────────────────────────────────────────────────────────────────────

class TestCostSavingsAPI:
    BASE = "/api/v1/cost-savings"

    def test_summary_no_cluster(self):
        r = client.get(f"{self.BASE}/summary")
        assert_valid_status(r, f"{self.BASE}/summary")

    def test_recommendations_no_cluster(self):
        r = client.get(f"{self.BASE}/recommendations")
        assert_valid_status(r, f"{self.BASE}/recommendations")


# ──────────────────────────────────────────────────────────────────────────────
# Recommendations API
# ──────────────────────────────────────────────────────────────────────────────

class TestRecommendationsAPI:
    BASE = "/api/v1/recommendations"

    def test_list_no_cluster(self):
        r = client.get(self.BASE)
        assert_valid_status(r, self.BASE)

    def test_summary_no_cluster(self):
        r = client.get(f"{self.BASE}/summary")
        assert_valid_status(r, f"{self.BASE}/summary")


# ──────────────────────────────────────────────────────────────────────────────
# Network API — dummy data fallback detection
# ──────────────────────────────────────────────────────────────────────────────

class TestNetworkAPI:
    BASE = "/api/v1/network"

    def test_services_no_cluster(self):
        r = client.get(f"{self.BASE}/services")
        assert_valid_status(r, f"{self.BASE}/services")
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, list)
            # When no real cluster exists and cluster_registry returns [],
            # dummy_data also produces [] — so this must be empty.
            assert len(data) == 0, (
                f"Services returned {len(data)} items with no real cluster — dummy leakage?"
            )

    def test_ingresses_no_cluster(self):
        r = client.get(f"{self.BASE}/ingresses")
        assert_valid_status(r, f"{self.BASE}/ingresses")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_network_policies_no_cluster(self):
        r = client.get(f"{self.BASE}/network-policies")
        assert_valid_status(r, f"{self.BASE}/network-policies")


# ──────────────────────────────────────────────────────────────────────────────
# Storage API
# ──────────────────────────────────────────────────────────────────────────────

class TestStorageAPI:
    BASE = "/api/v1/storage"

    def test_pvcs_no_cluster(self):
        r = client.get(f"{self.BASE}/pvcs")
        assert_valid_status(r, f"{self.BASE}/pvcs")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_pvs_no_cluster(self):
        r = client.get(f"{self.BASE}/pvs")
        assert_valid_status(r, f"{self.BASE}/pvs")

    def test_orphaned_volumes_no_cluster(self):
        r = client.get(f"{self.BASE}/orphaned-volumes")
        assert_valid_status(r, f"{self.BASE}/orphaned-volumes")


# ──────────────────────────────────────────────────────────────────────────────
# Observability API
# ──────────────────────────────────────────────────────────────────────────────

class TestObservabilityAPI:
    BASE = "/api/v1/observability"

    def test_events_no_cluster(self):
        r = client.get(f"{self.BASE}/events")
        assert_valid_status(r, f"{self.BASE}/events")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_service_health_no_cluster(self):
        r = client.get(f"{self.BASE}/service-health")
        assert_valid_status(r, f"{self.BASE}/service-health")


# ──────────────────────────────────────────────────────────────────────────────
# Scoring API
# ──────────────────────────────────────────────────────────────────────────────

class TestScoringAPI:
    BASE = "/api/v1/scoring"

    def test_cluster_score_no_cluster(self):
        r = client.get(f"{self.BASE}/cluster")
        assert_valid_status(r, f"{self.BASE}/cluster")

    def test_namespace_score_no_cluster(self):
        r = client.get(f"{self.BASE}/namespace")
        assert_valid_status(r, f"{self.BASE}/namespace")


# ──────────────────────────────────────────────────────────────────────────────
# Cleanup API
# ──────────────────────────────────────────────────────────────────────────────

class TestCleanupAPI:
    BASE = "/api/v1/cleanup"

    def test_zombie_resources_no_cluster(self):
        r = client.get(f"{self.BASE}/zombie-resources")
        assert_valid_status(r, f"{self.BASE}/zombie-resources")

    def test_unused_deployments_no_cluster(self):
        r = client.get(f"{self.BASE}/unused-deployments")
        assert_valid_status(r, f"{self.BASE}/unused-deployments")

    def test_stale_configmaps_no_cluster(self):
        r = client.get(f"{self.BASE}/stale-configmaps")
        assert_valid_status(r, f"{self.BASE}/stale-configmaps")

    def test_stale_secrets_no_cluster(self):
        r = client.get(f"{self.BASE}/stale-secrets")
        assert_valid_status(r, f"{self.BASE}/stale-secrets")

    def test_idle_namespaces_no_cluster(self):
        r = client.get(f"{self.BASE}/idle-namespaces")
        assert_valid_status(r, f"{self.BASE}/idle-namespaces")


# ──────────────────────────────────────────────────────────────────────────────
# Carbon API
# ──────────────────────────────────────────────────────────────────────────────

class TestCarbonAPI:
    BASE = "/api/v1/carbon"

    def test_footprint_no_cluster(self):
        r = client.get(f"{self.BASE}/footprint")
        assert_valid_status(r, f"{self.BASE}/footprint")

    def test_summary_no_cluster(self):
        r = client.get(f"{self.BASE}/summary")
        assert_valid_status(r, f"{self.BASE}/summary")


# ──────────────────────────────────────────────────────────────────────────────
# Incidents API
# ──────────────────────────────────────────────────────────────────────────────

class TestIncidentsAPI:
    BASE = "/api/v1/incidents"

    def test_list_no_cluster(self):
        r = client.get(f"{self.BASE}/incidents")
        assert_valid_status(r, f"{self.BASE}/incidents")

    def test_summary_no_cluster(self):
        r = client.get(f"{self.BASE}/summary")
        assert_valid_status(r, f"{self.BASE}/summary")


# ──────────────────────────────────────────────────────────────────────────────
# Reports API
# ──────────────────────────────────────────────────────────────────────────────

class TestReportsAPI:
    BASE = "/api/v1/reports"

    def test_list_no_cluster(self):
        r = client.get(self.BASE)
        assert_valid_status(r, self.BASE)


# ──────────────────────────────────────────────────────────────────────────────
# Audit API
# ──────────────────────────────────────────────────────────────────────────────

class TestAuditAPI:
    BASE = "/api/v1/audit"

    def test_list_events_no_cluster(self):
        r = client.get(self.BASE)
        assert_valid_status(r, self.BASE)


# ──────────────────────────────────────────────────────────────────────────────
# Executive API
# ──────────────────────────────────────────────────────────────────────────────

class TestExecutiveAPI:
    BASE = "/api/v1/executive"

    def test_overview_no_cluster(self):
        r = client.get(f"{self.BASE}/overview")
        assert_valid_status(r, f"{self.BASE}/overview")
        # Must not return dummy cluster names
        if r.status_code == 200:
            assert_no_dummy_leakage(r.text, f"{self.BASE}/overview")

    def test_kpis_no_cluster(self):
        r = client.get(f"{self.BASE}/kpis")
        assert_valid_status(r, f"{self.BASE}/kpis")


# ──────────────────────────────────────────────────────────────────────────────
# FinOps API — strict no-dummy-data policy
# ──────────────────────────────────────────────────────────────────────────────

class TestFinOpsAPI:
    BASE = "/api/v1/finops"

    def test_cost_management_no_cluster_returns_503(self):
        """FinOps explicitly forbids fake fallback — must 503 without a cluster.
        /api/v1/finops/cost-management is the real registered endpoint.
        /summary does not exist (404) — this test uses the correct endpoint.
        """
        r = client.get(f"{self.BASE}/cost-management")
        assert r.status_code == 503, (
            f"FinOps /cost-management should 503 without a cluster, got {r.status_code}: {r.text[:200]}"
        )

    def test_cost_allocation_no_cluster_returns_503(self):
        r = client.get(f"{self.BASE}/cost-allocation")
        assert r.status_code == 503


# ──────────────────────────────────────────────────────────────────────────────
# Security API
# ──────────────────────────────────────────────────────────────────────────────

class TestSecurityAPI:
    BASE = "/api/v1/security"

    def test_score_no_cluster(self):
        r = client.get(f"{self.BASE}/score")
        assert_valid_status(r, f"{self.BASE}/score")

    def test_alerts_no_cluster(self):
        r = client.get(f"{self.BASE}/alerts")
        assert_valid_status(r, f"{self.BASE}/alerts")


# ──────────────────────────────────────────────────────────────────────────────
# Data-shape contract tests — what a real pod response must look like
# ──────────────────────────────────────────────────────────────────────────────

class TestPodDataShapeContract:
    """Verify the response schema exactly matches the frontend TypeScript interfaces."""

    @pytest.fixture(autouse=True)
    def mock_db(self):
        cluster = [{"cluster_name": "shape-cluster", "last_seen": "2024-01-01T00:00:00"}]
        import api.pods as _pods_mod
        mock_db = MagicMock()
        mock_db.get_all_clusters.return_value = cluster
        mock_db.get_latest_metrics.return_value = {
                "pods": {
                    "items": [{
                        "name": "myapp-5f8d9b-xzp3q",
                        "namespace": "payments",
                        "node": "node-1",
                        "status": "Running",
                        "cpu_request": 0.25,
                        "memory_request_mb": 256.0,
                        "restarts": 2,
                        "creation_timestamp": "2024-03-01T00:00:00Z",
                        "containers": [],
                        "container_statuses": [
                            {"last_state_reason": "OOMKilled", "last_state_finished": "2024-03-15T12:00:00Z"}
                        ],
                    }],
                    "total": 1,
                },
                "nodes": {"count": 1},
                "resources": {},
                "namespaces": {"count": 1},
        }
        original = _pods_mod.db_manager
        _pods_mod.db_manager = mock_db
        yield mock_db
        _pods_mod.db_manager = original

    def test_pod_optimization_shape(self):
        r = client.get("/api/v1/pods")
        assert r.status_code == 200
        pod = r.json()[0]
        required_top = {"pod_name", "namespace", "cluster_id", "workload_type",
                        "node_name", "cpu_metrics", "memory_metrics", "smart_analysis",
                        "status", "last_restart", "age_days"}
        assert required_top.issubset(set(pod.keys())), f"Missing fields: {required_top - set(pod.keys())}"

        cpu_m = pod["cpu_metrics"]
        for field in ("current", "average", "peak", "requested", "limit", "utilization_percent"):
            assert field in cpu_m, f"cpu_metrics missing '{field}'"
            assert isinstance(cpu_m[field], (int, float))

        mem_m = pod["memory_metrics"]
        for field in ("current", "average", "peak", "requested", "limit", "utilization_percent"):
            assert field in mem_m, f"memory_metrics missing '{field}'"

        sa = pod["smart_analysis"]
        for field in ("issue", "recommendation", "estimated_savings", "risk_level"):
            assert field in sa, f"smart_analysis missing '{field}'"

    def test_oom_event_detected_from_container_status(self):
        r = client.get("/api/v1/pods/oom-events")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1, "OOMKilled container_status should produce at least one OOM event"
        event = data[0]
        assert event["oom_count"] >= 1
        assert event["pod_name"] == "myapp-5f8d9b-xzp3q"

    def test_restart_analysis_uses_real_restart_count(self):
        r = client.get("/api/v1/pods/restart-analysis")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        item = data[0]
        assert item["restart_count"] == 2
        assert item["restart_reason"] == "OOMKilled"


# ──────────────────────────────────────────────────────────────────────────────
# Cost calculation unit tests — verify math correctness
# ──────────────────────────────────────────────────────────────────────────────

class TestCostCalculations:
    def _approx(self, a: float, b: float, tol: float = 1e-5) -> bool:
        """Float comparison helper — avoids pytest.approx's numpy isinstance check."""
        return abs(a - b) < tol

    def test_dashboard_monthly_cost_formula(self):
        """The dashboard uses: cost = cpu*0.031*730 + mem_gb*0.004*730"""
        from api.dashboard import calculate_pod_cost
        pod = {
            "containers": [{
                "cpu_request": "1",        # 1 core
                "memory_request_mb": 1024, # 1 GB
            }]
        }
        result = calculate_pod_cost(pod)
        expected_cpu = 1.0 * 0.031 * 730
        expected_mem = (1024 / 1024) * 0.004 * 730
        expected_total = expected_cpu + expected_mem
        assert abs(result["monthly_cost"] - expected_total) < 0.01, (
            f"Cost formula wrong: expected {expected_total:.4f}, got {result['monthly_cost']:.4f}"
        )
        assert result["cpu_cores"] == 1.0
        assert self._approx(result["memory_gb"], 1.0)

    def test_cpu_millicore_parsing(self):
        from api.dashboard import _parse_cpu
        assert self._approx(_parse_cpu("500m"), 0.5)
        assert self._approx(_parse_cpu("2"), 2.0)
        assert self._approx(_parse_cpu(1.5), 1.5)
        assert _parse_cpu(None) == 0.0

    def test_memory_gb_parsing(self):
        from api.dashboard import _parse_memory_gb
        assert self._approx(_parse_memory_gb({"memory_request_mb": 2048.0}), 2.0)
        assert self._approx(_parse_memory_gb({"memory_request": "512Mi"}), 0.5)
        assert self._approx(_parse_memory_gb({"memory_request": "2Gi"}), 2.0)
        assert _parse_memory_gb({}) == 0.0

    def test_waste_analysis_30_percent_estimate(self):
        from api.dashboard import analyze_waste, calculate_pod_cost
        pod = {"containers": [{"cpu_request": "1", "memory_request_mb": 1024}]}
        cost_info = calculate_pod_cost(pod)
        monthly_cost = cost_info["monthly_cost"]
        result = analyze_waste([pod])
        # Waste estimate is exactly 30% of monthly_cost
        assert abs(result["total_waste"] - monthly_cost * 0.30) < 0.001


# ──────────────────────────────────────────────────────────────────────────────
# Dummy data utility unit tests
# ──────────────────────────────────────────────────────────────────────────────

class TestDummyDataUtility:
    """Verify dummy_data.py produces well-formed, cluster-tagged structures."""

    FAKE_CLUSTER = {"id": "test-abc", "name": "test-cluster", "environment": "production", "version": "1.28.0"}

    def test_deployments_structure(self):
        from utils.dummy_data import _build_deployments
        items = _build_deployments(self.FAKE_CLUSTER)
        assert len(items) > 0
        for item in items:
            assert "cluster_id" in item
            assert item["cluster_id"] == "test-abc"
            assert "name" in item
            assert "namespace" in item
            assert "replicas_desired" in item

    def test_nodes_structure(self):
        from utils.dummy_data import _build_nodes
        nodes = _build_nodes(self.FAKE_CLUSTER)
        assert len(nodes) == 5  # production → 5 nodes
        for node in nodes:
            assert "name" in node
            assert "cpu_usage" in node
            assert isinstance(node["cpu_usage"], float)
            assert 0 <= node["cpu_usage"] <= 100

    def test_health_structure(self):
        from utils.dummy_data import _build_health
        health = _build_health(self.FAKE_CLUSTER)
        assert "health_score" in health
        assert "cpu_efficiency" in health
        assert 0 <= health["health_score"] <= 100

    def test_deterministic_output(self):
        """Same cluster + name always produces same values (no random seed drift)."""
        from utils.dummy_data import _build_deployments
        result1 = _build_deployments(self.FAKE_CLUSTER)
        result2 = _build_deployments(self.FAKE_CLUSTER)
        assert result1[0]["name"] == result2[0]["name"]

    def test_get_dummy_data_empty_without_clusters(self):
        """When cluster_registry returns empty, dummy data returns empty too."""
        from unittest.mock import patch
        with patch("utils.cluster_registry.get_clusters", return_value=[]):
            from utils.dummy_data import get_dummy_data
            result = get_dummy_data("deployments")
            assert result == []


# ──────────────────────────────────────────────────────────────────────────────
# Response content — no placeholder text in any live endpoint
# ──────────────────────────────────────────────────────────────────────────────

class TestNoPlaceholderText:
    """API responses must never contain placeholder text used during development."""

    ENDPOINTS_TO_CHECK = [
        "/api/v1/pods",
        "/api/v1/clusters",
        "/api/v1/dashboard/insights",
        "/api/v1/dashboard/waste-contributors",
        "/api/v1/dashboard/cost-trend",
        "/api/v1/network/services",
        "/api/v1/observability/events",
    ]

    def test_no_lorem_ipsum_in_responses(self):
        for ep in self.ENDPOINTS_TO_CHECK:
            r = client.get(ep)
            if r.status_code == 200:
                assert "lorem ipsum" not in r.text.lower(), f"Lorem ipsum in {ep}"

    def test_no_test_user_in_responses(self):
        for ep in self.ENDPOINTS_TO_CHECK:
            r = client.get(ep)
            if r.status_code == 200:
                assert "test user" not in r.text.lower(), f"'test user' placeholder in {ep}"

    def test_no_sample_data_in_responses(self):
        for ep in self.ENDPOINTS_TO_CHECK:
            r = client.get(ep)
            if r.status_code == 200:
                assert "sample data" not in r.text.lower(), f"'sample data' placeholder in {ep}"


# ──────────────────────────────────────────────────────────────────────────────
# Platform Engineering API — Fix 3 introduced /api/v1/platform router
# ──────────────────────────────────────────────────────────────────────────────

class TestPlatformEngineeringAPI:
    BASE = "/api/v1/platform"

    def test_argocd_apps_no_cluster_returns_empty(self):
        """With no cluster data, platform routes must return [] not dummy data."""
        r = client.get(f"{self.BASE}/argocd/apps")
        assert r.status_code == 200
        assert r.json() == []

    def test_fluxcd_kustomizations_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/fluxcd/kustomizations")
        assert r.status_code == 200
        assert r.json() == []

    def test_gitops_drift_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/gitops/drift")
        assert r.status_code == 200
        assert r.json() == []

    def test_github_actions_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/pipelines/github-actions")
        assert r.status_code == 200
        assert r.json() == []

    def test_jenkins_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/pipelines/jenkins")
        assert r.status_code == 200
        assert r.json() == []

    def test_policy_as_code_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/policy/code")
        assert r.status_code == 200
        assert r.json() == []

    def test_deployment_intelligence_no_cluster_returns_empty(self):
        r = client.get(f"{self.BASE}/deployment-intelligence")
        assert r.status_code == 200
        assert r.json() == []

    def test_platform_engineering_no_dummy_strings(self):
        """Platform engineering endpoints must never leak dummy org names."""
        endpoints = [
            f"{self.BASE}/argocd/apps",
            f"{self.BASE}/fluxcd/kustomizations",
            f"{self.BASE}/gitops/drift",
        ]
        for ep in endpoints:
            r = client.get(ep)
            if r.status_code == 200:
                assert_no_dummy_leakage(r.text, ep)
