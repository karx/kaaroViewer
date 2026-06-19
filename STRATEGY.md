# kaaroViewer — Gardener Strategy

> This document guides the Alone-Time gardener. It defines *what matters*, *what good looks like*, and *where to invest Limited alone-time capacity*. The gardener reads this before every run.

---

## Mission

**Build a self-evolving knowledge graph explorer that grows wiser without human sessions.**

The system is alive when:
1. It identifies its own quality degradation before humans do
2. It **improves the encoding pipeline** so human sessions produce higher-quality output
3. It **detects recurring ontology gaps** from accumulated signal and proposes extensions
4. It **optimizes and innovates compute** (layout, rendering, validation, search)
5. Each generation starts from a stronger baseline than the last

---

## Strategic Pillars (Priority Order)

| Pillar | Description | Current Focus |
|---|---|---|
| **1. Library Integrity** | Every entry passes validator exit 0, density ≥ 2.0, proper climax, insights with warning+finding | **HITL**: human runs `/visualize` on 2 critical entries; **Autonomous**: guardrails + gate automation |
| **2. Signal Completeness** | Health mirror captures all degrading signals (evals, metrics, human intent) | gh CLI auth for eval polling; add engineering metrics to health check |
| **3. Ontology Evolution** | Alone-Time detects gaps → Dream Loop proposes → Human approves → Atomic update | First Dream Loop done (reveals→error); watch for next pattern |
| **4. Generative Growth** | EXPAND new sources, SYNTHESIZE cross-entry insights | After library clean: encode new domains from suggestion box |
| **5. Repo Gardening** | Fix tech debt, improve tests, update docs, refine pipelines | Deferred — see Gardener's Note below |

---

## Quality Gates (Non-Negotiable)

- **Validator:** Every library commit must pass `python3 .claude/hooks/validate-library-json.py` exit 0
- **Tests:** All 168 tests must pass after any mutation
- **Atomic Ontology:** VALID_TYPES / VALID_RELS / SOP / renderer updated together or not at all
- **One Commit Per Task:** Single logical change, revertible, traceable

---

## Task Modality Classification (Resolved)

### 🤖 Autonomous (Alone-Time Eligible)
*Runs without human presence. Gardener **improves the system**, not the library entries directly.*

| Task Type | Description | Example |
|---|---|---|
| **IMPROVE_PIPELINE** | Refactor/optimize encoding pipeline, validator, health-check, layout, renderer | Fix Python 2.7 fallback; add density pre-check to `/visualize` |
| **DETECT_ONTOLOGY_GAPS** | Scan handoffs/validator warnings → propose missing types/rels for Dream Loop | "12 entries use 'framework' type → promote to VALID_TYPES" |
| **OPTIMIZE_COMPUTE** | Improve graph layout algo, Three.js render perf, search index, bundle size | Force-directed → causal layout; WASM physics |
| **INNOVATE** | Prototype new capabilities: clustering, causal inference, multi-hop reasoning | "Add temporal path queries to brief schema" |
| **SYNTHESIZE** | Cross-entry analysis, cluster insight generation (read-only on library) | "PKM patterns across 3 library entries" |
| **MONITOR** | Run health check, poll evals, update metrics, detect regressions | Scheduled health check; eval latency alert |
| **CURATE_SOURCE** | Deduplicate, tag, organize source .md files (no encoding) | Consolidate duplicate seed files |

### 👤 Human-in-the-Loop (HITL)  
*Requires human steering/intervention. Only task type: **VISUALIZE**.*

| Task Type | Description | Human Role | Example |
|---|---|---|---|
| **VISUALIZE** | `/visualize` skill — deep encodes source to library JSON (3-pass) | Runs skill, reviews output, commits | Encode pkm-engineering-seed.md |
| **ADDRESS_EVAL** | Respond to low-rating eval with targeted fix (uses VISUALIZE) | Reads eval, runs `/visualize`, commits | Fix "missing decision log" complaint |
| **ONTOLOGY_REVIEW** | Approve/reject Dream Loop schema proposals | Judges semantic fit, commits atomic update | Add `framework` type + `enforces` rel |
| **STRATEGIC_STEER** | Edit STRATEGY.md, reprioritize pillars | Writes intent, gardener reads next run | Shift focus to Generative Growth |
| **SOURCE_CURATION** | Provide new source .md, confirm encoding intent | Drops file, describes domain/goal | Add "ESP32 Migration Guide.md" |

**Architecture Principle:** 
- **Autonomous** = improves the *machinery* (pipeline, ontology, compute, innovation)
- **HITL** = operates the *machinery* to produce *library entries* (`/visualize`)

The gardener never directly mutates `library/*.json`. It makes the VISUALIZE skill better.

---

## Alone-Time Operating Principles

1. **Read before write** — Ingest health.json + work-queue.md + STRATEGY.md + latest handoff
2. **One run, one primary task** — But may complete a thread step + triage queue
3. **Leave the garden better** — Every run updates work-queue.md, garden-journal.md, or pipeline/*
4. **Escalate, don't stall** — If blocked 2×, move to icebox, flag for Dream Loop or human
5. **Prefer pipeline repair over entry repair** — Better encoder fixes all future entries
6. **Respect modality** — Never attempt HITL tasks; never waste human time on autonomous tasks

---

## Decision Heuristics

| Situation | Heuristic |
|---|---|
| Critical library entries exist | **Human runs VISUALIZE** (HITL); Gardener ensures pipeline is ready (Autonomous) |
| No critical/degraded entries | Check eval issues → pipeline improvements → ontology gap detection → synthesis |
| Same validator warning 3× across entries | Create DETECT_ONTOLOGY_GAPS task → feeds Dream Loop |
| Pipeline bug blocks quality gate | Create IMPROVE_PIPELINE task (highest autonomy priority) |
| Human suggestion aligns with pillar 1–3 | Promote to work queue top |
| Tech debt blocks pipeline velocity | Promote to REPAIR_PIPELINE task |
| **Human present + HITL tasks queued** | **Human picks VISUALIZE; gardener runs pipeline/ontology/compute tasks in parallel** |
| **Human absent + no autonomous work** | **Gardener idles, writes journal observation, waits** |

---

## Success Metrics (Leading Indicators)

| Metric | Target | Measurement |
|---|---|---|
| Library `ok` ratio | 100% | health.json counts |
| Avg edge density | ≥ 2.2 | health.json library[].metrics.density |
| Validator warnings | 0 | health.json library[].validator.warnings |
| Open eval rating ≤2 | 0 | GitHub Issues label:eval |
| Dream Loop cycle time | < 10 Alone-Time runs | handoff dates |
| Generational tag | Every schema change | git tags v*.* |
| **HITL task latency** | **< 24hr when human available** | **work-queue.md timestamps** |
| **Autonomous throughput** | **≥ 1 pipeline/ontology/compute task per run** | **handoff completed log** |
| **Ontology gap detection rate** | **1 proposal per 5 runs** | **Dream Loop trigger frequency** |

---

## Review Cadence

- **Every run:** Gardener updates work-queue.md + garden-journal.md
- **Every 5 runs:** Re-read STRATEGY.md, adjust pillar weights if needed
- **Every Dream Loop:** Propose STRATEGY.md updates if ontology shifted
- **Every Generation:** Human reviews STRATEGY.md for drift

---

*Updated by gardener after each run. Human may edit anytime — gardener will respect on next ingest.*