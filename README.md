# K8s Cluster Dashboard

## Quick start

```bash
# 1. Generate data from your current kubectl context
python3 ~/k8s-cluster-audit/generate_dashboard.py

# 2. Serve the dashboard (required for JSON load)
cd ~/k8s-cluster-audit && python3 -m http.server 8765

# 3. Open in browser
open http://localhost:8765/dashboard.html
```

Re-run `generate_dashboard.py` anytime to refresh data.

## Files

| File | Purpose |
|---|---|
| `generate_dashboard.py` | Fetches **all** cluster resources → `cluster-data.json` |
| `dashboard.html` | Interactive UI: charts, tables, dependency map |
| `generate_full_inventory.py` | Full CSV export (optional) |

## Dashboard tabs

- **Overview** — cluster stats, CPU/memory charts, nodes, resource types
- **Namespaces** — all 42 namespaces (including empty ones)
- **Workloads / Pods** — every pod with right-size recommendations
- **All Resources** — pods, deployments, services, ingress, PVCs, secrets (metadata), jobs, etc.
- **Network & APIs** — dependency flow diagram + connection table
- **Storage** — PVC chart + delete/keep actions
- **Cost Actions** — everything flagged DELETE / RIGHTSIZE / SET_REQUESTS
