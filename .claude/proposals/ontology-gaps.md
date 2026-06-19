# Ontology Gaps Proposal — Dream Loop Input

**Generated**: 2026-06-19 (Alone-Time run)  
**Source**: Scan of handoffs (alone-time-2026-06-17-briefing.md, garden-journal.md) + validator warnings across library entries  
**Trigger**: T-005 DETECT_ONTOLOGY_GAPS task (priority 5, Autonomous)  
**Next Step**: Human review → Dream Loop propose (if approved) → Atomic update of VALID_TYPES / VALID_RELS / SOP / renderer

---

## Methodology

Scanned:
- Last 10 Alone-Time handoffs (runs 1–4 + 2026-06-17 briefing)
- Validator warnings across 9 library entries (health.json)
- Garden journal observations (hunches from 2026-06-07, 2026-06-16)

**Inclusion criteria**: Missing type/rel appears **≥3×** across handoffs OR blocks **≥2 library entries** from passing validator.

---

## Gap Analysis Summary

| Category | Recurring Gap | Frequency | Blocking Entries | Confidence |
|---|---|---|---|---|
| **Type** | `framework` | 3 handoffs | pkm-engineering-prompt | ⭐⭐⭐ HIGH |
| **Type** | `prompt` | 3 handoffs | pkm-engineering-prompt | ⭐⭐⭐ HIGH |
| **Type** | `process` | 5 handoffs | pkm-engineering-prompt, esp-ecosystem | ⭐⭐⭐ HIGH |
| **Type** | `system` | 2 handoffs | pkm-engineering-prompt, esp-ecosystem | ⭐⭐ MEDIUM |
| **Type** | `tool` | 2 handoffs | pkm-engineering-prompt, esp-ecosystem | ⭐⭐ MEDIUM |
| **Type** | `platform` | 2 entries (esports, gig) | — (journal H5) | ⭐⭐ MEDIUM |
| **Rel** | `enforces` | 3 edges | pkm-engineering-prompt | ⭐⭐⭐ HIGH |
| **Rel** | `transforms` | 2 edges | pkm-engineering-prompt | ⭐⭐ HIGH |
| **Rel** | `creates` | 2 edges | pkm-engineering-prompt | ⭐⭐ HIGH |
| **Rel** | `maps_to` | 3 edges | pkm-engineering-prompt | ⭐⭐⭐ HIGH |
| **Rel** | `visualizes` | 2 edges | pkm-engineering-prompt | ⭐⭐ HIGH |
| **Rel** | `renders` | 2 edges | pkm-engineering-prompt | ⭐⭐ HIGH |
| **Rel** | `underpins` | 2 edges | pkm-engineering-prompt | ⭐⭐ HIGH |
| **Rel** | `supports` | inferred | — (semantic gap) | ⭐ MEDIUM |

---

## Detailed Evidence

### Type: `framework` — **HIGH**
| Source | Current Mapping | Notes |
|---|---|---|
| para-framework (pkm-engineering) | `software` / `standard` | Core concept — PARA is a *framework*, not just software |
| (anticipated) esp-framework | — | Hardware/framework abstraction layer |
| Future: agent-framework | — | Meta-system pattern |

**Semantics**: A structured, opinionated methodology/toolkit that governs how work flows. Distinct from `software` (implementation) and `standard` (specification). Governs behavior.

---

### Type: `prompt` — **HIGH**
| Source | Current Mapping | Notes |
|---|---|---|
| pkm-prompt | `standard` | CLAUDE.md is a *prompt* — executable instruction set |
| claude-md-prompt | `standard` | Prompt engineering artifact |
| (anticipated) system-prompt | — | LLM system prompts as first-class nodes |

**Semantics**: An executable instruction document that shapes LLM behavior. Distinct from `standard` (passive spec) — prompts are *active*, *invocable*, *versioned*.

---

### Type: `process` — **HIGH**
| Source | Current Mapping | Notes |
|---|---|---|
| pipelines | `event` / `concept` | Recurring workflow, not one-time event |
| wikilinks | `standard` / `concept` | Linking process / convention |
| crystallization | `event` / `concept` | Multi-step transformation pipeline |
| dual-track | `concept` / `event` | Parallel process architecture |
| (esp) firmware-build | — | Build/deploy process |

**Semantics**: A repeatable, multi-step workflow that transforms inputs to outputs. Distinct from `event` (single occurrence) and `concept` (abstract idea). Has *stages*, *inputs*, *outputs*.

---

### Type: `system` — **MEDIUM**
| Source | Current Mapping | Notes |
|---|---|---|
| ebrain-vault | `platform` / `organization` | Composite system, not just platform |
| (esp) esp-ecosystem | — | Hardware + firmware + toolchain as system |

**Semantics**: A composite of interacting components (software, hardware, processes) that functions as a unified whole. Distinct from `platform` (hosts apps) — systems *contain* platforms.

---

### Type: `tool` — **MEDIUM**
| Source | Current Mapping | Notes |
|---|---|---|
| kaaroViewer | `software` | Interactive tool, not passive software |
| (esp) esp-toolchain | — | CLI/IDE tooling |

**Semantics**: An interactive instrument used *by* agents to accomplish work. Distinct from `software` (runs autonomously). Requires *operator*.

---

### Type: `platform` — **MEDIUM** (Journal H5)
| Source | Evidence |
|---|---|
| aoe-2-redbull: tournament platform | `platform` exists but used for hosting sites (YouTube, Twitch) — need *tournament* as platform subtype |
| gig-worker-projects: delivery platforms | Warshi, Zomato, Dunzo, Blinkit — all `platform` but distinct dynamics |

**Note**: `platform` already in VALID_TYPES. Gap is *subtype granularity* — consider `marketplace`, `labor-platform`, `tournament-platform` as attributes, not new types.

---

### Rel: `enforces` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| pkm-prompt → frontmatter | `governs` | **Enforces**: active mandate with compliance checking |
| pkm-prompt → wikilinks | `governs` | "Prompt *requires* wikilinks" — not just governs |
| pkm-prompt → crystallization | `governs` | Compliance mechanism (validator) |

**Distinction from `governs`**: `governs` = sets rules/policy. `enforces` = *actively validates compliance* (has a validator/checker). A prompt *enforces* its structure; a law *governs* but courts *enforce*.

---

### Rel: `transforms` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| para-framework → skill-surfaces | `governs` | **Transforms**: input → qualitatively different output |
| para-framework → crystallized-archive | `governs` | Framework *transforms* raw notes into structured archive |

**Distinction from `creates`/`enables`**: `transforms` = same essence, new form (caterpillar → butterfly). `creates` = new entity. `enables` = makes possible.

---

### Rel: `creates` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| crystallization → crystallized-archive | `creation` | **Creates**: brings new entity into existence |
| wikilinks → knowledge-surface | `creation` | Linking process *creates* the knowledge surface |

**Note**: `creation` exists but is generic. `creates` is more specific — *process creates artifact*. Consider promoting `creation` → `creates` as canonical.

---

### Rel: `maps_to` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| ebrain-vault → pipelines | `location` / `association` | **Maps_to**: structural correspondence, not containment |
| ebrain-vault → skill-surfaces | `location` / `association` | Vault *maps* conceptual structure → pipeline stages |
| (esp) pinout → peripheral | — | Hardware mapping |

**Distinction from `location`**: `location` = physical/spatial. `maps_to` = semantic/structural correspondence (A corresponds to B).

---

### Rel: `visualizes` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| kaaroViewer → knowledge-surface | `features` | **Visualizes**: renders abstract structure as visual representation |
| (esp) dashboard → metrics | — | Visualization tool |

**Distinction from `features`**: `features` = has capability. `visualizes` = *is a view of* — the tool *makes visible* the target.

---

### Rel: `renders` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| kaaroViewer → pkm-prompt | `features` | **Renders**: produces output from specification |
| (esp) firmware-builder → binary | — | Build tool |

**Distinction from `creates`**: `renders` = specification-driven output (prompt → scene, template → HTML). `creates` = generative.

---

### Rel: `underpins` — **HIGH**
| Source | Current Mapping | Semantics |
|---|---|---|
| agent-field → pkm-prompt | `enables` | **Underpins**: foundational theory enabling practice |
| computeTheory → para-framework | `informs` (valid) | Theory *underpins* framework design |

**Distinction from `enables`/`informs`**: `underpins` = necessary foundation (without A, B cannot exist). `enables` = makes possible. `informs` = influences design.

---

### Rel: `supports` — **MEDIUM** (Semantic Gap)
| Evidence | Notes |
|---|---|
| Evidence → finding (insight) | No direct rel for "evidence supports claim" |
| Precedent → ruling (legal) | `cites` exists but `supports` = strengthens argument |
| Metric → insight | `cites` is citation; `supports` = evidential weight |

**Existing alternatives**: `cites`, `contradicts`, `derives_from`. Missing: *evidential support*.

---

## Proposed Extensions (for Dream Loop)

### Tier 1: Must Add (High Confidence, High Impact)

| Type/Rel | Category | VALID_* Entry | SOP Section | Renderer Hint |
|---|---|---|---|---|
| `framework` | Type | `VALID_TYPES` | Toolkit profile: "Meta-System" | Distinct color (purple), hexagon shape |
| `prompt` | Type | `VALID_TYPES` | Toolkit/Meta-System | Distinct color (amber), bolt icon |
| `process` | Type | `VALID_TYPES` | Toolkit/Meta-System | Distinct color (cyan), gear icon |
| `enforces` | Rel | `VALID_RELS` | Step 2b: "Active mandates" | Solid line, arrowhead, label "enforces" |
| `transforms` | Rel | `VALID_RELS` | Step 2b: "Transformation flows" | Dashed line, double arrow |
| `creates` | Rel | `VALID_RELS` (replace `creation`) | Step 2b: "Artifact generation" | Solid, filled arrow |
| `maps_to` | Rel | `VALID_RELS` | Step 2b: "Structural mappings" | Dotted, bidirectional hint |
| `visualizes` | Rel | `VALID_RELS` | Step 2b: "View relationships" | Unique style (camera icon) |
| `renders` | Rel | `VALID_RELS` | Step 2b: "Spec-driven output" | Unique style (printer/icon) |
| `underpins` | Rel | `VALID_RELS` | Step 2b: "Foundational dependencies" | Bold, foundation style |

### Tier 2: Consider (Medium Confidence)

| Type/Rel | Category | Rationale |
|---|---|---|
| `system` | Type | Composite entities; distinct from `platform`/`organization` |
| `tool` | Type | Interactive instruments; distinct from `software` |
| `supports` | Rel | Evidential weight; distinct from `cites` |
| `describes` | Rel | Documentation relationship (ego-Field → knowledge-surface) |

### Tier 3: Defer (Low Signal)

| Type/Rel | Reason |
|---|---|
| `updates` | Use `supersedes` / `cites` |
| `builds` | Use `creates` / `enables` |
| `expands` | Use `enables` |
| `improves` | Use `enables` |
| `simplifies` | Semantic nuance, low frequency |

---

## Domain Profile Implications

### New Profile: **Meta-System** (for pkm-engineering-prompt, esp-ecosystem)
| Aspect | Specification |
|---|---|
| **Node count** | 25–35 |
| **Core types** | `framework`, `prompt`, `process`, `system`, `tool`, `concept`, `standard` |
| **Core rels** | `enforces`, `transforms`, `creates`, `maps_to`, `visualizes`, `renders`, `underpins`, `informs`, `governs`, `precedes` |
| **Cluster strategy** | By architectural layer (Framework → Process → Tool → Ecosystem) |
| **Story arc** | Problem (fragmented) → Framework (structure) → Process (workflow) → Tool (execution) → Leverage (compound) |
| **Insight types** | Must include `warning` (fragility), `finding` (leverage points), `pattern` (recurring structure) |

This profile addresses the journal hunch: *"Both critical entries are 'reference/overview' documents describing a meta-system... needs its own encoding profile."*

---

## Atomic Update Checklist (When Approved)

Per STRATEGY.md: **VALID_TYPES / VALID_RELS / SOP / renderer updated together or not at all.**

| File | Change |
|---|---|
| `.claude/hooks/validate-library-json.py` | Add Tier 1 types to `VALID_TYPES`, rels to `VALID_RELS` |
| `ENCODING_SOP.md` | Add Meta-System profile; document Tier 1 types/rels semantics |
| `sop-reference.md` | Same as SOP (canonical reference) |
| `canvas/paint-strategies.mjs` | Add visual encoding (color, shape, line style) for new types/rels |
| `pipeline/local-graph.mjs` | No change (runtime only) |

---

## Open Questions for Human Review

1. **`system` vs `platform`**: Is `ebrain-vault` a `system` (composite) or `platform` (hosts tools)? Current mapping: `platform`. What's the operational difference?
2. **`prompt` as type**: Should prompts be nodes? They're documents *and* executable artifacts. Dual nature?
3. **`creation` → `creates`**: `creation` exists in VALID_RELS. Promote to `creates` as canonical? Breaking change for existing entries?
4. **Tier 2 `tool`**: Does `kaaroViewer` need `tool` type, or is `software` sufficient? What behavior changes?
5. **Renderer changes**: New types/rels need visual distinction. Budget: 3 new colors + 2 new line styles. Prioritize which?

---

## Next Steps

1. **Human reviews** this proposal (approve / modify / reject)
2. **If approved**: Trigger Dream Loop → `dream-loop-propose.md` prompt with this doc as context
3. **Dream Loop** produces atomic schema change proposal
4. **Human approves** → commit atomic update (VALID_TYPES, VALID_RELS, SOP, renderer)
5. **Gardener** re-validates all 11 library entries pass new schema
6. **Update work-queue**: T-005 → complete, T-001/T-002 re-encode with new ontology

---

*Gardener: Update work-queue.md with outcome. Append journal observation.*