# FinOps & Sustainability — Production Implementation Plan

> **Status:** Not started  
> **Scope:** 10 frontend pages + backend rewrites + Cloud Discovery system  
> **Philosophy:** Ponytail-style — stdlib over custom, one function over fifty, least code that works  
> **Principle:** Agent-calculated estimates always. Cloud Discovery opt-in for invoice-accurate data. Never fake precision.

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Gap Analysis — Every Known Gap](#2-gap-analysis)
3. [Architecture Decision: Two-Phase Cost System](#3-architecture-two-phase-cost-system)
4. [Ponytail Integration](#4-ponytail-integration)
5. [Backend Implementation Plan](#5-backend-implementation-plan)
6. [Frontend Implementation Plan](#6-frontend-implementation-plan)
7. [Cloud Discovery System](#7-cloud-discovery-system)
8. [Data Model Changes](#8-data-model-changes)
9. [Step-by-Step Build Order](#9-build-order)
10. [What We Are NOT Building](#10-what-we-are-not-building)

---

## 1. Current State Audit

### Backend — `finops.py` (578 lines)

| Endpoint | Status | Problem |
|---|---|---|
| `GET /cost-management` | ❌ Fake | `_cluster_cost()` = hash-based deterministic mock. Returns `$21,975/mo` for IBM cluster that actually costs `$613/mo` |
| `GET /cost-allocation` | ❌ Fake | Hardcoded team shares (Platform Eng 28%, Data Analytics 22%). No real namespace data used. |
| `GET /chargeback-showback` | ❌ Fake | Same hardcoded team ratios. Billing period is real date but numbers are hash. |
| `GET /budget-tracking` | ❌ Fake | Budget = `monthly × 1.12`. No real budget ever set by user. |
| `GET /savings-tracker` | ❌ Fake | `realized_pct = 0.142` hardcoded. No tracking of actual agent fixes applied. |
| `GET /energy-consumption` | ❌ Fake | `monthly_kwh = monthly_cost × 0.50` — derived from fake cost. |
| `GET /sustainability-score` | ❌ Fake | `score = 68 + hash(cluster_id) % 20`. |
| `GET /financial-benchmarking` | ❌ Fake | `pod_count = len(clusters) × 62`. Not real. |

**One real field in all of finops.py:** `provider` and `region` come from `get_clusters()` which reads from the real `agent_clusters` table.

### Backend — `carbon.py` (458 lines)

| Endpoint | Status | Problem |
|---|---|---|
| `GET /summary` | ⚠️ Partial | Calls `fetch_recommendations()` via HTTP to `localhost:8000` — self-loop that breaks in Docker. |
| `GET /clusters` | ⚠️ Partial | Same localhost self-call. Falls back to `xforce-devops` hardcoded. |
| `GET /trends` | ⚠️ Partial | Simulates historical data with `improvement_factor = 1 - (i / months * 0.15)`. |
| `GET /namespaces` | ⚠️ Partial | Same localhost self-call. |
| `GET /impact` | ⚠️ Partial | Calls `get_summary()` internally — works but summary is broken. |

**Good in carbon.py:** The physics formulas (`KWH_PER_CPU_CORE_HOUR = 0.012`, `CO2_KG_PER_KWH = 0.385`) are correct EPA-sourced constants.  
**Bad:** It never reads `_fetch_cluster_context()`. It has no access to real pod CPU/memory data.

### Frontend — All 10 Pages

| Page | Lines | Theme | Dark? | Uses `useActiveCluster`? | Working? |
|---|---|---|---|---|---|
| `CostForecasting.tsx` | 223 | MUI light | ❌ | ✅ via `clusterParam` | ❌ Renders but light theme |
| `CostAllocation.tsx` | 183 | MUI light | ❌ | ✅ | ❌ Light theme |
| `ChargebackShowback.tsx` | 198 | MUI light | ❌ | ✅ | ❌ Light theme |
| `BudgetTracking.tsx` | 185 | MUI light | ❌ | ✅ | ❌ Light theme |
| `SavingsTracker.tsx` | 189 | MUI light | ❌ | ✅ | ❌ Light theme |
| `Carbon.tsx` | 280 | MUI light | ❌ | ❌ (missing) | ❌ Light + broken API |
| `EnergyConsumption.tsx` | 221 | MUI light | ❌ | ❌ (missing) | ❌ Light theme |
| `SustainabilityScore.tsx` | 234 | MUI light | ❌ | ❌ (missing) | ❌ Light theme |
| `FinancialBenchmarking.tsx` | 284 | MUI light | ❌ | ✅ | ❌ Light theme |
| `FinOpsReports.tsx` | 190 | MUI light | ❌ | ✅ | ❌ Light theme |

**No dark theme (`DK.*` tokens) in any file. No `CostAccuracyBanner`. No Cloud Discovery integration.**

---

## 2. Gap Analysis

### Gap 1 — Cost Source: Wrong Data Shape (CRITICAL)

The agent sends `finops.namespace_resources` as a **dict keyed by namespace name**:
```json
{ "rabbitmq": { "cpu_request": 1.5, "memory_request_gb": 4.5 } }
```

`_fetch_cluster_context()` in `autonomous_ai.py` calls `_safe_list()` on this dict → returns `[]` → `_build_cost_answer()` sees empty list → returns "No cost data available".

**Fix:** In `_extract()`, convert dict to list before `_safe_list()`:
```python
nr = finops_d.get("namespace_resources", {})
ns_res_raw = [{"namespace": k, **v} for k, v in nr.items()] if isinstance(nr, dict) else nr
```

### Gap 2 — Cost Source: Wrong Pricing Formula (HIGH)

Every cost calculation uses `$0.031/core/hr` (AWS rate labelled as such in `config/settings.py`).  
Your cluster is IBM Cloud IKS. Real node costs:
- `b3c.8x32.encrypted` = `$0.264/hr` → `$193/mo`  
- `m3c.4x32.encrypted` = `$0.192/hr` → `$140/mo × 3`  
- IKS control plane fee = `$0.091/hr` → `$66/mo`  
- **Correct total: `$613/mo` vs current estimate `$200/mo` — 3× error**

**Fix:** Per-node instance type lookup table + label fallback for 3 nodes with blank `instance_type`.

### Gap 3 — Instance Type Blank for 3 of 4 Nodes (HIGH)

Agent sets `instance_type: ""` for nodes `10.190.140.15`, `10.190.140.5`, `10.190.140.9`.  
But K8s labels contain `ibm-cloud.kubernetes.io/machine-type: m3c.4x32.encrypted`.  

**Fix:** Agent node collector must read `ibm-cloud.kubernetes.io/machine-type` label as fallback.

### Gap 4 — No Real CPU/Memory Usage Data (HIGH)

`pods[].cpu_usage_cores = 0` for all 283 pods. Agent never calls metrics-server API.  
Without usage data, waste calculation is impossible. We can only show requested cost, not wasted cost.

**Fix:** Phase 2 agent update — call `metrics.k8s.io/v1beta1/pods` custom resource API.  
**For now:** Show requested-based cost only, clearly labelled as "based on requests".

### Gap 5 — No Historical Cost Data (MEDIUM)

Agent onboards on a specific date. We have no pre-onboarding cost history.  
Current finops.py fakes 6 months of history by multiplying current cost by time factors.

**Production rule:** Only show cost from agent onboarding date forward. No fake history.  
For forecasting: use current cost trend from `agent_metrics` table (`ORDER BY timestamp DESC LIMIT 90`).

### Gap 6 — carbon.py Self-HTTP-Loop (HIGH)

`fetch_recommendations()` calls `http://localhost:8000/api/recommendations/` — breaks in Docker containers where localhost is not the service. Should call `_fetch_cluster_context()` directly.

**Fix:** Remove all `httpx` calls in `carbon.py`. Import and call `_fetch_cluster_context()` directly.

### Gap 7 — Energy/Sustainability Use Fake Cost as Input (MEDIUM)

`monthly_kwh = monthly_cost × 0.50` — derives energy from the already-wrong fake cost.  
Should derive from real node CPU cores × power consumption formula.

**Real formula:** `kWh = cpu_cores × 10W × hours / 1000` (10W per core industry standard)  
Your cluster: `20 CPU cores × 10W × 730h / 1000 = 146 kWh/month` (vs `10,987 kWh` currently shown)

### Gap 8 — All 10 Frontend Pages Use Light MUI Theme (MEDIUM)

All pages use `bgcolor: 'background.paper'`, `color: 'text.primary'` etc.  
No `DK.*` tokens. No GitHub dark theme. Inconsistent with all Autonomous AI pages.

### Gap 9 — No Cloud Discovery System (MEDIUM — Phase 2)

No `cloud_discovery_config` table. No billing API integration. No `CostAccuracyBanner`.  
Every cost page shows numbers with no accuracy indicator.

### Gap 10 — No `useActiveCluster` in Carbon/Energy/Sustainability (LOW)

`Carbon.tsx`, `EnergyConsumption.tsx`, `SustainabilityScore.tsx` don't use `useActiveCluster`.  
They call hardcoded endpoints with no cluster scoping.

### Gap 11 — finops.py Fallback Still Has Fake AWS Clusters (LOW)

```python
# finops.py line 16-21 — fallback fake clusters still present
clusters = [
    {"id": "prod-us-east-1", "provider": "aws"},  # ← fake, never real
    ...
]
```
Since `cluster_registry.get_clusters()` now returns real DB clusters, this fallback is dead code but misleads.

---

## 3. Architecture: Two-Phase Cost System

### Phase 1 — Agent Estimates (Always On, No Extra Credentials)

```
Agent deployed in cluster
    ↓ sends every 5 min
agent_metrics table in Postgres
    ↓ _fetch_cluster_context() reads
Cost Engine
    ↓ per-node instance type lookup table
    ↓ label fallback for blank instance_type
    ↓ IKS/EKS/GKE control plane fee
    ↓ namespace share allocation
    ↓ storage class-based PVC cost
Estimated monthly cost per namespace
    ↓
All FinOps pages — show with amber "~ Estimated" badge
    + CostAccuracyBanner on every cost page
```

**What Phase 1 can calculate accurately:**
- Node compute cost per flavour (IBM b3c/m3c lookup table)
- Namespace cost = (namespace cpu_request / total cluster cpu) × total node cost
- Storage cost per PVC (by storage class: ibmc-block-bronze $0.09/GB, ibmc-file-silver $0.12/GB, etc.)
- IKS control plane fee ($0.091/hr = $66/mo per cluster — always added for IBM)
- Energy consumption from CPU cores × 10W formula (not from fake cost)
- Carbon from kWh × regional CO₂ intensity (IBM us-east = 0.385 kg/kWh)
- Forecasting from agent_metrics history (from onboarding date only, no fake history)

**What Phase 1 cannot calculate:**
- Actual billed amount (discounts, EA, partner pricing)
- Pre-onboarding cost history
- Actual CPU/memory usage (needs metrics-server in agent)
- Network egress exact cost

### Phase 2 — Cloud Discovery (Opt-In, Per Cluster)

```
User configures discovery:
  Provider + read-only billing API key + account ID + cluster tag
    ↓
Discovery Engine (hourly background job)
    ↓ calls: IBM Billing API / AWS Cost Explorer / GCP BigQuery / Azure Cost Mgmt
    ↓ filters: ONLY K8s-related line items (worker nodes, PVCs, LBs, control plane)
    ↓ stores: cluster_billing_cache table
All FinOps pages
    ↓ check: does cluster_billing_cache have data for this month?
    ↓ YES → use real billing data, show green "✓ Invoice-Accurate" badge, no banner
    ↓ NO  → use Phase 1 estimates, show amber banner
```

**Phase 2 solves:**
- Enterprise Agreement discounts (automatically reflected in IBM billing API)
- Partner/reseller pricing (IBM billing API returns post-partner amount)
- Spot/reserved instance pricing
- Pre-onboarding history (billing API returns last 12 months)

**Permissions required (read-only billing only — nothing else):**

| Provider | Required Permissions | NOT Requested |
|---|---|---|
| IBM Cloud | `billing.usage.read`, `billing.invoice.read` | No compute, no storage, no IAM |
| AWS | `ce:GetCostAndUsage`, `ce:GetDimensionValues` | No `ec2:*`, `s3:*`, `iam:*` |
| GCP | `bigquery.tables.getData` on billing export table | No `compute.*`, `storage.*` |
| Azure | `Cost Management Reader` role | No `Contributor`, no write roles |

### The "From Onboarding Date Only" Rule

> **Production rule:** Cost history starts from the first agent metrics row for a cluster. We never fabricate pre-onboarding data. The UI shows "Cost data available from [onboarding date]". Forecasting uses only real historical data points from `agent_metrics`.

```python
# How to get onboarding date
def get_cluster_onboarding_date(cluster_name: str) -> str:
    """First metrics row = onboarding date. Use registered_at as fallback."""
    # SELECT MIN(timestamp) FROM agent_metrics WHERE cluster_name = %s
    # Falls back to agent_clusters.registered_at
```

---

## 4. Ponytail Integration

Ponytail (https://ponytail.dev) is a coding philosophy tool: **"the lazy senior dev for your AI agent"**.  
Its principle: **54% less code, stdlib over custom, native over deps, one line over fifty.**

### How We Apply Ponytail to This Codebase

**Rule 1: No new dependencies for what stdlib handles**

```python
# ❌ Before (over-engineered)
import httpx
async with httpx.AsyncClient() as client:
    r = await client.get("http://localhost:8000/api/recommendations/")

# ✅ After (Ponytail — direct function call, no HTTP)
ctx = await _fetch_cluster_context(cluster)
pods = ctx.get("pods", [])
```

**Rule 2: One shared cost engine, not per-endpoint duplication**

```python
# ❌ Before: every endpoint recalculates cost with its own formula
# finops.py has 8 endpoints each doing: _cluster_cost(c["id"], env) = hash * 12.5
# autonomous_ai.py does: cpu_cores * 0.031 * 24 * 30
# cleanup.py does: cpu * 0.04 * HOURS_PER_MONTH
# pods.py does: cpu * 0.031 * 730
# (4 different formulas for the same thing)

# ✅ After (Ponytail): one function, all files import it
# utils/cost_engine.py — single source of truth
def compute_cluster_cost(ctx: dict) -> ClusterCost: ...
```

**Rule 3: One hook, all frontend pages**

```typescript
// ❌ Before: each page has its own fetch + loading + error state (10× duplicated)
// ✅ After: one hook
const { cost, discovery, loading } = useClusterCost(clusterParam);
```

**Rule 4: No fake data, no fallback that invents numbers**

```python
# ❌ Before
if not clusters:
    clusters = [{"id": "prod-us-east-1", "provider": "aws"}]  # fake

# ✅ After (Ponytail)
if not clusters:
    return {"error": "no_clusters", "message": "No clusters registered yet."}
```

**Rule 5: One table migration function, not repeated ALTER TABLE in each module**

```python
# ❌ Before: db.py runs ALTER TABLE for every column in _init_schema
# ✅ After: add new tables in _init_schema only — one place, idempotent
```

---

## 5. Backend Implementation Plan

### Step B1 — `utils/cost_engine.py` (NEW FILE — Ponytail Core)

Single source of truth for all cost calculations. Replaces 4 different formulas across the codebase.

```python
"""
Cost Engine — single source of truth for all K8s cost calculations.
Ponytail rule: one function, imported everywhere. No duplication.

Data source priority:
  1. cluster_billing_cache (Phase 2 — real invoice data)
  2. _fetch_cluster_context() nodes + instance type lookup (Phase 1 — estimates)
"""

# IBM Cloud IKS instance type pricing (us-east, on-demand)
IBM_IKS_RATES: dict[str, float] = {
    "b3c.2x8":               0.064,
    "b3c.4x16":              0.118,
    "b3c.4x16.encrypted":    0.124,
    "b3c.8x32":              0.248,
    "b3c.8x32.encrypted":    0.264,   # ← your Node 1
    "b3c.16x64":             0.480,
    "b3c.16x64.encrypted":   0.512,
    "b3c.32x128":            0.960,
    "b3c.32x128.encrypted":  1.024,
    "m3c.4x32":              0.182,
    "m3c.4x32.encrypted":    0.192,   # ← your Nodes 2,3,4
    "m3c.8x64":              0.352,
    "m3c.8x64.encrypted":    0.384,
    "m3c.16x128":            0.704,
    "m3c.30x240":            1.320,
    "c3c.4x8":               0.096,
    "c3c.8x16":              0.192,
    "c3c.16x32":             0.384,
    "c3c.32x64":             0.768,
}

# AWS EKS EC2 rates (us-east-1, on-demand)
AWS_EC2_RATES: dict[str, float] = {
    "t3.small": 0.021, "t3.medium": 0.042, "t3.large": 0.083,
    "t3.xlarge": 0.166, "t3.2xlarge": 0.333,
    "m5.large": 0.096, "m5.xlarge": 0.192, "m5.2xlarge": 0.384,
    "m5.4xlarge": 0.768, "m5.8xlarge": 1.536,
    "m6i.large": 0.096, "m6i.xlarge": 0.192, "m6i.2xlarge": 0.384,
    "c5.large": 0.085, "c5.xlarge": 0.170, "c5.2xlarge": 0.340,
    "r5.large": 0.126, "r5.xlarge": 0.252, "r5.2xlarge": 0.504,
}

# GCP GKE machine types (us-central1, on-demand)
GCP_GCE_RATES: dict[str, float] = {
    "e2-small": 0.017, "e2-medium": 0.034, "e2-standard-2": 0.067,
    "e2-standard-4": 0.134, "e2-standard-8": 0.268, "e2-standard-16": 0.536,
    "n2-standard-2": 0.097, "n2-standard-4": 0.194, "n2-standard-8": 0.388,
    "n2-standard-16": 0.776, "n2-standard-32": 1.552,
}

# Azure AKS VM sizes (eastus, pay-as-you-go)
AZURE_VM_RATES: dict[str, float] = {
    "Standard_B2s": 0.046, "Standard_B4ms": 0.166,
    "Standard_D2s_v3": 0.096, "Standard_D4s_v3": 0.192,
    "Standard_D8s_v3": 0.384, "Standard_D16s_v3": 0.768,
}

# Managed K8s control plane fees ($/hr per cluster)
CONTROL_PLANE_FEES: dict[str, float] = {
    "IBM Cloud": 0.091,   # IKS Standard tier
    "AWS":       0.100,   # EKS cluster fee
    "GCP":       0.100,   # GKE Standard tier
    "Azure":     0.000,   # AKS control plane is free
}

# Provider-aware fallback vCPU rates (when instance type unknown)
PROVIDER_VCPU_RATES: dict[str, dict] = {
    "IBM Cloud": {"cpu": 0.048, "mem": 0.006},
    "AWS":       {"cpu": 0.031, "mem": 0.0035},
    "GCP":       {"cpu": 0.033, "mem": 0.0044},
    "Azure":     {"cpu": 0.040, "mem": 0.005},
    "unknown":   {"cpu": 0.031, "mem": 0.0035},
}

# Storage class rates ($/GB/month)
STORAGE_CLASS_RATES: dict[str, float] = {
    "ibmc-file-bronze":          0.08,
    "ibmc-file-silver":          0.12,
    "ibmc-file-gold":            0.20,
    "ibmc-block-bronze":         0.09,
    "ibmc-block-silver":         0.13,
    "ibmc-block-gold":           0.20,
    "ibmc-block-retain-bronze":  0.10,
    "ibmc-block-retain-silver":  0.14,
    "ibmc-block-retain-gold":    0.22,
    "eck-custom-storage-bronze": 0.08,
    "eck-custom-storage-silver": 0.12,
    "gp2": 0.10, "gp3": 0.08, "io1": 0.125,
    "pd-ssd": 0.17, "pd-balanced": 0.10, "pd-standard": 0.04,
    "default": 0.10,
}

HOURS_PER_MONTH = 730
```

**Functions in `cost_engine.py`:**

```python
def resolve_instance_type(node: dict) -> str:
    """
    Step 1: direct field.
    Step 2: K8s standard labels.
    Step 3: provider-specific labels (IBM, EKS nodegroup, etc.).
    """

def detect_provider(node: dict) -> str:
    """
    Read provider_id prefix: ibm:// → IBM Cloud, aws:///→ AWS, gce:// → GCP, azure:// → Azure.
    Fallback: finops.provider field.
    """

def node_hourly_cost(node: dict, provider: str) -> tuple[float, str]:
    """
    Returns (hourly_rate, method) where method is one of:
    'instance_lookup' | 'vcpu_fallback'
    """

def compute_cluster_cost(ctx: dict) -> dict:
    """
    Main function. Returns:
    {
      total_monthly: float,
      compute_monthly: float,
      storage_monthly: float,
      control_plane_monthly: float,
      provider: str,
      confidence: 'instance_lookup' | 'vcpu_fallback',
      onboarding_date: str,
      node_costs: list[{name, instance_type, hourly, monthly, method}],
      namespace_costs: list[{namespace, cpu_share, cost, pod_count}],
      pvc_costs: list[{name, namespace, storage_class, capacity_gb, monthly}],
    }
    """

def compute_energy(ctx: dict) -> dict:
    """
    From real CPU cores only. NO derivation from cost.
    kWh = cpu_cores × 10W × 730h / 1000
    CO2 = kWh × regional_intensity (IBM us-east = 0.385 kg/kWh)
    """

def get_billing_data_if_available(cluster_name: str) -> dict | None:
    """
    Check cluster_billing_cache for current month.
    Returns None if Phase 2 not connected.
    """
```

### Step B2 — Database Migrations (2 new tables)

Add to `db.py` `_init_schema()`:

```sql
-- Cloud Discovery config per cluster
CREATE TABLE IF NOT EXISTS cloud_discovery_config (
    cluster_name    TEXT PRIMARY KEY REFERENCES agent_clusters(cluster_name),
    provider        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    api_key_enc     TEXT,          -- AES-256 encrypted — NEVER returned via API response
    account_id      TEXT,          -- IBM account / AWS account / GCP project / Azure subscription
    cluster_tag     TEXT,          -- billing tag/label used to filter K8s costs
    last_sync_at    TEXT,
    last_sync_ok    BOOLEAN DEFAULT FALSE,
    last_error      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Billing cache — hourly refresh from cloud billing APIs
CREATE TABLE IF NOT EXISTS cluster_billing_cache (
    cluster_name    TEXT NOT NULL,
    billing_month   TEXT NOT NULL,     -- "2026-07"
    total_cost      FLOAT NOT NULL,
    compute_cost    FLOAT DEFAULT 0,
    storage_cost    FLOAT DEFAULT 0,
    network_cost    FLOAT DEFAULT 0,
    control_plane   FLOAT DEFAULT 0,
    currency        TEXT DEFAULT 'USD',
    line_items      JSONB DEFAULT '[]',
    source          TEXT NOT NULL,     -- 'ibm_billing_api' | 'aws_cost_explorer' | etc.
    fetched_at      TEXT NOT NULL,
    PRIMARY KEY (cluster_name, billing_month)
);
```

### Step B3 — Rewrite `finops.py` (All 8 Endpoints)

**Pattern for every endpoint:**

```python
from utils.cost_engine import compute_cluster_cost, get_billing_data_if_available

@router.get("/cost-management")
async def get_cost_management(cluster: Optional[str] = Query(None)):
    # Step 1: Try billing cache (Phase 2)
    if cluster:
        billing = get_billing_data_if_available(cluster)
        if billing:
            return _format_cost_management_from_billing(billing, cluster)

    # Step 2: Agent estimates (Phase 1)
    ctx = await _fetch_cluster_context(cluster)
    if not ctx:
        raise HTTPException(503, "No cluster data. Ensure agent is running.")
    cost = compute_cluster_cost(ctx)
    return _format_cost_management_from_estimate(cost, ctx)
```

**What changes per endpoint:**

| Endpoint | Phase 1 Source | Phase 2 Source | Cost Badge |
|---|---|---|---|
| `cost-management` | `compute_cluster_cost(ctx)` | billing cache total | `estimated` / `invoice` |
| `cost-allocation` | namespace_resources dict → cost per ns | billing tags per namespace | `estimated` / `invoice` |
| `chargeback-showback` | ns cost grouped by team label | billing by cost center tag | `estimated` / `invoice` |
| `budget-tracking` | current cost + forecasting from history | actual vs budget from billing | `estimated` / `invoice` |
| `savings-tracker` | requested - optimized (right-sizing) | billing month-over-month delta | `estimated` / `invoice` |
| `energy-consumption` | `compute_energy(ctx)` — CPU-based | same (energy = physics, not billing) | `physical` |
| `sustainability-score` | derived from energy + waste % | same | `physical` |
| `financial-benchmarking` | cost / real pod count from ctx | cost from billing / real pods | `estimated` / `invoice` |

**Forecasting rule (from onboarding date only):**

```python
def _build_forecast(cluster_name: str, current_monthly: float) -> dict:
    """
    Uses real agent_metrics history from onboarding date.
    Returns trend-based projection — never fabricated past data.
    If < 7 days of data: forecast = flat (too early to trend).
    If 7-30 days: linear extrapolation with wide confidence interval.
    If > 30 days: weighted moving average.
    """
    history = db_manager.get_metrics_history(cluster_name, limit=90)
    onboarding_date = min(r["timestamp"] for r in history) if history else None
    # ... trend calculation from real data only
```

### Step B4 — Rewrite `carbon.py` (Remove All HTTP Self-Calls)

```python
# ❌ Remove all httpx imports and fetch_recommendations() / fetch_clusters() functions
# ✅ Import directly

from api.autonomous_ai import _fetch_cluster_context
from utils.cost_engine import compute_energy

@router.get("/summary")
async def get_carbon_summary(cluster: Optional[str] = Query(None)):
    ctx = await _fetch_cluster_context(cluster)
    if not ctx:
        raise HTTPException(503, "No cluster data available")
    energy = compute_energy(ctx)
    # ... derive carbon from energy, not from fake cost
```

### Step B5 — New `api/discovery.py` (Cloud Discovery Endpoints)

```
GET  /api/v1/discovery/status?cluster=xforce-devops
POST /api/v1/discovery/connect        { cluster_name, provider, api_key, account_id, cluster_tag }
POST /api/v1/discovery/validate       { provider, api_key, account_id } → test credentials only
POST /api/v1/discovery/sync?cluster=xforce-devops  → trigger immediate billing fetch
DELETE /api/v1/discovery/disconnect?cluster=xforce-devops
GET  /api/v1/discovery/permissions?provider=IBM Cloud  → return exact permissions list + CLI commands
```

**Billing fetcher per provider (scoped to K8s only):**

```python
async def _fetch_ibm_billing(api_key_enc: str, account_id: str, cluster_tag: str, month: str) -> dict:
    """
    IBM Cloud Usage Reports API v4.
    Filter: resourceType = 'containers-kubernetes' AND cluster_id = cluster_tag
    Returns actual billed amounts — EA discounts and partner pricing reflected automatically.
    Scope: ONLY Kubernetes line items. Nothing else fetched.
    """

async def _fetch_aws_billing(api_key_enc: str, account_id: str, cluster_tag: str, month: str) -> dict:
    """
    AWS Cost Explorer ce:GetCostAndUsage.
    Filter: SERVICE = 'Amazon Elastic Kubernetes Service' AND tag:eks:cluster-name = cluster_tag
    """

async def _fetch_gcp_billing(api_key_enc: str, project_id: str, cluster_name: str, month: str) -> dict:
    """
    GCP Billing Export via BigQuery.
    SELECT * FROM billing_export WHERE service.description = 'Kubernetes Engine'
      AND labels.key = 'gke-cluster' AND labels.value = cluster_name
    """

async def _fetch_azure_billing(api_key_enc: str, subscription_id: str, resource_group: str, month: str) -> dict:
    """
    Azure Cost Management API.
    Filter: ResourceType = 'microsoft.containerservice/managedclusters'
    """
```

---

## 6. Frontend Implementation Plan

### Design Tokens — Same as All Autonomous AI Pages

```typescript
const DK = {
  bg:      '#0d1117',
  surface: '#161b22',
  surface2:'#1c2128',
  border:  '#30363d',
  text:    '#e6edf3',
  muted:   '#8b949e',
};
```

### New Shared Components

**`components/CostAccuracyBanner.tsx`**

Renders on 7 cost pages (not Carbon/Energy/Sustainability which are physics-based).

```typescript
// Logic:
// - calls GET /api/v1/discovery/status?cluster=X
// - connected=true  → green badge "✓ Invoice-Accurate · IBM Cloud · Synced 6m ago"
// - connected=false → amber banner with "Connect Cloud Account →" CTA
// - loading         → nothing (no flash of incorrect state)
```

**`hooks/useCloudDiscovery.ts`**

```typescript
// Returns: { connected, provider, lastSync, accuracy, loading }
// Auto-refetches every 5 minutes
```

**`pages/settings/CloudDiscovery.tsx`** (NEW PAGE)

The setup wizard for connecting billing. Provider selection → permission preview → credential entry → validate → connect.

### Frontend Page Rewrites (All 10 Pages)

**Pattern (Ponytail — least code that works):**

```typescript
// Every cost page follows this exact structure:
// 1. DK.* tokens — dark theme
// 2. useActiveCluster() — cluster scoping
// 3. CostAccuracyBanner — accuracy signal (7 pages only)
// 4. fetch from real endpoint
// 5. Show data with accuracy chips on cost numbers
// 6. No fake data fallbacks in the UI
```

**Pages that get `CostAccuracyBanner`:**
- CostForecasting ✅
- CostAllocation ✅
- ChargebackShowback ✅
- BudgetTracking ✅
- SavingsTracker ✅
- FinancialBenchmarking ✅
- FinOpsReports ✅

**Pages that do NOT get `CostAccuracyBanner` (physics-based, not billing-based):**
- Carbon ❌ (CO₂ from CPU watts — no billing needed)
- EnergyConsumption ❌ (kWh from CPU cores — no billing needed)
- SustainabilityScore ❌ (score from utilization — no billing needed)

---

## 7. Cloud Discovery System

### Connection Flow

```
1. User visits /settings/cloud-discovery
2. Sees list of registered clusters with their discovery status
3. Clicks "Connect" on a cluster
4. Selects provider (IBM Cloud / AWS / GCP / Azure / On-prem)
5. Sees exact permissions required + CLI command to create read-only key
6. Enters: API key, Account ID, Cluster tag/name used in billing
7. Clicks "Validate" — we test credentials immediately (no billing fetch yet)
8. On success: clicks "Connect" — we store encrypted key + run first billing fetch
9. All cost pages update automatically within 60 seconds
10. Connect banner disappears on all pages
```

### Security Design

- `api_key_enc` column: encrypted with AES-256-GCM before storage, key from environment variable `DISCOVERY_ENCRYPTION_KEY`
- Never returned in any API response — write-only from API perspective
- Displayed in UI as `••••••••••••••••` with option to rotate
- Can be revoked at any time — deletes from DB, falls back to Phase 1 immediately

### Sync Schedule

- Initial sync: on connect (immediate)
- Ongoing: background job every 60 minutes per connected cluster
- Manual: user can trigger sync from settings page
- On error: retry with exponential backoff (5m, 15m, 60m), show last error in UI
- Rate limits: IBM API = 1000 req/month free; AWS Cost Explorer = $0.01/1000 requests

### What We Filter (K8s Only)

```python
# IBM Cloud filter
resource_type = "containers-kubernetes"
cluster_id_tag = cluster_tag  # e.g., "c2dvjirw01r66qf58vu0"

# AWS filter  
service = "Amazon Elastic Kubernetes Service"
tag_key = "eks:cluster-name"
tag_value = cluster_tag

# GCP filter
service_description = "Kubernetes Engine"
label_key = "gke-cluster"
label_value = cluster_tag

# Azure filter
resource_type = "microsoft.containerservice/managedclusters"
resource_group = cluster_tag
```

---

## 8. Data Model Changes

### New Tables (added to `db.py` `_init_schema()`)

```sql
cloud_discovery_config    -- per-cluster billing connection config
cluster_billing_cache     -- hourly-refreshed billing data from cloud APIs
```

### Existing Tables (no schema changes needed)

```
agent_clusters            -- already has cloud_provider, region
agent_metrics             -- already has finops, nodes, pods, storage domains
```

### New Fields on API Responses

Every cost endpoint response gains:

```json
{
  "cost_source": "phase1_estimate" | "phase2_billing_api",
  "accuracy": "estimated" | "configured" | "invoice",
  "onboarding_date": "2026-07-09T07:14:10Z",
  "data_from": "2026-07-09",
  "last_updated": "2026-07-10T10:47:19Z"
}
```

---

## 9. Build Order

> Ponytail rule: build the core engine first, then wire everything to it.

### Sprint 1 — Core Engine (Backend, no frontend changes)

- [ ] **B1.1** Write `utils/cost_engine.py` with all price tables and `compute_cluster_cost()`
- [ ] **B1.2** Write `compute_energy()` in `cost_engine.py` (CPU-based, no fake cost derivation)
- [ ] **B1.3** Fix `_fetch_cluster_context()` in `autonomous_ai.py` — namespace_resources dict→list conversion
- [ ] **B1.4** Fix 3 blank instance_type nodes — add label fallback in `_extract()`
- [ ] **B1.5** Add `get_cluster_onboarding_date()` to `db_manager`
- [ ] **B2.1** Add `cloud_discovery_config` and `cluster_billing_cache` tables to `db.py`

### Sprint 2 — Backend Rewrites

- [ ] **B3.1** Rewrite `finops.py` all 8 endpoints using `cost_engine.py`
- [ ] **B3.2** Remove fallback fake clusters from `finops.py`
- [ ] **B4.1** Rewrite `carbon.py` — remove all httpx self-calls, use `_fetch_cluster_context()` directly
- [ ] **B5.1** Write `api/discovery.py` — 5 endpoints (status, connect, validate, sync, disconnect, permissions)
- [ ] **B5.2** Write billing fetcher stubs for IBM/AWS/GCP/Azure (IBM implemented first as that's our cluster)
- [ ] **B5.3** Register discovery router in `main.py`

### Sprint 3 — Frontend (All 10 pages)

- [ ] **F1.1** Write `hooks/useCloudDiscovery.ts`
- [ ] **F1.2** Write `components/CostAccuracyBanner.tsx`
- [ ] **F2.1** Rewrite `CostForecasting.tsx` — DK tokens + banner + real forecasting data
- [ ] **F2.2** Rewrite `CostAllocation.tsx` — DK tokens + banner + namespace breakdown
- [ ] **F2.3** Rewrite `ChargebackShowback.tsx` — DK tokens + banner
- [ ] **F2.4** Rewrite `BudgetTracking.tsx` — DK tokens + banner
- [ ] **F2.5** Rewrite `SavingsTracker.tsx` — DK tokens + banner
- [ ] **F2.6** Rewrite `Carbon.tsx` — DK tokens + `useActiveCluster` + real data
- [ ] **F2.7** Rewrite `EnergyConsumption.tsx` — DK tokens + `useActiveCluster`
- [ ] **F2.8** Rewrite `SustainabilityScore.tsx` — DK tokens + `useActiveCluster`
- [ ] **F2.9** Rewrite `FinancialBenchmarking.tsx` — DK tokens + banner + real pod counts
- [ ] **F2.10** Rewrite `FinOpsReports.tsx` — DK tokens + banner

### Sprint 4 — Cloud Discovery UI

- [ ] **F3.1** Write `pages/settings/CloudDiscovery.tsx` — setup wizard
- [ ] **F3.2** Add "Cloud Discovery" to navigation under Settings
- [ ] **F3.3** Add route in `App.tsx`

### Sprint 5 — Deploy

- [ ] **D1** `git push` → SSH EC2 → `git pull` + Docker rebuild
- [ ] **D2** `firebase deploy --only hosting`
- [ ] **D3** Verify all 8 finops endpoints return real data (not hash-based)
- [ ] **D4** Verify connect banner appears on all 7 cost pages
- [ ] **D5** Verify Carbon/Energy/Sustainability show real kWh from CPU formula

---

## 10. What We Are NOT Building

To keep this production-quality without scope creep (Ponytail: least that works):

| Not Building | Reason |
|---|---|
| Historical cost before agent onboarding | We don't fabricate. Only show what we know. |
| Multi-cloud cost consolidation dashboard | Separate future feature. Each cluster is scoped. |
| Budget setting UI | Budget is admin-managed via config, not per-page form. |
| Real-time cost streaming | Billing APIs update hourly at best. 60-min cache is correct. |
| Custom alert thresholds UI | Phase 2+ feature. For now: static thresholds in backend. |
| AWS Spot price live API | Spot prices change per hour. Static table is sufficient for estimates. |
| ML-based cost forecasting | Linear trend from 30-day history is correct for Phase 1. |
| Team tagging UI | Teams are derived from namespace labels. No manual assignment yet. |
| Currency conversion | All costs in USD. Provider billing APIs return USD. |

---

## Key Numbers — Your Cluster (`xforce-devops`)

| Metric | Current (Fake) | Correct (Phase 1) | Correct (Phase 2) |
|---|---|---|---|
| Monthly compute | $21,975 (hash-seeded) | ~$613 (node lookup) | actual IBM invoice |
| Node 1 cost | not calculated per-node | $193/mo (b3c.8x32 @$0.264/hr) | IBM billing line item |
| Nodes 2,3,4 cost | not calculated per-node | $140/mo each (m3c.4x32 @$0.192/hr) | IBM billing line item |
| Control plane | $0 (not counted) | +$66/mo (IKS @$0.091/hr) | included in IBM billing |
| Energy/month | 10,987 kWh (derived from fake cost) | ~146 kWh (20 cores × 10W × 730h) | same (physics) |
| CO₂/month | 4,230 kg (from fake kWh) | ~56 kg (from real kWh) | same (physics) |
| Pods | 62 per cluster (fake) | 283 (real from agent) | same |

---

*Written: 2026-07-10 · Applies to: FinOps & Sustainability section (10 pages) · Ponytail philosophy throughout*
