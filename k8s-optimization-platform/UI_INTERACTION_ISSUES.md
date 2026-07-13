# UI Interaction Issues — K8s Optimization Platform

> **Scope:** This document audits every page in the application for broken UI interactions, no-op handlers, hardcoded fallback data, permanently disabled buttons, and stub "coming soon" pages. It covers 215+ routes across the full frontend and backend.
>
> **No cluster changes were made** during this audit. All findings are based on static code analysis and automated test results.
>
> **Test Run Date:** 2025-07-01  
> **Backend Tests:** `tests/test_api_integrity.py` — **85/85 PASSED** ✅  
> **Frontend Tests:** `src/__tests__/theme_and_data_integrity.test.tsx` — **156/156 PASSED** ✅

---

## Summary Table

| Issue # | Severity | File | Line(s) | Type | Status |
|---------|----------|------|---------|------|--------|
| 1 | 🔴 HIGH | `OrphanedVolumes.tsx` | 185–192 | No `onClick` on Delete button | OPEN |
| 2 | 🔴 HIGH | `CommandCenter.tsx` | 288–290 | 3 Quick Action buttons — no `onClick` | OPEN |
| 3 | 🔴 HIGH | `CommandCenter.tsx` | 74–79, 94 | Health card hardcodes `uptime`/`response_time` | OPEN |
| 4 | 🟠 MEDIUM | `Executive.tsx` | 411 | "Take Action" button — no `onClick` | OPEN |
| 5 | 🟠 MEDIUM | `FinOpsReports.tsx` | 151–165 | Export PDF permanently `disabled` | OPEN |
| 6 | 🟠 MEDIUM | `AICopilot.tsx` | 119 | Entire page is `COMING SOON` stub | OPEN |
| 7 | 🟠 MEDIUM | `DaemonSets.tsx` | 385 | Auto-fix snack only — no backend call | OPEN |
| 8 | 🟠 MEDIUM | `CronJobs.tsx` | 529 | Auto-fix snack only — no backend call | OPEN |
| 9 | 🟠 MEDIUM | `Jobs.tsx` | 410 | Auto-fix snack only — no backend call | OPEN |
| 10 | 🟠 MEDIUM | `Cleanup.tsx` | 161 | Delete button no `onClick` even when `can_delete=true` | OPEN |
| 11 | 🟡 LOW | `CommandCenter.tsx` | 91, 95 | Alert fallback hardcodes `'Platform is operational'` | OPEN |

---

## HIGH Severity Issues

### Issue 1 — `OrphanedVolumes.tsx` : Delete button has no `onClick`

**File:** [`frontend/src/pages/OrphanedVolumes.tsx`](frontend/src/pages/OrphanedVolumes.tsx:185)  
**Lines:** 185–192

```tsx
// CURRENT — clicking this button does NOTHING
<Button
  size="small"
  color="error"
  startIcon={<DeleteIcon />}
  variant="outlined"
>
  Delete
</Button>
```

**Problem:** The Delete button in the orphaned volumes table renders visually and has a loading indicator pattern implied by the UI, but has zero `onClick` wired up. Users cannot delete orphaned volumes from this page at all.

**Recommended Fix:**

```tsx
// Add a handler in the component
const handleDelete = async (volume: OrphanedVolume) => {
  if (!window.confirm(`Delete volume "${volume.pvc_name}"?`)) return;
  await fetch(`${API_BASE_URL}/v1/storage/orphaned-volumes/${volume.pvc_name}`, {
    method: 'DELETE',
  });
  fetchVolumes(selectedClusterId);
};

// Wire it on the button
<Button
  size="small"
  color="error"
  startIcon={<DeleteIcon />}
  variant="outlined"
  onClick={() => handleDelete(volume)}
>
  Delete
</Button>
```

---

### Issue 2 — `CommandCenter.tsx` : 3 Quick Action buttons have no `onClick`

**File:** [`frontend/src/pages/CommandCenter.tsx`](frontend/src/pages/CommandCenter.tsx:288)  
**Lines:** 288–290

```tsx
// CURRENT — all three are no-ops
<Button variant="outlined" fullWidth sx={{ mb: 1 }}>Run Full Optimization</Button>
<Button variant="outlined" fullWidth sx={{ mb: 1 }}>Generate Executive Report</Button>
<Button variant="outlined" fullWidth>View All Recommendations</Button>
```

**Problem:** The "Quick Actions" card on the Command Center page renders three buttons that are completely unwired. Clicking any of them does nothing — no navigation, no API call, no feedback.

**Recommended Fix:**

```tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

<Button variant="outlined" fullWidth sx={{ mb: 1 }}
  onClick={() => navigate('/autofix')}>
  Run Full Optimization
</Button>
<Button variant="outlined" fullWidth sx={{ mb: 1 }}
  onClick={() => navigate('/reports/pdf-export')}>
  Generate Executive Report
</Button>
<Button variant="outlined" fullWidth
  onClick={() => navigate('/recommendations')}>
  View All Recommendations
</Button>
```

---

### Issue 3 — `CommandCenter.tsx` : System Health card hardcodes `uptime` and `response_time`

**File:** [`frontend/src/pages/CommandCenter.tsx`](frontend/src/pages/CommandCenter.tsx:74)  
**Lines:** 74–79, 94

```tsx
// CURRENT — hardcoded in every branch (success, failure, and catch)
setHealth({
  status: status.platform_health || 'healthy',
  uptime: '99.9%',          // ← NEVER read from API
  response_time: '45ms',    // ← NEVER read from API
});
```

**Problem:** Even when the `/api/v1/command-center/status` API succeeds and returns real data, `uptime` and `response_time` are pinned to `'99.9%'` and `'45ms'` respectively. The API response is only used for `platform_health`. The System Health card always displays fake metrics.

**Recommended Fix:**

```tsx
if (statusRes && statusRes.ok) {
  const status = await statusRes.json();
  setHealth({
    status: status.platform_health || 'healthy',
    uptime: status.uptime ?? 'N/A',
    response_time: status.response_time ?? 'N/A',
  });
} else {
  setHealth({ status: 'unknown', uptime: 'N/A', response_time: 'N/A' });
}
// In the catch block:
setHealth({ status: 'unknown', uptime: 'N/A', response_time: 'N/A' });
```

Also update the backend `/api/v1/command-center/status` endpoint to include `uptime` and `response_time` fields in its response shape.

---

## MEDIUM Severity Issues

### Issue 4 — `Executive.tsx` : "Take Action" button has no `onClick`

**File:** [`frontend/src/pages/Executive.tsx`](frontend/src/pages/Executive.tsx:411)  
**Line:** 411

```tsx
// CURRENT — no onClick
{insight.action_required && (
  <Button variant="contained" color="primary" size="small" sx={{ ml: 2 }}>
    Take Action
  </Button>
)}
```

**Problem:** AI Insight cards on the Executive page conditionally render a "Take Action" button when `insight.action_required` is true, but the button has no handler. Clicking it does nothing.

**Recommended Fix:**

```tsx
{insight.action_required && (
  <Button
    variant="contained"
    color="primary"
    size="small"
    sx={{ ml: 2 }}
    onClick={() => navigate(insight.action_url || '/recommendations')}
  >
    Take Action
  </Button>
)}
```

Add an `action_url?: string` field to the insight type definition and populate it from the backend's `/api/v1/executive/insights` response.

---

### Issue 5 — `FinOpsReports.tsx` : Export PDF button is permanently disabled

**File:** [`frontend/src/pages/FinOpsReports.tsx`](frontend/src/pages/FinOpsReports.tsx:151)  
**Lines:** 151–165

```tsx
// CURRENT — disabled={true} with tooltip saying it's "coming soon"
<Tooltip title="PDF export coming soon" arrow>
  <span>
    <Button
      variant="outlined"
      size="small"
      disabled                  // ← hardcoded, never enabled
      startIcon={<PictureAsPdfIcon />}
      // ...
    >
      Export PDF
    </Button>
  </span>
</Tooltip>
```

**Problem:** The PDF export functionality was shipped as a dedicated route at `/reports/pdf-export` (see `Reports/PDFExport.tsx`) but the FinOpsReports page was never updated to link to it. The button stays permanently disabled while the feature exists.

**Recommended Fix:**

```tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

// Remove the Tooltip wrapper and the disabled prop
<Button
  variant="outlined"
  size="small"
  startIcon={<PictureAsPdfIcon />}
  onClick={() => navigate('/reports/pdf-export')}
  sx={{ borderColor: DK.border, color: DK.text, textTransform: 'none', fontSize: '0.78rem' }}
>
  Export PDF
</Button>
```

---

### Issue 6 — `AICopilot.tsx` : Entire page is a stub

**File:** [`frontend/src/pages/AICopilot.tsx`](frontend/src/pages/AICopilot.tsx:119)  
**Line:** 119 (and the full component)

```tsx
// CURRENT — the only interactive element is a non-functional badge
<Chip
  label="COMING SOON"
  color="primary"
  sx={{ mt: 2, fontSize: '1rem', fontWeight: 'bold', px: 2, py: 3 }}
/>
```

**Problem:** The `/ai-copilot` route renders a splash screen with gradient title text, a description paragraph, and a `COMING SOON` chip. There is no functionality at all. Meanwhile, the `AutonomousAI/AICopilot/` sub-pages (NaturalLanguageQueries, OptimizationAdvisor, SecurityAdvisor, IncidentInvestigator) are fully implemented and accessible at separate routes.

**Recommended Fix (Option A — Quick):** Redirect `/ai-copilot` to the first real sub-page:

```tsx
// In App.tsx, replace:
<Route path="/ai-copilot" element={<AICopilot />} />
// With:
<Route path="/ai-copilot" element={<Navigate to="/autonomous-ai/ai-copilot/natural-language-queries" replace />} />
```

**Recommended Fix (Option B — Full):** Implement `AICopilot.tsx` as a hub page that lists the four sub-pages as navigation cards, replacing the `COMING SOON` chip with real links.

---

### Issue 7 — `DaemonSets.tsx` : Auto-fix shows snackbar only, never calls backend

**File:** [`frontend/src/pages/DaemonSets.tsx`](frontend/src/pages/DaemonSets.tsx:384)  
**Lines:** 384–386

```tsx
const handleAutoFix = (ds: DaemonSet, issue: string) => {
  showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations for manual steps.`, 'error');
};
```

**Problem:** The "Auto Fix" button appears on DaemonSet detail panels. When clicked it fires a snackbar with a "not yet automated" error message. No API call is made, no redirect to Recommendations occurs. The UX promises a feature that does not exist.

**Recommended Fix:**

```tsx
const handleAutoFix = (ds: DaemonSet, issue: string) => {
  navigate(`/recommendations?resource=${encodeURIComponent(ds.name)}&issue=${encodeURIComponent(issue)}`);
};
```

Or, if the backend `/api/v1/autofix/apply` endpoint supports DaemonSet fixes, call it:

```tsx
const handleAutoFix = async (ds: DaemonSet, issue: string) => {
  const res = await fetch(`${API_BASE_URL}/v1/autofix/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource_type: 'daemonset', name: ds.name, namespace: ds.namespace, issue }),
  });
  if (res.ok) showSnack(`Auto-fix applied for ${ds.name}`);
  else showSnack('Auto-fix failed — check Recommendations page', 'error');
};
```

---

### Issue 8 — `CronJobs.tsx` : Auto-fix shows snackbar only, never calls backend

**File:** [`frontend/src/pages/CronJobs.tsx`](frontend/src/pages/CronJobs.tsx:528)  
**Lines:** 528–530

```tsx
const handleAutoFix = (cronJob: CronJob, issue: string) => {
  showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations for manual steps.`, 'error');
};
```

**Problem:** Same pattern as Issue 7. The Auto-fix button on CronJob rows shows a dead-end error snackbar.

**Recommended Fix:** Same as Issue 7 — navigate to Recommendations or call the autofix endpoint with `resource_type: 'cronjob'`.

---

### Issue 9 — `Jobs.tsx` : Auto-fix shows snackbar only, never calls backend

**File:** [`frontend/src/pages/Jobs.tsx`](frontend/src/pages/Jobs.tsx:409)  
**Lines:** 409–411

```tsx
const handleAutoFix = (job: Job, issue: string) => {
  showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations for manual steps.`, 'error');
};
```

**Problem:** Same pattern as Issues 7–8. Auto-fix on Job rows shows a dead-end error snackbar.

**Recommended Fix:** Same as Issue 7 — navigate to Recommendations or call the autofix endpoint with `resource_type: 'job'`.

---

### Issue 10 — `Cleanup.tsx` : Delete button has no `onClick` even when `can_delete=true`

**File:** [`frontend/src/pages/Cleanup.tsx`](frontend/src/pages/Cleanup.tsx:161)  
**Line:** 161

```tsx
// CURRENT — disabled when can_delete is false, but no onClick when can_delete is true
<Button
  variant="outlined"
  size="small"
  color="error"
  startIcon={<Delete />}
  disabled={!resource.can_delete}   // ← correctly gates visual state
  // onClick is MISSING
>
  Delete
</Button>
```

**Problem:** The Delete button is correctly disabled for resources where `can_delete` is false (e.g. those with active dependencies). However, for resources where `can_delete=true`, the button is enabled but clicking it does nothing because `onClick` is not defined.

**Recommended Fix:**

```tsx
const handleDeleteResource = async (resource: CleanupResource) => {
  if (!window.confirm(`Delete ${resource.resource_type} "${resource.resource_name}"?`)) return;
  await fetch(`${API_BASE_URL}/v1/cleanup/${resource.resource_type}/${resource.resource_name}`, {
    method: 'DELETE',
    headers: { 'X-Cluster-Id': selectedClusterId },
  });
  fetchResources();
};

<Button
  variant="outlined"
  size="small"
  color="error"
  startIcon={<Delete />}
  disabled={!resource.can_delete}
  onClick={() => handleDeleteResource(resource)}
>
  Delete
</Button>
```

---

## LOW Severity Issues

### Issue 11 — `CommandCenter.tsx` : Alert fallback hardcodes a fake success message

**File:** [`frontend/src/pages/CommandCenter.tsx`](frontend/src/pages/CommandCenter.tsx:91)  
**Lines:** 91, 95

```tsx
// CURRENT — failure path shows a fake "all is well" message
} else {
  setAlerts([{ id: 1, severity: 'info', message: 'Platform is operational', time: 'now' }]);
}
// ...catch:
setAlerts([{ id: 1, severity: 'info', message: 'Platform is operational', time: 'now' }]);
```

**Problem:** When the alerts API call fails (network error, 5xx, etc.), the UI quietly shows `"Platform is operational"` — a misleading success message. Users cannot distinguish real silence from a degraded monitoring path.

**Recommended Fix:**

```tsx
} else {
  setAlerts([]);   // empty state — let the UI's empty-state placeholder render
}
// catch:
setAlerts([]);
```

Then ensure the Active Alerts card has a proper empty-state message like _"Alert data unavailable"_ when `alerts.length === 0`.

---

## Pages Confirmed Working ✅

The following pages and categories were audited and confirmed to have correct `onClick` handlers, real API wiring, and no dummy data or disabled-forever buttons:

### Workloads
- `Deployments.tsx` — restart, scale, delete all properly wired
- `StatefulSets.tsx` — restart, scale, delete all properly wired
- `DaemonSets.tsx` — restart properly wired (auto-fix is the only issue, see #7)
- `Jobs.tsx` — delete properly wired (auto-fix is the only issue, see #9)
- `CronJobs.tsx` — trigger, suspend/resume properly wired (auto-fix is the only issue, see #8)

### Attack Investigation (all 18 pages)
- `BlockTraffic.tsx`, `RotateSecrets.tsx`, `EmergencyRollback.tsx`, `KillPod.tsx`, `QuarantineResource.tsx` — destructive actions all have `disabled={busy}` guards and real API calls
- `PlaybookExecution.tsx`, `IncidentPlaybooks.tsx` — execution flow properly wired
- `SuspiciousPods.tsx`, `SuspiciousProcesses.tsx`, `SuspiciousUsers.tsx` — all use real API fetches

### Compliance & Governance
- `GovernanceRules.tsx` — Fix/Exception buttons have `disabled={busy}` guards ✅
- `SecurityGuardrails.tsx` — Fix/Exception buttons properly wired ✅
- `PolicyEngine.tsx` — policy enable/disable correctly wired ✅

### Autonomous AI (all 14 sub-pages)
- `NaturalLanguageQueries.tsx`, `OptimizationAdvisor.tsx`, `SecurityAdvisor.tsx`, `IncidentInvestigator.tsx` — all functional
- `ManualMode.tsx`, `AssistedMode.tsx`, `AutonomousMode.tsx` — real API wiring
- `ResourceFixes.tsx`, `SecurityFixes.tsx`, `ComplianceFixes.tsx`, `BulkFixes.tsx` — real API wiring
- `DeploymentRollback.tsx`, `ConfigurationRollback.tsx`, `NamespaceRollback.tsx`, `ClusterRollback.tsx` — real API wiring

### Reports
- `PDFExport.tsx`, `ExcelExport.tsx` — async task pattern with real `/api/v1/reports/generate` calls ✅
- `ScheduledReports.tsx`, `IncidentReports.tsx`, `OptimizationReports.tsx`, `ComplianceReports.tsx`, `SecurityReports.tsx` — all wired to real endpoints ✅

### Administration (all 8 pages)
- `UserManagement.tsx`, `RBACAdmin.tsx` — real Clerk-backed user data ✅
- `SSOSaml.tsx`, `Integrations.tsx`, `Notifications.tsx`, `APIKeys.tsx`, `BackupRecovery.tsx`, `PlatformSettings.tsx` — all migrated to real APIs (Fix 4) ✅

### Platform Engineering (all 11 pages)
- `ArgoCD.tsx`, `FluxCD.tsx`, `GitopsDriftDetection.tsx`, `GitHubActions.tsx`, `GitLabCI.tsx`, `JenkinsIntegration.tsx`, `TektonPipelines.tsx`, `PolicyAsCode.tsx`, `InfraAsCode.tsx`, `DeploymentIntelligence.tsx`, `PlatformStandards.tsx` — all migrated from `DUMMY_DATA` to real `/api/v1/platform/*` endpoints (Fix 3) ✅

### People & Teams
- `TeamCostAnalysis.tsx`, `TeamOptimizationScore.tsx`, `TeamSecurityScore.tsx` — real API calls (Fix 1) ✅
- `OwnershipMapping.tsx` — real API calls (Fix 2) ✅
- `AccessReviews.tsx` — real API calls ✅

### Search & Alerts
- `RealTimeAlerts.tsx` — live poll of `/api/v1/observability/events?event_type=Warning` ✅
- `GlobalSearch.tsx` — multi-resource search across pods, workloads, recommendations ✅

### Optimization
- `StorageOptimization.tsx`, `NodeOptimization.tsx` — real API calls (Fix 6) ✅
- `AutoFix.tsx` — `handleApplyAction` / `handleBulkApply` both call `/api/v1/autofix/apply` ✅
- `Rollback.tsx` — properly guards behind `selectedChanges.length > 0` + `rollbackReason` ✅

---

## Backend Data Integrity Summary

| API Group | Real Data | Dummy Fallback | Notes |
|-----------|-----------|----------------|-------|
| `/api/v1/pods` | ✅ | None | Reads agent_metrics from Supabase |
| `/api/v1/clusters` | ✅ | `get_dummy_health()` for `/health/all` only | Acceptable UX fallback |
| `/api/v1/workloads` | ✅ | None | Empty list when no cluster |
| `/api/v1/storage` | ✅ | None (Fix 7) | Previously returned dummy PVCs |
| `/api/v1/network` | ✅ | None (Fix 7) | Previously returned dummy services/ingresses |
| `/api/v1/observability` | ✅ | None (Fix 7) | Previously returned dummy events |
| `/api/v1/executive` | ✅ | None | 503 when no cluster |
| `/api/v1/finops` | ✅ | None | 503 when no cluster |
| `/api/v1/platform` | ✅ | None | Returns `[]` when no cluster |
| `/api/v1/dashboard` | ✅ | None (Fix 8) | 503 for executive/kpis, `[]` for others |
| `/api/v1/compliance` | ✅ | None | Reads from db_manager pods |
| `/api/v1/carbon` | ✅ | None | Energy data from cluster metrics |
| `/api/v1/security` | ✅ | None | Trivy scanner + RBAC data |
| `/api/v1/recommendations` | ✅ | None | Empty list when no cluster |
| `/api/v1/cost-savings` | ✅ | None | Empty when no cluster |
| `/api/v1/incidents` | ✅ | None | Empty when no cluster |
| `/api/v1/reports` | ✅ | None | Async task generation |
| `/api/v1/audit` | ✅ | None | DB-backed events |

---

## Theme Consistency Report

All 156 frontend theme tests pass. The design system is consistently applied across all pages:

| Token | Value | Status |
|-------|-------|--------|
| `palette.mode` | `dark` | ✅ |
| `palette.background.default` | `#050d1a` | ✅ |
| `palette.background.paper` | `#0b1628` | ✅ |
| `palette.primary.main` | `#00d4ff` (cyan) | ✅ |
| `palette.secondary.main` | `#2563eb` (blue) | ✅ |
| `palette.success.main` | `#39ff14` (neon green) | ✅ |
| `palette.error.main` | `#ef4444` | ✅ |
| `palette.warning.main` | `#f59e0b` | ✅ |
| `palette.text.primary` | `#e2f0ff` | ✅ |
| `palette.text.secondary` | `#7ca5cc` | ✅ |
| `palette.divider` | `#1e3a5f` | ✅ |
| `typography.fontFamily` | `-apple-system, 'Segoe UI', system-ui, sans-serif` | ✅ |
| `shape.borderRadius` | `8` | ✅ |
| No `#ffffff` hardcoded text | — | ✅ |
| No `#000000` hardcoded background | — | ✅ |
| No placeholder image CDNs | picsum, placehold.it, etc. | ✅ |
| K8s icon | Custom SVG — no external URL | ✅ |

---

## Placeholder / Dummy Content Report

| Category | Status | Detail |
|----------|--------|--------|
| Lorem ipsum text | ✅ None found | Full grep across all 215 pages |
| "Test User" | ✅ None found | — |
| "Sample Data" | ✅ None found | — |
| "placeholder text" | ✅ None found | Input `placeholder=` attributes are correct UX |
| PlatformEngineering `DUMMY_DATA` | ✅ Fixed (Fix 3) | All 11 pages use real APIs |
| Administration `DUMMY_DATA` | ✅ Fixed (Fix 4) | All 6 pages use real APIs |
| Backend dummy fallbacks | ✅ Fixed (Fix 7) | network.py + observability.py |
| Backend health dummy fallback | ⚠️ Intentionally kept | `/clusters/health/all` uses `get_dummy_health()` as UX fallback — acceptable |
| `CommandCenter.tsx` hardcoded uptime | 🔴 Issue 3 | Uptime/response_time never read from API |
| `AICopilot.tsx` stub page | 🟠 Issue 6 | Full page is COMING SOON |

---

## How to Reproduce Any Issue Locally

1. Start the backend: `docker-compose up backend`
2. Start the frontend: `cd frontend && npm start`
3. Log in and navigate to the affected route
4. Observe the button behaviour described above

For the test suites:

```bash
# Backend
cd k8s-optimization-platform/backend
python3 -m pytest tests/test_api_integrity.py -v
# Expected: 85 passed

# Frontend
cd k8s-optimization-platform/frontend
npx react-scripts test --watchAll=false
# Expected: 156 passed
```

---

*Audit conducted via static code analysis of all 215+ page files, targeted `grep` for `onClick`, `disabled`, `TODO`, `COMING SOON`, `not yet automated`, and hardcoded values, followed by direct file reads of every flagged location. No automated browser or E2E tooling was run — findings are code-level, not runtime.*
