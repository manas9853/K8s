#!/usr/bin/env python3
"""
Self-check for _parse_opencost_allocation (agent.py). Run directly:
python3 test_opencost_parse.py
No live cluster/OpenCost needed — feeds a synthetic response matching
OpenCost's documented /allocation/compute shape (aggregate=namespace).
"""
from agent import _parse_opencost_allocation


def demo():
    # Real-shaped OpenCost response: one window, three namespaces plus the
    # synthetic __idle__ bucket OpenCost adds for unused node capacity.
    raw = {
        "code": 200,
        "data": [{
            "production": {"cpuCost": 120.0, "ramCost": 40.0, "pvCost": 10.0, "totalCost": 170.0},
            "staging":    {"cpuCost": 30.0,  "ramCost": 10.0, "pvCost": 0.0,  "totalCost": 40.0},
            "kube-system": {"cpuCost": 5.0,  "ramCost": 2.0,  "pvCost": 0.0,  "totalCost": 7.0},
            "__idle__":   {"cpuCost": 50.0,  "ramCost": 20.0, "pvCost": 0.0,  "totalCost": 70.0},
        }],
    }

    entries = _parse_opencost_allocation(raw)

    # __idle__ excluded — it's unused capacity, not attributable to any namespace
    names = [e["namespace"] for e in entries]
    assert "__idle__" not in names, entries
    assert set(names) == {"production", "staging", "kube-system"}, names

    # Sorted by cost descending
    assert names[0] == "production", names

    # Shares computed against the ATTRIBUTABLE total only (170+40+7=217),
    # not including idle — idle isn't anyone's namespace to blame.
    prod = next(e for e in entries if e["namespace"] == "production")
    assert abs(prod["share"] - (170.0 / 217.0)) < 1e-6, prod

    # Shares sum to ~1.0 across attributable namespaces
    total_share = sum(e["share"] for e in entries)
    assert abs(total_share - 1.0) < 1e-6, total_share

    # Empty response (no data yet) -> empty list, not a crash
    assert _parse_opencost_allocation({"code": 200, "data": []}) == []
    assert _parse_opencost_allocation({}) == []

    # All-idle response (empty cluster) -> empty list, no div-by-zero
    assert _parse_opencost_allocation({"data": [{"__idle__": {"totalCost": 5.0}}]}) == []

    print("OK: _parse_opencost_allocation shares, sort, idle-exclusion, and empty-input checks passed")


if __name__ == "__main__":
    demo()
