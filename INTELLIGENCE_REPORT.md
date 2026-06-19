# kaaroViewer — Intelligence Report: System Operations & Interactions

> **Classification:** Living System Architecture — Operational Specification  
> **Generated:** 2026-06-17  
> **Authority:** STRATEGY.md + LIFE.md + .claude protocols + handoff history  
> **Purpose:** Single source of truth for how this system breathes, decides, mutates, and evolves.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        kaaroViewer LIVING SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│   │   HUMAN      │    │  ALONE-TIME  │    │  DREAM LOOP  │    │ GENERATION││
│   │  (Operator)  │◄───│ (Machinery   │◄───│ (Meta-Agent) │◄───│ (Version)│ │
│   │              │    │  Improver)   │    │              │    │          │ │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └────┬─────┘  │
│          │                   │                   │                   │        │
│          ▼                   ▼                   ▼                   ▼        │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │                    SHARED SUBSTRATE                                    │   │
│   │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│   │  │ Library │ │ Handoffs │ │ Work Q   │ │ Journal  │ │ STRATEGY   │  │   │
│   │  │ (JSON)  │ │ (Memory) │ │ (Intent) │ │ (Signals)│ │ (Compass)  │  │   │
│   │  └─────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘  │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│              ▲                    ▲                    ▲                    │
│              │                    │                    │                    │
│   ┌──────────┴────────────────────┴────────────────────┴────────────────┐   │
│   │                      IMMUNE SYSTEM (Validator + Tests)                │   │
│   │  .claude/hooks/validate-library-json.py  +  pnpm test (168)           │   │
│   └───────────────────────────────────────────────────────────────────────┘   │
│                                    ▲                                          │
│                                    │                                          │
│   ┌────────────────────────────────┴───────────────────────────────────────┐ │
│   │                         REDUCIBLE CORE (Deterministic)                  │ │
│   │  Three.js renderer • Graph layout • Brief schema • Vitest suite        │ │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Core Loop:** `Health Check → Alone-Time → Handoff → (Dream Loop) → Generation`

**Key Architectural Distinction:**
- **Human (Operator)** runs `/visualize` — the *only* way to produce/modify `library/*.json`
- **Alone-Time (Machinery Improver)** improves the *pipeline, ontology, compute* — never touches library JSON directly
- **Dream Loop (Meta-Agent)** proposes ontology extensions from accumulated signals
- **Generation** = atomic schema version bump after human approval

---

## 2. Interaction Taxonomy

### 2.1 Human ↔ System Interactions (HITL Only)

| Interaction | Trigger | Human Action | System Response | Artifacts Modified |
|---|---|---|---|---|
| **VISUALIZE** | Human session + source .md | Runs `/visualize skill` with gap targets | Validates, commits library JSON + retrospective | `library/*.json`, `library/*-retrospective.md`, `pipeline/local-graph.mjs` |
| **ADDRESS_EVAL** | Eval rating ≤2 | Reads eval, runs `/visualize` targeted fix | Commits fixed entry | `library/*.json`, `work-queue.md` |
| **ONTOLOGY_REVIEW** | Dream Loop proposes | Judges semantic fit, commits atomic update | Validator + SOP + renderer updated together | `.claude/hooks/validate-*.py`, `sop-reference.md`, `canvas/` |
| **STRATEGIC_STEER** | Anytime | Edits `STRATEGY.md` | Gardener reads on next ingest | `STRATEGY.md` |
| **SOURCE_CURATION** | Anytime | Drops `*.md` in `library/`, describes domain | Gardener queues CURATE_SOURCE → human VISUALIZE later | `library/*.md`, `work-queue.md` |
| **Emergency Brake** | Any run | `git revert` or manual fix | Loop pauses, human resolves | Any |

### 2.2 Alone-Time ↔ System Interactions (Autonomous Only)

| Phase | Input Reads | Decisions | Output Writes | Gate |
|---|---|---|---|---|
| **INGEST** | `health.json`, latest handoff, `work-queue.md`, `STRATEGY.md`, `garden-journal.md` | Build situational awareness; detect human presence | Internal context | — |
| **SELECT** | Work queue (priority), health scores, thread status, **modality filter**, human_present flag | Pick top unblocked **Autonomous** task; skip all HITL | Task assignment | — |
| **MUTATE** | Code/docs/config (never library JSON) | **IMPROVE_PIPELINE**, **DETECT_ONTOLOGY_GAPS**, **OPTIMIZE_COMPUTE**, **INNOVATE**, **SYNTHESIZE** (read-only), **MONITOR**, **CURATE_SOURCE** | Pipeline code, validator config, SOP proposals, layout prototypes, analysis docs | — |
| **GATE** | Validator + test suite (on pipeline changes) | Pass = commit, Fail = record blocker | Gate result | **Blocking** |
| **COMMIT** | Gate pass | `git add` + commit message | Git history (pipeline/ docs/ config/) | — |
| **HANDOFF** | Full run context | Write structured markdown | `alone-time-YYYY-MM-DD.md` | — |
| **QUEUE UPDATE** | Task outcome | Mark complete, unblock deps, add learnings | `work-queue.md` | — |
| **JOURNAL** | Observations, patterns, hunches | Append dated entry | `garden-journal.md` | — |

**Critical Invariant:** Alone-Time **never writes** `library/*.json`. It only improves the machinery that the human operates via `/visualize`.

### 2.2b Modality-Aware Selection Logic

```
FUNCTION select_task(health, queue, threads, strategy, human_present):
    # 1. Critical evals → HITL only (defer if human absent)
    IF exists eval rating ≤2 AND actionable:
        IF human_present:
            RETURN ADDRESS_EVAL(eval_issue)  # HITL
        ELSE:
            LOG "eval waiting for human"     # defer
            CONTINUE to autonomous work
    
    # 2. Critical library entries → signal for HUMAN VISUALIZE (not autonomous repair)
    FOR entry IN health.library SORT BY degradationScore DESC:
        IF entry.health.status IN ['critical', 'degraded']:
            IF human_present:
                RETURN VISUALIZE(entry.id)  # HITL — human runs /visualize
            ELSE:
                LOG "critical entry waiting for human VISUALIZE"
                CONTINUE to autonomous work
    
    # 3. Queue priority — RESPECT MODALITY
    FOR task IN queue WHERE status == 'Ready' AND NOT task.blocked:
        IF task.modality == 'HITL' AND NOT human_present:
            CONTINUE  # skip HITL when human absent
        RETURN task  # first Autonomous task
    
    # 4. Autonomous opportunity detection
    #    a) Pipeline bugs blocking quality
    IF health.has_validator_bug OR health.has_test_flake:
        RETURN IMPROVE_PIPELINE
    
    #    b) Ontology gaps named 3× across handoffs
    IF ontology_gap_count ≥ 3:
        RETURN DETECT_ONTOLOGY_GAPS
    
    #    c) Compute optimization opportunity
    IF layout_perf_regression OR bundle_size_increase:
        RETURN OPTIMIZE_COMPUTE
    
    #    d) Synthesis (read-only analysis)
    IF strategy.pillar[4] active AND domain_cluster ≥3 AND no synthesis in 10 runs:
        RETURN SYNTHESIZE(domain)
    
    # 5. Idle — no autonomous work
    IF human_present AND queue.has_HITL:
        RETURN WAIT_FOR_HUMAN
    RETURN IDLE  # writes journal observation
```

### 2.3 Dream Loop ↔ System Interactions (Meta-Autonomous)

| Phase | Input Reads | Analysis | Output Writes | Gate |
|---|---|---|---|---|
| **META-INGEST** | Last 5–10 handoffs + `genesis.md` + `garden-journal.md` | Identify recurring signals | Pattern catalog | — |
| **PATTERN ANALYSIS** | Pattern catalog | Classify: encoder habit / missing ontology / SOP blind spot / compression / stagnation | Root cause docs | — |
| **PROPOSE CHANGES** | Root causes | Draft ontology/SOP/renderer deltas | Change proposals (types, rels, SOP, renderer) | — |
| **ATOMIC UPDATE** | Proposals | Edit 3 artifacts together (requires human ONTOLOGY_REVIEW) | Validator, SOP, Renderer | — |
| **GATE** | All library entries + test suite | Zero regressions required | Pass/Fail | **Blocking** |
| **CONSOLIDATE** | Change summary | Prune handoffs, update `GENERATIONS.md` | Clean context | — |
| **HANDOFF** | Full meta-run context | Write `dream-loop-YYYY-MM-DD.md` | Handoff doc | — |

### 2.4 System ↔ System Interactions (Automated)

| Flow | Frequency | Producer | Consumer | Channel |
|---|---|---|---|---|
| Health Report | Before each Alone-Time | `health-check.mjs` | Alone-Time agent | `health.json` (stdout/file) |
| Eval Polling | Each health check | GitHub API | `health-check.mjs` | `gh issue list --label eval` |
| Test Suite | Each gate | `pnpm test` | Gate logic | Exit code + JSON reporter |
| Validator | Each gate + commit hook | Python validator | Gate logic / Claude settings | Exit code + ANSI output |
| Library Registration | Each VISUALIZE | `/visualize` skill | `pipeline/local-graph.mjs` | `LIBRARY` array append |
| Git Hook | Post-write | Claude Code settings | Validator | `settings.json` → stdin |

---

## 3. Data Flow Architecture

### 3.1 Primary Data Objects

```
Library Entry (library/{id}.json)  ← ONLY written by /visualize (HITL)
├── meta              — identity, domain, tone, tags
├── report_card       — summary, spine, protagonists, antagonists, themes
├── story[]           — beats (7–12, exactly 1 climax)
├── insights[]        — 4–7 items, ≥1 warning + ≥1 finding
├── clusters[]        — semantic groups with colors
├── nodes[]           — entities (typed, tiered, sentimented)
└── edges[]           — relationships (typed, weighted, directed)

Health Report (health.json)
├── generated         — date
├── systemTests       — pass/fail/total
├── evals             — available, openCount
├── counts            — ok/watch/degraded/critical/unknown
├── topPriority       — entry ID
├── recommendations[] — human-readable actions
└── library[]         — per-entry: metrics, validator, health, evals, degradationScore

Work Queue (work-queue.md)
├── Queue             — Prioritized task table (T-XXX) with Modality column
├── Active Threads    — Multi-step efforts (Θ-XXX)
├── Completed Log     — Finished tasks with outcomes
├── Icebox            — Deferred items with context
└── Triage Rules      — Automation logic for queue management

Handoff Document (handoffs/alone-time-*.md / dream-loop-*.md)
├── Telemetry Snapshot    — Library state at run start
├── Entry/Trigger Selected — What & why
├── Mutation/Changes      — What was done (pipeline/ontology/compute, NOT library JSON)
├── Gate Result           — Pass/Fail details
├── Unresolved            — Gaps for next loop
├── Signal Tracking       — Consecutive counts
└── Next Recommendation   — Forward-looking

Garden Journal (garden-journal.md)
└── Append-only dated entries — Observations, patterns, hunches, soil conditions

STRATEGY.md
├── Mission & Pillars       — What matters, priority order
├── Quality Gates           — Non-negotiable thresholds
├── Operating Principles    — How the gardener behaves
├── Decision Heuristics     — If/then rules
├── Success Metrics         — Leading indicators
└── Review Cadence          — When to reassess
```

### 3.2 State Transitions

```
LIBRARY ENTRY LIFECYCLE (Human-Operated)
────────────────────────────────────────
[New .md source] 
    │
    ▼ (Human runs /visualize)
[Encoded JSON] ──validator exit 2──▶ [Critical] ──Human VISUALIZE──▶ [ok]
    │                                      │                    │
    │                         (cross-ref errors,          (validator exit 0,
    │                          bad types/rels,            density ≥2.0,
    │                          low density)               proper climax)
    │                                      │                    │
    ▼                                      ▼                    ▼
[stays critical]                    [health.json]        [health.json]
                                                      shows degraded        shows ok
                                                           │                    │
                                                           ▼                    ▼
                                                  [Human runs /visualize]  [Stable until
                                                   with improved pipeline] eval/regression]

ENTRY HEALTH STATES
──────────────────
ok ──(density<2.0 or warnings)──▶ watch ──(exit 2 or density<1.7)──▶ degraded ──(multi-signal)──▶ critical
  ▲                                                                              │
  │                                                                              │
  └────────────────────────(human VISUALIZE with better pipeline)────────────────┘

AUTONOMOUS MACHINERY IMPROVEMENT LOOP
─────────────────────────────────────
[Pipeline bug / ontology gap / perf regression]
    │
    ▼ (Alone-Time task)
[IMPROVE_PIPELINE / DETECT_ONTOLOGY_GAPS / OPTIMIZE_COMPUTE / INNOVATE]
    │
    ▼ (Gate: tests + validator on pipeline code)
[Committed pipeline improvement]
    │
    ▼ (Next human VISUALIZE)
[Higher-quality library entries by default]
```

---

## 4. Decision Points & Branching Logic

### 4.1 Alone-Time Task Selection Algorithm (Modality-Aware)

See **Section 2.2b** for the complete modality-aware `select_task()` function.

### 4.2 Dream Loop Trigger Conditions (All OR)

```
TRIGGER Dream Loop IF ANY:
  1. same_unresolved_signal_count ≥ 3  (from handoffs)
  2. ontology_gap_named_count ≥ 3      (missing type/rel in handoffs/validator)
  3. density_improvement_5run_avg < 0.1 (diminishing returns on current ontology)
  4. human_explicit_request             (via work-queue or STRATEGY.md)
```

### 4.3 Gate Decision Matrix

| Gate | Check | Pass Condition | Fail Action |
|---|---|---|---|
| **Validator (library)** | `python3 validate-library-json.py library/{id}.json` | Exit code 0 | Human must re-run `/visualize` with fixes |
| **Tests (pipeline)** | `pnpm test --reporter=json` | 168 pass, 0 fail | Autonomous re-queue with failure context |
| **Density (library)** | Computed in health-check | ≥ 2.0 | Warning in health; human VISUALIZE should fix |
| **Climax (library)** | Exactly 1 beat with `tension: "climax"` | Count == 1 | Warning in health; human VISUALIZE should fix |
| **Insights (library)** | 4–7 items, ≥1 warning, ≥1 finding | All true | Warning in health; human VISUALIZE should fix |
| **Pipeline changes** | Validator + tests on modified pipeline files | Exit 0 + 168 pass | Autonomous re-queue, block commit |

---

## 5. Scheduled & Event-Driven Cadence

### 5.1 Time-Based Triggers

| Loop | Schedule | Jitter | Max Duration | Concurrency Guard |
|---|---|---|---|---|
| Health Check | Before every Alone-Time | N/A | 30s | Single process |
| Alone-Time | Nightly 02:00–04:00 local | ±30 min | 30 min | Git lock file `.alone-time.lock` |
| Dream Loop | Weekly Sunday 03:00 | ±2 hr | 60 min | Git lock file `.dream-loop.lock` |
| Generational Tag | On schema change (human approved) | Immediate | 5 min | Human confirms |

### 5.2 Event-Based Triggers

| Event | Triggered Loop | Latency |
|---|---|---|
| New eval issue (rating ≤2) | Next HITL session (ADDRESS_EVAL) | ≤24 hours |
| New unencoded `*.md` in library/ | Next Alone-Time CURATE_SOURCE (Autonomous) → then HITL VISUALIZE | ≤24 hours |
| 3× same Dream Loop signal | Immediate Dream Loop | Immediate |
| Validator exit 2 on commit | Blocked commit (hook) | Immediate |
| Test failure on commit | Blocked commit (hook) | Immediate |
| Human session starts | HITL task drain (VISUALIZE queue) | Immediate |
| Critical library entry detected | Queue VISUALIZE (HITL) + signal in health.json | Immediate |

---

## 6. Failure Modes & Recovery

| Failure Mode | Detection | Auto-Recovery | Human Intervention |
|---|---|---|---|
| Library validator exit 2 | Health check / `/visualize` gate | N/A (requires human) | Human runs `/visualize` with fixes |
| Pipeline test regression | Alone-Time gate | Re-queue with failure context | Debug test + pipeline code |
| Same critical entry 3× no improvement | Handoff analysis | Move to icebox, flag Dream Loop | Review source adequacy / pipeline |
| Dream Loop schema breaks library | Generational gate | Reject schema change | Manual ontology migration |
| gh CLI auth expires | Health check `evals.available=false` | Log warning, continue | `gh auth login` |
| Concurrent Alone-Time runs | Lock file conflict | Second exits | Manual cleanup |
| Work queue corruption | Parse error on ingest | Backup from git history | Manual restore |
| **Autonomous attempts library write** | Modality check in SELECT | Skipped, logged in journal | N/A (prevented by design) |

---

## 7. Observability Surface

### 7.1 Health Check Output (Per Run)
```json
{
  "generated": "2026-06-17",
  "counts": {"ok": 9, "watch": 0, "degraded": 0, "critical": 2},
  "topPriority": "pkm-engineering-prompt",
  "recommendations": [...],
  "library": [{ "id": "...", "metrics": {...}, "validator": {...}, "health": {...}, "degradationScore": 1366 }]
}
```

### 7.2 Key Metrics Dashboard (Leading Indicators)
| Metric | Healthy | Warning | Critical | Source |
|---|---|---|---|---|
| Library `ok` ratio | 100% | <90% | <70% | `health.json.counts` |
| Avg edge density | ≥2.2 | 2.0–2.2 | <2.0 | `health.json.library[].metrics.density` |
| Validator warnings | 0 | 1–2 | ≥3 | `health.json.library[].validator.warnings` |
| Open eval rating ≤2 | 0 | 1 | ≥2 | `health.json.evals` |
| Dream Loop cycle | <10 runs | 10–15 | >15 | Handoff dates |
| Test pass rate | 100% | 99% | <99% | `pnpm test` |
| **HITL task latency** | **<24hr** | **24–48hr** | **>48hr** | **work-queue.md timestamps** |
| **Autonomous throughput** | **≥1/run** | **0.5/run** | **0/run** | **handoff completed log** |
| **Ontology gap detection rate** | **1/5 runs** | **1/10 runs** | **0** | **Dream Loop trigger frequency** |
| **Pipeline improvement rate** | **1/3 runs** | **1/5 runs** | **0** | **IMPROVE_PIPELINE completed** |

### 7.3 Audit Trail
- **Git history:** `alone-time: pipeline X` / `visualize: entry Y` / `dream-loop: ontology Z`
- **Handoff chain:** `alone-time-*.md` → `dream-loop-*.md` → `GENERATIONS.md`
- **Work queue:** Complete task lifecycle from Ready → Active → Complete
- **Garden journal:** Weak signals, hunches, pattern recognition

---

## 8. Evolutionary Mechanics

### 8.1 Ontology Extension Protocol (Atomic, All-or-Nothing)

```
1. Alone-Time DETECT_ONTOLOGY_GAPS scans handoffs → proposes missing types/rels
2. Dream Loop formalizes proposal: VALID_TYPES + VALID_RELS + SOP + Renderer
3. Human ONTOLOGY_REVIEW approves/rejects (semantic judgment)
4. Gate validates: all 11 library entries pass new validator (zero regressions) + 168 tests pass
5. On pass: Git commit with 3+ files + GENERATIONS.md entry + version tag v{M}.{m} + Alone-Time counter reset
```

### 8.2 Generational Versioning

| Generation | Trigger | Schema Changes | Re-encoded Entries (Human VISUALIZE) |
|---|---|---|---|
| 1.0 | Baseline | — | — |
| 1.1 | Dream Loop 1 (reveals→error) | Constraint tightening only | None needed (all passed) |
| 1.2 | Pending | `framework`, `prompt`, `process`, `system`, `tool` types + `enforces`, `transforms`, `creates`, `maps_to`, `visualizes`, `renders` rels | pkm-engineering-prompt, esp-ecosystem, ... |

### 8.3 Compounding Quality Hypothesis (H7)

```
Run 0 (baseline):  6 ok, 1 watch, 2 degraded, 2 critical  →  avg density ~1.7
Run 4 (current):   9 ok, 0 watch, 0 degraded, 2 critical  →  avg density ~2.1
Run 10 (target):  11 ok, 0 watch, 0 degraded, 0 critical  →  avg density ≥2.2
Run N+generation:  Stronger baseline, new ontology, higher ceiling
```

---

## 9. Human-AI Collaboration Model

| Human Role | AI Role | Touchpoint |
|---|---|---|
| **Operator** | Runs `/visualize` — produces library entries | HITL sessions |
| **Architect** | Approves Dream Loop ontology changes | ONTOLOGY_REVIEW gate |
| **Strategist** | Writes `STRATEGY.md` | Gardener reads every run |
| **Curator** | Drops source `*.md` in library/ | CURATE_SOURCE → VISUALIZE |
| **Evaluator** | Submits eval via browser slide | Health check ingests → ADDRESS_EVAL |
| **Debugger** | Fixes pipeline gate failures | Alone-Time re-queues with context |
| **Observer** | Reads handoffs/journal | No write access needed |

**Principle:** Human operates the *encoding machinery* (`/visualize`); AI improves the *machinery* (pipeline, ontology, compute). Human provides *semantic judgment*; AI provides *pattern detection* and *mechanical execution*.

---

## 10. Current Operational Status (2026-06-17)

| Component | Status | Notes |
|---|---|---|
| **Health Check** | ✅ Operational | `node scripts/health-check.mjs --summary` works |
| **Validator** | ✅ Strict | Exit 2 on cross-refs, exit 1 on warnings |
| **Test Suite** | ✅ 168 passing | No flakiness |
| **Alone-Time Protocol** | ✅ Proven | 4 successful runs logged (as machinery improver) |
| **Dream Loop Protocol** | ✅ Proven | 1 run (reveals→error) |
| **Work Queue** | ✅ Scaffolded | 10 tasks, 3 threads, icebox populated |
| **Garden Journal** | ✅ Started | 4 entries |
| **STRATEGY.md** | ✅ Written | 5 pillars, resolved modality |
| **Modality Classification** | ✅ Resolved | 7 Autonomous types, 5 HITL types (VISUALIZE only for library) |
| **Eval Sensor** | ⚠️ Blind | gh CLI not authenticated |
| **Critical Entries** | 🔴 2 | pkm-engineering-prompt, esp-ecosystem (await human VISUALIZE) |
| **Next Autonomous Action** | 🎯 T-004 | IMPROVE_PIPELINE — density gate in `/visualize` |
| **Next HITL Action** | 🎯 T-001 | `/visualize library/pkm-engineering-seed.md` |

---

## 11. Quick Reference: Running the Loops

### Health Check
```bash
node scripts/health-check.mjs --summary          # Human readable
node scripts/health-check.mjs --out health.json  # Machine JSON
```

### Alone-Time — Autonomous Run (No Human)
```bash
# 1. Ingest
node scripts/health-check.mjs --out health.json
cat library/handoffs/alone-time-2026-06-17.md   # previous handoff
cat library/handoffs/work-queue.md              # current queue

# 2. Select (automatically picks top Autonomous task)
#    Current top: T-004 IMPROVE_PIPELINE (density gate in /visualize)
#    or T-005 DETECT_ONTOLOGY_GAPS (scan handoffs for missing types/rels)

# 3. Mutate (gardener improves machinery)
#    - Edit pipeline/visualize-skill.md (add density pre-check)
#    - Edit .claude/hooks/validate-library-json.py (propose types/rels)
#    - Prototype canvas/causal-layout.mjs
#    - Write analysis doc for SYNTHESIZE

# 4. Gate (on pipeline changes)
python3 .claude/hooks/validate-library-json.py library/pkm-engineering-prompt.json  # regression test
pnpm test

# 5. Commit (if gate passes)
git add pipeline/ .claude/hooks/ canvas/ docs/
git commit -m "alone-time: IMPROVE_PIPELINE — add density gate to /visualize skill"

# 6. Handoff
# Write library/handoffs/alone-time-YYYY-MM-DD.md
# Update work-queue.md, garden-journal.md
```

### HITL Session — Human Present
```bash
# Human picks VISUALIZE task from queue (e.g., T-001)
# Human executes with gap targets:
/visualize library/pkm-engineering-seed.md
  # uses alone-time-2026-06-17-briefing.md for cross-refs, types, rels, density, climax

# Gate (same)
python3 .claude/hooks/validate-library-json.py library/pkm-engineering-prompt.json
pnpm test

# Commit + Handoff
git add library/pkm-engineering-prompt.json library/pkm-engineering-prompt-retrospective.md
git commit -m "visualize: re-encode pkm-engineering-prompt — fix cross-refs, ontology gaps, density 1.47→2.0+"

# Update work-queue.md (T-001 complete), garden-journal.md
```

### Dream Loop (When Triggered)
```bash
# Read last 5–10 handoffs + genesis.md + garden-journal.md
# Analyze patterns, propose atomic ontology update
# Gate: validate all entries + pnpm test
# Human ONTOLOGY_REVIEW approves
# Commit + GENERATIONS.md + version tag
```

---

## 12. Open Questions & Future Evolution

| Question | Status | Resolution Path |
|---|---|---|
| Product metrics ingestion? | Deferred | Add `scripts/collect-metrics.mjs` when analytics exist |
| Automated scheduling (cron/GitHub Actions)? | Manual only | Phase 2: `/schedule` integration |
| Multi-repo garden federation? | Design only | Requires GENERATIONS.md compatibility layer |
| In-browser visualize pipeline? | Icebox | IMPLEMENTATION_PLAN.md Phase 4 |
| Human-in-the-loop task confirmation? | Not implemented | Add `--confirm` flag to Alone-Time wrapper |
| Rollback protocol for failed generation? | Not tested | `git revert` + handoff annotation |
| **Human presence detection automation?** | Not implemented | Env var, lock file, or git activity heuristic |
| **Autonomous density pre-check in /visualize?** | T-004 queued | Edit pipeline/visualize-skill.md + validator gate |

---

*This report is the system's self-model. Update it when loops change, protocols evolve, or new interaction patterns emerge. The Dream Loop should read this alongside handoffs to detect drift between documented and actual behavior.*