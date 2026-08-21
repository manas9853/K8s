"""
Self-check for Phase 6's Hubble integration: the pure flow -> traffic_flows
aggregator in api/security.py. No live cluster/Hubble needed — synthetic
flow-row fixtures only (the shape agent.py's _parse_hubble_metrics produces).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")

from api.security import _hubble_flows_to_traffic  # noqa: E402


def _flow(src_ns, dst_ns, verdict="FORWARDED", protocol="TCP", count=1):
    return {
        "source_namespace": src_ns, "source_pod": f"{src_ns}-pod",
        "dest_namespace": dst_ns, "dest_pod": f"{dst_ns}-pod",
        "verdict": verdict, "protocol": protocol, "count": count,
    }


def test_all_forwarded_pair_is_unrestricted_high_risk():
    out = _hubble_flows_to_traffic([_flow("frontend", "backend", count=42)])
    assert out["traffic_flows"][0]["is_restricted"] is False
    assert out["traffic_flows"][0]["risk_level"] == "high"
    assert out["traffic_flows"][0]["connection_count"] == 42
    assert out["restricted_flows"] == 0
    assert out["unrestricted_flows"] == 1


def test_any_dropped_marks_pair_restricted():
    out = _hubble_flows_to_traffic([
        _flow("frontend", "payments", verdict="FORWARDED", count=10),
        _flow("frontend", "payments", verdict="DROPPED", count=5),
    ])
    t = out["traffic_flows"][0]
    assert t["is_restricted"] is True
    assert t["risk_level"] == "low"
    assert t["connection_count"] == 15  # both verdicts count as observed traffic
    assert out["restricted_flows"] == 1


def test_same_namespace_pair_excluded():
    out = _hubble_flows_to_traffic([_flow("frontend", "frontend")])
    assert out["traffic_flows"] == []


def test_missing_namespace_excluded_not_crashed():
    out = _hubble_flows_to_traffic([
        {"source_namespace": None, "dest_namespace": "backend", "verdict": "FORWARDED", "count": 1},
    ])
    assert out["traffic_flows"] == []


def test_sorted_by_connection_count_descending():
    out = _hubble_flows_to_traffic([
        _flow("a", "b", count=5),
        _flow("c", "d", count=99),
    ])
    assert out["traffic_flows"][0]["connection_count"] == 99


def test_empty_input_returns_empty():
    out = _hubble_flows_to_traffic([])
    assert out["traffic_flows"] == []
    assert out["namespaces_analyzed"] == 0


if __name__ == "__main__":
    test_all_forwarded_pair_is_unrestricted_high_risk()
    test_any_dropped_marks_pair_restricted()
    test_same_namespace_pair_excluded()
    test_missing_namespace_excluded_not_crashed()
    test_sorted_by_connection_count_descending()
    test_empty_input_returns_empty()
    print("OK: all Hubble integration aggregation checks passed")
