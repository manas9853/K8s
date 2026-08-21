#!/usr/bin/env python3
"""
Self-check for _parse_hubble_metrics (agent.py). Run directly:
python3 test_hubble_metrics.py
No live cluster/Hubble needed — feeds a synthetic Prometheus exposition
snippet matching Hubble's documented hubble_flows_processed_total shape.
"""
from agent import _parse_hubble_metrics, _parse_hubble_endpoint


def demo():
    raw = """
# HELP hubble_flows_processed_total Total number of flows processed
# TYPE hubble_flows_processed_total counter
hubble_flows_processed_total{destination="frontend/frontend-abc123",protocol="TCP",source="backend/backend-xyz789",subtype="to-endpoint",type="Trace",verdict="FORWARDED"} 42
hubble_flows_processed_total{destination="frontend/frontend-abc123",protocol="TCP",source="backend/backend-xyz789",subtype="to-endpoint",type="Trace",verdict="FORWARDED"} 8
hubble_flows_processed_total{destination="reserved:world",protocol="TCP",source="payments/payments-def456",subtype="to-endpoint",type="Trace",verdict="DROPPED"} 3
some_other_metric{label="x"} 100
"""
    entries = _parse_hubble_metrics(raw)

    # Two matching lines for the same (src,dst,verdict,protocol) key merge
    fe = next(e for e in entries if e["dest_pod"] == "frontend-abc123")
    assert fe["count"] == 50, fe  # 42 + 8
    assert fe["source_namespace"] == "backend" and fe["source_pod"] == "backend-xyz789", fe
    assert fe["verdict"] == "FORWARDED", fe

    # reserved:world destination has no namespace/pod, but is preserved as an identity
    world = next(e for e in entries if e["dest_namespace"] is None)
    assert world["dest_pod"] == "reserved:world", world
    assert world["verdict"] == "DROPPED", world

    # Sorted by count descending
    assert entries[0]["count"] >= entries[-1]["count"], entries

    # Non-hubble metric lines are ignored, not crashed on
    assert len(entries) == 2, entries

    # Empty input -> empty list
    assert _parse_hubble_metrics("") == []

    # Endpoint parsing helper
    assert _parse_hubble_endpoint("ns/pod-1") == ("ns", "pod-1")
    assert _parse_hubble_endpoint("reserved:host") == (None, "reserved:host")
    assert _parse_hubble_endpoint("") == (None, None)

    print("OK: _parse_hubble_metrics aggregation, reserved-identity, and empty-input checks passed")


if __name__ == "__main__":
    demo()
