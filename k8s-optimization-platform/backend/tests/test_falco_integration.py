"""
Self-check for Phase 6's Falco integration: the pure alert -> runtime_threats
mapper in api/security.py. No live cluster or Falco deployment needed —
synthetic alert-row fixtures only (the shape db_manager.get_falco_alerts returns).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")

from api.security import _map_falco_alerts  # noqa: E402


def _alert(rule="Terminal shell in container", priority="Critical", **fields):
    return {
        "rule": rule,
        "priority": priority,
        "output": f"{rule} detected",
        "alert_time": "2026-08-21T10:00:00Z",
        "fields": {
            "k8s.pod.name": "victim-pod",
            "k8s.ns.name": "default",
            "container.id": "abc123",
            **fields,
        },
    }


def test_priority_maps_to_severity():
    out = _map_falco_alerts([_alert(priority="Critical"), _alert(priority="Warning"), _alert(priority="Notice")])
    assert [t["severity"] for t in out] == ["critical", "medium", "low"]


def test_unknown_priority_defaults_medium():
    out = _map_falco_alerts([_alert(priority="Something Weird")])
    assert out[0]["severity"] == "medium"


def test_fields_carried_through():
    out = _map_falco_alerts([_alert(rule="Detect crypto miners using the Stratum protocol")])
    t = out[0]
    assert t["pod_name"] == "victim-pod"
    assert t["namespace"] == "default"
    assert t["threat_type"] == "Detect crypto miners using the Stratum protocol"
    assert t["source"] == "falco"


def test_empty_input_returns_empty():
    assert _map_falco_alerts([]) == []


if __name__ == "__main__":
    test_priority_maps_to_severity()
    test_unknown_priority_defaults_medium()
    test_fields_carried_through()
    test_empty_input_returns_empty()
    print("OK: all Falco integration mapping checks passed")
