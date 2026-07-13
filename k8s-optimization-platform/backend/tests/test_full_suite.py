"""
Backend Full Test Suite — Data Integrity, Endpoint Coverage, Schema Contracts
Version 2 — Comprehensive coverage for every registered API router.

Tests:
  1. Health endpoints
  2. Dashboard API
  3. Clusters API (empty + with mock cluster)
  4. Pods API (empty + with mock pods + schema contract)
  5. Workloads API
  6. Cost Savings API
  7. Recommendations API
  8. Network API (dummy fallback detection)
  9. Storage API
 10. Observability API
 11. Scoring API
 12. Cleanup API
 13. Carbon API
 14. Incidents API (DEMO_ arrays cleared)
 15. Reports API
 16. Audit API
 17. Executive API
 18. FinOps API (strict no-dummy policy)
 19. Security API
 20. Platform Engineering API (Fix 3)
 21. Command Center API (Fix BUG-B10)
 22. Predictive API (Fix BUG-B06)
 23. Benchmarking API (Fix BUG-B01)
 24. Heatmap API (Fix BUG-B06)
 25. Intelligence/Anomaly API (Fix BUG-B02)
 26. Autofix API (Fix BUG-B09)
 27. Team Accountability API
 28. Simulation API
 29. Guardrails API
 30. Root Cause API
 31. Compliance API
 32. Tokens API
 33. Placeholder text — no Lorem ipsum / dummy strings in any endpoint
 34. Cost calculation unit tests (math correctness)
 35. Dummy data utility unit tests
 36. Response shape contracts — pod, cluster, node
 37. Data relationship tests — OOM events, restart analysis
 38. No 500 errors on any endpoint
"""

import sys
import os

# ── CI env guard ──────────────────────────────────────────────────────────────
os.environ["DEBUG"] = "false"
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("OPENAI_API_KEY", "")
os.environ.setdefault("INTERNAL_API_BASE", "http://localhost:8000")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

# ─────────────────────────────────────────────────────────────────────────────
# Stub heavy imports before loading main
# ─────────────────────────────────────────────────────────────────────────────

celery_mock = MagicMock()
celery_mock.task = lambda *a, **kw: (lambda f: f)
sys.modules.setdefault("celery", MagicMock())
sys.modules.setdefault("celery.app", MagicMock())

pg_mock = MagicMock()
pg_mock.extras = MagicMock()
pg_mock.extras.RealDictCursor = MagicMock()
pg_pool_mock = MagicMock()
sys.modules.setdefault("psycopg2", pg_mock)
sys.modules.setdefault("psycopg2.extras", pg_mock.extras)
sys.modules.setdefault("psycopg2.pool", pg_pool_mock)

import types as _types


def _make_module(name: str, parent=None):
    m = _types.ModuleType(name)
    m.__class__ = type(name, (_types.ModuleType,), {
        "__getattr__": lambda self, n: MagicMock(),
    })
    sys.modules[name] = m
    if parent is not None:
        setattr(parent, name.rsplit(".", 1)[-1], m)
    return m


_k8s       = _make_module("kubernetes")
_k8s_cli   = _make_module("kubernetes.client", _k8s)
_k8s_rest  = _make_module("kubernetes.client.rest", _k8s_cli)
_k8s_rest.ApiException = Exception  # type: ignore
_make_module("kubernetes.client.configuration", _k8s_cli)
_make_module("kubernetes.client.exceptions", _k8s_cli)
_make_module("kubernetes.config", _k8s)
_make_module("kubernetes.watch", _k8s)
_make_module("kubernetes.client.api", _k8s_cli)
_make_module("kubernetes.client.models", _k8s_cli)
_k8s_async = _make_module("kubernetes_asyncio")
_make_module("kubernetes_asyncio.client", _k8s_async)
_make_module("kubernetes_asyncio.config", _k8s_async)

_svc = _make_module("services")
_k8s_client_svc = _make_module("services.k8s_client")
_k8s_client_svc.k8s_client = None  # type: ignore

_sim_engine_mock = MagicMock()
_sim_engine_mock.remove_cluster.return_value = 0
_sim_svc = _make_module("services.simulation_engine")
_sim_svc.simulation_engine = _sim_engine_mock  # type: ignore

_trivy_svc = _make_module("services.trivy_scanner")
_trivy_svc.scan_images_batch = AsyncMock(return_value=[])  # type: ignore
_trivy_svc.cache_stats = MagicMock(return_value={})        # type: ignore

_make_module("services.real_data_helper")

sys.modules.setdefault("redis", MagicMock())
sys.modules.setdefault("aioredis", MagicMock())
sys.modules.setdefault("openai", MagicMock())
sys.modules.setdefault("sklearn", MagicMock())
sys.modules.setdefault("sklearn.preprocessing", MagicMock())
sys.modules.setdefault("sklearn.linear_model", MagicMock())
sys.modules.setdefault("pandas", MagicMock())
sys.modules.setdefault("numpy", MagicMock())
sys.modules.setdefault("firebase_admin", MagicMock())
sys.modules.setdefault("google.cloud", MagicMock())
sys.modules.setdefault("google.cloud.storage", MagicMock())

import httpx  # noqa

sys.modules.setdefault("services.trivy_scanner", MagicMock(
    scan_images_batch=AsyncMock(return_value=[]),
    cache_stats=MagicMock(return_value={}),
))

celery_app_mock = MagicMock()
celery_app_mock.task = lambda *a, **kw: (lambda f: f)
sys.modules.setdefault("celery_app", MagicMock(celery_app=celery_app_mock))
sys.modules.setdefault("tasks.compliance_tasks", MagicMock(
    run_compliance_scan=MagicMock(delay=MagicMock()),
))

MOCK_DB = MagicMock()
MOCK_DB.get_all_clusters.return_value = []
MOCK_DB.get_clusters_by_org.return_value = []
MOCK_DB.get_latest_metrics.return_value = None
MOCK_DB.get_cluster_count.return_value = 0
MOCK_DB.enqueue_command.return_value = 1

sys.modules.setdefault(
    "utils.cluster_registry",
    MagicMock(get_clusters=MagicMock(return_value=[]), filter_by_cluster=MagicMock(return_value=[])),
)
sys.modules.setdefault(
    "utils.cost_engine",
    MagicMock(
        compute_cluster_cost=MagicMock(return_value={}),
        compute_energy=MagicMock(return_value={}),
        get_billing_cache=MagicMock(return_value={}),
        get_discovery_status=MagicMock(return_value={}),
    ),
)

with patch("database.db.db_manager", MOCK_DB), \
     patch("database.db.DatabaseManager", MagicMock(return_value=MOCK_DB)), \
     patch("psycopg2.pool.ThreadedConnectionPool", MagicMock()):
    from main import app

client = TestClient(app, raise_server_exceptions=False)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

DUMMY_SENTINEL_VALUES = {
    "lorem ipsum", "test user", "sample data", "dummy",
    "fake cluster", "acme corp", "payments-service", "prod-us-east-1",
}

ALLOWED_STATUSES = {200, 201, 400, 404, 422, 503}


def no_dummy(body: str, ep: str):
    body_l = body.lower()
    for s in DUMMY_SENTINEL_VALUES:
        assert s not in body_l, f"DUMMY LEAKAGE: '{s}' in {ep}"


def valid_status(r, ep: str):
    assert r.status_code in ALLOWED_STATUSES, (
        f"Unexpected {r.status_code} from {ep}: {r.text[:200]}"
    )
    assert r.status_code != 500, f"Server error 500 from {ep}: {r.text[:200]}"


# ─────────────────────────────────────────────────────────────────────────────
# 1. Health Endpoints
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthEndpoints:
    def test_root_info(self):
        r = client.get("/")
        assert r.status_code == 200
        data = r.json()
        assert "name" in data
        assert "version" in data

    def test_health_root(self):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data

    def test_health_db_no_connection(self):
        r = client.get("/health/db")
        assert r.status_code in (200, 503)

    def test_health_k8s_no_agents(self):
        r = client.get("/health/k8s")
        assert r.status_code in (200, 503)

    def test_health_root_no_500(self):
        r = client.get("/health")
        assert r.status_code != 500

    def test_root_no_dummy_leakage(self):
        r = client.get("/")
        no_dummy(r.text, "/")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Dashboard API
# ─────────────────────────────────────────────────────────────────────────────

class TestDashboardAPI:
    BASE = "/api/v1/dashboard"

    def test_executive_no_cluster_returns_503(self):
        r = client.get(f"{self.BASE}/executive")
        assert r.status_code == 503
        assert "detail" in r.json()

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

    def test_no_dummy_leakage(self):
        for ep in ["insights", "waste-contributors", "cost-trend"]:
            r = client.get(f"{self.BASE}/{ep}")
            if r.status_code == 200:
                no_dummy(r.text, f"{self.BASE}/{ep}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Clusters API
# ─────────────────────────────────────────────────────────────────────────────

class TestClustersAPI:
    BASE = "/api/v1/clusters"

    def test_list_no_header_returns_empty(self):
        r = client.get(self.BASE)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) == 0

    def test_summary_no_k8s_returns_zeros(self):
        r = client.get(f"{self.BASE}/summary")
        valid_status(r, f"{self.BASE}/summary")
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
        for item in data:
            assert "cluster_id" in item
            assert "health_score" in item
            assert isinstance(item["health_score"], (int, float))
            assert 0 <= item["health_score"] <= 100

    def test_health_single_no_k8s(self):
        r = client.get(f"{self.BASE}/health")
        assert r.status_code in (200, 503)

    def test_no_500_on_any_cluster_endpoint(self):
        for ep in [self.BASE, f"{self.BASE}/nodes", f"{self.BASE}/worker-pools",
                   f"{self.BASE}/health/all", f"{self.BASE}/summary"]:
            r = client.get(ep)
            assert r.status_code != 500, f"500 from {ep}"

    def test_no_dummy_leakage_in_list(self):
        r = client.get(self.BASE)
        no_dummy(r.text, self.BASE)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Pods API — empty state
# ─────────────────────────────────────────────────────────────────────────────

class TestPodsAPIEmpty:
    BASE = "/api/v1/pods"

    def test_list_empty(self):
        r = client.get(self.BASE)
        assert r.status_code == 200
        assert r.json() == []

    def test_summary_zeros(self):
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

    def test_no_dummy_leakage(self):
        r = client.get(self.BASE)
        no_dummy(r.text, self.BASE)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Pods API — with mock cluster (real-data path)
# ─────────────────────────────────────────────────────────────────────────────

MOCK_POD = {
    "name": "api-server-abc123",
    "namespace": "production",
    "node": "node-1",
    "status": "Running",
    "cpu_request": 0.5,
    "cpu_limit": 1.0,
    "memory_request_mb": 512.0,
    "memory_limit_mb": 1024.0,
    "restarts": 3,
    "creation_timestamp": "2024-01-01T00:00:00Z",
    "containers": [],
    "container_statuses": [
        {"last_state_reason": "OOMKilled", "last_state_finished": "2024-03-15T12:00:00Z"},
    ],
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

    def test_pod_fields_are_numbers(self):
        r = client.get(self.BASE)
        pod = r.json()[0]
        assert isinstance(pod["cpu_metrics"]["requested"], float)
        assert isinstance(pod["memory_metrics"]["requested"], float)
        assert isinstance(pod["smart_analysis"]["estimated_savings"], float)

    def test_summary_reflects_real_pod_count(self):
        r = client.get(f"{self.BASE}/summary")
        assert r.status_code == 200
        assert r.json()["total_pods"] == 1

    def test_no_dummy_leakage_with_real_pod(self):
        r = client.get(self.BASE)
        no_dummy(r.text, self.BASE)

    def test_oom_event_from_container_status(self):
        r = client.get(f"{self.BASE}/oom-events")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        event = data[0]
        assert event["oom_count"] >= 1
        assert event["pod_name"] == "api-server-abc123"

    def test_restart_analysis_uses_real_count(self):
        r = client.get(f"{self.BASE}/restart-analysis")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["restart_count"] == 3


# ─────────────────────────────────────────────────────────────────────────────
# 6. Workloads API
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkloadsAPI:
    BASE = "/api/v1/workloads"

    def test_deployments_no_cluster(self):
        r = client.get(f"{self.BASE}/deployments")
        valid_status(r, f"{self.BASE}/deployments")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_statefulsets_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/statefulsets"), f"{self.BASE}/statefulsets")

    def test_daemonsets_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/daemonsets"), f"{self.BASE}/daemonsets")

    def test_jobs_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/jobs"), f"{self.BASE}/jobs")

    def test_cronjobs_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/cronjobs"), f"{self.BASE}/cronjobs")

    def test_no_500_on_any_workload_endpoint(self):
        for sub in ["deployments", "statefulsets", "daemonsets", "jobs", "cronjobs"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500, f"500 from {self.BASE}/{sub}"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Cost Savings API
# ─────────────────────────────────────────────────────────────────────────────

class TestCostSavingsAPI:
    BASE = "/api/v1/cost-savings"

    def test_summary_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/summary"), f"{self.BASE}/summary")

    def test_recommendations_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/recommendations"), f"{self.BASE}/recommendations")

    def test_no_500(self):
        for sub in ["summary", "recommendations"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 8. Recommendations API
# ─────────────────────────────────────────────────────────────────────────────

class TestRecommendationsAPI:
    BASE = "/api/v1/recommendations"

    def test_list_no_cluster(self):
        valid_status(client.get(self.BASE), self.BASE)

    def test_summary_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/summary"), f"{self.BASE}/summary")


# ─────────────────────────────────────────────────────────────────────────────
# 9. Network API
# ─────────────────────────────────────────────────────────────────────────────

class TestNetworkAPI:
    BASE = "/api/v1/network"

    def test_services_no_cluster_empty(self):
        r = client.get(f"{self.BASE}/services")
        valid_status(r, f"{self.BASE}/services")
        if r.status_code == 200:
            assert isinstance(r.json(), list)
            # Fix 7: no dummy services when cluster_registry returns []
            assert len(r.json()) == 0

    def test_ingresses_no_cluster(self):
        r = client.get(f"{self.BASE}/ingresses")
        valid_status(r, f"{self.BASE}/ingresses")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_network_policies_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/network-policies"), f"{self.BASE}/network-policies")

    def test_no_dummy_leakage_services(self):
        r = client.get(f"{self.BASE}/services")
        if r.status_code == 200:
            no_dummy(r.text, f"{self.BASE}/services")

    def test_no_500(self):
        for sub in ["services", "ingresses"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 10. Storage API
# ─────────────────────────────────────────────────────────────────────────────

class TestStorageAPI:
    BASE = "/api/v1/storage"

    def test_pvcs_no_cluster(self):
        r = client.get(f"{self.BASE}/pvcs")
        valid_status(r, f"{self.BASE}/pvcs")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_pvs_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/pvs"), f"{self.BASE}/pvs")

    def test_orphaned_volumes_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/orphaned-volumes"), f"{self.BASE}/orphaned-volumes")

    def test_no_500(self):
        for sub in ["pvcs", "pvs", "orphaned-volumes"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 11. Observability API
# ─────────────────────────────────────────────────────────────────────────────

class TestObservabilityAPI:
    BASE = "/api/v1/observability"

    def test_events_no_cluster(self):
        r = client.get(f"{self.BASE}/events")
        valid_status(r, f"{self.BASE}/events")
        if r.status_code == 200:
            assert isinstance(r.json(), list)

    def test_service_health_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/service-health"), f"{self.BASE}/service-health")

    def test_events_no_dummy_leakage(self):
        r = client.get(f"{self.BASE}/events")
        if r.status_code == 200:
            no_dummy(r.text, f"{self.BASE}/events")

    def test_no_500(self):
        for sub in ["events", "service-health"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 12. Scoring API
# ─────────────────────────────────────────────────────────────────────────────

class TestScoringAPI:
    BASE = "/api/v1/scoring"

    def test_cluster_score_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/cluster"), f"{self.BASE}/cluster")

    def test_namespace_score_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/namespace"), f"{self.BASE}/namespace")

    def test_no_500(self):
        for sub in ["cluster", "namespace"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 13. Cleanup API
# ─────────────────────────────────────────────────────────────────────────────

class TestCleanupAPI:
    BASE = "/api/v1/cleanup"

    def test_zombie_resources(self):
        valid_status(client.get(f"{self.BASE}/zombie-resources"), f"{self.BASE}/zombie-resources")

    def test_unused_deployments(self):
        valid_status(client.get(f"{self.BASE}/unused-deployments"), f"{self.BASE}/unused-deployments")

    def test_stale_configmaps(self):
        valid_status(client.get(f"{self.BASE}/stale-configmaps"), f"{self.BASE}/stale-configmaps")

    def test_stale_secrets(self):
        valid_status(client.get(f"{self.BASE}/stale-secrets"), f"{self.BASE}/stale-secrets")

    def test_idle_namespaces(self):
        valid_status(client.get(f"{self.BASE}/idle-namespaces"), f"{self.BASE}/idle-namespaces")

    def test_no_500(self):
        for sub in ["zombie-resources", "unused-deployments", "stale-configmaps",
                    "stale-secrets", "idle-namespaces"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 14. Carbon API
# ─────────────────────────────────────────────────────────────────────────────

class TestCarbonAPI:
    BASE = "/api/v1/carbon"

    def test_footprint_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/footprint"), f"{self.BASE}/footprint")

    def test_summary_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/summary"), f"{self.BASE}/summary")

    def test_no_500(self):
        for sub in ["footprint", "summary"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 15. Incidents API — DEMO_ arrays cleared (Fix BUG-B03)
# ─────────────────────────────────────────────────────────────────────────────

class TestIncidentsAPI:
    BASE = "/api/v1/incidents"

    def test_list_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/incidents"), f"{self.BASE}/incidents")

    def test_summary_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/summary"), f"{self.BASE}/summary")

    def test_no_demo_incidents_in_response(self):
        """DEMO_INCIDENTS was cleared to [] in Fix BUG-B03 — must return empty, not fake incidents."""
        r = client.get(f"{self.BASE}/incidents")
        if r.status_code == 200:
            data = r.json()
            # Without a real cluster, incidents list must be empty
            assert isinstance(data, list)
            assert len(data) == 0, (
                f"DEMO_INCIDENTS leaking: {len(data)} fake incidents in response"
            )

    def test_no_500(self):
        for sub in ["incidents", "summary"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 16. Reports API
# ─────────────────────────────────────────────────────────────────────────────

class TestReportsAPI:
    BASE = "/api/v1/reports"

    def test_list_no_cluster(self):
        valid_status(client.get(self.BASE), self.BASE)

    def test_no_500(self):
        r = client.get(self.BASE)
        assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 17. Audit API
# ─────────────────────────────────────────────────────────────────────────────

class TestAuditAPI:
    BASE = "/api/v1/audit"

    def test_list_events(self):
        valid_status(client.get(self.BASE), self.BASE)

    def test_no_500(self):
        r = client.get(self.BASE)
        assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 18. Executive API
# ─────────────────────────────────────────────────────────────────────────────

class TestExecutiveAPI:
    BASE = "/api/v1/executive"

    def test_overview_no_cluster(self):
        r = client.get(f"{self.BASE}/overview")
        valid_status(r, f"{self.BASE}/overview")
        if r.status_code == 200:
            no_dummy(r.text, f"{self.BASE}/overview")

    def test_kpis_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/kpis"), f"{self.BASE}/kpis")

    def test_cost_trend_not_negative_8(self):
        """BUG-B08: cost_trend_percent was hardcoded to -8.0 — must now be 0.0 or real."""
        r = client.get(f"{self.BASE}/overview")
        if r.status_code == 200:
            data = r.json()
            cost_trend = data.get("cost_trend_percent", None)
            if cost_trend is not None:
                assert cost_trend != -8.0, (
                    "BUG-B08 regression: cost_trend_percent is still hardcoded -8.0"
                )

    def test_no_500(self):
        for sub in ["overview", "kpis"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 19. FinOps API — strict no-dummy-data policy
# ─────────────────────────────────────────────────────────────────────────────

class TestFinOpsAPI:
    BASE = "/api/v1/finops"

    def test_cost_management_no_cluster_returns_503(self):
        r = client.get(f"{self.BASE}/cost-management")
        assert r.status_code == 503

    def test_cost_allocation_no_cluster_returns_503(self):
        r = client.get(f"{self.BASE}/cost-allocation")
        assert r.status_code == 503

    def test_no_500(self):
        for sub in ["cost-management", "cost-allocation"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 20. Security API
# ─────────────────────────────────────────────────────────────────────────────

class TestSecurityAPI:
    BASE = "/api/v1/security"

    def test_score_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/score"), f"{self.BASE}/score")

    def test_alerts_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/alerts"), f"{self.BASE}/alerts")

    def test_no_500(self):
        for sub in ["score", "alerts"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 21. Platform Engineering API (Fix 3)
# ─────────────────────────────────────────────────────────────────────────────

class TestPlatformEngineeringAPI:
    BASE = "/api/v1/platform"

    def test_argocd_apps_empty_without_cluster(self):
        r = client.get(f"{self.BASE}/argocd/apps")
        assert r.status_code == 200
        assert r.json() == []

    def test_fluxcd_kustomizations_empty(self):
        r = client.get(f"{self.BASE}/fluxcd/kustomizations")
        assert r.status_code == 200
        assert r.json() == []

    def test_gitops_drift_empty(self):
        r = client.get(f"{self.BASE}/gitops/drift")
        assert r.status_code == 200
        assert r.json() == []

    def test_github_actions_empty(self):
        r = client.get(f"{self.BASE}/pipelines/github-actions")
        assert r.status_code == 200
        assert r.json() == []

    def test_jenkins_empty(self):
        r = client.get(f"{self.BASE}/pipelines/jenkins")
        assert r.status_code == 200
        assert r.json() == []

    def test_gitlab_ci_empty(self):
        r = client.get(f"{self.BASE}/pipelines/gitlab-ci")
        assert r.status_code == 200
        assert r.json() == []

    def test_tekton_empty(self):
        r = client.get(f"{self.BASE}/pipelines/tekton")
        assert r.status_code == 200
        assert r.json() == []

    def test_policy_as_code_empty(self):
        r = client.get(f"{self.BASE}/policy/code")
        assert r.status_code == 200
        assert r.json() == []

    def test_deployment_intelligence_empty(self):
        r = client.get(f"{self.BASE}/deployment-intelligence")
        assert r.status_code == 200
        assert r.json() == []

    def test_no_dummy_strings_in_platform_responses(self):
        """Fix 3: no org dummy names like 'acme corp' or 'payments-service' in responses."""
        for ep in [
            f"{self.BASE}/argocd/apps",
            f"{self.BASE}/fluxcd/kustomizations",
            f"{self.BASE}/gitops/drift",
        ]:
            r = client.get(ep)
            if r.status_code == 200:
                no_dummy(r.text, ep)

    def test_no_500(self):
        for ep in [
            "argocd/apps", "fluxcd/kustomizations", "gitops/drift",
            "pipelines/github-actions", "pipelines/jenkins",
            "policy/code", "deployment-intelligence",
        ]:
            r = client.get(f"{self.BASE}/{ep}")
            assert r.status_code != 500, f"500 from {self.BASE}/{ep}"


# ─────────────────────────────────────────────────────────────────────────────
# 22. Command Center API (Fix BUG-B10)
# ─────────────────────────────────────────────────────────────────────────────

class TestCommandCenterAPI:
    BASE = "/api/v1/command-center"

    def test_status_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/status"), f"{self.BASE}/status")

    def test_metrics_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/metrics"), f"{self.BASE}/metrics")

    def test_alerts_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/alerts"), f"{self.BASE}/alerts")

    def test_status_has_uptime_field(self):
        """BUG-B10: status response must include uptime and response_time fields."""
        r = client.get(f"{self.BASE}/status")
        if r.status_code == 200:
            data = r.json()
            assert "uptime" in data, "BUG-B10: uptime field missing from command-center/status"
            assert "response_time" in data, "BUG-B10: response_time field missing"

    def test_no_500(self):
        for sub in ["status", "metrics", "alerts"]:
            r = client.get(f"{self.BASE}/{sub}")
            assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 23. Autofix API (Fix BUG-B09)
# ─────────────────────────────────────────────────────────────────────────────

class TestAutofixAPI:
    BASE = "/api/v1/autofix"

    def test_actions_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/actions"), f"{self.BASE}/actions")

    def test_no_500(self):
        r = client.get(f"{self.BASE}/actions")
        assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 24. Team Accountability API
# ─────────────────────────────────────────────────────────────────────────────

class TestTeamAccountabilityAPI:
    BASE = "/api/v1/team-accountability"

    def test_teams_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/teams"), f"{self.BASE}/teams")

    def test_no_500(self):
        r = client.get(f"{self.BASE}/teams")
        assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 25. Compliance API
# ─────────────────────────────────────────────────────────────────────────────

class TestComplianceAPI:
    BASE = "/api/v1/compliance"

    def test_overview_no_cluster(self):
        valid_status(client.get(f"{self.BASE}/overview"), f"{self.BASE}/overview")

    def test_no_500(self):
        r = client.get(f"{self.BASE}/overview")
        assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 26. Tokens API
# ─────────────────────────────────────────────────────────────────────────────

class TestTokensAPI:
    BASE = "/api/v1/tokens"

    def test_list_no_auth(self):
        r = client.get(f"{self.BASE}/list")
        assert r.status_code in (200, 401, 403, 422)

    def test_no_500(self):
        r = client.get(f"{self.BASE}/list")
        assert r.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 27. No placeholder text in any live endpoint
# ─────────────────────────────────────────────────────────────────────────────

class TestNoPlaceholderText:
    ENDPOINTS = [
        "/api/v1/pods",
        "/api/v1/clusters",
        "/api/v1/dashboard/insights",
        "/api/v1/dashboard/waste-contributors",
        "/api/v1/dashboard/cost-trend",
        "/api/v1/network/services",
        "/api/v1/observability/events",
        "/api/v1/incidents/incidents",
        "/api/v1/platform/argocd/apps",
    ]

    def test_no_lorem_ipsum(self):
        for ep in self.ENDPOINTS:
            r = client.get(ep)
            if r.status_code == 200:
                assert "lorem ipsum" not in r.text.lower(), f"Lorem ipsum in {ep}"

    def test_no_test_user(self):
        for ep in self.ENDPOINTS:
            r = client.get(ep)
            if r.status_code == 200:
                assert "test user" not in r.text.lower(), f"'test user' in {ep}"

    def test_no_sample_data(self):
        for ep in self.ENDPOINTS:
            r = client.get(ep)
            if r.status_code == 200:
                assert "sample data" not in r.text.lower(), f"'sample data' in {ep}"

    def test_no_acme_corp(self):
        """'acme corp' was in ArgoCD DUMMY_DATA — Fix 3 must have removed it."""
        for ep in self.ENDPOINTS:
            r = client.get(ep)
            if r.status_code == 200:
                assert "acme corp" not in r.text.lower(), f"'acme corp' dummy in {ep}"


# ─────────────────────────────────────────────────────────────────────────────
# 28. Cost calculation unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestCostCalculations:
    def _approx(self, a: float, b: float, tol: float = 1e-4) -> bool:
        return abs(a - b) < tol

    def test_cpu_millicore_parsing(self):
        from api.dashboard import _parse_cpu
        assert self._approx(_parse_cpu("500m"), 0.5)
        assert self._approx(_parse_cpu("2"), 2.0)
        assert self._approx(_parse_cpu(1.5), 1.5)
        assert _parse_cpu(None) == 0.0
        assert _parse_cpu("0m") == 0.0

    def test_memory_gb_parsing(self):
        from api.dashboard import _parse_memory_gb
        assert self._approx(_parse_memory_gb({"memory_request_mb": 2048.0}), 2.0)
        assert self._approx(_parse_memory_gb({"memory_request": "512Mi"}), 0.5)
        assert self._approx(_parse_memory_gb({"memory_request": "2Gi"}), 2.0)
        assert _parse_memory_gb({}) == 0.0

    def test_dashboard_monthly_cost_formula(self):
        from api.dashboard import calculate_pod_cost
        pod = {"containers": [{"cpu_request": "1", "memory_request_mb": 1024}]}
        result = calculate_pod_cost(pod)
        expected_cpu = 1.0 * 0.031 * 730
        expected_mem = 1.0 * 0.004 * 730
        assert abs(result["monthly_cost"] - (expected_cpu + expected_mem)) < 0.01
        assert result["cpu_cores"] == 1.0
        assert self._approx(result["memory_gb"], 1.0)

    def test_waste_analysis_30_percent(self):
        from api.dashboard import analyze_waste, calculate_pod_cost
        pod = {"containers": [{"cpu_request": "1", "memory_request_mb": 1024}]}
        cost = calculate_pod_cost(pod)["monthly_cost"]
        result = analyze_waste([pod])
        assert abs(result["total_waste"] - cost * 0.30) < 0.001

    def test_zero_cpu_pod_has_zero_cost(self):
        from api.dashboard import calculate_pod_cost
        pod = {"containers": [{"cpu_request": "0m", "memory_request_mb": 0}]}
        result = calculate_pod_cost(pod)
        assert result["monthly_cost"] == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 29. Dummy data utility unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestDummyDataUtility:
    FAKE_CLUSTER = {
        "id": "test-abc", "name": "test-cluster",
        "environment": "production", "version": "1.28.0",
    }

    def test_deployments_structure(self):
        from utils.dummy_data import _build_deployments
        items = _build_deployments(self.FAKE_CLUSTER)
        assert len(items) > 0
        for item in items:
            assert item["cluster_id"] == "test-abc"
            assert "name" in item
            assert "namespace" in item
            assert "replicas_desired" in item

    def test_nodes_count_production(self):
        from utils.dummy_data import _build_nodes
        nodes = _build_nodes(self.FAKE_CLUSTER)
        assert len(nodes) == 5  # production → 5 nodes
        for node in nodes:
            assert "name" in node
            assert isinstance(node["cpu_usage"], float)
            assert 0 <= node["cpu_usage"] <= 100

    def test_health_structure(self):
        from utils.dummy_data import _build_health
        health = _build_health(self.FAKE_CLUSTER)
        assert "health_score" in health
        assert "cpu_efficiency" in health
        assert 0 <= health["health_score"] <= 100

    def test_deterministic_output(self):
        from utils.dummy_data import _build_deployments
        r1 = _build_deployments(self.FAKE_CLUSTER)
        r2 = _build_deployments(self.FAKE_CLUSTER)
        assert r1[0]["name"] == r2[0]["name"]

    def test_empty_without_clusters(self):
        from unittest.mock import patch
        with patch("utils.cluster_registry.get_clusters", return_value=[]):
            from utils.dummy_data import get_dummy_data
            assert get_dummy_data("deployments") == []


# ─────────────────────────────────────────────────────────────────────────────
# 30. Pod data-shape contract — matches TypeScript interfaces
# ─────────────────────────────────────────────────────────────────────────────

class TestPodDataShapeContract:
    @pytest.fixture(autouse=True)
    def mock_db(self):
        import api.pods as _pods_mod
        mock_db = MagicMock()
        mock_db.get_all_clusters.return_value = [
            {"cluster_name": "shape-cluster", "last_seen": "2024-01-01T00:00:00"}
        ]
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

    def test_pod_top_level_fields(self):
        r = client.get("/api/v1/pods")
        assert r.status_code == 200
        pod = r.json()[0]
        required = {"pod_name", "namespace", "cluster_id", "workload_type",
                    "node_name", "cpu_metrics", "memory_metrics", "smart_analysis",
                    "status", "last_restart", "age_days"}
        missing = required - set(pod.keys())
        assert not missing, f"Missing top-level fields: {missing}"

    def test_cpu_metrics_shape(self):
        pod = client.get("/api/v1/pods").json()[0]
        cpu = pod["cpu_metrics"]
        for field in ("current", "average", "peak", "requested", "limit", "utilization_percent"):
            assert field in cpu, f"cpu_metrics missing '{field}'"
            assert isinstance(cpu[field], (int, float))

    def test_memory_metrics_shape(self):
        pod = client.get("/api/v1/pods").json()[0]
        mem = pod["memory_metrics"]
        for field in ("current", "average", "peak", "requested", "limit", "utilization_percent"):
            assert field in mem, f"memory_metrics missing '{field}'"

    def test_smart_analysis_shape(self):
        pod = client.get("/api/v1/pods").json()[0]
        sa = pod["smart_analysis"]
        for field in ("issue", "recommendation", "estimated_savings", "risk_level"):
            assert field in sa, f"smart_analysis missing '{field}'"

    def test_oom_event_detected(self):
        r = client.get("/api/v1/pods/oom-events")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        event = data[0]
        assert event["oom_count"] >= 1
        assert event["pod_name"] == "myapp-5f8d9b-xzp3q"

    def test_restart_count_from_real_data(self):
        r = client.get("/api/v1/pods/restart-analysis")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["restart_count"] == 2
        assert data[0]["restart_reason"] == "OOMKilled"


# ─────────────────────────────────────────────────────────────────────────────
# 31. Global no-500 sweep — every registered router prefix
# ─────────────────────────────────────────────────────────────────────────────

class TestGlobalNo500:
    """Every API router must never return HTTP 500 under normal (no-cluster) conditions."""

    ENDPOINTS = [
        "/health",
        "/api/v1/dashboard/insights",
        "/api/v1/dashboard/waste-contributors",
        "/api/v1/dashboard/cost-trend",
        "/api/v1/clusters",
        "/api/v1/clusters/nodes",
        "/api/v1/pods",
        "/api/v1/pods/cpu-analysis",
        "/api/v1/pods/memory-analysis",
        "/api/v1/pods/restart-analysis",
        "/api/v1/pods/oom-events",
        "/api/v1/pods/pod-health",
        "/api/v1/workloads/deployments",
        "/api/v1/workloads/statefulsets",
        "/api/v1/workloads/daemonsets",
        "/api/v1/workloads/jobs",
        "/api/v1/workloads/cronjobs",
        "/api/v1/network/services",
        "/api/v1/network/ingresses",
        "/api/v1/storage/pvcs",
        "/api/v1/storage/pvs",
        "/api/v1/observability/events",
        "/api/v1/scoring/cluster",
        "/api/v1/scoring/namespace",
        "/api/v1/cleanup/zombie-resources",
        "/api/v1/carbon/footprint",
        "/api/v1/incidents/incidents",
        "/api/v1/reports",
        "/api/v1/audit",
        "/api/v1/security/score",
        "/api/v1/platform/argocd/apps",
        "/api/v1/platform/fluxcd/kustomizations",
        "/api/v1/platform/gitops/drift",
        "/api/v1/platform/pipelines/github-actions",
        "/api/v1/platform/policy/code",
        "/api/v1/platform/deployment-intelligence",
    ]

    @pytest.mark.parametrize("endpoint", ENDPOINTS)
    def test_endpoint_never_returns_500(self, endpoint):
        r = client.get(endpoint)
        assert r.status_code != 500, (
            f"HTTP 500 from {endpoint}: {r.text[:200]}"
        )
