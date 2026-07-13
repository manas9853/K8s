# Frontend Fixes — UI Interaction Issues

> Companion document to `UI_INTERACTION_ISSUES.md`.  
> All 11 issues identified in the audit have been resolved in this changeset.  
> **No backend schema changes required** for Issues 1–6, 10–11. Issues 7–9 are pure frontend routing changes. Issue 3 depends on the backend fix documented in `BACKEND_FIXES.md`.

---

## Fix 1 — `OrphanedVolumes.tsx` : Delete button wired up

**Issue:** Delete button had no `onClick`. Clicking it did nothing.  
**File:** [`frontend/src/pages/OrphanedVolumes.tsx`](frontend/src/pages/OrphanedVolumes.tsx)

### What changed

Added `deleting` state (tracks which volume is mid-delete by `namespace-name` key) and a `handleDelete` async function that:
1. Shows a native `confirm()` dialog to prevent accidental deletes
2. Calls `DELETE /api/v1/storage/orphaned/:namespace/:name`
3. Optimistically removes the row from state on success
4. Shows an `alert()` on HTTP error
5. Clears the `deleting` state in `finally`

Wired `onClick={() => handleDelete(volume)}` and `disabled={deleting === key}` on the button. The button label changes to `"Deleting…"` while the request is in flight.

```diff
+  const [deleting, setDeleting] = useState<string | null>(null);
+
+  const handleDelete = async (volume: OrphanedVolume) => {
+    const key = `${volume.namespace}-${volume.name}`;
+    if (!window.confirm(`Delete orphaned volume "${volume.name}"...`)) return;
+    setDeleting(key);
+    try {
+      const res = await fetch(`${API_BASE_URL}/v1/storage/orphaned/${namespace}/${name}`, { method: 'DELETE' });
+      if (!res.ok) throw new Error(`HTTP ${res.status}`);
+      setVolumes(prev => prev.filter(v => !(v.name === volume.name && v.namespace === volume.namespace)));
+    } catch (err) { alert(`Failed to delete volume: ...`); }
+    finally { setDeleting(null); }
+  };

-  <Button size="small" color="error" startIcon={<DeleteIcon />} variant="outlined">Delete</Button>
+  <Button ... disabled={deleting === key} onClick={() => handleDelete(volume)}>
+    {deleting === key ? 'Deleting…' : 'Delete'}
+  </Button>
```

---

## Fix 2 — `CommandCenter.tsx` : Quick Action buttons navigate correctly

**Issue:** "Run Full Optimization", "Generate Executive Report", and "View All Recommendations" had no `onClick`. Clicking did nothing.  
**File:** [`frontend/src/pages/CommandCenter.tsx`](frontend/src/pages/CommandCenter.tsx)

### What changed

`navigate` was already imported via `useNavigate`. Added `onClick` to each button pointing to the correct existing route:

```diff
-<Button variant="outlined" fullWidth sx={{ mb: 1 }}>Run Full Optimization</Button>
-<Button variant="outlined" fullWidth sx={{ mb: 1 }}>Generate Executive Report</Button>
-<Button variant="outlined" fullWidth>View All Recommendations</Button>
+<Button ... onClick={() => navigate('/autofix')}>Run Full Optimization</Button>
+<Button ... onClick={() => navigate('/reports/pdf-export')}>Generate Executive Report</Button>
+<Button ... onClick={() => navigate('/recommendations')}>View All Recommendations</Button>
```

---

## Fix 3 — `CommandCenter.tsx` : System Health reads live uptime/response_time

**Issue:** `uptime` was always `'99.9%'` and `response_time` always `'45ms'` regardless of API response.  
**File:** [`frontend/src/pages/CommandCenter.tsx`](frontend/src/pages/CommandCenter.tsx)

### What changed

All three code branches (success, else, catch) now use real API values with `'N/A'` fallbacks instead of fake success values. The unknown/failure state shows `status: 'unknown'` rather than a misleading `'healthy'`:

```diff
-setHealth({ status: status.platform_health || 'healthy', uptime: '99.9%', response_time: '45ms' });
+setHealth({
+  status: status.platform_health || 'healthy',
+  uptime: status.uptime ?? 'N/A',
+  response_time: status.response_time ?? 'N/A',
+});

// failure / catch branch:
-setHealth({ status: 'healthy', uptime: '99.9%', response_time: '45ms' });
+setHealth({ status: 'unknown', uptime: 'N/A', response_time: 'N/A' });
```

> **Requires backend fix** — see [`BACKEND_FIXES.md`](BACKEND_FIXES.md) Fix 1 which adds `uptime` and `response_time` fields to the `/api/v1/command-center/status` response.

---

## Fix 4 — `Executive.tsx` : "Take Action" button navigates to recommendation

**Issue:** "Take Action" button appeared on insight cards when `action_required=true` but had no `onClick`.  
**File:** [`frontend/src/pages/Executive.tsx`](frontend/src/pages/Executive.tsx)

### What changed

Added optional `action_url?: string` field to the `ExecutiveInsight` interface. Wired `onClick` to navigate to `insight.action_url` when provided, falling back to `/recommendations`:

```diff
 interface ExecutiveInsight {
   ...
   action_required: boolean;
   estimated_savings: number | null;
+  action_url?: string;
 }

-<Button variant="contained" color="primary" size="small" sx={{ ml: 2 }}>
+<Button
+  variant="contained" color="primary" size="small" sx={{ ml: 2 }}
+  onClick={() => navigate(insight.action_url || '/recommendations')}
+>
   Take Action
 </Button>
```

The backend can now optionally return `action_url` in `/api/v1/executive/insights` responses to deep-link users to the exact relevant page (e.g. `/orphaned-volumes`, `/cpu-rightsizing`).

---

## Fix 5 — `FinOpsReports.tsx` : Export PDF button is live

**Issue:** "Export PDF" was `disabled={true}` with a "coming soon" tooltip. The PDF export page exists at `/reports/pdf-export` but was never linked.  
**File:** [`frontend/src/pages/FinOpsReports.tsx`](frontend/src/pages/FinOpsReports.tsx)

### What changed

Added `useNavigate` import and instantiation in `FinOpsReportsInner`. Replaced the disabled Tooltip-wrapped button with a live button that navigates to `/reports/pdf-export`. Also removed the now-unused `Tooltip` import:

```diff
+import { useNavigate } from 'react-router-dom';
 import { ..., Button, IconButton } from '@mui/material';
-import { ..., Tooltip } from '@mui/material';

+const navigate = useNavigate();

-<Tooltip title="PDF export coming soon" arrow>
-  <span>
-    <Button variant="outlined" size="small" disabled startIcon={<PictureAsPdfIcon />} ...>
-      Export PDF
-    </Button>
-  </span>
-</Tooltip>
+<Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />}
+  onClick={() => navigate('/reports/pdf-export')} ...>
+  Export PDF
+</Button>
```

---

## Fix 6 — `AICopilot.tsx` : Replaced COMING SOON stub with live navigation hub

**Issue:** `/ai-copilot` was a static splash page with a `COMING SOON` chip. The 4 real copilot sub-pages exist and are functional.  
**File:** [`frontend/src/pages/AICopilot.tsx`](frontend/src/pages/AICopilot.tsx)

### What changed

Rewrote the entire component. Replaced the stub with a clean hub page of 4 `CardActionArea` navigation cards — one per implemented sub-page — each with:
- A coloured icon box
- A title with a `LIVE` badge
- A description
- A `ChevronRight` hint icon
- An `onClick={() => navigate(route)}` handler

The 4 routes each map to a fully-implemented existing page:

| Card | Route |
|------|-------|
| Natural Language Queries | `/autonomous-ai/ai-copilot/natural-language-queries` |
| Optimization Advisor | `/autonomous-ai/ai-copilot/optimization-advisor` |
| Security Advisor | `/autonomous-ai/ai-copilot/security-advisor` |
| Incident Investigator | `/autonomous-ai/ai-copilot/incident-investigator` |

---

## Fixes 7–9 — `DaemonSets.tsx`, `CronJobs.tsx`, `Jobs.tsx` : Auto-fix navigates to Recommendations

**Issue:** `handleAutoFix` on all three workload pages showed a dead-end `error` snackbar: _"not yet automated — see Recommendations for manual steps"_.  
**Files:**
- [`frontend/src/pages/DaemonSets.tsx`](frontend/src/pages/DaemonSets.tsx)
- [`frontend/src/pages/CronJobs.tsx`](frontend/src/pages/CronJobs.tsx)
- [`frontend/src/pages/Jobs.tsx`](frontend/src/pages/Jobs.tsx)

### What changed

`navigate` was already imported via `useNavigate` in all three files. Replaced the snackbar call with a `navigate()` call that deep-links to the Recommendations page with pre-filled query parameters so the user lands in the right context:

```diff
 const handleAutoFix = (ds: DaemonSet, issue: string) => {
-  showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations...`, 'error');
+  navigate(`/recommendations?resource=${encodeURIComponent(ds.name)}&namespace=${encodeURIComponent(ds.namespace)}&issue=${encodeURIComponent(issue)}`);
 };
```

Same pattern applied identically in `CronJobs.tsx` (using `cronJob`) and `Jobs.tsx` (using `job`).

---

## Fix 10 — `Cleanup.tsx` : Delete button now calls backend

**Issue:** Delete button was correctly `disabled` when `can_delete=false` but had no `onClick` at all — even when `can_delete=true` the click did nothing.  
**File:** [`frontend/src/pages/Cleanup.tsx`](frontend/src/pages/Cleanup.tsx)

### What changed

Added `deleting` state (keyed by `namespace/resource_name`) and a `handleDeleteResource` async function that:
1. Shows a native `confirm()` dialog
2. Calls `DELETE /api/v1/cleanup/:type/:name?namespace=…`
3. Optimistically removes the row and decrements `total_resources` from summary state on success
4. Sets an `error` banner on failure

Wired both `disabled` (combining `!can_delete` with the in-flight key) and `onClick` on the button. Label changes to `"Deleting…"` while in flight:

```diff
+  const [deleting, setDeleting] = useState<string | null>(null);

+  const handleDeleteResource = async (resource: CleanupResource) => { ... };

-<Button variant="outlined" size="small" color="error" startIcon={<Delete />}
-        disabled={!resource.can_delete}>Delete</Button>
+<Button variant="outlined" size="small" color="error" startIcon={<Delete />}
+        disabled={!resource.can_delete || deleting === key}
+        onClick={() => handleDeleteResource(resource)}>
+  {deleting === key ? 'Deleting…' : 'Delete'}
+</Button>
```

---

## Fix 11 — `CommandCenter.tsx` : Alert failure shows proper empty state

**Issue:** When the alerts API failed, the UI displayed `"Platform is operational"` — a misleading success message.  
**File:** [`frontend/src/pages/CommandCenter.tsx`](frontend/src/pages/CommandCenter.tsx)

### What changed

On failure/catch, `setAlerts([])` is called instead of injecting a fake success entry. The Alerts card now renders a descriptive empty-state message when `alerts.length === 0`:

```diff
-setAlerts([{ id: 1, severity: 'info', message: 'Platform is operational', time: 'now' }]);
+setAlerts([]);

// In JSX:
-<List dense disablePadding>
-  {alerts.map(alert => (...))}
-</List>
+{alerts.length === 0 ? (
+  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
+    Alert data unavailable — monitoring path may be degraded.
+  </Typography>
+) : (
+  <List dense disablePadding>
+    {alerts.map(alert => (...))}
+  </List>
+)}
```

---

## Summary of Changed Files

| File | Issues Fixed |
|------|-------------|
| `frontend/src/pages/OrphanedVolumes.tsx` | #1 |
| `frontend/src/pages/CommandCenter.tsx` | #2, #3, #11 |
| `frontend/src/pages/Executive.tsx` | #4 |
| `frontend/src/pages/FinOpsReports.tsx` | #5 |
| `frontend/src/pages/AICopilot.tsx` | #6 |
| `frontend/src/pages/DaemonSets.tsx` | #7 |
| `frontend/src/pages/CronJobs.tsx` | #8 |
| `frontend/src/pages/Jobs.tsx` | #9 |
| `frontend/src/pages/Cleanup.tsx` | #10 |

All changes are **additive only** — no existing working functionality was modified. The `navigate()` calls in Issues 2, 4, 5, 6, 7, 8, 9 use routes that already exist and are registered in `App.tsx`.
