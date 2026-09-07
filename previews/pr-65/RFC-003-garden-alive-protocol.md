# RFC-003: Garden, Alive Protocol, and Dead-Code Cleanup

**Status**: Proposed — implement from `origin/master`  
**Audience**: A developer starting on `origin/master` who did **not** merge `kaaro/cleanup-paint-sessions`  
**Source branch (reference only)**: `kaaro/cleanup-paint-sessions` @ `ca45d96`  
**Date**: 2026-09-07  
**Depends on**: [PR #64](https://github.com/karx/kaaroViewer/pull/64) for the ontology slice (do not re-implement)  
**Does not depend on**: RFC-001 (skeleton/hydration), RFC-002 (hierarchical ontology) — those are later spikes on the source branch and are not on `master`

---

## 0. Non-negotiable constraint

**Do not merge `kaaro/cleanup-paint-sessions`.**

That branch is a mixed prototype: v3 A-Frame deletion, gardener runtime, ontology, two library mutations, 3.5k lines of untested orchestration, and 18 lines of paint-indicator JS. It is **8 commits ahead / 2 behind** `origin/master`, has **no PR**, a dirty working tree, and a real merge conflict on `pipeline/local-graph.mjs` (master added `kaaro-sessions-platform`; the branch dropped `pkm-engineering-prompt`).

Treat the branch as a **design + prototype archive**. Cherry-pick or re-implement work packages below onto branches cut from current `origin/master`.

---

## 1. Problem

`LIFE.md` on `master` already defines a living system (health mirror → Alone-Time → Dream Loop → generational tags). Phase 1 (nervous system) shipped: `scripts/health-check.mjs`, `.claude/alone-time.md`, `.claude/dream-loop.md`, `library/handoffs/`.

What `master` still lacks:

| Gap | Effect |
|---|---|
| Dead A-Frame/MQTT tree still in the repo | `components/`, `controller/`, `pod_modules/`, `entity-test.html` — unused at runtime, still documented as live |
| No executable gardener | Protocols exist as markdown; there is no orchestrator, lock, checkpoint, gate runner, or queue |
| No persistent work queue / strategy | Alone-Time re-reads `LIFE.md` but has no `STRATEGY.md` or `work-queue.md` on `master` |
| Paint / session UX unfinished | Branch name promised paint-session cleanup; `session-manager.mjs` on master is save/restore drawer only; paint indicator is not in `index.html` |
| Ontology work in flight elsewhere | PR #64 extends Meta-System types/rels and **fixes** the two critical library entries. Duplicating that here will collide |

The source branch proved these are tractable. It did not prove they are mergeable as one PR.

---

## 2. Current state (`origin/master` vs source branch)

### Already on `master` — do not rebuild

- `LIFE.md` phases 1–5 (design)
- `scripts/health-check.mjs` + `pnpm health` / `pnpm health:json`
- `.claude/alone-time.md`, `.claude/dream-loop.md`
- `library/handoffs/genesis.md` + four 2026-06-07 alone-time runs + one dream-loop run
- `IMPROVEMENT_PLAN.md` (canvas/IA/ontology/skill backlog — orthogonal to this RFC)
- `canvas/session-manager.mjs` (manual save/load drawer, ~196 lines)
- Library: 11 JSON entries including `kaaro-sessions-platform`

### Only on the source branch — harvest, do not merge wholesale

| Cluster | Paths | Notes |
|---|---|---|
| Dead-code deletion | `components/`, `controller/`, `pod_modules/`, `entity-test.html` gone; `cleanup.test.mjs` | Safe, isolated, tests exist |
| Gardening docs | `STRATEGY.md`, `library/handoffs/work-queue.md`, `garden-journal.md` | Reset queue to **master** reality; do not copy “T-011 done” |
| Orchestrator v0 | `scripts/alone-time.mjs`, `scripts/dream-loop.mjs`, `scripts/lib/{lock,checkpoint,gates,artifacts,agent-session}.mjs`, `.claude/prompts/alone-time-*.md`, `dream-loop-*.md` | Design is right; needs tests |
| Orchestrator v1 (hardened) | `scripts/alone-time-hardened.mjs` (+22k), `scripts/lib/{llm-gateway,hitl-coordinator,audit-*,context-service}.mjs`, `scripts/scheduler.mjs` | Commit message: **no unit tests**. Do not land first |
| Paint 2a (partial) | 18 lines in `canvas/paint-orchestrator.mjs` + `canvas/paint-indicator.test.mjs` | JS hooks only. **No** `#paint-indicator` in `index.html`, **no** CSS. Tests pass because `testSetup.mjs` injects the DOM |
| Ontology T-011 | validator / SOP / `node-factory.mjs` / `ontology.mjs` | **Owned by PR #64.** Different rel set, and PR #64 **repairs** `pkm-engineering-prompt` instead of deleting it |
| Library extras | `adhd-assistant-bot`, `pkm-system-prompt-engineering-projects`, uncommitted `local-tooling-obsidian-obs` | HITL `/visualize` work. Not this RFC’s code PRs |
| Design spikes | `RFC-001-*.md`, `RFC-002-*.md`, `AGENT_LOOPS_ARCHITECTURE.md`, `docs/orchestration/*`, `IMPLEMENTATION_PLAN.md` | Read as spec; land as their own RFCs later |

### Collision: PR #64

Open: https://github.com/karx/kaaroViewer/pull/64  
Branch: `kaaro/dream-loop/technical-systems-ontology`  
Touches: validator, SOP, `ontology.mjs`, `canvas/node-factory.mjs`, `library/pkm-engineering-prompt.json`, `library/esp-ecosystem.json`, `GENERATIONS.md`, `.gitignore`

**Rule:** ontology + those two library JSON files are out of scope for every WP in this RFC until #64 merges. After it merges, rebase. If #64 is closed without merge, pick up ontology as WP-ONT (appendix).

---

## 3. Design goals

1. **Small PRs, one concern each**, cut from `origin/master` (or from the previous WP in the stack).
2. **Gardener improves machinery, not library JSON.** `VISUALIZE` stays HITL (`STRATEGY.md` rule). Orchestrator may propose; it may not `/visualize` and commit briefs unattended in v0.
3. **Deterministic skeleton, LLM in a pocket.** File I/O, git, locks, gates, checkpoints are Node. Agent sessions are spawned, sandboxed, gated.
4. **No auto-commit in v0** unless `--commit` is passed. Default is dry-run + handoff markdown.
5. **Tests before hardening.** WP-5 (gateway, HITL, audit, scheduler) is blocked on WP-3 tests.
6. **Preserve `kaaro-sessions-platform`** in `pipeline/local-graph.mjs` through every change.

---

## 4. Work packages

Implement in this order unless a note says “parallel”. Each WP is one PR.

### WP-1 — Dead A-Frame / MQTT cleanup

**Why first:** no product behavior, deletes unused tree, unblocks mental load. Prototype + regression tests already exist.

**Delete**

- `components/` (`alongpath.js`, `rain-of-entities.js`, `rain-of-posts.js`, `sky-canvas.js`, `tcgcard.js`, `wikidata-entity.js`)
- `controller/` (`index.html`, `speech-to-text-to-mqtt.js`, `style.css`)
- `pod_modules/` (`await-request.js`, `wiki.js`)
- `entity-test.html`

**Config**

- `vitest.config.mjs` — drop `pod_modules/**` from exclude
- `package.json` — drop `"pod_modules"` from `vitest.exclude`

**Docs** (historical note only, not live instructions)

- `DEVELOPER_GUIDE.md` — mark v3 cleanup; do not keep MQTT controller as a how-to
- `PRODUCT_ROADMAP.md` — drop “test with live MQTT controller”

**Tests** — port `cleanup.test.mjs` from `ca45d96` (directories gone, no `.mjs` imports of those paths, docs only mention artifacts inside an explicit “removed in v3 cleanup” line).

**Gate:** `pnpm test` green. `git grep` for `pod_modules/`, `entity-test.html`, `speech-to-text-to-mqtt` only hits the historical notes.

**Do not take from the source commit `0b86666`:** that commit also adds agent loops, library JSON, validator density change, and paint-indicator. Cherry-pick the **deletes + test + doc notes** only, or re-apply by hand.

**Parallel with:** nothing that edits the same docs. Safe to land while #64 is open.

---

### WP-2 — Gardening protocol on disk

**Why:** Alone-Time on `master` has no queue and no strategy file. Without them the orchestrator has nothing to SELECT from.

**Add (new files on `master`)**

| File | Role |
|---|---|
| `STRATEGY.md` | Mission, pillars, modality split (autonomous vs HITL), heuristics. Source: branch `STRATEGY.md` — trim any “T-011 done” language |
| `library/handoffs/work-queue.md` | Persistent queue + threads + icebox + triage rules |
| `library/handoffs/garden-journal.md` | Append-only weak-signal log. Seed with a short “opened from RFC-003” entry, do **not** dump the whole 2026-06-19 journal as if those tasks ran on this checkout |

**`.gitignore` additions** (source branch already has these; #64 also touches `.gitignore` — rebase)

```
.alone-time.lock
.alone-time-checkpoint.json
.dream-loop.lock
library/handoffs/orchestration-events.jsonl
.claude/skills/visualize/nodes.json
.claude/skills/visualize/edges.json
.claude/skills/visualize/narrative.json
.claude/skills/visualize/encoding-workspace.md
ENCODING_SOP.md.tmp
```

**Queue seed for `master` (do not copy branch statuses blindly)**

After #64, recompute with `pnpm health`. Until then, seed from `master` as of 2026-09-07:

| ID | Type | Modality | Target | Status |
|---|---|---|---|---|
| T-064 | ONTOLOGY_REVIEW | HITL | PR #64 | Waiting on that PR |
| T-002 | VISUALIZE | HITL | `esp-ecosystem` | Waiting (source `.md` still missing unless #64 fully heals it) |
| T-003 | ADDRESS_EVAL | HITL | GitHub `eval` issues | Blocked on `gh auth` |
| T-006 | IMPROVE_PIPELINE | Autonomous | health-check engineering metrics | Waiting |
| T-007 | OPTIMIZE_COMPUTE | Autonomous | causal vs force layout | Waiting |
| T-P2 | IMPROVE_PIPELINE | Autonomous | paint UX 2a–2d | Waiting (this RFC WP-6) |
| T-P3 | IMPROVE_PIPELINE | Autonomous | session auto-save + crash recovery | Waiting (this RFC WP-7) |

**Do not** mark T-001 / T-011 done on a `master` checkout. On `master`, `pkm-engineering-prompt` still exists and is still the critical entry until #64 (or a HITL `/visualize`) lands.

**Gate:** markdown only. No runtime. Human-readable enough that `scripts/lib/artifacts.mjs` (WP-3) can later parse `## Queue` / `## Active Threads`.

---

### WP-3 — Alive protocol v0 (Alone-Time skeleton)

**Goal:** LIFE.md Phase 2 as a **deterministic orchestrator** that launches an agent session, then gates. Not a single LLM call. Not the hardened 22k file.

**Implement (re-write against `master`; use branch as reference, not a dump)**

```
scripts/alone-time.mjs              # CLI: --dry-run (default), --resume, --commit, --human-present
scripts/lib/lock.mjs
scripts/lib/checkpoint.mjs
scripts/lib/gates.mjs               # validator on changed library JSON + pnpm test
scripts/lib/artifacts.mjs           # write handoff, update queue row, append journal
scripts/lib/agent-session.mjs       # spawn harness session; injectable fake in tests
.claude/prompts/alone-time-select.md
.claude/prompts/alone-time-improve_pipeline.md
.claude/prompts/alone-time-monitor.md
.claude/prompts/alone-time-curate_source.md
.claude/prompts/alone-time-detect_ontology_gaps.md
.claude/prompts/alone-time-optimize_compute.md
.claude/prompts/alone-time-synthesize.md
.claude/prompts/alone-time-innovate.md
```

**Phase machine** (from `AGENT_LOOPS_ARCHITECTURE.md` on the source branch)

```
INGEST → SELECT → MUTATE → GATE → (COMMIT if --commit) → HANDOFF
```

- **INGEST:** `node scripts/health-check.mjs --out health.json`; read latest handoff; read `work-queue.md` + `STRATEGY.md`. Tolerate missing `library/handoffs/genesis.md` (source commit `06d5475` — two-line guard; copy that).
- **SELECT:** agent session, **read-only tools**, JSON plan. Must refuse HITL types when `--human-present` is false.
- **MUTATE:** agent session with write tools, scoped to the selected task’s paths. **Forbidden:** committing `library/*.json` from autonomous types.
- **GATE:** `validate-library-json.py` on touched briefs (if any) + `pnpm test`. Fail → write handoff, exit 1, do not commit.
- **COMMIT:** only with `--commit`. One logical commit. Default dry-run prints the would-be commit and writes the handoff anyway.

**npm scripts (v0 only)**

```
"alone-time": "node scripts/alone-time.mjs --dry-run"
"alone-time:commit": "node scripts/alone-time.mjs --commit"
"alone-time:resume": "node scripts/alone-time.mjs --resume --dry-run"
```

Do **not** wire `alone-time` to `alone-time-hardened.mjs` yet.

**Tests (mandatory — this is why v0 is separate from the prototype)**

| Case | File |
|---|---|
| lock: second acquire fails; force-release works | `scripts/lib/lock.test.mjs` |
| checkpoint: save/load/clear round-trip; resume mid-phase | `scripts/lib/checkpoint.test.mjs` |
| gates: mock validator exit 2 → `passed: false`; exit 0 + tests pass → true | `scripts/lib/gates.test.mjs` |
| SELECT skips HITL when human absent | `scripts/alone-time.test.mjs` |
| dry-run never calls `git commit` | `scripts/alone-time.test.mjs` |
| MUTATE that touches `library/*.json` on an autonomous task is rejected | `scripts/alone-time.test.mjs` |

**Reference, do not copy blindly:** `scripts/alone-time.mjs` @ `0b86666` is the right shape; `scripts/alone-time-hardened.mjs` @ `ad54cde` is the wrong first PR.

**Harness:** keep `agent-session.mjs` behind an interface (`runAgentSession(opts) → { stdout, parsed }`) so tests inject a stub. Do not hard-require a live `pi` / Claude / Grok binary to run `pnpm test`.

---

### WP-4 — Dream Loop v0

**Blocked on:** WP-3 (shared lock/checkpoint/gates/artifacts) and, for real ontology applies, PR #64.

**Add**

- `scripts/dream-loop.mjs` — `--dry-run` (default), `--propose-only`, `--apply` (HITL-equivalent; requires `--approve` or `--commit`)
- `.claude/prompts/dream-loop-propose.md`, `dream-loop-analyze.md`, `dream-loop-apply.md`
- `GENERATIONS.md` — **only if #64 has not already added it**. If #64 merged, append; do not fork the ledger.

**Trigger (from `LIFE.md`):** 3× same unresolved signal in handoffs, or a type/rel used in evals/warnings that is absent from `VALID_TYPES` / `VALID_RELS`.

**Invariant:** apply path must update validator + SOP + renderer in the same commit, or abort. This is already a `CLAUDE.md` rule; the orchestrator enforces it by diffing those three paths.

**Tests:** propose-only writes `.claude/proposals/…` and does not touch validator; apply without approval no-ops; apply with approval refuses if only one of the three ontology files changed.

**npm:** `"dream-loop": "node scripts/dream-loop.mjs --dry-run"`

---

### WP-5 — Hardening (gateway, HITL, audit, scheduler)

**Blocked on:** WP-3 tests green and at least one dry-run documented in a handoff.

Source commit `ad54cde` (+3511 / 12 files) is the prototype. Re-implement with tests; do not drop the file in.

**Modules**

| Module | Job | First tests |
|---|---|---|
| `scripts/lib/llm-gateway.mjs` | Timeouts, retries, tiered model fallback | timeout fires; fallback on 5xx; no fallback on 4xx |
| `scripts/lib/hitl-coordinator.mjs` | Presence flag, handoff of HITL tasks, status | `start/stop/status` without a human is a no-op skip |
| `scripts/lib/audit-bus.mjs` + query/export | JSONL events, gitignored path | emit → query by `runId` |
| `scripts/lib/context-service.mjs` | Bundle health + queue + strategy + last N journal lines | missing file → empty, not throw |
| `scripts/scheduler.mjs` | Cron + queue-pressure + single-flight via lock | overlapping tick is a no-op |

Phase timeouts from the prototype (keep unless measured otherwise):

| Phase | Timeout |
|---|---|
| INGEST | 30s |
| SELECT | 3 min |
| MUTATE | 10 min |
| GATE | 3 min |
| COMMIT | 1 min |

**Then** point `pnpm alone-time` at the hardened entry, keep `scripts/alone-time.mjs` as the thin CLI or delete it in the same PR if the hardened file fully subsumes it.

**Do not ship scheduler-on-by-default.** `pnpm scheduler:start` is explicit. No GitHub Action cron in this WP.

---

### WP-6 — Paint UX (the named work of the source branch)

Source branch delivered **2a JS only**, incomplete. Spec is `IMPLEMENTATION_PLAN.md` on the source branch (Phase 2). Port that spec onto `master`; do not treat the 18-line hook as done.

#### 6a. Progress indicator (finish 2a)

- Add `#paint-indicator` + `#paint-indicator-label` to `index.html` near `#paint-hud-btn`
- CSS: `.paint-indicator`, spinner keyframe, amber `#ffaa00`, `.hidden`
- Keep/port `_showPaintIndicator` / `_hidePaintIndicator` in `canvas/paint-orchestrator.mjs` (show before `generateScene`, `finally` hide)
- Port `canvas/paint-indicator.test.mjs`; extend `index.html` presence assertion so tests fail if the real DOM is missing (today they only see `testSetup.mjs`)

#### 6b. Generation queue

- In-memory `_paintQueue[]` + `_isPainting`. Tab close aborts (no persist).
- P while painting enqueues. Failure skips item, notifies, continues.
- Indicator: `generating (2 queued)…`
- Tests: sequential order, skip-on-fail, queue cleared on unload.

#### 6c. Layer undo / redo window

- `_paintHistory[]` / `_redoStack[]` in `scene-painter.mjs`
- `U` undo (fade ~625ms), `Ctrl+U` redo during ~1s window
- Move strategy cycle off `Shift+P` onto `Ctrl+P` (decision already locked in the plan)
- HUD: UNDO / REDO when stacks non-empty

#### 6d. Thumbnail strip

- New `canvas/paint-strip.mjs`, left edge, 80px, collapse arrow
- Wire add/remove/redo/clear into orchestrator + session load

**6a is its own PR if needed.** 6b–6d can stack on 6a. Independent of WP-3.

---

### WP-7 — Session persistence

Spec: `IMPLEMENTATION_PLAN.md` Phase 3 on the source branch. `canvas/session-manager.mjs` on `master` already does manual drawer save/load. Extend it; do not replace.

| Slice | Behavior |
|---|---|
| 7a Auto-save | 60s timer → IndexedDB id `__auto__`, skip empty graph, toggle in settings (`kv.autoSave`), hidden from drawer |
| 7b Crash recovery | `beforeunload` → `__draft__` (never the same id as `__auto__`). Startup banner RESTORE / DISCARD. Delete draft only after successful restore |
| 7c Full state | Persist `nodeStates`, `pinned`, `overlayMode`, `cameraLocked`, `causalLayout`, `expandedQids` — requires small exports from `main.mjs` |

Tests for timer skip/empty, drawer exclusion, restore-failure leaves draft.

Independent of WP-3. Natural follow-on to WP-6 because paint layers should round-trip through `__auto__` / `__draft__`.

---

### WP-8 — Health-check engineering metrics (T-006)

`scripts/health-check.mjs` on `master` already scores library entries. Add reducible-core metrics the gardener can trend:

- test duration (from last `pnpm test` or a timed self-run behind `--full`)
- bundle / script weight of the static app (no bundler — sum of served `.mjs` + `index.html` + `style.css` is enough)
- coverage only if `pnpm test:coverage` is already wired; do not make coverage a gate in this WP

Source branch touched this file by 8 lines — re-read that diff, do not assume it is complete.

---

### WP-9 — Library HITL (not autonomous)

After #64 and WP-2, a human runs `/visualize` for anything still `critical` / `degraded`. This RFC does **not** encode those in the gardener PRs.

Known leftovers from the source working tree (uncommitted, **do not sneak onto a cleanup PR**):

- `library/local-tooling-obsidian-obs.{md,json,retrospective.md}` + `pipeline/local-graph.mjs` registration
- `library/mcc-intelligence-2026.json` (unregistered)
- `library/adhd-assistant-bot.json` (on the source branch only)

Each is a separate `/visualize` + validator exit 0 + LIBRARY registration. Preserve `kaaro-sessions-platform` when editing `local-graph.mjs`.

---

## 5. Suggested PR stack (from `origin/master`)

```
origin/master
 ├─ wp1/dead-aframe-mqtt          WP-1
 ├─ wp2/gardening-docs            WP-2   (rebase if #64 merged — .gitignore)
 │    └─ wp3/alone-time-v0        WP-3
 │         ├─ wp4/dream-loop-v0   WP-4
 │         └─ wp5/orch-hardening  WP-5   (after WP-3 tests)
 ├─ wp6a/paint-indicator          WP-6a  (parallel after master)
 │    └─ wp6b-d/paint-ux          WP-6b–d
 └─ wp7/session-persistence       WP-7   (parallel; nicer after 6a)
```

WP-8 can sit on WP-2 or WP-3. WP-9 is HITL, not stacked.

Branch names are suggestions. Keep them boring and one-concern.

---

## 6. Quality gates (every WP)

Copied from `CLAUDE.md` / `LIFE.md` / `STRATEGY.md`; they apply on `master` today.

- `pnpm test` — currently 168 on `master`; do not land a WP that drops that
- Library JSON: `python3 .claude/hooks/validate-library-json.py library/{id}.json` exit 0 before any brief commit
- Ontology: validator + SOP + renderer in one commit, or not at all (WP-4 / #64 only)
- One concern per commit
- New orchestrator / paint / session code ships with tests in the same PR
- No secrets, no lock/checkpoint/event-log files

---

## 7. Explicitly out of scope

| Item | Why |
|---|---|
| Merge of `kaaro/cleanup-paint-sessions` | Kitchen-sink, conflicts, overlaps #64 |
| Meta-System `VALID_TYPES` / `VALID_RELS` | PR #64 |
| Repair or deletion of `pkm-engineering-prompt` | PR #64 repairs; source branch deleted. Do not fork that policy |
| RFC-001 skeleton+hydration encoder | Separate spike |
| RFC-002 hierarchical ontology | Separate spike |
| In-browser `visualize-pipeline.mjs` | Icebox in the source `work-queue.md` |
| WebXR, analytics ingestion, chrome-extension, Discord | Other branches |
| Enabling nightly cron in CI | WP-5 ships the scheduler; ops enablement is a later decision |
| Auto-`/visualize` without a human | Violates gardener modality |

---

## 8. Reference map (for implementers)

All SHAs are on `origin/kaaro/cleanup-paint-sessions` unless noted.

| Need | Read |
|---|---|
| Why not merge | this RFC §0–§2; merge-tree conflict is `pipeline/local-graph.mjs` vs `origin/master` |
| Dead-code list + test | `cleanup.test.mjs`; commit `0b86666` **deletes only** |
| Strategy / modality | `STRATEGY.md` |
| Queue format + icebox (paint/session/legacy) | `library/handoffs/work-queue.md` (use as template, restatues) |
| Orchestrator shape | `AGENT_LOOPS_ARCHITECTURE.md`; `scripts/alone-time.mjs` |
| Hardening design | `docs/orchestration/EXECUTION_ORCHESTRATION.md`; `docs/orchestration/AGENT_HARNESS_MODEL_REQUIREMENTS.md` |
| Hardening prototype (tests missing) | `ad54cde` |
| Missing `genesis.md` guard | `06d5475` |
| Paint/session locked decisions | `IMPLEMENTATION_PLAN.md` |
| Paint 2a incomplete hook | `canvas/paint-orchestrator.mjs` + `canvas/paint-indicator.test.mjs` @ `0b86666` |
| LIFE phases | `LIFE.md` on **master** (source of truth for protocol; this RFC is the build plan) |
| Ontology (do not copy) | PR #64 |

---

## 9. Success

This RFC is done when, on a tree descended from `origin/master` (plus #64 if merged):

1. A-Frame / MQTT / `pod_modules` / `entity-test.html` are gone and `cleanup.test.mjs` enforces it.
2. `STRATEGY.md` + `work-queue.md` + `garden-journal.md` exist and match `master`’s actual library health.
3. `pnpm alone-time` dry-runs INGEST→SELECT→HANDOFF with stubbed agent, no git commit, tests covering lock/checkpoint/gates/HITL-skip.
4. Paint indicator is visible in the real `index.html` path, not only in the test DOM.
5. Session auto-save + crash-recovery exist behind tests.
6. No PR in this stack has re-implemented PR #64’s ontology or clobbered `kaaro-sessions-platform`.

The system is **not** “alive” yet at WP-1. It becomes alive at WP-3 dry-run + WP-4 propose-only. Hardening (WP-5) is what makes it runnable unattended.

---

## 10. Decision

| Option | Description |
|---|---|
| **A (recommended)** | Execute WP-1 → WP-7 as the stack in §5. Coordinate ontology with #64. |
| **B** | WP-1 + WP-6a only (cleanup + visible paint indicator). Defer gardener to a later RFC. |
| **C** | Merge/cherry-pick `ca45d96` as-is. **Reject.** |

**Recommendation: A.** The source branch already paid for the design; `master` should receive it as reviewable PRs, not as one 12k-line dump.

---

*Handover from branch review of `kaaro/cleanup-paint-sessions` @ `ca45d96`. Implementers cut from `origin/master`.*
