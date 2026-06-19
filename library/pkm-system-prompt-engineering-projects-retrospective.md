# Encoding Retrospective: PKM System Prompt — Engineering Projects

**Source**: `library/pkm-engineering-seed.md`
**Output**: `library/pkm-system-prompt-engineering-projects.json`
**Encoded**: 2026-06-19

## What Went Well

- The three-pass structure (nodes → edges → narrative) produced a well-connected graph with clear structural relationships between the PARA components, frontmatter standards, and theoretical foundations.
- The Reflective/Essay domain profile was correctly applied — no forced legal/academic sweeps, focus on concepts, tools, metaphors, and author-built products.
- Edge density (2.65) exceeded the 2.0 gate comfortably after cross-cluster sweeps connected infrastructure, standards, and theory clusters.
- Story arc follows the prescribed tension pattern (low→low→medium→medium→high→high→climax→medium→low) with exactly one climax beat.
- Insight mix includes 2 findings, 2 warnings, 2 patterns, 1 opportunity — satisfying the mandatory warning+finding requirement.
- All 19 nodes assigned to exactly 1 of 5 clusters with functional role labels (not document sections).

## What the Skill Could Have Done Better

- The source document is ~800 words — right at the small/medium boundary. Node count of 19 is at the upper end of small (12-20). Could have pushed to 22-24 nodes by extracting the 5 "Do Not" prohibitions as separate `issue`/`concept` nodes with `prohibits` edges from the framework.
- The "Related Vault Notes" section lists 5 notes but only 4 got explicit nodes (agent-field, compute-theory, ego-field, garden-guidelines, kaaroViewer). kaaro-viewer was included but the others could have had richer metrics (word counts, maturity levels if known).
- The temporal chain requirement was correctly marked N/A (no dated events), but the pipeline lifecycle (Pipeline → Skill Surface → Crystallized) could have been encoded as a `precedes` chain with `milestone` nodes for "Pipeline Opened", "Pipeline Matured", "Pipeline Closed", "Crystallized Created".

## How This Topic Could Have Been Better Visualized

- The layer ontology (L4→L1) maps directly to agent context window tiers. A companion Excalidraw diagram in `library/diagrams/pkm-system-prompt-engineering-projects/` showing the four-layer stack with context window allocations would make the `layer-levels` node's role immediately graspable.
- The eBrain vault folder structure (Inbox→Pipelines→Skill Surfaces→Areas→Crystallized) is a spatial flow that would render well as a sankey or flow diagram — the graph shows `location` edges but the directional flow of knowledge compounding is a key argument.
- The "Two-Link Minimum" rule is a topological invariant. A small network diagram showing isolated vs. connected components would illustrate the warning insight visually.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A- | 19 nodes for ~800 words is solid; missed 5 "Do Not" prohibitions as separate nodes |
| Edge density | A | 2.65 (53 edges / 20 nodes) — well above 2.0 gate after cross-cluster sweeps |
| Story arc quality | A | 10 beats, exact tension pattern, climax at crystallization moment, good wide/tight focus mix |
| Insight title quality | A | All 7 pass headline test; 2 findings, 2 warnings, 2 patterns, 1 opportunity |
| Cluster design | A | 5 functional-role clusters, every node in exactly one, colors distinct |
| Entity visual-model opportunity | B | 3 software nodes (Git, kaaroViewer, Obsidian WikiLinks) could carry logos; 2 standards (YAML, Frontmatter) could carry spec icons; theoretical concepts (Agent Field, Compute Theory, Ego Field) remain geometric primitives |
| Slide / narrative surface | A- | Story beats map naturally to 10-slide deck; beat 6 (crystallization climax) needs companion flow diagram; beat 5 (frontmatter contract) needs table visual |

## Skill-Level Recommendations

1. **Add "Do Not" prohibition sweep to Reflective profile**: For prescriptive frameworks, extract each `Do Not` rule as an `issue` node with `prohibits` edge from the framework node. This captures the immune-system metaphor the document uses.
2. **Theoretical foundation metrics**: When vault notes are cited (e.g., `[[agent-field]]`), attempt to record their maturity level and word count as metrics on the concept nodes — this would surface the "theory-practice gap" warning more quantitatively.
3. **Pipeline lifecycle as temporal chain**: Even without calendar dates, the Pipeline→Skill Surface→Crystallized flow is a causal-temporal chain. Encode as `milestone` nodes with `precedes` edges in Reflective encodings where the document describes a process lifecycle.
4. **Visual model registry**: Maintain a sidecar `library/diagrams/{id}/visual-models.json` listing which nodes have real assets (logos, portraits, diagrams) vs. geometric primitives — this feeds the retrospective's visual-model opportunity row automatically.
