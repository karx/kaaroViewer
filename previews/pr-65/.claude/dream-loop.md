# Dream Loop — Protocol

> *"The system evolves its own rules."*
> — LIFE.md §4

The Dream Loop is a meta-governance agent. It reads accumulated Alone-Time signals and makes systemic changes that are beyond the corrective scope of a single Alone-Time run: ontology extensions, SOP updates, encoder pattern fixes, constraint tightening.

---

## When to Run

- When any Alone-Time handoff's "Dream Loop Signal" section reads "3/3 — TRIGGERED"
- When ≥5 handoffs flag the same recurring gap
- Manually: after a significant library expansion reveals new domain patterns
- **Never** while an Alone-Time run is in progress

---

## The Protocol (7 Steps)

### Step 1 — META-INGEST

Read the most recent 3–10 handoff documents in reverse chronological order:

```
cat library/handoffs/alone-time-[most-recent].md
cat library/handoffs/alone-time-[second].md
cat library/handoffs/alone-time-[third].md
```

Also read `library/handoffs/genesis.md` for the baseline hypotheses.

Identify:
- Recurring unresolved signals (same error type across ≥3 runs)
- Persistent encoding gaps (same "What Could Not Be Resolved" entry)
- Ontology requests (entity types or rels that appear in source material but not in VALID_TYPES/VALID_RELS)
- Quality trends (is edge density improving? Are validator warnings declining?)

---

### Step 2 — PATTERN ANALYSIS

For each recurring signal, classify it:

| Class | Description | Dream Loop Action |
|---|---|---|
| **Encoder habit** | LLM consistently uses a disallowed pattern from memory | Update SOP + tighten validator |
| **Missing ontology** | Entity type or rel exists in sources but not in schema | Extend VALID_TYPES or VALID_RELS atomically |
| **SOP blind spot** | Encoding rule exists but is buried/ambiguous | Rewrite SOP section for clarity |
| **Systematic compression** | Specific named-entity class consistently collapsed into concepts | Add named-entity sweep rule to SOP |
| **Loop stagnation** | Same entry stays degraded across 3+ runs | Flag for full re-encode, not patching |

---

### Step 3 — PROPOSE CHANGES

Draft the change before implementing:

- **For encoder habits**: Write the prohibition rule explicitly. Simulate how an encoder would read it and test whether it would prevent the error.
- **For ontology additions**: Check VALID_TYPES/VALID_RELS for collisions. Draft the geometry/style for the renderer. Write the SOP row. Confirm all 3 are consistent.
- **For constraint tightening**: Decide: warning → error, or new check altogether?

---

### Step 4 — ATOMIC UPDATE

For encoder habit fixes and constraint tightening:
1. `.claude/hooks/validate-library-json.py` — add/upgrade the check
2. `.claude/skills/visualize/sop-reference.md` — add/update the rule
3. (Only if new type/rel added) Canvas renderer — wire new geometry/style

The third step is **only required if a new VALID_TYPE or VALID_REL is added**. Constraint tightening (warning → error, new prohibition) does not require a renderer change.

**Never update only one of the three.** Partial updates create drift between the validator, the encoder's reference, and the rendered output.

---

### Step 5 — GATE

```bash
# Validate all existing library entries — none should regress
for f in library/*.json; do python .claude/hooks/validate-library-json.py "$f"; done
# All must exit 0

# Run full test suite
pnpm test
# All 168 (or current count) must pass
```

---

### Step 6 — CONSOLIDATE

- Write the handoff document (Step 7)
- If a new VALID_TYPE or VALID_REL was added, create a `GENERATIONS.md` entry
- If no schema change (only constraint tightening or SOP update), no GENERATIONS.md entry needed

---

### Step 7 — HANDOFF

Write `library/handoffs/dream-loop-YYYY-MM-DD.md` using the schema below.

---

## Handoff Document Schema

```markdown
## Dream Loop Run — YYYY-MM-DD

### Trigger
- Signal: {signal name}
- Handoffs with this signal: {run 1}, {run 2}, {run 3}
- Consecutive count: {N}/3

### Pattern Identified
- Class: {encoder habit / missing ontology / SOP blind spot / systematic compression / loop stagnation}
- Root cause: {one or two sentences}

### Changes Made
- Validator: {what was changed}
- SOP: {what was added/updated}
- Renderer: {what was added} or "no change — constraint tightening only"

### Gate Result
- All library entries: {PASS / FAIL + entry names}
- Tests: {PASS / FAIL}
- Committed: {YES / NO}

### Generations Update
- Schema change: {YES: GENERATIONS.md entry written} or {NO: constraint tightening only}

### Signal Reset
- Dream Loop signal count reset to 0
- Next Alone-Time run may now target remaining watch/degraded entries
```

---

## Guardrails

- **Never extend VALID_TYPES or VALID_RELS without updating all three artifacts atomically.**
- **Never tighten a constraint that would break any existing valid library entry.**
- **Never run the Dream Loop to speculate.** It responds to accumulated evidence, not to hypotheses.
- **Never reset the Alone-Time loop's consecutive signal counter without documenting why.**
