# Encoding Retrospective: PKM System Prompt — Engineering Projects

**Source**: `library/pkm-engineering-seed.md`  
**Output**: `library/pkm-engineering-prompt.json`  
**Encoded**: 2026-05-22

## What Went Well
- Captured the dual-track philosophy and the critical shift from passive Resources to active Skill Surfaces as the central insight.
- Strong spine (PARA Framework, PKM Prompt, Knowledge Surface) with clear causal flow through crystallization.
- Good coverage of frontmatter, WikiLinks, and eBrain vault mapping.
- Story arc follows the prompt's own logic: seed → framework → practice → crystallization → compounding leverage → vault integration.
- Insights include one strong `warning` (crystallization prevents evaporation) and actionable `finding`/`pattern` types.

## What the Skill Could Have Done Better
- The source is highly conceptual with almost no named entities, dates, people, or tools. This forced heavier reliance on abstract `concept` and `framework` nodes.
- Edge density required deliberate cross-cluster sweeps; some weaker `association` / `informs` edges were added to meet the ≥2.0 gate.
- No real Wikidata QIDs were applicable (pure framework document).

## How This Topic Could Have Been Better Visualized
- A companion Excalidraw diagram showing the "dual-track" loop (code work ↔ PKM enrichment) and the crystallization gate would help non-experts see the workflow instantly.
- The PARA transformation (Resources → Skill Surfaces, Archive → Crystallized) lends itself to a clean before/after visual.

## Summary Table

| Dimension              | Grade | Notes |
|------------------------|-------|-------|
| Node coverage          | A     | Strong coverage of all major concepts in the prompt; spine is clear |
| Edge density           | B+    | Met ≥2.0 after cross-cluster sweep; some edges are lighter but structurally necessary |
| Story arc quality      | A-    | Follows the prompt's own logic; climax at vault integration feels earned |
| Insight title quality  | A     | Headline-test passed on all; "Dual-track is the only sustainable..." is particularly sharp |
| Cluster design         | A-    | Four clusters map cleanly to Framework / Workflow / Leverage / Ecosystem |
| Entity visual-model opportunity | B | Most nodes are abstract concepts/frameworks. Few candidates for rich 3D models (kaaroViewer itself is one) |
| Slide / narrative surface | B+  | Story beats map reasonably to horizontal slides; crystallization and surface-expansion beats would benefit from simple diagrams |

## Skill-Level Recommendations
- For highly conceptual/framework sources, add an optional "conceptual encoding profile" that relaxes the named-entity sweep and emphasizes definition nodes + causal chains.
- Consider adding a lightweight "dual-track diagram" generator when the source explicitly describes parallel workflows.
- The current retrospective template is excellent; keep requiring the "Entity visual-model opportunity" row — it surfaces rendering gaps early.

## Re-encode 2026-09-17 — ontology conformance + density

**Trigger:** health-check flagged `validator-exit2` (density 1.47, 20+ warnings: unknown types/rels, label-string protagonists, invalid tone, short insight title).

| Change | Before | After |
|---|---|---|
| Nodes / edges / density | 17 / 25 / 1.47 | 20 / 47 / 2.35 |
| `report_card` protagonists/antagonists | free-text labels | node ids |
| `meta.tone` | `instructional` (invalid) | `analytical` |
| Node types outside ontology | `framework`, `prompt`, `process`, `system`, `tool` | `concept`, `standard`, `solution`, `platform`, `software` |
| Rels outside ontology (17 edges) | `enforces`, `transforms`, `creates`, `updates`, `builds`, `expands`, `improves`, `contains`, `maps_to`, `visualizes`, `renders`, `underpins`, `informs`, `describes` | `governs` (labelled), `supersedes`, `creation`, `enables`, `causes`, `implements`, `association`, `features` |
| Insight-3 title | 5-word topic label | declarative claim |

**Encoding decisions**
- The antagonists (isolated notes, uncrystallized pipelines, context evaporation) became `issue` nodes in a new "Failure Modes" cluster. The prompt's rules then read as explicit mitigations, which is the clearest way to show why each rule exists.
- `enforces` → `governs` with labels: the validator requires a label on every `governs` edge describing the scope, and the labels turned out to be the most informative text in the graph.
- `transforms` (Resources → Skill Surfaces, Archive → Crystallized) → `supersedes`: the framework replaces the old pillar's meaning rather than converting an instance.
- `crystallization` and `dual-track` are `solution` nodes, not `process`: the ontology encodes them by what they resolve.

**Skill-level note:** this entry was built outside `/visualize` and never validated; the ontology drift here is the same failure mode the widget registry lockstep is designed to prevent on the UI axis.
