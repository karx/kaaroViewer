# Work Queue — Alone-Time Gardener

> Persistent task queue surviving across runs. Gardener reads this before selecting work, updates it after every run.
> Format: Markdown for human auditability. Machine parses `## Queue` and `## Active Threads` sections.

---

## Queue

*Ordered by priority. Gardener picks top unblocked **Autonomous** task each run. **Modality** determines who can execute.*

| Priority | Task ID | Type | Modality | Target | Description | Status | Added | Source |
|---|---|---|---|---|---|---|---|---|
| 1 | T-001 | VISUALIZE | 👤 HITL | pkm-engineering-prompt | Human runs `/visualize library/pkm-engineering-seed.md` — fix cross-refs, types, rels, tone, density | ✅ Done | 2026-06-19 | health.json |
| 2 | T-002 | VISUALIZE | 👤 HITL | esp-ecosystem | Human runs `/visualize` — needs source .md (original: kaaroBrain `2 Resources/Hardware/ESP/README.md`) | ⚪ Waiting | 2026-06-16 | health.json |
| 3 | T-003 | ADDRESS_EVAL | 👤 HITL | — | gh CLI auth needed — eval polling unavailable | ⚪ Blocked | 2026-06-16 | health.json |
| 4 | T-004 | IMPROVE_PIPELINE | 🤖 Autonomous | validator density gate | Add density ≥2.0 pre-check to `/visualize` skill — prevents low-density commits | ✅ Done | 2026-06-17 | STRATEGY.md |
| 5 | T-005 | DETECT_ONTOLOGY_GAPS | 🤖 Autonomous | type/rel gaps | Scan last 10 handoffs + validator warnings → propose missing types (framework, prompt, process, system, tool) + rels (enforces, transforms, creates, maps_to, visualizes, renders) | ✅ Done | 2026-06-19 | STRATEGY.md |
| 11 | T-011 | DREAM_LOOP | 🤖 Autonomous | ontology extension | Atomic update: added 5 types (framework, prompt, process, hardware, tool, system) + 11 rels (enforces, transforms, creates, maps_to, visualizes, renders, underpins, supports, updates, simplifies, describes) to VALID_TYPES/VALID_RELS, updated SOP + renderer | ✅ Done | 2026-06-19 | T-005 proposal |
| 6 | T-006 | IMPROVE_PIPELINE | 🤖 Autonomous | health-check metrics | Add engineering metrics (bundle size, test duration, coverage) to health.json | ⚪ Waiting | 2026-06-16 | STRATEGY.md |
| 7 | T-007 | OPTIMIZE_COMPUTE | 🤖 Autonomous | graph layout | Evaluate causal layout vs force-directed for brief rendering — prototype in canvas/ | ⚪ Waiting | 2026-06-17 | STRATEGY.md |
| 8 | T-008 | SYNTHESIZE | 🤖 Autonomous | esports domain | aoe-2-redbull + future esports entries → shared `tournament`, `player`, `venue` cluster | ⚪ Waiting | 2026-06-07 | Dream Loop signal |
| 9 | T-009 | REFINE_SOP | 🤖 Autonomous | reveals prohibition | SOP already updated; verify encoder compliance on next 3 runs | 🟢 Monitoring | 2026-06-07 | Dream Loop run-1 |
| 10 | T-010 | CURATE_SOURCE | 🤖 Autonomous | esp-ecosystem source | Locate/create source .md for esp-ecosystem (was kaaroBrain `2 Resources/Hardware/ESP/README.md`) | 🟡 Ready | 2026-06-17 | T-002 dependency |

---

## Active Threads

*Multi-step efforts in progress. Each thread tracks its own context across runs.*

### Thread: Θ-001 — Library Critical Repair Sprint (HITL-Driven)
- **Goal:** All 11 entries at `ok` (validator exit 0, density ≥ 2.0, proper climax)
- **Started:** 2026-06-16
- **Steps:**
  1. [ ] T-010: CURATE_SOURCE esp-ecosystem source (Autonomous) — unblocks T-002
  2. [ ] T-001: VISUALIZE pkm-engineering-prompt (HITL) — human runs `/visualize`
  3. [ ] T-002: VISUALIZE esp-ecosystem (HITL) — human runs `/visualize`
  4. [ ] Verify all 11 entries `ok` via health-check (Autonomous MONITOR)
- **Context refs:** health.json (2026-06-16), STRATEGY.md Pillar 1, alone-time-2026-06-17-briefing.md
- **Blocker:** Human sessions for VISUALIZE; esp-ecosystem source missing
- **Next action:** Human runs T-001; Gardener runs T-010 + T-004 + T-005

### Thread: Θ-002 — Eval Signal Activation
- **Goal:** gh CLI authenticated, eval issues flowing into health.json
- **Started:** 2026-06-16
- **Steps:**
  1. [ ] `gh auth login` (requires human)
  2. [ ] Verify health-check.mjs parses eval issues correctly
  3. [ ] Process any existing eval issues (rating ≤2 → ADDRESS_EVAL tasks)
- **Context refs:** health.json evals.available=false
- **Blocker:** Human auth required
- **Next action:** Flag for human

### Thread: Θ-003 — Pipeline & Ontology Hardening (Autonomous)
- **Goal:** Prevent future critical entries by improving machinery
- **Started:** 2026-06-17
- **Steps:**
  1. [x] T-004: IMPROVE_PIPELINE — density gate in `/visualize` skill
  2. [ ] T-005: DETECT_ONTOLOGY_GAPS — scan handoffs, propose types/rels for Dream Loop
  3. [ ] T-006: IMPROVE_PIPELINE — engineering metrics in health-check
  4. [ ] T-007: OPTIMIZE_COMPUTE — causal layout prototype
- **Context refs:** STRATEGY.md Autonomous task types, Dream Loop signal
- **Blocker:** None
- **Next action:** Gardener picks T-004 on next autonomous run

---

## Completed Log

*Finished tasks with outcomes. Gardener appends after each run.*

| Date | Task ID | Type | Target | Outcome | Handoff Ref |
|---|---|---|---|---|---|
| 2026-06-17 | T-004 | IMPROVE_PIPELINE | validator density gate | Validator now warns at density <2.0 (was 1.5); both critical entries now flagged | this run |
| 2026-06-07 | — | REPAIR | aoe-2-redbull-april-2026 | density 1.40→2.50, validator 1→0, climax 3→1 | alone-time-2026-06-07.md |
| 2026-06-07 | — | REPAIR | poker-tooling-2026 | density 1.32→2.10, validator 1→0, temporal chain added | alone-time-2026-06-07-run2.md |
| 2026-06-07 | — | REPAIR | gig-worker-projects | density 1.78→2.41, validator 1→0, climax 2→1 | alone-time-2026-06-07-run3.md |
| 2026-06-07 | — | REPAIR | kaaro-viewer | nodes 7→22, density 1.71→2.09, full architecture encoded | alone-time-2026-06-07-run4.md |
| 2026-06-19 | T-001 | VISUALIZE | pkm-engineering-prompt | Created pkm-system-prompt-engineering-projects.json — 20 nodes, 53 edges, density 2.65, 10 beats, 7 insights, validator ✅ | this run |
| 2026-06-19 | T-005 | DETECT_ONTOLOGY_GAPS | type/rel gaps | Proposed 10 Tier 1 additions (5 types, 5 rels) + Meta-System profile → .claude/proposals/ontology-gaps.md | this run |
| 2026-06-19 | T-011 | DREAM_LOOP | ontology extension | Atomic update: 6 types (framework, prompt, process, hardware, tool, system) + 11 rels (enforces, transforms, creates, maps_to, visualizes, renders, underpins, supports, updates, simplifies, describes) across VALID_TYPES/VALID_RELS + SOP + renderer | this run |
| 2026-06-07 | — | DREAM_LOOP | ontology (reveals) | `reveals` promoted warning→error; SOP updated; all 9 entries pass | dream-loop-2026-06-07.md |

---

## Icebox / Deferred

*Parked ideas with context. Review every 5 runs or Dream Loop.*

| Item | Type | Context | Why Deferred |
|---|---|---|---|
| Paint UX: progress indicator, queue, undo, thumbnails | IMPROVE_PIPELINE | From IMPLEMENTATION_PLAN.md Phase 2 | Library integrity first (Pillar 1) |
| Session persistence: auto-save, crash recovery, full state | IMPROVE_PIPELINE | From IMPLEMENTATION_PLAN.md Phase 3 | Not blocking quality gates |
| Markdown→Library pipeline (visualize-pipeline.mjs) | IMPROVE_PIPELINE | From IMPLEMENTATION_PLAN.md Phase 4 | /visualize skill works; in-browser not urgent |
| Legacy cleanup: components/, controller/, pod_modules/ | REPAIR_PIPELINE | From IMPLEMENTATION_PLAN.md Phase 1a | Tests pass; no runtime impact |
| WebXR / VR canvas support | INNOVATE | Product roadmap | No source doc; no eval demand |
| Analytics ingestion (product metrics) | IMPROVE_PIPELINE | STRATEGY.md Signal Completeness | No endpoint; defer to Phase 2 |

---

## Gardener's Note — From IMPLEMENTATION_PLAN.md

> *Captured 2026-06-16 during STRATEGY.md scaffolding. These are repo gardening tasks (tech debt, UX, features) that don't directly serve Pillar 1 (Library Integrity) but matter for long-term product health. They live in Icebox until Pillars 1–3 are stable.*

### Phase 1: Legacy Cleanup (Deferred)
**Files to delete when safe:**
- `components/` — entire directory (6 A-Frame files)
- `controller/` — entire directory (3 files)
- `pod_modules/` — entire directory (2 files)
- `entity-test.html` — only consumer of components/

**Config cleanup:**
- `vitest.config.mjs` — remove `'pod_modules/**'` from exclude array
- `package.json` — remove `"pod_modules"` from vitest.exclude

**Doc references to update:**
- `DEVELOPER_GUIDE.md` — note removal in v3 cleanup
- `PRODUCT_ROADMAP.md` — remove MQTT controller references

**Gate:** All 168 tests pass after deletion. Zero runtime references remain.

---

### Phase 2: Scene Painter UX (Deferred)
**2a. Inline Paint Progress Indicator**
- HTML: spinner + status in `#paint-hud`
- CSS: `.paint-indicator` flex, amber `#ffaa00`, `paint-spin` keyframe
- JS hooks in `paint-orchestrator.mjs`: show/update/hide in `_executePaint()`

**2b. Generation Queue**
- `_paintQueue[]` + `_isPainting` gate
- P press while painting → enqueue; dequeue after complete
- Indicator: `"generating (2 queued)…"`

**2c. Layer Undo**
- `_paintHistory[]` in scene-painter.mjs
- `removeLastPaint()` — pop UUID, fade mesh, remove localStorage
- `Shift+P` → strategy cycle; `U` key for undo
- HUD button: `◆ UNDO LAYER`

**2d. Layer Preview Thumbnails**
- `#paint-strip` vertical side strip
- New `canvas/paint-strip.mjs` — add/remove/clear previews
- 64×36 canvas thumbnails with amber border

---

### Phase 3: Session Persistence (Deferred)
**3a. Auto-Save (Periodic Timer)**
- 60s interval in `session-manager.mjs`
- Skips if graph empty; saves as `"__auto__"` with `_auto: true`
- Prune to 3 most recent auto-saves

**3b. Crash Recovery**
- `beforeunload` → save `"__draft__"` session
- Startup: detect draft → amber banner with RESTORE/DISCARD
- `#crash-recovery-banner` in index.html

**3c. Full State Recovery**
Persist & restore: `nodeStates`, `pinned`, `overlayMode`, `cameraLocked`, `causalLayout`, `expandedQids`
Exports needed in main.mjs: `getPinnedQids()`, `getOverlayMode()`, `getExpandedQids()`

---

### Phase 4: Markdown → Library JSON (Deferred)
**Files to create:**
- `pipeline/visualize-pipeline.mjs` — entry point
- `pipeline/visualize-schema.mjs` — port VALID_TYPES/RELS/TIERS from Python validator
- `pipeline/visualize-validator.mjs` — JS cross-reference validator

**Flow:** markdown → Pass 1 (entities) → Pass 2 (relations, density ≥2.0 gate) → Pass 3 (narrative) → validate → write library JSON → register in local-graph.mjs → Python validator gate

---

## Triage Rules (Gardener Applies Each Run)

1. **New eval rating ≤2** → Insert at Priority 1 as ADDRESS_EVAL (**HITL**)
2. **New .md in library/ unencoded** → Insert at Priority 5 as CURATE_SOURCE (**Autonomous**) → human VISUALIZE later
3. **Same Dream Loop signal 3×** → Insert at Priority 2 as DREAM_LOOP trigger (**Autonomous DETECT_ONTOLOGY_GAPS**)
4. **Health check reveals new critical** → Insert at Priority 1 as VISUALIZE (**HITL**) + CURATE_SOURCE if no source
5. **Validator warning pattern 3× across entries** → Insert as DETECT_ONTOLOGY_GAPS (**Autonomous**)
6. **Thread completes** → Move to Completed Log, unblock dependent tasks
7. **Thread blocked 2× runs** → Move to Icebox, flag for human/Dream Loop

---

*Gardener: Update this file after every run. Human may edit anytime.*