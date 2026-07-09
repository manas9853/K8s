# Autonomous AI Section — Full Plan (Phase 1 + Phase 2)

## Top-Level Overview

The entire `/autonomous-ai` section (20 pages across 5 sub-sections) needs to be made real.
Right now 14 of 20 pages return hardcoded mock data, 0 of 20 use the dark design system,
and 0 of 20 use `API_BASE_URL` from `config/api.ts`.

The user expects everything under this section to be powered by AI using their real cluster data.
This plan covers all 20 pages across two phases:

- **Phase 1** — Rule-based intelligence using real cluster data already in Postgres ($0 cost)
- **Phase 2** — LLM-powered reasoning (OpenAI `gpt-4o-mini`) activated by adding `OPENAI_API_KEY` to `.env`

The Phase 1 → Phase 2 switch is a **single swappable function** (`_answer_engine()`).
Adding the API key + restarting the server is the entire migration.

---

## 🚀 Implementation Roadmap — Start Here

This is the **exact sequence** to follow. Do not skip steps. Each step must be complete
and verified before the next one starts. Steps marked *(parallel)* can be done together
after their prerequisite is done.

---

### STEP 1 — Sub-Task 0 · Backend Intelligence Engine ✅ DONE
**Start this first. Everything else depends on it.**

**What to build:**
- Add `cluster: Optional[str]` to `CopilotQuery` model in `autonomous_ai.py`
- Build `_fetch_cluster_context(cluster)` — reads real pods, finops, security, storage, observability from Postgres
- Build `_answer_engine(query, data)` — keyword router with 7 intent branches
- Build 7 response builders (restart / cpu / cost / memory / security / storage / health)
- Add beginner detection (no K8s jargon → plain English response)
- Add Phase 2 slot: `if OPENAI_API_KEY: → _llm_engine()` with fallback to rules
- Fix broken `_ai_security_context()` All-Clusters path

**File:** `k8s-optimization-platform/backend/api/autonomous_ai.py`

**Done when:** `POST /api/v1/autonomous-ai/copilot/query` with `{"query": "why is my cluster expensive?", "cluster": "xforce-devops"}` returns a real answer with real pod names from Postgres — not a hardcoded string.

**Completed:** ✅
- `_fetch_cluster_context(cluster)` built — reads pods, finops, storage, observability, workloads, configmaps, secrets, namespaces from Postgres. Single cluster + All-clusters aggregation with `_cluster` tagging.
- `_answer_engine(query, ctx)` built — Phase 1 keyword routing + Phase 2 OpenAI slot.
- 7 response builders: `_build_incident_answer`, `_build_cost_answer`, `_build_memory_answer`, `_build_cpu_answer`, `_build_security_answer`, `_build_storage_answer`, `_build_health_overview`.
- Beginner detection: `_is_beginner()` — if no K8s jargon detected → plain English + analogy.
- `_llm_engine()` added — activates automatically when `OPENAI_API_KEY` is set in `.env`, falls back to Phase 1 on error.
- `_ai_security_context()` bug fixed — All-Clusters no longer silently falls back to `clusters[0]`, now aggregates all clusters.
- `CopilotQuery` now has `cluster: Optional[str] = None` field.
- `query_copilot()` endpoint now reads real Postgres data — hardcoded mock strings removed.

---

### STEP 2 — Sub-Task 10 · Agent: Add patch_configmap + Fix Rollback Pipeline ✅ DONE
**Do this second, before wiring any frontend rollback pages.**

**What to build:**
- Add `patch_configmap` command to `_run_k8s_command()` in `agent.py`
- Replace all of `rollback.py`'s in-memory `CHANGE_HISTORY = []` with real `db_manager.enqueue_command()` calls
- Wire: DeploymentRollback → `emergency_rollback` · ConfigRollback → `patch_configmap` · NamespaceRollback → batch `restart_deployment` · ClusterRollback → all `restart_deployment` + `get_metrics_history()`

**Files:**
- `k8s-optimization-platform/agent/agent.py`
- `k8s-optimization-platform/backend/api/rollback.py`

**Done when:** Calling `POST /api/v1/autonomous-ai/rollback/deployment` returns a real `command_id`, and `GET /api/v1/autonomous-ai/rollback/status/{command_id}` shows `pending → done` as the agent processes it.

**Completed:** ✅
- `patch_configmap` command added to `_run_k8s_command()` in `agent.py` — calls `core_v1.patch_namespaced_config_map()`, returns `{patched, namespace, keys_updated}`.
- `rollback.py` fully rewritten — `CHANGE_HISTORY = []` removed entirely.
- `POST /rollback/deployment` → enqueues `emergency_rollback` → returns `{command_id}`.
- `POST /rollback/configuration` → enqueues `patch_configmap` → returns `{command_id}`.
- `POST /rollback/namespace` → reads real deployments from `get_latest_metrics()`, enqueues `restart_deployment` × N → returns `{command_ids}`.
- `POST /rollback/cluster` → reads all deployments from `get_latest_metrics()`, enqueues `restart_deployment` × all → returns `{command_ids}`.
- `GET /rollback/status/{command_id}` → calls `db_manager.get_command()` → returns real `pending/done/failed` status.
- `GET /rollback/snapshots?cluster=X` → calls `get_metrics_history()` → returns real timestamp-based rollback points.

---

### STEP 3 — Sub-Task 1 · Backend: Wire Real Data to 14 Mock Endpoints ✅ DONE
**Do this third. Sub-Task 0 must be done first (uses `_fetch_cluster_context()`).**

**Completed:** ✅
- All 14 mock GET endpoints replaced with real `_fetch_cluster_context()` data.
- `/copilot/incident-investigator` — real OOMKill + restart data
- `/operations/manual-mode` — real over-provisioned pods as approval queue
- `/operations/assisted-mode` — real rule matches
- `/operations/autonomous-mode` — real agent command history
- `/autofix/resource-fixes` — real CPU/memory/PVC waste
- `/autofix/bulk-fixes` — combined real fix candidates
- `/rollback/deployment-rollback` — real deployments from workloads domain
- `/rollback/configuration-rollback` — real ConfigMaps + Secrets
- `/rollback/namespace-rollback` — real namespaces with deployment counts
- `/rollback/cluster-rollback` — real snapshots from metrics history
- `/recommendations/cost` — real namespace cost breakdown
- `/recommendations/performance` — real throttled/OOM/unstable pods
- `/recommendations/reliability` — real pods missing probes/single replicas
- `/copilot/optimization-advisor` — real over-provisioned pods, unlim CPU, idle namespaces, orphaned PVCs (sorted by savings)
- Syntax verified: `python3 -c "import ast; ast.parse(...)"` → ✅ OK

---

### ↓ STEPS 4–10 can be done in parallel once Steps 1, 2, 3 are complete ↓

---

### STEP 4 — Sub-Task 2 · Frontend: NaturalLanguageQueries ✅ DONE
*(parallel after Step 3)*

**Completed:** ✅
- `conversations: Conversation[]` array replaces single `response` state — full chat history in memory
- `UserBubble` + `AIBubble` sub-components with distinct dark styling
- `DK.*` token system matching `Incidents.tsx` exactly — `#0d1117` bg, `#161b22` surface, `#1c2128` surface2, `#30363d` border
- `fetch()` + `API_BASE_URL` from `config/api.ts` — `axios` removed
- `cluster: activeClusterId === 'all' ? null : activeClusterId` sent in every POST body
- `ConfidenceBadge` — green ≥85%, yellow ≥65%, red <65%
- `related_resources` chips — `kind/name` format, outlined dark chips
- Follow-up suggestion chips — click instantly submits (no pre-fill)
- `useRef` + `useEffect` auto-scroll after every new message
- 👍/👎 `ThumbUpOutlined`/`ThumbDownOutlined` icon buttons per AI bubble (UI-only, Phase 2 logs them)
- 8 starter query chips on empty state — click = instant submit
- History sidebar with `<ListItemButton>` (MUI v5) — click = instant re-submit, up to 20 items
- Typing indicator (bot icon + spinner + "Thinking…") while loading
- TypeScript: 0 errors in this file (`tsc --noEmit --skipLibCheck`)

---

### STEP 5 — Sub-Task 3 · Frontend: OptimizationAdvisor + IncidentInvestigator ✅ DONE
*(parallel after Step 3)*

**Completed:** ✅
- **OptimizationAdvisor**: flat `<Table>` replaced with dark fix cards; left-border color = impact severity
- Quick Wins section — filters `effort=low && impact≠low`, gold border highlight
- Savings Calculator sidebar — live-updates as checkboxes are ticked, shows `$X/mo` per rec + grand total
- Batch select via `<Checkbox>` per card + "Apply Selected (N)" button applies all checked fixes sequentially
- Individual Apply → `POST /v1/root-cause/fix` → polls agent every 2.5 s → ✅ card fades, toast shows result
- `API_BASE_URL + clusterParam` — `axios` removed, `activeClusterName` in subtitle
- **IncidentInvestigator**: `<Accordion>` replaced with expandable incident feed cards
- `TypeIcon` (MemoryIcon/RestartAltIcon/WarningAmberIcon) and severity left-border per incident
- `ConfidenceBar` — smooth SVG-free fill bar with % label, green/yellow/red by threshold
- Timeline dot (red=active, green=resolved) + timestamp on every card header row
- Click row header → `<Collapse>` shows root cause box, affected pod chips, recommendations list
- Apply → `POST /v1/root-cause/fix` → polls agent → ✅ icon replaces play button on success
- `API_BASE_URL + clusterParam`, TypeScript: 0 errors

---

### STEP 6 — Sub-Task 4 · Frontend: SecurityAdvisor ✅ DONE
*(parallel after Step 3)*

**Completed:** ✅
- **SVG `<ScoreRing>`** — pure circular ring drawn with `stroke-dasharray`, animates on load; green ≥80, yellow ≥60, red <60
- **`<SevBadge>`** components — CRITICAL / HIGH / MEDIUM / LOW each in tinted colour box (replaces plain number cards)
- **`<ComplianceChip>`** — maps "Compliant"→green, "Partial"/"Needs Review"→yellow, else red; works for any backend key
- **"Fix All Critical"** red button in header — only visible when unfixed criticals > 0; iterates sequentially, disables while in-flight
- Issues **grouped by severity** with section header (dot + label + count chip): Critical → High → Medium → Low
- `<IssueCard>` with `<Collapse>` — CVE badges (red BugReportIcon), affected resource chips, remediation in dark box
- Individual **Apply Fix** → `POST /v1/root-cause/fix` → polls agent every 2.5 s → card fades to 0.5 opacity on success
- `API_BASE_URL + clusterParam`, `axios` removed, TypeScript: 0 errors

---

### STEP 7 — Sub-Task 5 · Frontend: Autonomous Operations (3 pages)
*(parallel after Step 3)*

**What to build:**
- ManualMode: split-screen approval queue, before/after diff, Approve/Reject/Defer buttons, progress bar
- AssistedMode: rule cards by category with toggle switches, live auto-applied feed
- AutonomousMode: dramatic centered toggle with green glow, pulsing banner, guardrails panel, red Emergency Stop

**Files:** `ManualMode.tsx` · `AssistedMode.tsx` · `AutonomousMode.tsx`

**Done when:** ManualMode Approve button enqueues a real agent command. AutonomousMode toggle POSTs to backend. Emergency Stop is always visible.

---

### STEP 8 — Sub-Task 6 · Frontend: Auto-Fix Center (4 pages)
*(parallel after Step 3)*

**What to build:**
- ResourceFixes: grouped fix cards (CPU/Memory/Storage), batch select checkboxes, "Fix Selected (N)" button
- SecurityFixes: severity-banded list, compliance tags, Apply Fix → agent command
- ComplianceFixes: framework tabs (CIS/PCI/ISO/HIPAA/GDPR), per-tab score ring, "Apply All" bulk button
- BulkFixes: operation builder left/right layout, namespace filter, dry-run toggle, execution progress ticker

**Files:** `ResourceFixes.tsx` · `SecurityFixes.tsx` · `ComplianceFixes.tsx` · `BulkFixes.tsx`

**Done when:** All Apply buttons reach the real agent. Dry-run mode on BulkFixes shows a preview without applying. ComplianceFixes score ring animates after a fix completes.

---

### STEP 9 — Sub-Task 7 · Frontend: Rollback Center (4 pages)
*(parallel after Steps 2 + 3)*

**What to build:**
- DeploymentRollback: searchable deployment selector, horizontal version timeline, diff preview, "Rollback Now" → agent
- ConfigurationRollback: two-column ConfigMap/Secret layout, snapshot history, values never shown for secrets
- NamespaceRollback: namespace cards with risk indicators, 3-step confirm flow, button locked until name typed
- ClusterRollback: **red accent theme** (danger), 4-step confirm, "type cluster name" gate, ABORT always visible

**Files:** `DeploymentRollback.tsx` · `ConfigurationRollback.tsx` · `NamespaceRollback.tsx` · `ClusterRollback.tsx`

**Done when:** "Rollback Now" on DeploymentRollback enqueues a real `emergency_rollback` command and shows polling status. ClusterRollback has visually distinct red danger theme.

---

### STEP 10 — Sub-Task 8 · Frontend: AI Recommendations (5 pages)
*(parallel after Step 3)*

**What to build:**
- CostRecommendations: bar chart (namespaces × cost), ROI-sorted cards, running total sidebar
- PerformanceRecommendations: performance score ring, 3 categories (Throttling/Stability/Capacity), urgency badges
- ReliabilityRecommendations: reliability score ring, 2×2 risk matrix plot, fix-type grouping
- SecurityRecommendations: attack-type grouping, MITRE ATT&CK tags per item, "What attacker could do" text
- ComplianceRecommendations: framework scorecard banner, "Audit Readiness" header, per-framework sorted list

**Files:** All 5 in `AIRecommendations/`

**Done when:** Every page shows real data, dark theme, unique visual layout. Apply buttons reach the agent.

---

### STEP 11 — Sub-Task 9 · Phase 2: LLM Engine
**Do this last. Do it only after all 20 pages are working in Phase 1.**

**What to build:**
- `_llm_engine(query, cluster_data)` in `autonomous_ai.py` — calls `openai.AsyncOpenAI()` with `gpt-4o-mini`
- Cluster data formatted as LLM context prompt (real pod names, costs, events)
- `RateLimitError` / `APIError` fallback to Phase 1 rule engine
- `POST /copilot/feedback` endpoint + `nlq_feedback` Postgres table
- Wire frontend 👍/👎 to feedback endpoint

**File:** `k8s-optimization-platform/backend/api/autonomous_ai.py`

**Done when:** Adding `OPENAI_API_KEY=sk-...` to `.env` and restarting the server makes the NaturalLanguageQueries page respond with LLM-generated answers. Removing the key falls back to Phase 1 instantly.

---

## 📊 Sequence Summary

```
STEP 1  Sub-Task 0   Backend: intelligence engine         ← must be first
    ↓
STEP 2  Sub-Task 10  Agent: patch_configmap + rollback.py ← must be second
    ↓
STEP 3  Sub-Task 1   Backend: wire 14 mock endpoints      ← must be third
    ↓ ↓ ↓ ↓ ↓ ↓ ↓  (all parallel from here)
STEP 4  Sub-Task 2   Frontend: NaturalLanguageQueries
STEP 5  Sub-Task 3   Frontend: OptimizationAdvisor + IncidentInvestigator
STEP 6  Sub-Task 4   Frontend: SecurityAdvisor
STEP 7  Sub-Task 5   Frontend: Autonomous Operations (3 pages)
STEP 8  Sub-Task 6   Frontend: Auto-Fix Center (4 pages)
STEP 9  Sub-Task 7   Frontend: Rollback Center (4 pages)
STEP 10 Sub-Task 8   Frontend: AI Recommendations (5 pages)
    ↓
STEP 11 Sub-Task 9   Phase 2: LLM engine                  ← do last
```

---

## 🗺️ Site Map — All 20 Pages at a Glance

```
https://k8s-6d5ba.web.app/autonomous-ai
│
├── 🤖 AI COPILOT
│   │
│   ├── /natural-language-queries
│   │   UNIQUE: Only CONVERSATIONAL page in the product
│   │   Dark chat thread. User types anything.
│   │   AI responds in their language level (expert or beginner).
│   │   Every Q+A preserved. Confidence badge. Real pod names.
│   │   Phase 1: Keyword routing over real Postgres data
│   │   Phase 2: LLM reasons across all data domains
│   │
│   ├── /optimization-advisor
│   │   UNIQUE: ROI CALCULATOR
│   │   "AI found 12 ways to save $412/mo on xforce-devops"
│   │   Cards sorted by highest savings ÷ lowest risk.
│   │   Running savings counter as user selects fixes.
│   │   Quick Wins section at top.
│   │   Phase 2: LLM explains WHY each fix matters
│   │
│   ├── /security-advisor
│   │   UNIQUE: CIRCULAR SECURITY SCORE RING
│   │   Already real data. Needs dark theme.
│   │   SVG ring 0–100 (green / yellow / red).
│   │   "Fix All Critical" bulk button.
│   │   Issues grouped by severity with count badges.
│   │   Phase 2: LLM explains each CVE in plain English
│   │
│   └── /incident-investigator
│       UNIQUE: REAL-TIME INCIDENT FEED
│       Severity-colored left border per card.
│       💀 OOMKill  🔄 CrashLoop  ⚡ Eviction icons.
│       Confidence % bar per root cause.
│       Timeline bar: "started 3h ago".
│       Phase 2: LLM correlates multiple incidents → systemic root cause
│
├── ⚙️ AUTONOMOUS OPERATIONS
│   │
│   ├── /manual-mode
│   │   UNIQUE: HUMAN-IN-THE-LOOP APPROVAL QUEUE
│   │   Split-screen: list left, detail panel right.
│   │   Before/After diff view: "2000m CPU → 500m CPU"
│   │   Approve ✅ / Reject ❌ / Defer ⏳ buttons.
│   │   "3 of 12 reviewed" progress bar at top.
│   │   Phase 2: LLM writes plain-English justification per recommendation
│   │
│   ├── /assisted-mode
│   │   UNIQUE: RULES ENGINE DASHBOARD
│   │   Rule CARDS (not a table) by category.
│   │   COST 💰 / SECURITY 🔒 / PERFORMANCE ⚡ / STORAGE 🗄️
│   │   "N applied today" counter per rule card.
│   │   Live auto-applied feed with real timestamps.
│   │   Phase 2: LLM suggests new rules based on cluster patterns
│   │
│   └── /autonomous-mode
│       UNIQUE: THE BIG TOGGLE — MOST DRAMATIC PAGE
│       Centered toggle with GREEN GLOW when ON.
│       "AUTONOMOUS MODE: ACTIVE" pulsing banner.
│       Guardrails: "AI will NEVER delete production..."
│       Emergency STOP button always visible.
│       Phase 2: LLM narrates what it is doing and why
│
├── 🔧 AUTO-FIX CENTER
│   │
│   ├── /resource-fixes
│   │   UNIQUE: GROUPED FIX CARDS WITH BATCH SELECT
│   │   CPU WASTE / MEMORY WASTE / STORAGE WASTE groups.
│   │   Each card: real pod name + before/after + $savings.
│   │   Checkbox → "Fix Selected (3)" button.
│   │   Progress ring: "8 of 24 resources optimized".
│   │   Phase 2: LLM explains the impact of each fix
│   │
│   ├── /security-fixes
│   │   UNIQUE: SEVERITY-BANDED LIST + COMPLIANCE TAGS
│   │   CRITICAL (red band) at top, HIGH, MEDIUM below.
│   │   Each item: real pod + misconfiguration + patch description.
│   │   "Fixes CIS 5.2.1 · PCI-DSS 6.3" chips per item.
│   │   Phase 2: LLM explains what an attacker could do if left unfixed
│   │
│   ├── /compliance-fixes
│   │   UNIQUE: FRAMEWORK TABS WITH SCORE RINGS
│   │   CIS | PCI-DSS | ISO 27001 | HIPAA | GDPR tabs.
│   │   Per-framework score ring (e.g. "CIS: 72%").
│   │   "Apply All CIS Fixes" bulk button per tab.
│   │   Score ring animates UP after fixes applied.
│   │   Phase 2: LLM explains each control in plain English for non-auditors
│   │
│   └── /bulk-fixes
│       UNIQUE: OPERATION BUILDER WITH DRY RUN
│       Left panel = available fix types.
│       Right panel = selected operations + preview.
│       Namespace filter multi-select.
│       DRY RUN toggle → shows what WOULD change.
│       Execution progress: each item ticks off live.
│       Phase 2: LLM suggests optimal order and grouping for bulk ops
│
├── ↩️ ROLLBACK CENTER
│   │
│   ├── /deployment-rollback
│   │   UNIQUE: DEPLOYMENT SELECTOR + VERSION TIMELINE
│   │   Searchable list of real deployments.
│   │   Horizontal scrollable version timeline per deployment.
│   │   Diff preview before confirming rollback.
│   │   "Dry Run" toggle.
│   │   Real agent command: emergency_rollback ✅ (already in agent)
│   │   Phase 2: LLM explains why this rollback point resolves the incident
│   │
│   ├── /configuration-rollback
│   │   UNIQUE: TWO-COLUMN CONFIGMAP/SECRET LAYOUT
│   │   Left = ConfigMaps, Right = Secrets.
│   │   Key names shown, values NEVER exposed (🔒).
│   │   Snapshot history = last 10 agent metric timestamps.
│   │   Real agent command: patch_configmap ⚠️ (must be added to agent)
│   │   Phase 2: LLM identifies which config change caused a recent incident
│   │
│   ├── /namespace-rollback
│   │   UNIQUE: RISK-INDICATED NAMESPACE CARDS + 3-STEP CONFIRM
│   │   🔴 PRODUCTION / 🟡 STAGING / 🟢 DEV risk per card.
│   │   Step 1: Select → Step 2: Preview → Step 3: Type name.
│   │   Button locked until user types namespace name.
│   │   Real agent command: restart_deployment × N (batch) ✅
│   │   Phase 2: LLM summarises what changed before vs after the rollback trigger
│   │
│   └── /cluster-rollback
│       UNIQUE: DARK RED THEME — NUCLEAR OPTION
│       Red accent (not blue) — visual danger signal.
│       Real snapshot timeline from DB history.
│       4-step confirmation. Must type cluster name.
│       ABORT button always visible and prominent.
│       Real agent command: restart_deployment × all ✅ + metrics history
│       Phase 2: LLM recommends the safest rollback point based on incident timeline
│
└── 💡 AI RECOMMENDATIONS
    │
    ├── /cost
    │   UNIQUE: FINANCIAL DASHBOARD WITH BAR CHART
    │   Bar chart: namespaces on X-axis, real $ on Y-axis.
    │   "AI identified $412/mo in savings" banner.
    │   ROI-sorted recommendation cards.
    │   Running total sidebar: "Selected fixes save: $284/mo"
    │   Phase 2: LLM projects cost trajectory for next month
    │
    ├── /performance
    │   UNIQUE: PERFORMANCE SCORE RING + 3 URGENCY CATEGORIES
    │   Score ring: "Cluster Performance: 74/100"
    │   THROTTLING ⚡ / STABILITY 🔄 / CAPACITY 📈
    │   "Urgent" badge on items degrading UX right now.
    │   Phase 2: LLM predicts when a perf issue becomes a user-visible outage
    │
    ├── /reliability
    │   UNIQUE: 2×2 RISK MATRIX PLOT
    │   X = likelihood of failure, Y = impact if fails.
    │   Each pod plotted on the grid visually.
    │   Fix types: HEALTH CHECK / REPLICA / PDB / READINESS PROBE
    │   Phase 2: LLM estimates MTBF based on restart history
    │
    ├── /security
    │   UNIQUE: ATTACK VECTOR GROUPING + MITRE ATT&CK TAGS
    │   CONTAINER ESCAPE / PRIV ESCALATION / DATA EXFIL / LATERAL MOVEMENT
    │   MITRE ATT&CK tag per item (e.g. "T1611 - Escape to Host")
    │   "What an attacker could do" per misconfiguration.
    │   Phase 2: LLM writes a full threat narrative for the cluster
    │
    └── /compliance
        UNIQUE: AUDIT READINESS SCORECARD
        CIS 72% | PCI 68% | ISO 81% | HIPAA 74% | GDPR 79%
        "You would FAIL a CIS audit today. 14 controls failing."
        Sorted by framework → control → failing resource.
        "Generate Audit Report" export button.
        Phase 2: LLM generates a full audit narrative for an auditor
```

---

## Current State Audit (All 20 Pages)

| # | Page | Real Data? | Dark Theme? | API_BASE_URL? | Cluster Sent? | Actions Work? |
|---|------|-----------|------------|--------------|--------------|--------------|
| 1 | NaturalLanguageQueries | ❌ Mock | ❌ No | ❌ No | ❌ No | ⚠️ No cluster |
| 2 | OptimizationAdvisor | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 3 | SecurityAdvisor | ✅ Real | ❌ No | ❌ No | ❌ No | ❌ Dead Apply Fix |
| 4 | IncidentInvestigator | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply Fixes |
| 5 | ManualMode | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Approve/Reject |
| 6 | AssistedMode | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Toggles |
| 7 | AutonomousMode | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Toggle |
| 8 | ResourceFixes | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 9 | SecurityFixes | ✅ Real | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 10 | ComplianceFixes | ✅ Real | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 11 | BulkFixes | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 12 | DeploymentRollback | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 13 | ConfigurationRollback | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 14 | NamespaceRollback | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 15 | ClusterRollback | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 16 | CostRecommendations | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 17 | PerformanceRecommendations | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 18 | ReliabilityRecommendations | ❌ Mock | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 19 | SecurityRecommendations | ✅ Real | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |
| 20 | ComplianceRecommendations | ✅ Real | ❌ No | ❌ No | ❌ No | ❌ Dead Apply |

**Summary:** 14/20 fake · 0/20 dark theme · 0/20 API_BASE_URL · 20/20 no cluster param · 20/20 dead action buttons

---

## What Makes Each Page Unique — The User Experience Vision

Every page must feel different and purposeful. Here is exactly what each page does
for the user, what real data powers it, and what makes it unique visually and functionally.

---

### 🤖 AI COPILOT

---

#### Page 1 — Natural Language Queries
**URL:** `/autonomous-ai/ai-copilot/natural-language-queries`
**What the user does:** Types any question in plain English about their cluster
**What makes it unique:** It's the ONLY conversational interface in the entire product —
a chat thread where every question + answer pair is preserved, AI responds in the
user's language level (expert vs beginner), and follow-up suggestions keep the
conversation going.

**Real data powering it:**
- `pods.items` → real pod names, namespaces, cpu_request, memory_request, restarts
- `finops.namespace_resources` → real cost per namespace
- `security` domain → real privileged/root pod counts
- `pods.oom_events` → real OOMKill history
- `storage.pvcs.orphaned` → real wasted storage

**Phase 1 unique UI:**
- Dark chat thread (user messages right-aligned, AI responses left-aligned)
- 4 query type chips (Natural Language 🌐 / Optimization 💰 / Security 🔒 / Incident 🚨)
- Confidence badge (e.g. "92% confident") on every AI response
- `related_resources` chips below each answer showing exact pod/namespace names
- Capability intro cards (hidden once conversation starts)
- Beginner detection: plain English + analogy when no K8s terms detected
- 👍/👎 feedback on each response

**Phase 2 addition:** LLM understands any question, multi-step reasoning, remembers conversation

---

#### Page 2 — Optimization Advisor
**URL:** `/autonomous-ai/ai-copilot/optimization-advisor`
**What the user does:** Views AI-generated list of what to optimize and in what order
**What makes it unique:** Priority-ranked recommendations table with a live savings
calculator — shows exactly HOW MUCH money each fix saves, in what order to do them,
and what the risk is. The AI ranks by ROI: highest savings ÷ lowest risk first.

**Real data powering it:**
- `pods.items` → sort by `cpu_request` descending, filter where `cpu_request > 2× actual usage`
- `finops.namespace_resources` → cost per namespace to calculate savings
- `storage.pvcs.orphaned` → storage waste savings
- `pods.restart_analysis` → unstable pods that waste resources

**Phase 1 unique UI (redesign):**
- Dark header: "AI found {N} ways to save ${total}/month on {cluster}"
- ROI-sorted table: savings/month · effort (Low/Med/High) · risk chip · affected resource name (real)
- Savings calculator sidebar: running total as user checks off items
- "Quick Wins" highlighted section at top (low effort + high savings)
- Animated savings counter showing total selected savings

**Phase 2 addition:** LLM explains WHY each recommendation matters in plain English

---

#### Page 3 — Security Advisor
**URL:** `/autonomous-ai/ai-copilot/security-advisor`
**What the user does:** Reviews real security issues found in their cluster
**What makes it unique:** Already reads real cluster data. Currently uses plain white
MUI. Needs dark theme + the "Apply Fix" button wired to the real agent command system.
Also needs a security score ring (not just a LinearProgress bar).

**Real data powering it (already working):**
- `pods.items` → containers with `privileged`, `run_as_root`, `allow_privilege_escalation`
- `pods.items` → `host_network`, `host_pid`, `host_ipc` flags
- `pods.items` → `no_cpu_limit`, `no_memory_limit`, `default_sa`

**Phase 1 unique UI (dark theme + fixes):**
- Dark circular security score ring (SVG arc, not linear bar) with color: green/yellow/red
- Issues grouped by severity with count badges: CRITICAL (3) HIGH (2) MEDIUM (5)
- "Apply Fix" button → real agent command → polling spinner → success toast
- Timeline view: when each issue was first detected (from metrics timestamp)
- "Fix All Critical" bulk button at the top

**Phase 2 addition:** LLM explains each CVE in plain English for non-security experts

---

#### Page 4 — Incident Investigator
**URL:** `/autonomous-ai/ai-copilot/incident-investigator`
**What the user does:** Sees what broke, why it broke, and how to fix it
**What makes it unique:** Real-time incident feed from actual cluster events — OOMKills,
crash loops, evictions. Each incident has a confidence-scored root cause and a
one-click "Apply Fix" that sends a real patch command to the cluster agent.

**Real data powering it (currently mock — needs wiring):**
- `pods.oom_events` → real OOMKill events with pod name, namespace, timestamp
- `pods.restart_analysis` → pods with high restart counts
- `observability.events.warning_events` → Kubernetes warning events

**Phase 1 unique UI (redesign from mock):**
- Dark incident feed with severity-colored left border (red = critical, yellow = high)
- Each incident card: type icon (💀 OOMKill / 🔄 CrashLoop / ⚡ Eviction) + real pod name
- Timeline bar inside each card showing when it started vs now
- Root cause with confidence % bar (e.g. "Memory leak — 94% confident")
- "Apply Fix" → real agent command with live status polling
- "This week" vs "Today" toggle filter

**Phase 2 addition:** LLM correlates multiple incidents to find systemic root causes

---

### ⚙️ AUTONOMOUS OPERATIONS

---

#### Page 5 — Manual Mode
**URL:** `/autonomous-ai/autonomous-operations/manual-mode`
**What the user does:** Reviews every AI recommendation before it gets applied — one by one
**What makes it unique:** A human-in-the-loop approval queue. Every pending optimization
is shown with "what it is now" vs "what AI wants to change it to". User approves or rejects.
Approved items become real agent commands on the cluster.

**Real data powering it (currently mock):**
- `pods.items` → pods where `cpu_request > 2× needed` → "reduce CPU from 2000m to 500m"
- `pods.oom_events` → pods that OOMKilled → "increase memory from 512Mi to 1Gi"
- `storage.pvcs.orphaned` → "delete PVC old-data-vol (unattached 30+ days)"

**Phase 1 unique UI (redesign):**
- Dark split-screen: left = pending queue list, right = detail panel for selected item
- Each pending item: before/after diff view (current value struck-through → recommended value in green)
- Risk badge: LOW / MEDIUM / HIGH with color
- Savings chip: "$84/mo" in green
- Approve (✅ green) / Reject (❌ red) / Defer (⏳ grey) buttons
- After approve → real agent command → spinner → "Applied to cluster" confirmation
- Counter: "3 of 12 reviewed" progress bar at top

**Phase 2 addition:** LLM writes a plain-English justification for each recommendation

---

#### Page 6 — Assisted Mode
**URL:** `/autonomous-ai/autonomous-operations/assisted-mode`
**What the user does:** Sets rules for what the AI can auto-fix vs what needs approval
**What makes it unique:** A rules engine UI. User defines thresholds ("auto-fix if risk is Low
AND savings > $50/mo"). Low-risk fixes happen automatically; high-risk ones come to the
manual queue. Toggle rules on/off per category.

**Real data powering it (currently mock):**
- Same pod/storage data as Manual Mode
- `security` domain → drives which security rules fire

**Phase 1 unique UI (redesign):**
- Dark rule cards (not a flat table) — each rule is a card with: rule name, condition text,
  "fires when" example, toggle switch, "N applied today" counter
- Live feed section: last 10 auto-applied actions with timestamps and resource names (real)
- "Today's impact" sidebar: auto-applied count, manual queue count, $ saved
- Rule categories: COST 💰 / SECURITY 🔒 / PERFORMANCE ⚡ / STORAGE 🗄️
- Toggle switches POST to real backend endpoint

**Phase 2 addition:** LLM suggests new rules based on patterns it sees in the cluster

---

#### Page 7 — Autonomous Mode
**URL:** `/autonomous-ai/autonomous-operations/autonomous-mode`
**What the user does:** Turns on fully automated AI optimization — AI acts without asking
**What makes it unique:** The "big red button" of the product. A dramatic toggle with
clear consequences shown. When ON: shows a live activity feed of what AI is doing
right now. Has guardrails display to reassure user what AI will NEVER do automatically.

**Real data powering it (currently mock):**
- `pods.items` → shows what AI has access to fix
- `pods.oom_events`, `pods.restart_analysis` → shows what it would auto-fix
- Agent command queue → shows recent autonomous actions

**Phase 1 unique UI (redesign):**
- Large centered toggle card with green glow when ON, red/grey when OFF
- "AUTONOMOUS MODE: ACTIVE" banner when enabled (pulsing green dot)
- Live activity ticker: scrolling feed of recent auto-actions (real from agent command history)
- Guardrails panel: "AI will NEVER delete production namespaces / NEVER touch databases..."
- Success rate ring: e.g. "98.2% of autonomous actions succeeded this week"
- Emergency stop button: prominent red "STOP ALL AUTONOMOUS ACTIONS" button

**Phase 2 addition:** LLM narrates what it's doing and why in the activity feed

---

### 🔧 AUTO-FIX CENTER

---

#### Page 8 — Resource Fixes
**URL:** `/autonomous-ai/autofix-center/resource-fixes`
**What the user does:** Sees all CPU/memory/storage waste and fixes them one click
**What makes it unique:** Every fix item is a real pod with real numbers — "frontend-7d9f8
requests 2000m but uses 180m. Fix: reduce to 250m. Save $84/mo." Not generic advice —
specific actionable patches for specific resources.

**Real data powering it (currently mock):**
- `pods.items` → filter where `cpu_request > 3× observed` or `memory_request > 3× observed`
- `storage.pvcs.orphaned` → unattached PVCs with size and age
- `pods.restart_analysis` → pods that need memory increased

**Phase 1 unique UI (redesign from generic table):**
- Dark fix cards (not a table) grouped by type: CPU WASTE / MEMORY WASTE / STORAGE WASTE
- Each card: real resource name (pod/PVC) + namespace + before/after values + savings chip
- Batch select checkboxes → "Fix Selected (3)" button
- Progress ring: "8 of 24 resources optimized"
- After Apply → real agent command → command status polling → success/fail toast

**Phase 2 addition:** LLM explains the impact of each fix in plain English

---

#### Page 9 — Security Fixes
**URL:** `/autonomous-ai/autofix-center/security-fixes`
**What the user does:** One-click fixes for real security misconfigurations in their cluster
**What makes it unique:** Already reads real cluster data. Each fix maps to a real pod
that has a real misconfiguration. "api-server-5c2b is running as root. Fix: add
`runAsNonRoot: true` to securityContext." Real pod name, real fix, real patch.

**Real data powering it (already partially real):**
- `pods.items` containers where `privileged=true`, `run_as_root=true`, `allow_privilege_escalation=true`
- `pods.items` where `read_only_root_fs=false`
- `pods.items` where `service_account=default`

**Phase 1 unique UI (dark theme + apply wire):**
- Dark severity-banded list: CRITICAL fixes (red band) at top, HIGH (orange), MEDIUM (yellow)
- Each fix item: severity icon + real pod name + what the misconfiguration is + what the patch does
- "Apply Fix" → `POST /api/v1/root-cause/fix` → poll command → toast
- Compliance impact chips: "Fixes CIS 5.2.1 · PCI-DSS 6.3" per item
- Fixed counter: "3 of 11 critical issues resolved"

**Phase 2 addition:** LLM explains what an attacker could do if this issue is not fixed

---

#### Page 10 — Compliance Fixes
**URL:** `/autonomous-ai/autofix-center/compliance-fixes`
**What the user does:** Fixes specific compliance framework violations found in their cluster
**What makes it unique:** Already reads real cluster data. Violations are mapped to real
compliance controls (CIS 5.2.1, PCI-DSS 6.3, ISO 27001 A.12.6.1). Each fix shows
exactly which control it satisfies and which real resources are affected.

**Real data powering it (already partially real):**
- Security domain → privileged containers → CIS 5.2.2
- Pods without resource limits → CIS 5.2.4
- Missing network policies → CIS 5.3.1
- Default service accounts → CIS 5.1.5

**Phase 1 unique UI (dark theme + apply wire):**
- Framework tabs: CIS Benchmark | PCI-DSS | ISO 27001 | HIPAA | GDPR
- Per-framework compliance score ring (e.g. "CIS: 72%")
- Fix items grouped by control ID with "FAILING" badge
- Each item: control ID + control name + affected resource count + fix action
- "Apply All CIS Fixes" bulk button per framework tab
- After fix → score ring animates upward

**Phase 2 addition:** LLM explains the compliance control in plain English for non-auditors

---

#### Page 11 — Bulk Fixes
**URL:** `/autonomous-ai/autofix-center/bulk-fixes`
**What the user does:** Applies multiple fixes across the whole cluster in one operation
**What makes it unique:** A batch operations interface. Instead of fixing one pod at a time,
user can say "fix all CPU waste across all namespaces" and AI queues all the commands at once.
Shows estimated time, estimated savings, and risk level before confirming.

**Real data powering it (currently mock):**
- All fix candidates from Resource + Security + Compliance combined
- Grouped by namespace or by fix type

**Phase 1 unique UI (redesign):**
- Dark operation builder: left = available fix types, right = selected operations
- "What will this fix?" preview showing count + estimated savings + risk summary
- Namespace filter: "Fix only in: [production] [staging]" multi-select
- Confirmation dialog showing EXACTLY what will change (real resource names)
- Execution progress: each fix item ticks off as agent processes commands
- "Dry Run" toggle → shows what WOULD happen without applying

**Phase 2 addition:** LLM suggests the optimal order and grouping for bulk operations

---

### ↩️ ROLLBACK CENTER

---

#### Page 12 — Deployment Rollback
**URL:** `/autonomous-ai/rollback-center/deployment-rollback`
**What the user does:** Rolls back a specific deployment to a previous version
**What makes it unique:** Shows REAL deployments from the cluster with their real
revision history. User picks a deployment, sees all available rollback points
(from workloads domain), and triggers a real `kubectl rollout undo` via the agent.

**Real data powering it (currently mock):**
- `workloads.deployments.items` → real deployment names, namespaces, current replicas
- Agent command history → previous deployment changes recorded

**Phase 1 unique UI (redesign):**
- Dark deployment selector: searchable list of real deployments (name + namespace + current image)
- Selected deployment → version timeline (horizontal scroll of rollback points)
- Each rollback point: version tag + timestamp + "what changed" label + risk chip
- Diff preview: shows what will change if this rollback point is selected
- "Rollback Now" → real agent command → polling → "Rollback complete" confirmation
- "Dry Run" toggle → shows impact without applying

**Phase 2 addition:** LLM explains why this rollback point might resolve an incident

---

#### Page 13 — Configuration Rollback
**URL:** `/autonomous-ai/rollback-center/configuration-rollback`
**What the user does:** Rolls back ConfigMap or Secret to a previous known-good state
**What makes it unique:** Targets configuration objects specifically. Shows real ConfigMaps
and Secrets from the cluster, lets user pick which one changed and caused an issue,
and reverts it via the agent.

**Real data powering it (currently mock):**
- `configmaps.items` → real ConfigMap names + namespaces + data key count
- `secrets_domain.items` → real Secret names + namespaces (values never exposed)

**Phase 1 unique UI (redesign):**
- Dark two-column layout: left = ConfigMaps list, right = Secrets list
- Each item: name + namespace + age + "N data keys" chip
- Clicking item → shows key names (not values for secrets) + "revert to snapshot" option
- Snapshot history from agent metrics timestamps (last 10 metric snapshots = 10 rollback points)
- "Rollback ConfigMap" → real agent command
- Secrets section clearly marked 🔒 "Values hidden for security"

**Phase 2 addition:** LLM identifies which config change likely caused a recent incident

---

#### Page 14 — Namespace Rollback
**URL:** `/autonomous-ai/rollback-center/namespace-rollback`
**What the user does:** Rolls back ALL resources in a namespace to a snapshot state
**What makes it unique:** The most impactful rollback — affects everything in a namespace.
Shows real namespaces with their real resource counts. Has a very strong "are you sure"
confirmation flow because this is high-risk.

**Real data powering it (currently mock):**
- `namespaces.items` → real namespace names + resource counts
- `pods.items` grouped by namespace → pod counts per namespace

**Phase 1 unique UI (redesign):**
- Dark namespace cards: name + pod count + deployment count + last-changed timestamp
- Risk indicator per namespace: PRODUCTION (🔴 extreme risk) / STAGING (🟡 medium) / DEV (🟢 low)
- Three-step confirmation flow: 1) Select namespace → 2) Preview what changes → 3) Type namespace name to confirm
- Impact summary: "This will affect 42 pods, 8 deployments, 3 services"
- "Rollback Namespace" only enabled after user types namespace name (safety gate)

**Phase 2 addition:** LLM summarizes what was different before vs after the event that triggered rollback need

---

#### Page 15 — Cluster Rollback
**URL:** `/autonomous-ai/rollback-center/cluster-rollback`
**What the user does:** Rolls back the ENTIRE cluster to a previous snapshot state
**What makes it unique:** The nuclear option — highest risk rollback in the product.
This page should feel dramatically different from others: dark red theme, multiple
confirmation steps, prominent "EXTREME RISK" warnings, and requires typing
"I UNDERSTAND" to proceed.

**Real data powering it (currently mock):**
- `db_manager.get_metrics_history(cluster_name)` → last N snapshots = rollback points
- Each snapshot: timestamp + total pods + total nodes + key metrics summary

**Phase 1 unique UI (completely unique design):**
- Dark red accent theme (not the standard dark blue) — visual danger signal
- Snapshot timeline: horizontal scrollable list of available rollback points (real timestamps from DB)
- Each snapshot card: datetime + "42 pods · 5 nodes · 6 namespaces" summary
- IMPACT WARNING panel: "This will affect EVERY resource in cluster {name}"
- Step 1: Select snapshot → Step 2: Review impact → Step 3: Type cluster name → Step 4: Confirm
- "ABORT" button always visible and prominent

**Phase 2 addition:** LLM recommends the safest rollback point based on incident timeline

---

### 💡 AI RECOMMENDATIONS

---

#### Page 16 — Cost Recommendations
**URL:** `/autonomous-ai/ai-recommendations/cost`
**What the user does:** Sees exactly where money is being wasted and what to do
**What makes it unique:** A financial dashboard for the cluster. Shows real cost breakdown
by namespace using the finops domain. Each recommendation has a dollar amount
(calculated from CPU/memory cost formulas already in the codebase).

**Real data powering it (currently mock):**
- `finops.namespace_resources` → real CPU + memory per namespace → cost calculation
- `pods.items` with `cpu_request` → cost per pod
- `storage.pvcs` → storage cost per PVC

**Phase 1 unique UI (redesign):**
- Dark cost breakdown bar chart at top: namespaces on X-axis, $ on Y-axis (real numbers)
- "Potential savings" banner: "AI identified $412/mo in savings across 3 areas"
- Recommendation cards (not a flat table): each card = one saving opportunity
  - Title + real resource name + real $$/month savings + effort chip + risk chip
  - "Apply Fix" → real agent command
- Sorted by savings descending (highest ROI first)
- Running total sidebar: "Selected fixes save: $284/mo"

**Phase 2 addition:** LLM projects cost trajectory: "at current rate, your bill will be $X next month"

---

#### Page 17 — Performance Recommendations
**URL:** `/autonomous-ai/ai-recommendations/performance`
**What the user does:** Fixes bottlenecks slowing down their applications
**What makes it unique:** Focuses on SPEED and RELIABILITY not cost. Shows which pods
are CPU-throttled, which are getting OOMKilled, and which need HPA. Each recommendation
explains the user-visible impact: "your API response time is degraded because..."

**Real data powering it (currently mock):**
- `pods.items` where `cpu_limit` is set and usage is near limit → throttling candidates
- `pods.oom_events` → memory-constrained pods
- `pods.restart_analysis` → unstable pods
- `pods.items` where `replicas=1` and restarts > 5 → single-point-of-failure

**Phase 1 unique UI (redesign):**
- Dark performance score at top: "Cluster Performance Score: 74/100" with ring
- Three categories: THROTTLING ⚡ / STABILITY 🔄 / CAPACITY 📈
- Each item: real pod name + metric (e.g. "CPU throttling: 67%") + recommended fix + impact on UX
- "Urgent" badge for items that are actively degrading user experience
- After Apply → polls agent → shows "Throttling reduced from 67% to 8%"

**Phase 2 addition:** LLM predicts when a performance issue will become a user-visible outage

---

#### Page 18 — Reliability Recommendations
**URL:** `/autonomous-ai/ai-recommendations/reliability`
**What the user does:** Makes their cluster more resilient and fault-tolerant
**What makes it unique:** Focuses on UPTIME not cost or speed. Shows single points of
failure, pods with no health checks, and applications with no redundancy. Recommendations
are about making the system survive failures, not just run faster.

**Real data powering it (currently mock):**
- `pods.items` where `has_liveness=false` → no health check → can silently fail
- `pods.items` where `replicas=1` → single point of failure
- `pods.restart_analysis` → pods that frequently crash = reliability risk
- `pods.items` where no `readiness_probe` → traffic sent to unhealthy pods

**Phase 1 unique UI (redesign):**
- Dark reliability score ring: "Reliability Score: 68/100"
- Risk matrix: 2×2 grid (X = likelihood of failure, Y = impact if fails) — each pod plotted
- High-impact items: "api-server has 1 replica and crashed 14 times — CRITICAL single point of failure"
- Fix types: ADD HEALTH CHECK / ADD REPLICA / ADD PDB / ADD READINESS PROBE
- After Apply → real agent command to patch deployment spec

**Phase 2 addition:** LLM estimates Mean Time Between Failures based on restart history

---

#### Page 19 — Security Recommendations
**URL:** `/autonomous-ai/ai-recommendations/security`
**What the user does:** Hardens their cluster against attacks and vulnerabilities
**What makes it unique:** Already reads real cluster data. Recommendations are mapped
to actual attack vectors — "this misconfiguration allows container escape", "this
allows privilege escalation". Not just "fix this setting" — explains the THREAT.

**Real data powering it (already partially real):**
- Same security signals as SecurityAdvisor + SecurityFixes
- Adds threat modeling: misconfiguration → attack vector mapping

**Phase 1 unique UI (dark theme upgrade):**
- Dark threat-level header: "Your cluster has 3 critical attack vectors"
- Recommendations grouped by attack type: CONTAINER ESCAPE / PRIVILEGE ESCALATION / DATA EXFILTRATION / LATERAL MOVEMENT
- Each recommendation: threat icon + real pod/resource name + "What an attacker could do" + fix
- MITRE ATT&CK technique tag per recommendation (e.g. "T1611 - Escape to Host")
- "Apply Hardening" → real agent command

**Phase 2 addition:** LLM writes a threat narrative: "If this cluster were attacked today, here's what would happen step by step..."

---

#### Page 20 — Compliance Recommendations
**URL:** `/autonomous-ai/ai-recommendations/compliance`
**What the user does:** Closes compliance gaps before an audit
**What makes it unique:** Already reads real cluster data. Frames everything in terms of
AUDIT READINESS. Shows a compliance scorecard per framework and what specific controls
are failing. Each recommendation = one audit finding closed.

**Real data powering it (already partially real):**
- Same compliance signals as ComplianceFixes
- Adds audit readiness scoring per framework

**Phase 1 unique UI (dark theme upgrade):**
- Dark compliance scorecard at top: CIS 72% | PCI-DSS 68% | ISO27001 81% | HIPAA 74% | GDPR 79%
- "Audit Readiness" header: "You would FAIL a CIS audit today. 14 controls failing."
- Recommendations sorted by: which framework they fix, which controls they close
- Each item: control ID + control description + failing resource + fix + framework badge
- "Generate Audit Report" button → exports current compliance state as PDF
- After Apply → score rings update (re-fetch after command completes)

**Phase 2 addition:** LLM generates a full audit narrative: "Here is your compliance story for an auditor..."

---

## The 17 Gaps (Full System)

### Backend Gaps
| # | Gap | Phase |
|---|-----|-------|
| G1 | `cluster` field missing from `CopilotQuery` model | 1 |
| G2 | `query_copilot()` reads no real data — hardcoded dict | 1 |
| G3 | `_ai_security_context()` silently falls back to cluster[0] when `cluster=None` (All Clusters broken) | 1 |
| G4 | No `_fetch_cluster_context()` — reads only pods, missing finops/storage/observability/workloads | 1 |
| G5 | No `_answer_engine()` abstraction — Phase 2 requires full rewrite without it | 1+2 |
| G6 | No intent/keyword routing — ignores query text entirely | 1 |
| G7 | 14 backend endpoints return hardcoded data | 1 |
| G8 | `openai` installed + `OPENAI_API_KEY` in settings but never called for NLQ | 2 |

### Frontend Gaps
| # | Gap | Phase |
|---|-----|-------|
| G9 | `cluster` identity never sent in POST body (NaturalLanguageQueries) | 1 |
| G10 | `axios` used instead of `fetch + API_BASE_URL` | 1 |
| G11 | `query_type` never sent to backend | 1 |
| G12 | No query type selector UI | 1 |
| G13 | Response shape mismatch — `related_resources` and `confidence` never shown | 1 |
| G14 | No conversation thread — only last response shown | 1 |
| G15 | `<ListItem button>` deprecated in MUI v5 | 1 |
| G16 | Plain white MUI theme across all 20 pages | 1 |
| G17 | No feedback buttons to measure Phase 1 quality | 2 |

---

## Phase 1 → Phase 2 Switch Design

```
PHASE 1 (now):
  query_copilot()
    → _fetch_cluster_context()   ← reads real Postgres data
    → _answer_engine()            ← keyword router + template response

PHASE 2 (add API key, restart):
  query_copilot()
    → _fetch_cluster_context()   ← SAME, unchanged
    → _answer_engine()            ← NOW calls OpenAI with cluster data as context
                                     auto-fallback to Phase 1 if OpenAI down

Switch cost: add OPENAI_API_KEY to .env + restart server
Rollback: remove OPENAI_API_KEY → auto-falls back to Phase 1
Cost at 50k users: ~$6,000/month (Phase 2) vs $0 (Phase 1)
```

---

## Sub-Tasks

### Sub-Task 0 — Backend: Build the Intelligence Engine (Phase 1 Core)
**Status:** `[ ] pending`

**Intent**
Wire `POST /copilot/query` to real cluster data. Build `_fetch_cluster_context()` and
the swappable `_answer_engine()` with keyword intent routing and beginner detection.
This engine is shared by ALL 20 pages — built once, used everywhere.

**Expected Outcomes**
- `CopilotQuery` accepts `cluster: Optional[str]`
- Single cluster → reads 1 row from `agent_metrics`
- All clusters → aggregates all rows, tags each resource with `_cluster` field
- `_fetch_cluster_context()` reads: pods, finops, security, storage, observability domains
- `_answer_engine()` routes: crash/restart/cost/security/memory/storage/health
- Beginner detection: no K8s jargon → plain English + analogy
- Phase 2 slot: `if OPENAI_API_KEY set → _llm_engine()` with fallback

**Todo List**
1. Add `cluster: Optional[str]` to `CopilotQuery` model
2. Create `_fetch_cluster_context(cluster)`:
   - Single: `db_manager.get_latest_metrics(cluster)` → extract all 5 domains
   - All: loop all clusters → aggregate → tag each pod/resource with `_cluster`
3. Create `_answer_engine(query, cluster_data)` with 7 intent branches
4. Create 7 response builders: `_build_restart_answer()`, `_build_cpu_answer()`,
   `_build_cost_answer()`, `_build_memory_answer()`, `_build_security_answer()`,
   `_build_storage_answer()`, `_build_health_overview()`
5. Add `is_beginner` detection + plain-English wrapper
6. Add Phase 2 slot: `if os.environ.get("OPENAI_API_KEY"): return await _llm_engine(...)`
7. Fix `_ai_security_context()` All-Clusters path (currently broken)

**Relevant Context**
- [`autonomous_ai.py:22`](k8s-optimization-platform/backend/api/autonomous_ai.py:22)
- [`autonomous_ai.py:104`](k8s-optimization-platform/backend/api/autonomous_ai.py:104)
- [`autonomous_ai.py:118`](k8s-optimization-platform/backend/api/autonomous_ai.py:118)
- [`database/db.py:245`](k8s-optimization-platform/backend/database/db.py:245)
- [`ai_copilot.py:103`](k8s-optimization-platform/backend/api/ai_copilot.py:103) — keyword matching pattern
- [`settings.py:46`](k8s-optimization-platform/backend/config/settings.py:46)
- `requirements.txt:27` — `openai==1.10.0` already installed

---

### Sub-Task 1 — Backend: Wire Real Data to 14 Mock Endpoints
**Status:** `[ ] pending`

**Intent**
Replace hardcoded responses in 14 endpoints with real cluster data reads using
`_fetch_cluster_context()` from Sub-Task 0.

**Expected Outcomes**
Each endpoint returns real data matching its unique purpose (see vision above):
- OptimizationAdvisor → real ROI-sorted pod waste candidates
- IncidentInvestigator → real OOMKill + restart events
- ManualMode → real before/after recommendation queue
- AssistedMode → real rule-matched resources
- AutonomousMode → real agent command history
- ResourceFixes → real over-provisioned pods
- BulkFixes → combined fix candidates across all types
- All 4 Rollbacks → real workload/namespace/configmap history
- CostRecommendations → real cost per namespace
- PerformanceRecommendations → real throttled/OOM pods
- ReliabilityRecommendations → real single-replica / no-healthcheck pods

**Todo List**
1. Add `cluster: Optional[str] = Query(None)` to each GET endpoint
2. Call `_fetch_cluster_context(cluster)` at start of each handler
3. Build response from real data fields, keeping existing response shape
4. For endpoints that need sorted/filtered data: sort by most impactful first

**Relevant Context**
- [`autonomous_ai.py:196–920`](k8s-optimization-platform/backend/api/autonomous_ai.py:196)

---

### Sub-Task 2 — Frontend: NaturalLanguageQueries (Conversation UI)
**Status:** `[ ] pending`

**Intent**
Build the full chat-style conversation interface. Most unique page in the product.

**Expected Outcomes**
- Dark chat thread: user messages right, AI responses left
- 4 query type chips with icons and accent colors
- Cluster identity sent in every POST body
- Conversation array (not single response overwrite)
- `related_resources` chips + `confidence` badge on every AI response
- Auto-scroll to latest message
- Beginner-friendly: no jargon needed to get a useful answer
- Capability intro cards on first load
- 👍/👎 per response

**Todo List**
1. Remove `axios`, add `API_BASE_URL` + `activeClusterId` from hooks
2. Add `queryType` state + 4 selector chips
3. Fix POST body: `{ query, query_type, cluster }`
4. Extend response interface: `related_resources`, `confidence`, `query_id`
5. Replace `response` state with `conversations` array
6. Build chat bubble components: `UserBubble` + `AIBubble` with confidence + resources
7. Add `useRef` scroll-to-bottom
8. Add `DK.*` dark theme tokens throughout
9. Add capability intro cards (hide once conversation starts)
10. Replace `<ListItem button>` with `<ListItemButton>`
11. Add 👍/👎 buttons

**Relevant Context**
- [`NaturalLanguageQueries.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AICopilot/NaturalLanguageQueries.tsx)
- [`Incidents.tsx:78`](k8s-optimization-platform/frontend/src/pages/Incidents.tsx:78) — DK tokens
- [`config/api.ts`](k8s-optimization-platform/frontend/src/config/api.ts)

---

### Sub-Task 3 — Frontend: AI Copilot Pages (Optimization + Incident)
**Status:** `[ ] pending`

**Intent**
Redesign OptimizationAdvisor and IncidentInvestigator with unique purpose-built UIs
and wire their Apply/Fix buttons to real agent commands.

**Expected Outcomes**
- OptimizationAdvisor: ROI-sorted cards with savings calculator, real pod names
- IncidentInvestigator: severity-banded incident feed with timeline bars and root cause confidence
- Both: dark theme, real data, working Apply buttons with command polling

**Todo List — OptimizationAdvisor**
1. Switch to `fetch + API_BASE_URL + clusterParam`
2. Redesign: ROI-sorted fix cards (not flat table), savings calculator sidebar
3. Highlight "Quick Wins" section
4. Apply button → POST to `/v1/root-cause/fix` → poll → toast
5. Add `DK.*` dark theme

**Todo List — IncidentInvestigator**
1. Switch to `fetch + API_BASE_URL + clusterParam`
2. Redesign: incident feed cards with severity left-border color
3. Each card: type icon + real pod name + timeline bar + confidence % bar
4. Apply Fixes → real agent command → poll → toast
5. Add `DK.*` dark theme

**Relevant Context**
- [`OptimizationAdvisor.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AICopilot/OptimizationAdvisor.tsx)
- [`IncidentInvestigator.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AICopilot/IncidentInvestigator.tsx)
- [`Incidents.tsx:175`](k8s-optimization-platform/frontend/src/pages/Incidents.tsx:175) — handleFix pattern

---

### Sub-Task 4 — Frontend: SecurityAdvisor (Dark Theme + Apply Wire)
**Status:** `[ ] pending`

**Intent**
SecurityAdvisor already has real data. It needs dark theme, circular security score ring,
and working Apply Fix buttons.

**Expected Outcomes**
- Circular SVG security score ring (not LinearProgress)
- Issues grouped by severity with count badges
- "Fix All Critical" bulk button
- Apply Fix → real agent command → polling → toast
- Dark theme throughout

**Todo List**
1. Add `DK.*` dark theme
2. Replace LinearProgress score bar with SVG circular ring component
3. Add severity group badges: CRITICAL (N) HIGH (N) MEDIUM (N)
4. Add "Fix All Critical" button → batch agent commands
5. Wire individual Apply Fix → POST `/v1/root-cause/fix` → poll → toast
6. Switch URL to `API_BASE_URL + clusterParam`

**Relevant Context**
- [`SecurityAdvisor.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AICopilot/SecurityAdvisor.tsx)

---

### Sub-Task 5 — Frontend: Autonomous Operations (Manual/Assisted/Autonomous)
**Status:** `[ ] pending`

**Intent**
Redesign all 3 Autonomous Operations pages with their unique UIs and wire all controls.

**Expected Outcomes**
- ManualMode: split-screen approval queue with before/after diff view
- AssistedMode: rule cards (not table) with live feed of auto-applied actions
- AutonomousMode: dramatic toggle with pulsing status, guardrails panel, emergency stop

**Todo List — ManualMode**
1. Redesign: left panel = pending list, right = detail panel with before/after diff
2. Approve → POST `/manual-mode/{id}/approve` → poll → remove from list
3. Reject → POST `/manual-mode/{id}/reject` → remove from list
4. Progress bar: "N of M reviewed"
5. Dark theme

**Todo List — AssistedMode**
1. Redesign: rule cards (not table rows) by category
2. Each card toggle → POST `/assisted-mode/rules/{id}/toggle`
3. Live feed section from real agent command history
4. Dark theme

**Todo List — AutonomousMode**
1. Redesign: centered toggle card with glow effect
2. Status banner: "AUTONOMOUS MODE: ACTIVE" with pulsing dot
3. Guardrails panel with "AI will NEVER..." list
4. Emergency stop button (prominent red)
5. Toggle → POST `/autonomous-mode/toggle`
6. Dark theme

**Relevant Context**
- [`ManualMode.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AutonomousOperations/ManualMode.tsx)
- [`AssistedMode.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AutonomousOperations/AssistedMode.tsx)
- [`AutonomousMode.tsx`](k8s-optimization-platform/frontend/src/pages/AutonomousAI/AutonomousOperations/AutonomousMode.tsx)

---

### Sub-Task 6 — Frontend: Auto-Fix Center (Resource/Security/Compliance/Bulk)
**Status:** `[ ] pending`

**Intent**
Redesign all 4 Auto-Fix pages with differentiated UIs and wire Apply buttons to real agent commands.

**Expected Outcomes**
- ResourceFixes: grouped fix cards (CPU / Memory / Storage) with batch select
- SecurityFixes: severity-banded list with compliance impact chips, working Apply
- ComplianceFixes: framework tabs with score rings, bulk apply per framework
- BulkFixes: operation builder with dry-run mode and execution progress

**Todo List**
1. ResourceFixes: redesign as grouped fix cards + batch select + Apply → agent command
2. SecurityFixes: add severity banding + compliance tags + working Apply Fix
3. ComplianceFixes: add framework tabs + score rings + "Apply All [Framework] Fixes"
4. BulkFixes: add operation builder left/right layout + dry-run toggle + execution progress
5. All: dark theme + `API_BASE_URL + clusterParam`

**Relevant Context**
- All 4 files in `k8s-optimization-platform/frontend/src/pages/AutonomousAI/AutoFixCenter/`

---

### Sub-Task 7 — Frontend: Rollback Center (Deployment/Config/Namespace/Cluster)
**Status:** `[ ] pending`

**Intent**
Redesign all 4 Rollback pages with progressive risk UIs and wire Apply to real agent commands.

**Expected Outcomes**
- DeploymentRollback: deployment selector + version timeline + diff preview
- ConfigurationRollback: two-column ConfigMap/Secret list + snapshot history
- NamespaceRollback: namespace cards with risk indicators + 3-step confirmation
- ClusterRollback: red accent theme + snapshot timeline + "type to confirm" safety gate

**Todo List**
1. DeploymentRollback: deployment selector + horizontal version timeline + "Rollback Now" → agent
2. ConfigurationRollback: two-column layout + snapshot history + Rollback → agent
3. NamespaceRollback: namespace cards with risk chips + 3-step confirmation flow
4. ClusterRollback: red accent DK tokens + multi-step safety gate + "type cluster name" confirm
5. All: dark theme + `API_BASE_URL + clusterParam`

**Relevant Context**
- All 4 files in `k8s-optimization-platform/frontend/src/pages/AutonomousAI/RollbackCenter/`

---

### Sub-Task 8 — Frontend: AI Recommendations (Cost/Performance/Reliability/Security/Compliance)
**Status:** `[ ] pending`

**Intent**
Redesign all 5 AI Recommendation pages with unique purpose-built dashboards and wire Apply buttons.

**Expected Outcomes**
- CostRecommendations: bar chart + recommendation cards sorted by ROI + running total sidebar
- PerformanceRecommendations: performance score ring + 3 categories + urgency badges
- ReliabilityRecommendations: reliability score ring + risk matrix plot + fix-type grouping
- SecurityRecommendations: attack-type grouping + MITRE ATT&CK tags + threat narrative
- ComplianceRecommendations: framework scorecards + audit readiness banner + per-framework apply

**Todo List**
1. CostRecommendations: add bar chart + ROI-sorted cards + savings calculator
2. PerformanceRecommendations: add score ring + urgency badges + 3-category layout
3. ReliabilityRecommendations: add reliability ring + risk matrix + fix-type grouping
4. SecurityRecommendations: add attack-type grouping + MITRE tags (dark theme upgrade)
5. ComplianceRecommendations: add framework scorecards + "Audit Readiness" banner (dark theme upgrade)
6. All: dark theme + `API_BASE_URL + clusterParam` + Apply → agent command

**Relevant Context**
- All 5 files in `k8s-optimization-platform/frontend/src/pages/AutonomousAI/AIRecommendations/`

---

### Sub-Task 9 — Phase 2: LLM Engine + Feedback Loop
**Status:** `[ ] pending`

**Intent**
Add the LLM engine that activates with `OPENAI_API_KEY`. Add feedback endpoint to
measure Phase 1 quality and confirm when to switch.

**Expected Outcomes**
- `_answer_engine()` auto-detects key → routes to `_llm_engine()` → fallback to rules
- LLM receives real cluster data as context → reasons over it
- `POST /copilot/feedback` stores 👍/👎 in Postgres
- Frontend 👍/👎 buttons call feedback endpoint

**Todo List**
1. Add `_llm_engine(query, cluster_data)` in `autonomous_ai.py`
2. Build cluster context prompt from real data
3. Call `openai.AsyncOpenAI().chat.completions.create()` — model: `gpt-4o-mini`, temp: 0.3
4. Add `RateLimitError` / `APIError` fallback to `_rule_based_engine()`
5. Add `POST /copilot/feedback` endpoint + `nlq_feedback` Postgres table
6. Wire frontend 👍/👎 buttons to feedback endpoint

**Relevant Context**
- [`settings.py:46`](k8s-optimization-platform/backend/config/settings.py:46) — `OPENAI_API_KEY`
- [`main.py:166`](k8s-optimization-platform/backend/main.py:166) — `/health/ai` already exists

---

### Sub-Task 10 — Agent + Backend: Wire Rollback Center to Real Cluster
**Status:** `[ ] pending`

**Intent**
The Rollback Center is the most dangerous gap in the entire product. All 4 Rollback pages
currently call `/autonomous-ai/rollback/*` which uses an **in-memory Python list** in
`rollback.py` — it resets on every server restart and never touches the real cluster.
The agent never sees these commands. Nothing actually rolls back.

This sub-task replaces `rollback.py`'s mock pipeline with real `db_manager.enqueue_command()`
calls, and adds the missing `patch_configmap` command to `agent.py`.

**The Problem in Detail**
- `rollback.py` uses `CHANGE_HISTORY = []` (a plain Python list) as fake storage
- Rollback endpoints call `CHANGE_HISTORY.append(...)` — no DB write, no agent command
- The agent (`agent.py`) polls `GET /api/agents/commands/pending` — it never sees rollback requests
- Result: clicking "Rollback Now" on any Rollback page does nothing to the real cluster

**Expected Outcomes**
- `DeploymentRollback` → enqueues `emergency_rollback` command → agent runs real `kubectl rollout undo`
- `ConfigurationRollback` → enqueues `patch_configmap` command → agent applies real ConfigMap patch
- `NamespaceRollback` → enqueues batch `restart_deployment` commands (one per deployment in namespace)
- `ClusterRollback` → enqueues `restart_deployment` × all deployments + reads real snapshot from `get_metrics_history()`
- `rollback.py` no longer uses any in-memory state

**Agent Command Mapping**

| Rollback Page | Agent Command | Status |
|---|---|---|
| DeploymentRollback | `emergency_rollback` | ✅ Already in agent |
| ConfigurationRollback | `patch_configmap` | ⚠️ Must be added to agent |
| NamespaceRollback | `restart_deployment` × N | ✅ Already in agent |
| ClusterRollback | `restart_deployment` × all | ✅ Already in agent |

**Todo List**

*Step 1 — Add `patch_configmap` to `agent.py`*
1. Open `_run_k8s_command()` in `agent.py`
2. Add `elif command == "patch_configmap":` branch
3. Params: `{ namespace, name, data }` — `data` is a dict of key→value pairs to apply
4. Implementation: `core_v1.patch_namespaced_config_map(name, namespace, body)` where body = `{"data": params["data"]}`
5. Return `{"patched": name, "namespace": namespace, "keys_updated": list(params["data"].keys())}`

*Step 2 — Replace `rollback.py` with real agent command enqueuing*
1. Remove `CHANGE_HISTORY = []` and all `.append()` calls
2. `POST /rollback/deployment` → call `db_manager.enqueue_command(cluster, "emergency_rollback", {deployment, namespace, revision})` → return `{command_id}`
3. `POST /rollback/configuration` → call `db_manager.enqueue_command(cluster, "patch_configmap", {name, namespace, data})` → return `{command_id}`
4. `POST /rollback/namespace` → loop all deployments in namespace → enqueue one `restart_deployment` per deployment → return `{command_ids: [...]}`
5. `POST /rollback/cluster` → call `db_manager.get_metrics_history(cluster)` for snapshot list → enqueue `restart_deployment` × all → return `{command_ids: [...]}`
6. `GET /rollback/status/{command_id}` → call `db_manager.get_command(command_id)` → return real status

**Relevant Context**
- [`rollback.py`](k8s-optimization-platform/backend/api/rollback.py) — current in-memory implementation to replace
- [`agent.py`](k8s-optimization-platform/agent/agent.py) — `_run_k8s_command()` where `patch_configmap` branch goes
- [`db.py`](k8s-optimization-platform/backend/database/db.py) — `enqueue_command()`, `get_command()`, `get_metrics_history()`
- [`root_cause.py`](k8s-optimization-platform/backend/api/root_cause.py) — reference: how `POST /fix` enqueues a command today
- [`Incidents.tsx:175`](k8s-optimization-platform/frontend/src/pages/Incidents.tsx:175) — reference: how frontend polls command status

---

## Implementation Order

```
Sub-Task 0   Backend intelligence engine — Phase 1 core
    ↓
Sub-Task 10  Agent: add patch_configmap + replace rollback.py mock pipeline
    ↓
Sub-Task 1   Backend: wire real data to 14 mock endpoints
    ↓  (Sub-Tasks 2–8 can be done in parallel after 0+1+10)
Sub-Task 2   Frontend: NaturalLanguageQueries (conversation UI)
Sub-Task 3   Frontend: AI Copilot — Optimization + Incident
Sub-Task 4   Frontend: Security Advisor (dark theme + apply wire)
Sub-Task 5   Frontend: Autonomous Operations (Manual/Assisted/Autonomous)
Sub-Task 6   Frontend: Auto-Fix Center (Resource/Security/Compliance/Bulk)
Sub-Task 7   Frontend: Rollback Center (Deployment/Config/Namespace/Cluster)
Sub-Task 8   Frontend: AI Recommendations (Cost/Perf/Reliability/Security/Compliance)
    ↓
Sub-Task 9   Phase 2: LLM engine + feedback (when user base grows)
```

---

## Files Touched

### Backend (3 files)
- `k8s-optimization-platform/backend/api/autonomous_ai.py` — Sub-Tasks 0, 1, 9
- `k8s-optimization-platform/backend/api/rollback.py` — Sub-Task 10 (full replacement)
- `k8s-optimization-platform/agent/agent.py` — Sub-Task 10 (add patch_configmap)

### Frontend (20 files)
- `AICopilot/NaturalLanguageQueries.tsx`
- `AICopilot/OptimizationAdvisor.tsx`
- `AICopilot/SecurityAdvisor.tsx`
- `AICopilot/IncidentInvestigator.tsx`
- `AutonomousOperations/ManualMode.tsx`
- `AutonomousOperations/AssistedMode.tsx`
- `AutonomousOperations/AutonomousMode.tsx`
- `AutoFixCenter/ResourceFixes.tsx`
- `AutoFixCenter/SecurityFixes.tsx`
- `AutoFixCenter/ComplianceFixes.tsx`
- `AutoFixCenter/BulkFixes.tsx`
- `RollbackCenter/DeploymentRollback.tsx`
- `RollbackCenter/ConfigurationRollback.tsx`
- `RollbackCenter/NamespaceRollback.tsx`
- `RollbackCenter/ClusterRollback.tsx`
- `AIRecommendations/CostRecommendations.tsx`
- `AIRecommendations/PerformanceRecommendations.tsx`
- `AIRecommendations/ReliabilityRecommendations.tsx`
- `AIRecommendations/SecurityRecommendations.tsx`
- `AIRecommendations/ComplianceRecommendations.tsx`

### No new routes. No new schema migrations.
### Phase 2: add `OPENAI_API_KEY` to `.env` + restart. That's it.
