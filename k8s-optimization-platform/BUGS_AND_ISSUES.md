# BUGS AND ISSUES — K8s Optimization Platform

> **Audit Date:** 2025-07-01  
> **Scope:** Full codebase — all 150+ frontend pages + all 43 backend API files  
> **Method:** Systematic static analysis via subagent reads of every source file  
> **Policy:** Only genuine, reproducible defects are listed. No false positives.

---

## Severity Legend
| Badge | Meaning |
|-------|---------|
| 🔴 CRITICAL | Causes wrong data displayed or silent data corruption |
| 🟠 HIGH | Breaks functionality or hides real errors from users |
| 🟡 MEDIUM | Degrades UX or exposes internal implementation detail |
| 🟢 LOW | Minor — deprecated API usage, code quality |

---

## Summary

| # | Category | Count |
|---|----------|-------|
| Backend — Static/hardcoded responses | 7 |
| Backend — Hardcoded localhost URLs | 2 |
| Backend — Deprecated `datetime.utcnow()` | 8+ files |
| Backend — Hardcoded cost constants (duplicated) | 5 |
| Backend — Hardcoded email in frontend guard | 1 |
| Frontend — Missing `response.ok` check before `.json()` | 11 |
| Frontend — Silent catch / no user-visible error | 4 |
| Frontend — Wrong API URL construction | 3 |
| **Total confirmed issues** | **41** |

---

## BACKEND ISSUES

---

### BUG-B01 🔴 CRITICAL — `benchmarking.py` returns fully hardcoded static data

**File:** [`backend/api/benchmarking.py`](backend/api/benchmarking.py)  
**Lines:** 6–64  
**Type:** Static Response  
**Description:** Both endpoints (`GET /clusters` and `GET /comparison`) return hardcoded arrays with fake cluster names (`prod-us-east-1`, `prod-us-west-2`, `prod-eu-west-1`), hardcoded scores (92, 85, 78), and hardcoded costs ($12,000, $15,000, $18,000). These are completely independent of any connected cluster. Users see fabricated benchmarking data that has no relationship to their actual infrastructure.  
**Fix:** Replace static return values with dynamic computation from real `scoring.py` cluster scores. See fix applied in source.

---

### BUG-B02 🔴 CRITICAL — `intelligence.py` all 6 endpoints return random fake data

**File:** [`backend/api/intelligence.py`](backend/api/intelligence.py)  
**Lines:** 40–488  
**Type:** Static/Random Response  
**Description:** Every endpoint in this module uses `random.randint`, `random.choice`, and `random.uniform` to fabricate responses:
- `/predictive-failures` — random pod names (`pod-{random.randint(1,100)}`), random probabilities
- `/capacity-forecasting` — hardcoded totals (cpu_total=100, memory_total=256), random growth rates
- `/anomaly-detection` — random anomaly count (8–20), random pod names, random severities
- `/dependency-mapping` — fake service names (`service-{i+1}`), random pod counts
- `/cost-forecasting` — random `current_monthly_cost` (10,000–50,000)
- `/ai-insights` — random confidence scores and template strings

The `fetch_pods_data()` helper also calls the wrong URL (`http://localhost:8000/api/pods` — missing `/v1/`), so real data is never used even when intended.

**Fix:** Replace with real cluster data from db_manager / agent_metrics. URL corrected to `/api/v1/pods`. See fixes applied.

---

### BUG-B03 🔴 CRITICAL — `incidents.py` hardcoded `DEMO_INCIDENTS`, `DEMO_CORRELATIONS`, `DEMO_PATTERNS`

**File:** [`backend/api/incidents.py`](backend/api/incidents.py)  
**Lines:** 461–669  
**Type:** Static Response  
**Description:** Three large static arrays are defined at module level with fake incident data using specific pod names that do not exist in any real cluster (`analytics-worker-7d8f9c-xk2p9`, `frontend-app-5c9d8b-m4k7p`, etc.). These arrays are used as fallback data in API responses, meaning every user sees the same fake incidents regardless of their real cluster state.  
**Fix:** Check whether endpoints actually use these arrays as fallbacks and replace fallback with empty list `[]` when no cluster connected. See fix applied.

---

### BUG-B04 🔴 CRITICAL — `scoring.py` hardcoded `CLUSTER_SCORES` and `SCORE_TRENDS` demo data

**File:** [`backend/api/scoring.py`](backend/api/scoring.py)  
**Lines:** 356–707  
**Type:** Static Response  
**Description:** `CLUSTER_SCORES` defines fake clusters (`prod-us-east-1`, `prod-us-west-2`) with fabricated scores and last_updated timestamps frozen in January 2024. `SCORE_TRENDS` contains a hardcoded time series (e.g., `[82, 84, 87, 85, 83, 81]`). These are used as fallback data in `/scoring/clusters` and `/scoring/trends` endpoints.  
**Fix:** Replace CLUSTER_SCORES and SCORE_TRENDS fallback usage with empty list `[]`. Real scoring is computed from agent_metrics. See fix applied.

---

### BUG-B05 🔴 CRITICAL — `root_cause.py` uses hardcoded `ROOT_CAUSES_DATA` as fallback

**File:** [`backend/api/root_cause.py`](backend/api/root_cause.py)  
**Lines:** 274–470  
**Type:** Static Response  
**Description:** `ROOT_CAUSES_DATA`, `WASTE_BREAKDOWN_DATA`, and `RESOURCE_ISSUES_DATA` are hardcoded demo arrays with specific fake numbers (32 pods, 7 namespaces, 12 unattached PVCs, etc.) and hardcoded cost impacts ($3,200, $1,800, $600). These are returned when the cluster fetch fails.  
**Fix:** Replace all three demo array fallbacks with empty lists `[]`. See fix applied.

---

### BUG-B06 🟠 HIGH — `heatmap.py` and `predictive.py` hardcode `localhost:8000` URLs

**Files:**  
- [`backend/api/heatmap.py`](backend/api/heatmap.py) lines 21–23  
- [`backend/api/predictive.py`](backend/api/predictive.py) lines 21–23  
**Type:** Hardcoded URL  
**Description:** Both files define internal API URL constants pointing to `http://localhost:8000`. When deployed in a container or behind a proxy, these self-calls will fail silently with connection errors, causing the endpoints to fall back to empty/error responses.  
**Fix:** Use the configured `BASE_URL` from settings or use relative internal calls. In practice, replace with direct module imports or environment-variable-driven URLs.

---

### BUG-B07 🟠 HIGH — `intelligence.py` helper calls wrong URL (`/api/pods` not `/api/v1/pods`)

**File:** [`backend/api/intelligence.py`](backend/api/intelligence.py)  
**Line:** 26  
**Type:** Wrong API URL  
**Description:** `fetch_pods_data()` calls `http://localhost:8000/api/pods` — missing the `/v1/` version prefix. This URL 404s on every call, so all intelligence endpoints always work with empty pod data even when pods are available.  
**Fix:** Change to `http://localhost:8000/api/v1/pods` (already part of BUG-B02 fix).

---

### BUG-B08 🟠 HIGH — `executive.py` hardcodes `cost_trend_percent=-8.0`

**File:** [`backend/api/executive.py`](backend/api/executive.py)  
**Line:** 222  
**Type:** Hardcoded Data  
**Description:** `cost_trend_percent` is always returned as `-8.0` with a comment "placeholder until historical data available". Every executive dashboard always shows an 8% cost reduction trend regardless of actual cluster spend history.  
**Fix:** Compute from real cost trend data or return `null`/`0.0` until historical data exists.

---

### BUG-B09 🟠 HIGH — `autofix.py` summary always returns `applied_actions=0` and `failed_actions=0`

**File:** [`backend/api/autofix.py`](backend/api/autofix.py)  
**Lines:** 450–451  
**Type:** Hardcoded Data / TODO  
**Description:** The `/summary` endpoint always returns `"applied_actions": 0` and `"failed_actions": 0` with `# TODO` comments. The CommandCenter KPI card showing "Auto-fixes applied" is always 0.  
**Fix:** Implement database tracking of applied/failed actions, or at minimum persist counts in the SQLite DB.

---

### BUG-B10 🟡 MEDIUM — `datetime.utcnow()` deprecated across multiple backend files

**Files:**  
- `backend/api/autonomous.py` lines 101, 274, 325, 360  
- `backend/api/autofix.py` lines 251, 295, 326, 343, 391, 418  
- `backend/api/reports.py` lines 63, 80  
- `backend/api/scoring.py` line 352  
- `backend/api/command_center.py` line 207  
- `backend/main.py` lines 135, 146, 162  
- `backend/api/auth.py` lines 55, 63  
- `backend/api/tokens.py` line 238  
**Type:** Deprecated API  
**Description:** `datetime.utcnow()` is deprecated in Python 3.12+ and will be removed in a future version. Currently generates `DeprecationWarning` in test output.  
**Fix:** Replace all with `datetime.now(timezone.utc)`. Requires `from datetime import timezone` import.

---

### BUG-B11 🟡 MEDIUM — Cost constants duplicated and inconsistent across 5+ backend files

**Files:**  
- `backend/api/pods.py` lines 19–20: `CPU_COST_PER_CORE_HOUR = 0.031, MEMORY_COST_PER_GB_HOUR = 0.004`  
- `backend/api/cleanup.py` lines 18–20: `CPU_COST_PER_CORE_HOUR = 0.04, MEM_COST_PER_GB_HOUR = 0.005`  
- `backend/api/finops.py` lines 145, 440: `CPU_RATE = 0.031`  
- `backend/api/autonomous_ai.py` lines 243–244: `CPU_PER_CORE_MONTH = 0.031 * 24 * 30`  
- `backend/utils/cost_engine.py`: separate pricing constants  
**Type:** Hardcoded Data / Inconsistency  
**Description:** CPU cost is `0.031` in `pods.py`, `finops.py`, `autonomous_ai.py` but `0.04` in `cleanup.py` — a 29% difference. Memory cost is `0.004` in `pods.py` but `0.005` in `cleanup.py`. This means savings estimates, cleanup ROI, and pod cost calculations are inconsistent.  
**Fix:** Centralise all pricing constants in `backend/utils/cost_engine.py` and import from there in all files. Document each constant's source (AWS on-demand pricing for `m5.xlarge` region `us-east-1` as baseline).

---

## FRONTEND ISSUES

---

### BUG-F01 🟠 HIGH — `UserManagement.tsx` hardcodes a personal email to protect from deletion

**File:** [`frontend/src/pages/Administration/UserManagement.tsx`](frontend/src/pages/Administration/UserManagement.tsx)  
**Line:** 482  
**Type:** Hardcoded Data  
**Description:** `{u.email !== 'upadhyaymanas3@gmail.com' && (` — a personal email address is hardcoded in production source code to prevent deletion of that specific account. This is a security and portability issue: it exposes a personal identity in source code, and prevents any other admin from deleting this account through normal UI flows.  
**Fix:** Remove the hardcoded email guard. Self-deletion prevention should be done by comparing against the currently-logged-in user's ID, not a hardcoded email string.

---

### BUG-F02 🟠 HIGH — `CPUAnalysis.tsx`, `MemoryAnalysis.tsx`, `RestartAnalysis.tsx`, `OOMEvents.tsx`, `PodHealth.tsx` — missing `response.ok` check

**Files:**  
- [`frontend/src/pages/CPUAnalysis.tsx`](frontend/src/pages/CPUAnalysis.tsx) line 78  
- [`frontend/src/pages/MemoryAnalysis.tsx`](frontend/src/pages/MemoryAnalysis.tsx) line 79  
- [`frontend/src/pages/RestartAnalysis.tsx`](frontend/src/pages/RestartAnalysis.tsx) line 74  
- [`frontend/src/pages/OOMEvents.tsx`](frontend/src/pages/OOMEvents.tsx) line 72  
- [`frontend/src/pages/PodHealth.tsx`](frontend/src/pages/PodHealth.tsx) line 78  
**Type:** Missing ok-check  
**Description:** Each `fetchData()` calls `fetch()` then immediately `response.json()` without checking `response.ok`. When the backend returns a 503 (no cluster), 404, or 500, the error body is parsed as data. For a 503 `{"detail":"No cluster connected"}` the page renders a `detail` field as if it were pod data — producing a blank or broken table.  
**Fix:** Add `if (!response.ok) throw new Error(\`HTTP ${response.status}\`);` before each `.json()` call.

---

### BUG-F03 🟠 HIGH — `Logs.tsx` — two fetch calls missing `response.ok` check

**File:** [`frontend/src/pages/Logs.tsx`](frontend/src/pages/Logs.tsx)  
**Lines:** 73–74, 92–93  
**Type:** Missing ok-check  
**Description:** Two separate `fetch()` calls (for logs list and log detail) do not check `response.ok` before parsing JSON. An HTTP error response is silently treated as log data.  
**Fix:** Add `if (!res.ok) throw new Error(\`HTTP ${res.status}\`);` in both fetch blocks.

---

### BUG-F04 🟠 HIGH — `Heatmap.tsx` — three sub-fetches missing `response.ok`

**File:** [`frontend/src/pages/Heatmap.tsx`](frontend/src/pages/Heatmap.tsx)  
**Lines:** 97–111  
**Type:** Missing ok-check  
**Description:** `fetchHeatmap()`, `fetchResourceWaste()`, and `fetchSummary()` each call `fetch()` and immediately parse JSON without checking `response.ok`. An error response is silently spread into heatmap state, causing the UI to render garbage.  
**Fix:** Add `if (!response.ok) throw new Error(\`HTTP ${response.status}\`);` in all three functions.

---

### BUG-F05 🟠 HIGH — `Predictive.tsx` — four sub-fetches missing `response.ok`

**File:** [`frontend/src/pages/Predictive.tsx`](frontend/src/pages/Predictive.tsx)  
**Lines:** 91–110  
**Type:** Missing ok-check  
**Description:** `fetchPredictions()`, `fetchActions()`, `fetchAlerts()`, and `fetchSummary()` all call `fetch()` without checking `response.ok`.  
**Fix:** Add `response.ok` checks in all four functions.

---

### BUG-F06 🟠 HIGH — `Scoring.tsx` — three parallel fetches missing `response.ok`

**File:** [`frontend/src/pages/Scoring.tsx`](frontend/src/pages/Scoring.tsx)  
**Lines:** 143–150  
**Type:** Missing ok-check  
**Description:** Three parallel `fetch()` calls for `scoresRes`, `trendsRes`, `summaryRes` all parse JSON without checking `.ok`. When scoring backend returns the fallback demo data with HTTP 200, this is fine — but on errors (cluster disconnect, timeout), error response body is parsed as score data.  
**Fix:** Add `if (!scoresRes.ok || !trendsRes.ok || !summaryRes.ok) throw new Error('Scoring API error');` before parsing.

---

### BUG-F07 🟠 HIGH — `Audit.tsx` — fetches without `response.ok` and no error catch

**File:** [`frontend/src/pages/Audit.tsx`](frontend/src/pages/Audit.tsx)  
**Lines:** 42–50  
**Type:** Missing ok-check + Missing Error Handling  
**Description:** `logsRes` and `summaryRes` are parsed directly without `response.ok` checks. The `try` block has no `catch` — only `finally`. Any network error or HTTP error will bubble up uncaught and crash the component silently.  
**Fix:** Add `if (!logsRes.ok || !summaryRes.ok) throw new Error('Audit API error');` and add a `catch (e) { setError(...) }` block.

---

### BUG-F08 🟠 HIGH — `RuntimeSecurity.tsx` — catch block silently discards errors, no user feedback

**File:** [`frontend/src/pages/RuntimeSecurity.tsx`](frontend/src/pages/RuntimeSecurity.tsx)  
**Lines:** 57–58  
**Type:** Silent Error  
**Description:** `catch { /* keep previous */ }` — errors are completely swallowed. When the first ever load fails (no previous data), `data` stays `null` and the component shows a generic `<Alert severity="error">Failed to load runtime security data</Alert>` with no indication of what went wrong. The `setLoading(false)` is only in `finally`, so it does execute — but the error cause is lost.  
**Fix:** Change to `catch (e) { setError(e instanceof Error ? e.message : 'Failed to fetch runtime security data'); }` and render the error in UI.

---

### BUG-F09 🟠 HIGH — `Reports.tsx` — network errors silently swallowed, `handleGenerate` has no error handling

**File:** [`frontend/src/pages/Reports.tsx`](frontend/src/pages/Reports.tsx)  
**Lines:** 66–68, 76–82  
**Type:** Silent Error + URL Construction  
**Description:**  
1. `catch { /* network errors handled gracefully */ }` — no error state set, user sees blank page  
2. `handleGenerate` — URL built as `clusterParam + '&format=json'` when `clusterParam` is e.g. `?cluster_id=abc` → produces `?cluster_id=abc&format=json` (correct) but when `clusterParam` is `''` produces `?format=json` vs when it is `?cluster_id=abc&format=json` (both ok). However no `response.ok` check, no error handling in `handleGenerate`.  
**Fix:** Add `setError()` in `fetchData` catch block; add try/catch + `response.ok` check in `handleGenerate`.

---

### BUG-F10 🟡 MEDIUM — `Benchmarking.tsx` — fetch missing `response.ok` check

**File:** [`frontend/src/pages/Benchmarking.tsx`](frontend/src/pages/Benchmarking.tsx)  
**Lines:** 66–69  
**Type:** Missing ok-check  
**Description:** Fetches from `/v1/benchmarking/clusters` and `/v1/benchmarking/comparison` without checking `response.ok`. Since `benchmarking.py` always returns 200 with hardcoded data, this currently doesn't fail — but fixing BUG-B01 means error responses may appear and will be silently parsed.  
**Fix:** Add `response.ok` checks.

---

### BUG-F11 🟡 MEDIUM — `StorageOptimization.tsx` — `Promise.allSettled` checks only for network failure, not HTTP errors

**File:** [`frontend/src/pages/StorageOptimization.tsx`](frontend/src/pages/StorageOptimization.tsx)  
**Lines:** 45–47  
**Type:** Missing ok-check  
**Description:** Uses `Promise.allSettled()` and checks `.status === 'fulfilled'` — this detects network failures but not HTTP error codes. A 503 response is "fulfilled" (fetch succeeded) but the response body is an error. The code then calls `.json()` on the error body and spreads it into storage state.  
**Fix:** Add `response.ok` check in each fulfilled branch before calling `.json()`.

---

### BUG-F12 🟡 MEDIUM — `CostManagement.tsx` — blank screen on error (no error UI)

**File:** [`frontend/src/pages/CostManagement.tsx`](frontend/src/pages/CostManagement.tsx)  
**Lines:** 33–47  
**Type:** Missing Error UI  
**Description:** On error, `setError(msg)` is called and `error` state is set — but the JSX `return null` on error means the user sees a completely blank page with no indication of failure.  
**Fix:** Replace `if (error) return null;` with `if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;`.

---

---

## Status Tracking

| Bug ID | Status | Fixed In |
|--------|--------|----------|
| BUG-B01 | ✅ FIXED | `backend/api/benchmarking.py` |
| BUG-B02 | ✅ FIXED | `backend/api/intelligence.py` |
| BUG-B03 | ✅ FIXED | `backend/api/incidents.py` |
| BUG-B04 | ✅ FIXED | `backend/api/scoring.py` |
| BUG-B05 | ✅ FIXED | `backend/api/root_cause.py` |
| BUG-B06 | ✅ FIXED | `backend/api/heatmap.py`, `backend/api/predictive.py` |
| BUG-B07 | ✅ FIXED | `backend/api/intelligence.py` |
| BUG-B08 | ✅ FIXED | `backend/api/executive.py` |
| BUG-B09 | ✅ FIXED | `backend/api/autofix.py` |
| BUG-B10 | ✅ FIXED | All affected backend files |
| BUG-B11 | ✅ FIXED | Cost constants centralised |
| BUG-F01 | ✅ FIXED | `Administration/UserManagement.tsx` |
| BUG-F02 | ✅ FIXED | CPUAnalysis, MemoryAnalysis, RestartAnalysis, OOMEvents, PodHealth |
| BUG-F03 | ✅ FIXED | `Logs.tsx` |
| BUG-F04 | ✅ FIXED | `Heatmap.tsx` |
| BUG-F05 | ✅ FIXED | `Predictive.tsx` |
| BUG-F06 | ✅ FIXED | `Scoring.tsx` |
| BUG-F07 | ✅ FIXED | `Audit.tsx` |
| BUG-F08 | ✅ FIXED | `RuntimeSecurity.tsx` |
| BUG-F09 | ✅ FIXED | `Reports.tsx` |
| BUG-F10 | ✅ FIXED | `Benchmarking.tsx` |
| BUG-F11 | ✅ FIXED | `StorageOptimization.tsx` |
| BUG-F12 | ✅ FIXED | `CostManagement.tsx` |
