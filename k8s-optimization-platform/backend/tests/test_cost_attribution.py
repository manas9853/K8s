"""
Self-check for services/cost_service.py's real-billing namespace-cost
blending (Phase 4): OpenCost-shape allocation when available, resource-
weighted fallback against the REAL total otherwise. No live cluster,
OpenCost, or billing API needed — synthetic finops-domain fixtures only.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")

from services.cost_service import _namespace_costs_for_real_total  # noqa: E402


def test_opencost_path_uses_real_shares_against_real_total():
    finops = {
        "opencost_allocation": [
            {"namespace": "production", "cpu_cost": 120.0, "ram_cost": 40.0,
             "pv_cost": 10.0, "total_cost": 170.0, "share": 0.85},
            {"namespace": "staging", "cpu_cost": 15.0, "ram_cost": 5.0,
             "pv_cost": 0.0, "total_cost": 20.0, "share": 0.10},
            {"namespace": "kube-system", "cpu_cost": 8.0, "ram_cost": 2.0,
             "pv_cost": 0.0, "total_cost": 10.0, "share": 0.05},
        ],
        "namespace_resources": {
            "production": {"cpu_request": 12.0, "memory_request_gb": 48.0, "pod_count": 40},
            "staging": {"cpu_request": 2.0, "memory_request_gb": 8.0, "pod_count": 10},
        },
    }

    real_total = 1000.0
    out = _namespace_costs_for_real_total(real_total, finops)

    prod = next(r for r in out if r["namespace"] == "production")
    assert prod["monthly_cost"] == 850.0, prod  # real_total * 0.85, not OpenCost's own $170
    assert prod["pod_count"] == 40, prod          # cross-referenced from namespace_resources

    staging = next(r for r in out if r["namespace"] == "staging")
    assert staging["monthly_cost"] == 100.0, staging

    # Shares sum to the real total (within rounding)
    assert abs(sum(r["monthly_cost"] for r in out) - real_total) < 1.0

    # Namespace missing from namespace_resources (e.g. kube-system, agent
    # doesn't always report resources for system namespaces) degrades to
    # zero resource fields, not a crash
    ks = next(r for r in out if r["namespace"] == "kube-system")
    assert ks["cpu_request"] == 0


def test_fallback_path_when_no_opencost():
    finops = {
        "namespace_resources": {
            "production": {"cpu_request": 8.0, "memory_request_gb": 32.0, "pod_count": 20},
            "staging": {"cpu_request": 2.0, "memory_request_gb": 8.0, "pod_count": 5},
        },
    }
    real_total = 500.0
    out = _namespace_costs_for_real_total(real_total, finops)

    # 70/30 CPU/mem blend, same formula as Phase 1 estimation
    prod = next(r for r in out if r["namespace"] == "production")
    expected_cpu_share = 8.0 / 10.0   # 0.8
    expected_mem_share = 32.0 / 40.0  # 0.8
    expected_blend = expected_cpu_share * 0.70 + expected_mem_share * 0.30
    assert abs(prod["monthly_cost"] - round(real_total * expected_blend, 2)) < 0.01

    assert abs(sum(r["monthly_cost"] for r in out) - real_total) < 1.0


def test_no_data_returns_empty_not_crash():
    assert _namespace_costs_for_real_total(1000.0, {}) == []
    assert _namespace_costs_for_real_total(1000.0, {"opencost_allocation": [], "namespace_resources": {}}) == []


def test_zero_total_no_div_by_zero():
    finops = {"namespace_resources": {"ns": {"cpu_request": 0, "memory_request_gb": 0, "pod_count": 0}}}
    out = _namespace_costs_for_real_total(0.0, finops)
    assert out[0]["monthly_cost"] == 0.0


if __name__ == "__main__":
    test_opencost_path_uses_real_shares_against_real_total()
    test_fallback_path_when_no_opencost()
    test_no_data_returns_empty_not_crash()
    test_zero_total_no_div_by_zero()
    print("OK: all cost attribution blending checks passed")
