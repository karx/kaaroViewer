# kaaroViewer — Life Architecture

> *"The software does not restrict its growth to active user sessions."*
> — Self-Evolving Software Architecture seed, §3

This document is the operational blueprint for breathing life into kaaroViewer: transforming it from a static knowledge-graph viewer into a self-observing, self-improving, self-evolving system. It maps the seed directives from `life-DNA-seed.md` to the concrete modules, loops, and protocols that govern the system's growth.

---

## 0. The Core Premise

kaaroViewer already contains every primitive required for a living system. What it lacks is the **nervous system** that connects them into a self-reinforcing loop.

| Seed Concept | kaaroViewer Primitive |
|---|---|
| Reducible computational core | Three.js renderer, graph layout, brief schema, vitest suite |
| Irreducible LLM pocket | `explore.mjs`, `completion.mjs`, `/visualize` skill |
| Self-referential state mirror | `scripts/health-check.mjs` ← *to be built* |
| Feedback sensor | Eval slide → GitHub Issues (`label:eval`) |
| Mutation engine | `/visualize` skill (Claude-driven re-encoding) |
| Immune system | `validate-library-json.py` + `pnpm test` (168 tests) |
| Alone-Time loop | Nightly scheduled Claude Code agent |
| Dream Loop | Weekly meta-agent reading accumulated handoffs |
| Generational handoff | Git tag + frozen schema snapshot |
| Handoff memory | `library/handoffs/alone-time-YYYY-MM-DD.md` |

The loop closes when the immune system's output becomes the next loop's input.

---

## 1. Dual Pillars

### Reducible Core — Deterministic Guardrails

Owns: schema integrity, rendering correctness, test regressions, type safety.

```
canvas/layout.mjs          — graph placement algorithms
canvas/brief-controller.mjs — active brief state machine
pipeline/graph.mjs         — node/edge data model
ontology.mjs               — entity type registry
validate-library-json.py   — structural + semantic validator
pnpm test (168 tests)      — regression gate
```

**Invariants the LLM pockets may never violate:**
- Brief JSON must pass `validate-library-json.py` exit 0 before any library commit
- All 168 tests must pass after any code mutation
- VALID_TYPES / VALID_RELS / SOP / renderer must be updated atomically — never one without the other two

### Irreducible Pocket — LLM-Driven Emergence

Owns: intent interpretation, semantic encoding, creative enrichment, self-diagnosis.

```
pipeline/explore.mjs       — draft brief generation (in-browser)
pipeline/completion.mjs    — node enrichment, edge stubs
canvas/paint-orchestrator.mjs — Gemini image synthesis
/visualize skill           — library-grade encoding (Claude)
Alone-Time agent           — self-diagnosis + mutation
Dream Loop agent           — meta-governance + ontology evolution
```

LLM outputs are always sandboxed: validate → test → commit or discard.

---

## 2. Self-Referential State — The Mirror

**Module:** `scripts/health-check.mjs`

The system's dual-layer self-portrait. Runs before every Alone-Time loop iteration. Produces a structured JSON report that the LLM agent reads as its primary context.

### Output schema

```json
{
  "generated": "YYYY-MM-DD",
  "systemTests": { "pass": 168, "fail": 0, "suites": 12 },
  "library": [
    {
      "id": "gig-worker-projects",
      "validatorExitCode": 1,
      "validatorWarnings": 3,
      "nodeCount": 18,
      "edgeDensity": 1.6,
      "storyBeats": 7,
      "insights": 4,
      "hasClimaxBeat": true,
      "lastModified": "2026-05-12",
      "evals": [
        { "issueNumber": 14, "rating": 2, "date": "2026-06-05",
          "worked": "...", "confused": "missing causal links between actors" }
      ],
      "health": "degraded"
    }
  ],
  "openEvals": 2,
  "recommendations": [
    "re-encode gig-worker-projects (validator warnings + low eval rating)",
    "check edge density on minecraft-redstone-computation (1.7, below threshold)"
  ]
}
```

### Health scoring

| Status | Criteria |
|---|---|
| `ok` | Validator exit 0, edge density ≥ 2.0, no open evals rating ≤ 2 |
| `watch` | Validator exit 1 (warnings), or edge density 1.7–2.0 |
| `degraded` | Validator exit 2, or edge density < 1.7, or eval rating ≤ 2 |
| `critical` | Multiple degraded signals, or validator exit 2 + negative eval |

---

## 3. Phase Plan

---

### Phase 1 — Nervous System

**Goal:** The system can observe itself. Health state is machine-readable and LLM-consumable.

**Deliverables:**

| Artifact | Description |
|---|---|
| `scripts/health-check.mjs` | Node CLI — runs validator on all `library/*.json`, polls `gh issue list --label eval`, emits JSON health report |
| `library/handoffs/` | Directory for Alone-Time output documents |
| `.claude/alone-time.md` | Alone-Time protocol (prompt + operational rules) |

**Completion criteria:**
- `node scripts/health-check.mjs` exits 0 and produces valid JSON
- Health report correctly flags known-degraded entries
- GitHub eval issues are parsed and attached to their doc by ID
- Handoffs directory exists and accepts structured markdown

**Does not include:** any automated mutation, scheduling, or loop execution.

---

### Phase 2 — The Alone-Time Loop

**Goal:** The system can improve itself. One library entry per run, fully gated.

**Operational protocol (per run):**

```
1. INGEST
   node scripts/health-check.mjs → health.json
   cat library/handoffs/[most-recent].md       (previous loop's memory)

2. SELECT
   Pick entry: highest combined degradation signal
   (validator warnings × eval rating inverse × days since last touch)

3. MUTATE
   /visualize [source document or inline content]
   Target: specific gaps named in health report + eval feedback

4. GATE
   python3 .claude/hooks/validate-library-json.py library/{id}.json
   → must exit 0
   pnpm test
   → all 168 must pass

5. COMMIT
   git add library/{id}.json library/{id}-retrospective.md
   git commit -m "alone-time: re-encode {id} — {one-line reason}"

6. HANDOFF
   Write library/handoffs/alone-time-YYYY-MM-DD.md
   (see handoff schema in §5)
```

**Deliverables:**

| Artifact | Description |
|---|---|
| `.claude/alone-time.md` | Full protocol + prompt structure |
| First pilot run | Manual execution on lowest-health entry |
| `library/handoffs/alone-time-[date].md` | First handoff document |

**Completion criteria:**
- At least one entry improves from `degraded` → `ok` after a run
- Handoff document captures all required fields
- No test regressions introduced

**Scheduling:** Nightly via `/schedule` cron at low-traffic hours.

---

### Phase 3 — Handoff Memory

**Goal:** Loop iterations accumulate usable memory. Each run reads the last.

**Handoff document schema:**

```markdown
## Alone-Time Run — YYYY-MM-DD HH:MM

### Telemetry Snapshot
- Library: {N} ok, {N} watch, {N} degraded, {N} critical
- Open evals: {N} unprocessed
- Tests: {pass}/{total}

### Entry Selected
- ID: {id}
- Reason: {validator warnings + eval signal + days stale}
- Pre-run health: {status}
- Pre-run edge density: {n}

### Mutation Applied
- Re-encoded from: {source description}
- Validator: exit {code} → exit 0
- Edge density: {before} → {after}
- Node count: {before} → {after}
- Story beats: {before} → {after}
- Key improvement: {one sentence}

### What Could Not Be Resolved
- {Any gaps that remain — signals for Dream Loop}

### Dream Loop Signal
- Consecutive unresolved signals: {list}
- Recommend Dream Loop if: {condition}

### Next Run Suggestions
- {Top recommendation for next iteration}
```

**Completion criteria:**
- Three consecutive handoff documents exist
- Each correctly references the previous run's unresolved signals
- The accumulated signal is legible enough to inform a Dream Loop decision

---

### Phase 4 — Dream Loop

**Goal:** The system can evolve its own rules. Ontology, SOP, and encoder patterns are living documents.

**Trigger condition:** Any of:
- 3+ consecutive handoff docs flag the same unresolved signal
- A handoff names an entity type or relationship not in VALID_TYPES / VALID_RELS
- Alone-Time loop shows diminishing returns (edge density improvement < 0.1 across 5 runs)

**Operational protocol:**

```
1. META-INGEST
   Read last 5–10 handoff documents
   Identify: recurring failures, stale reasoning, unresolved signals

2. PATTERN ANALYSIS
   What entity types appear in eval feedback but are absent from VALID_TYPES?
   What relationship types appear in source docs but are absent from VALID_RELS?
   Which encoding instructions in SOP consistently produce validator warnings?

3. PROPOSE CHANGES
   Draft ontology extension (new type or rel)
   Draft SOP update (new encoding guidance)
   Draft renderer extension (new geometry/style for the new type)

4. ATOMIC UPDATE (all three or none)
   .claude/hooks/validate-library-json.py — add to VALID_TYPES or VALID_RELS
   sop-reference.md — add semantic + visual explanation
   canvas/node-factory.mjs or edges.mjs — wire new type into renderer

5. GATE
   pnpm test → all tests pass
   Re-validate all 9 library entries → none regress

6. CONSOLIDATE
   Summarize and prune handoff history (convert raw logs to clean context)
   Update GENERATIONS.md with generational note if schema changed

7. HANDOFF
   Write library/handoffs/dream-loop-YYYY-MM-DD.md
```

**Deliverables:**

| Artifact | Description |
|---|---|
| `.claude/dream-loop.md` | Full protocol + prompt structure |
| `GENERATIONS.md` | Generational ledger |
| First Dream Loop run | After Phase 3 accumulates sufficient signal |

**Scheduling:** Weekly, or manually triggered when handoff signal threshold is reached.

---

### Phase 5 — Generational Handoff

**Goal:** Structural evolution is versioned, auditable, and revertable.

**Trigger:** Dream Loop makes a schema change (new VALID_TYPE, new VALID_REL, updated core invariants).

**Protocol:**

```
1. Tag the current commit: git tag v{MAJOR}.{MINOR} -m "Generation {N}: {one-line description}"
2. Snapshot the validator's VALID_TYPES and VALID_RELS to GENERATIONS.md
3. Note which entries were re-encoded under this generation's schema
4. Reset the Alone-Time loop's "consecutive runs" counter
5. Update CLAUDE.md quality gate table if thresholds changed
```

**GENERATIONS.md entry format:**

```markdown
## Generation 1.1 — 2026-06-15
**Trigger:** Dream Loop run after 4 consecutive alone-time signals for missing `platform` entity type
**Schema changes:** Added VALID_TYPE `platform`, VALID_REL `hosts`
**Renderer:** Platform nodes render as hexagonal prism, teal (#00ccaa)
**Re-encoded under new schema:** gig-worker-projects, kaaro-sessions-platform
**Frozen commit:** abc1234
```

---

## 4. Operational Cadence

| Loop | Frequency | Trigger | Output |
|---|---|---|---|
| Health check | Before every loop | Scheduled / manual | `health.json` |
| Alone-Time | Nightly (low traffic) | `/schedule` cron | Re-encoded entry + handoff doc |
| Dream Loop | Weekly | N accumulated signals or manual | Ontology update + handoff doc |
| Generational Handoff | On schema change | Dream Loop output | Git tag + GENERATIONS.md entry |
| Test suite | After every mutation | Pre-commit hook | Pass/fail signal |

---

## 5. Success Definition

The system is **alive** when:

1. It can identify its own quality degradation before a human does
2. It can improve a degraded library entry without human direction
3. It can identify a recurring gap in its own ontology from accumulated signal
4. It can propose and implement an ontology extension atomically
5. Its improvements compound — each generation starts from a stronger baseline than the last

The system has **failed** when:
- The mutation engine produces entries that regress the validator
- The Alone-Time loop repeats the same mutation without improvement (stagnation)
- The Dream Loop proposes schema changes that break existing library entries
- The generational tag introduces test failures

---

## 6. What This Branch Builds

```
kaaro/breathe-life
│
├── scripts/
│   └── health-check.mjs          ← Phase 1
│
├── library/
│   └── handoffs/
│       ├── genesis.md             ← TDD hypotheses (this document's pair)
│       └── alone-time-[date].md  ← Phase 2+ outputs
│
├── .claude/
│   ├── alone-time.md             ← Phase 2 protocol
│   └── dream-loop.md             ← Phase 4 protocol
│
├── LIFE.md                       ← this document
└── GENERATIONS.md                ← Phase 5 ledger
```

The existing test suite, validator, and `/visualize` skill are unchanged. This branch adds the loop infrastructure around them.
