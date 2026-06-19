# RFC-001: Skeleton + Hydration Encoding Pipeline

**Status**: Draft  
**Author**: Gardener (Alone-Time)  
**Created**: 2026-06-19  
**Target**: `/visualize` skill, `pipeline/explore.mjs`, library encoding workflow  
**Supersedes**: Monolithic JSON generation in `/visualize` (3-pass LLM → single JSON)

---

## Summary

Replace the current monolithic LLM→JSON encoding in `/visualize` with a **two-phase pipeline**:

1. **Skeleton Pass** — Single LLM call emitting only topological structure (IDs, types, relationships). ~200 tokens. Validated upfront for cross-reference integrity, density, climax count.
2. **Hydration Passes** — Parallel, per-entity LLM calls streaming JSONL lines (one node/edge/beat/insight/cluster per line). Incrementally validated. Resumable from failure.
3. **Assembly** — Deterministic merge (zero LLL) producing final `library/{id}.json`. Full validator gate.

---

## Motivation

### Current Pain Points

| Problem | Impact |
|---------|--------|
| **Monolithic JSON generation** | 2000–4000 tokens in one call; high failure rate (truncation, syntax errors, hallucinated commas) |
| **All-or-nothing validation** | One cross-ref error → entire brief rejected; no partial credit |
| **No resume capability** | Failure at 90% = restart from zero |
| **No parallelism** | Sequential 3-pass inside single session; slow, expensive |
| **Human review bottleneck** | Can only review final output; architectural flaws discovered late |
| **Token waste** | Re-sending full context for small fixes |

### Evidence from Health Check

- 3 degraded entries with validator warnings (density, climax, unclustered, `reveals` rel)
- 2 critical entries pending (validator exit 2 — cross-ref errors)
- Each re-encode attempt risks repeating monolithic failure mode

---

## Detailed Design

### Phase 1: Skeleton Generation

**Input**: Source markdown + domain profile (Toolkit, Academic, Legal, Reflective, *new: Meta-System*)

**Output**: `library/{id}.skeleton.json`

```json
{
  "meta": { "id": "", "title": "", "domain": "", "profile": "" },
  "nodes": [
    { "id": "n1", "type": "concept", "tier": 1, "cluster": "c1" },
    { "id": "n2", "type": "tool", "tier": 2, "cluster": "c2" }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "rel": "enables" }
  ],
  "story": [
    { "id": "s1", "node": "n1", "nodes": ["n1", "n2"], "tension": "rising" }
  ],
  "insights": [
    { "id": "i1", "type": "finding" },
    { "id": "i2", "type": "warning" }
  ],
  "clusters": [
    { "id": "c1", "label": "Core Concepts", "nodes": ["n1"] },
    { "id": "c2", "label": "Tooling", "nodes": ["n2"] }
  ]
}
```

**Validation Gates** (must pass before hydration):
- All node/edge/story/insight/cluster IDs unique
- All edge `from`/`to` reference existing node IDs
- All story `node`/`nodes` reference existing node IDs
- All cluster `nodes` reference existing node IDs
- Exactly **one** story beat with `tension: "climax"`
- At least one insight `type: "warning"` and one `type: "finding"`
- Edge density ≥ 2.0 (edges / nodes) — *pre-check, not final*
- Node count within domain profile range

**Checkpoint**: Persist skeleton. Human may review architecture before hydration.

---

### Phase 2: Hydration (Parallel, Streaming)

**Input**: Skeleton + source markdown + entity specification

**Output**: Append-only `library/{id}.hydration.jsonl` (one JSON object per line)

```jsonl
{"entity": "node", "id": "n1", "label": "PKM Framework", "description": "A meta-system for...", "metrics": {"centrality": 0.8}, "sentiment": "neutral", "wikidata": ""}
{"entity": "node", "id": "n2", "label": "Obsidian", "description": "Local-first note-taking...", "metrics": {}, "sentiment": "positive", "wikidata": "Q12345"}
{"entity": "edge", "from": "n1", "to": "n2", "label": "implemented in", "weight": 3, "directed": true}
{"entity": "story", "id": "s1", "title": "The Catalyst", "narration": "When the framework...", "tension": "rising", "focus": "n1"}
{"entity": "insight", "id": "i1", "title": "Centralization Risk", "body": "The framework...", "type": "warning", "evidence": ["n1"], "severity": "high"}
{"entity": "cluster", "id": "c1", "label": "Core Concepts", "color": "#8B5CF6", "description": "Foundational abstractions...", "nodes": ["n1"]}
```

**Hydration Prompt Template** (per entity type):

```markdown
# Hydrate: {entity_type} #{id}

## Skeleton Context
{skeleton_json}

## Source Text
{source_markdown}

## Task
Emit ONLY the JSON object for this {entity_type}. No wrapper, no markdown.
Required fields: {field_list}
```

**Validation per line** (streaming):
- JSON syntax valid
- `id`/`from`/`to` matches skeleton
- Required fields present per entity type
- Enum values valid (type, tier, sentiment, tension, insight type, severity)

**Failure Handling**: Failed line → retry up to 3× with error feedback. Max 3 failures → escalate to human with partial hydration.

**Parallelism**: Up to 5 concurrent hydration calls (nodes, edges, story, insights, clusters independent after skeleton).

---

### Phase 3: Assembly (Deterministic)

**Input**: `skeleton.json` + `hydration.jsonl`

**Output**: `library/{id}.json` (full brief schema)

**Process**:
1. Load skeleton
2. Index hydration lines by entity + id
3. Merge: skeleton topology + hydration content
4. Compute derived fields (edge density final, cluster membership completeness)
5. Run full validator (`validate-library-json.py`)
6. Exit 0 → register in `LIBRARY` array, commit files

**Zero LLM involvement** — pure code, deterministic, testable.

---

## Domain Profile Extension

The skeleton prompt **must** consume the domain-specific encoding profile from `ENCODING_SOP.md`:

| Profile | Node Count | Key Types | Key Rels | Cluster Strategy |
|---------|------------|-----------|----------|------------------|
| Toolkit | 20–30 | tool, process, framework, concept | enables, uses, implements, extends | By function |
| Academic | 25–35 | theory, method, finding, claim | supports, contradicts, extends, cites | By argument |
| Legal | 15–25 | statute, precedent, principle, ruling | governs, cites, distinguishes, overturns | By jurisdiction |
| Reflective | 12–20 | insight, tension, synthesis, question | reveals, resolves, deepens, contextualizes | By theme |
| **Meta-System** (new) | 25–35 | **framework, prompt, process, system, tool** | **enforces, transforms, creates, maps_to, visualizes, renders, underpins** | By layer |

*Meta-System profile added for pkm-engineering-prompt and similar "system-describing-system" sources.*

---

## Migration Path

| Stage | Action |
|-------|--------|
| **0. Prototype** | Implement `pipeline/encode-skeleton.mjs`, `pipeline/hydrate.mjs`, `pipeline/assemble.mjs` behind feature flag |
| **1. Shadow Run** | Run on `pkm-engineering-seed.md` alongside current `/visualize`; compare outputs |
| **2. Switch** | Update `/visualize` skill to invoke new pipeline; deprecate monolithic prompt |
| **3. Re-encode** | Re-process 3 degraded entries via new pipeline (validates they pass) |
| **4. Cleanup** | Remove monolithic prompt code; update docs |

---

## Open Questions

1. **Skeleton prompt size**: Domain profiles add ~500 tokens. Acceptable?
2. **Hydration ordering**: Should edges hydrate after nodes? (Currently independent — skeleton guarantees IDs exist)
3. **Human review UX**: CLI flag `--review-skeleton` to pause before hydration?
4. **Partial hydration commit**: If human aborts mid-hydration, persist partial `.jsonl` for resume?
5. **Provider agnosticism**: Hydration prompts assume instruction-following. Test with non-Gemini providers?

---

## Acceptance Criteria

- [ ] Skeleton pass produces valid topology for pkm-engineering-seed.md (validator pre-gates pass)
- [ ] Hydration streams 50+ lines without syntax errors
- [ ] Assembly produces `brief.json` passing full validator exit 0
- [ ] Total wall-clock time ≤ current monolithic approach (parallelism gain > overhead)
- [ ] Failure injection: kill hydration at line 30 → resume completes successfully
- [ ] All 168 existing tests pass
- [ ] New tests: skeleton validation, hydration streaming, assembly merge

---

## References

- `STRATEGY.md` — Pillar 1 (Library Integrity), Pillar 3 (Ontology Evolution)
- `ENCODING_SOP.md` — Domain-specific encoding profiles
- `CLAUDE.md` — `/visualize` skill specification, quality gates
- `health.json` — Current degraded entries motivating this change
- `.alone-time-checkpoint.json` — Task T-001 (VISUALIZE pkm-engineering), T-005 (DETECT_ONTOLOGY_GAPS)

---

## Feedback

**Reviewers**: Human (strategic), Gardener (implementation)

**Comment deadline**: Next Alone-Time run (or human async)

**Decision**: Approve / Request Changes / Defer