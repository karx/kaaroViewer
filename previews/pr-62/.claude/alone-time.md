# Alone-Time Loop — Protocol

> *"The software does not restrict its growth to active user sessions."*
> — life-DNA-seed.md §3

The Alone-Time Loop is an autonomous, scheduled self-improvement process. One iteration per run. One library entry per run. Fully gated.

---

## When to Run

- Nightly (low-traffic, scheduled via `/schedule`)
- Manually: when `pnpm health` reports any `degraded` or `critical` entry
- Never: during active user sessions or while another Alone-Time run is in progress

---

## The Protocol (6 Steps)

### Step 1 — INGEST

```bash
pnpm health:json                                # current library state
cat library/handoffs/[most-recent].md          # previous loop's memory
```

Read both. The health report is the objective signal. The previous handoff is the subjective memory — what the last loop couldn't resolve, what it flagged for this run.

If no previous handoff exists, start from the genesis handoff: `library/handoffs/genesis.md`.

---

### Step 2 — SELECT

Pick the single entry with the highest `degradationScore` from the health report JSON.

**Selection rules:**
- Always take the top-ranked entry from `health.json → library[0]` (already sorted by score)
- Override only if the top entry was also top-ranked in the previous handoff AND showed no improvement — in that case, skip to rank 2 and flag persistent stagnation in the handoff
- Never select an `ok` entry

**Document the selection reasoning** — record in the handoff why this entry was chosen over others.

---

### Step 3 — MUTATE

Re-encode via `/visualize`, targeting the specific gaps from the health report. Pass the original source document path AND the gap-targeting context as the inline prompt.

**Standard invocation:**
```
/visualize library/{id}.md

Gap targets for this run:
- [list each signal from health.json → library[n].health.signals]
- [list each warning from health.json → library[n].validator.warnings]
- [note any eval feedback from health.json → library[n].evals]
```

**The `/visualize` skill will produce:**
- `library/{id}.json` (overwriting the existing entry)
- `library/{id}-retrospective.md` (encoding notes)

---

### Step 4 — GATE

Both checks must pass before committing. If either fails, do NOT commit.

```bash
python .claude/hooks/validate-library-json.py library/{id}.json
# → must exit 0

pnpm test
# → all tests must pass (currently: 168)
```

**If gate fails:**
- Record the failure in the handoff document
- Record what the validator says
- Do NOT modify the live entry
- Flag for next run with the specific blocker

---

### Step 5 — COMMIT

Commit only the re-encoded entry and its retrospective.

```bash
git add library/{id}.json library/{id}-retrospective.md
git commit -m "alone-time: re-encode {id} — {one-line reason}"
```

The commit message format is canonical — it makes the loop's history readable in `git log`.

---

### Step 6 — HANDOFF

Write `library/handoffs/alone-time-YYYY-MM-DD.md` using the schema below.

This document is the loop's memory. The next run **must** read it before selecting its target.

---

## Handoff Document Schema

```markdown
## Alone-Time Run — YYYY-MM-DD

### Telemetry Snapshot
- Library: {N} ok  {N} watch  {N} degraded  {N} critical
- Open evals: {N}
- Tests: {pass}/{total}
- Health report: health.json (regenerate with `pnpm health:json`)

### Entry Selected
- ID: {id}
- Degradation score: {score}
- Reason for selection: {one sentence}
- Pre-run health: {status}
- Pre-run metrics: {density}, {nodes}N {edges}E, {beats} beats, {climax} climax, {unclustered} unclustered

### Mutation Applied
- Source: {path to source doc}
- Gap targets addressed: {list from signals + warnings}
- Validator: exit {pre} → exit {post}
- Edge density: {before} → {after}
- Node count: {before} → {after}
- Climax beats: {before} → {after}
- Unclustered nodes: {before} → {after}
- Key structural improvement: {one sentence}

### Gate Result
- Validator: {PASS / FAIL — reason}
- Tests: {PASS / FAIL — reason}
- Committed: {YES / NO}

### What Could Not Be Resolved
- {Remaining gaps after this run — signals for Dream Loop}

### Dream Loop Signal
- Consecutive runs with same unresolved signal: {count} — {signal name}
- Trigger Dream Loop if: {condition or "not yet"}

### Next Run Recommendation
- Top priority: {entry id} (score: {score})
- Key gap to target: {one sentence}
```

---

## Guardrails

- **Never mutate an `ok` entry.** Alone-Time is corrective, not speculative.
- **Never commit without gate passing.** The immune system is non-negotiable.
- **Never batch multiple entries in one run.** One target, one commit, one handoff. Compound effects are harder to attribute.
- **Always read the previous handoff.** Loop memory prevents circular re-selection.
- **Never alter VALID_TYPES, VALID_RELS, or sop-reference.md.** That is the Dream Loop's domain.

---

## Dream Loop Trigger Conditions

Escalate to Dream Loop when any of these are true:

1. Same entry appears as top target in 3+ consecutive handoffs with no score improvement
2. A handoff's "What Could Not Be Resolved" names a missing entity type or relationship ≥ 3 times
3. Average edge density improvement per run drops below 0.1 across 5 consecutive runs
4. Validator warnings include the same unknown type/rel across 3+ entries

When escalating, the current handoff's "Dream Loop Signal" section must name the specific pattern.
