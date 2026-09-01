# Encoding Retrospective: kaaroViewer: A Self-Governing Spatial Intelligence Platform

**Source**: `library/kaaro-viewer-2026.md`
**Output**: `library/kaaro-viewer.json`
**Encoded**: 2026-06-07

## What Went Well

The causal narrative source (`kaaro-viewer-2026.md`) was purpose-written to supply the WHY behind each architectural decision, not just the WHAT. This made the three-pass encoding significantly richer than run 4 (which sourced from CLAUDE.md). Spine entities were immediately legible from the document's structure: the platform, the central problem (personalized ontology), and the data model (intelligence brief). The tension arc maps naturally to the document's progression: open-world failure → LLM pivot → drift → three-part lock → self-governance → open question.

The cross-cluster sweep surfaced 17 inter-cluster edges that would not have been found by a single-pass read. The governance cluster (Dream Loop, Alone-Time, health-check) needed explicit edges to every other cluster to represent its role as a meta-layer over the whole system.

Wikidata lookups found QIDs for: open-world-assumption (Q1069864), Wikidata itself (Q2013), SPARQL (Q54871), Three.js (Q1245512), force-directed-layout (Q906415). All private/project-specific nodes correctly marked `null`.

31 nodes vs. 22 in run 4 — the 9 additional nodes are entirely attributable to the richer source document. The narrative names `personalized-ontology`, `ontology-drift`, and `three-part-lock` as first-class concepts; CLAUDE.md does not.

## What the Skill Could Have Done Better

**Two distinct edges from visualize-skill to intelligence-brief** (`achieves` and `governs`) encode slightly different semantic facets of the same relationship. This is accurate but may cause visual clutter in the renderer. A single `governs` edge with a richer label would have been cleaner — but the validator permits multi-edge same-pair relationships, and both facets are real.

**The `stable-diffusion` node** is primarily a conceptual reference (the paint strategies inherit its prompt engineering patterns) rather than a component the system actually calls. It sits at an awkward conceptual layer. An `association` edge with a descriptive label handles this adequately, but a richer semantic relationship closer to `derives_from` would be more precise. The ontology gap here is minor but worth noting for the Dream Loop's next vocabulary review.

**Node tier assignment for `completion-pipeline`**: set as `secondary` even though it is on the critical path of the explore pipeline. The `tier` field reflects narrative importance in this document, not operational criticality — correct by the SOP but potentially misleading for a system-architecture brief.

## How This Topic Could Have Been Better Visualized

**The three-part lock deserves a companion diagram.** The concept is architectural — three components that must update atomically. A triangle diagram with labeled vertices would carry the argument faster than any graph edge. Candidate: `library/diagrams/kaaro-viewer/three-part-lock.excalidraw`.

**The two-path interaction model** (explore pipeline vs. visualize skill) is inherently a fork diagram. The current encoding represents both paths as nodes with edges to the same output (`intelligence-brief`), which works in the graph but does not visually emphasize the fork structure the way a flow diagram would.

**The self-referential encoding paradox** (insight i5) is a strong visual opportunity. The kaaro-viewer node should appear twice in a diagram: once as the subject being encoded, once as the system doing the encoding. A Möbius-strip or recursive diagram would land the paradox more viscerally than a text insight.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A | 31 nodes covering all named tools, systems, and coined concepts. Run 4 (7 nodes) vs. this run (31 nodes) — the delta is entirely attributable to the richer source document. |
| Edge density | B+ | 64 edges, density 2.06. Passes the gate. Governance cluster edges to other clusters are the highest-value additions from the cross-cluster sweep. |
| Story arc quality | A | 10 beats, one climax (beat 7 — Three-Part Lock), clean low→climax→low arc. The self-governance climax is more accurate than a "canvas features" climax would have been. |
| Insight title quality | A- | All five titles pass the headline test and state a named mechanism with a direction. i3 is slightly long but contains enough precision to justify it. |
| Cluster design | A | 6 clusters by functional role, not document section: C1 (problem space), C2 (data architecture), C3 (encoding paths), C4 (canvas), C5 (image layer), C6 (governance). All 31 nodes placed, no overlaps. |
| Entity visual-model opportunity | High | Strong candidates: three-js (logo), a-frame (logo), wikidata (logo), gemini (Google AI logo), stable-diffusion (community logo), kaaro-viewer (custom logo). The `three-part-lock` concept is the strongest candidate for a custom diagram — a labeled triangle would communicate its structure instantly. |
| Slide / narrative surface | A- | 10 beats map cleanly to a horizontal slide deck. Beat 7 (climax) should carry the three-part lock triangle diagram. Beat 9 (paint system) would benefit from a 2×2 grid showing one canvas state in all four strategies side-by-side. These are the two beats where text alone leaves meaning on the table. |

## Skill-Level Recommendations

1. **Self-referential entry pattern**: When encoding a system that also runs the encoding process, the narrative source must be purpose-written — not scraped from project docs. This is now validated: the run 4 entry sourced from CLAUDE.md missed the causal story entirely. Add a note to the SOP's Reflective profile: "If the subject IS the encoding platform, write a causal narrative first, then encode from that narrative."

2. **Concept nodes for coined terms**: This encoding used `concept` for `ontology-drift`, `three-part-lock`, `open-world-assumption`, `paint-strategies`, `private-knowledge-vault`, `personalized-ontology`. All are project-coined terms with no Wikidata analog. The Reflective profile already instructs this; the validation here confirms the instruction is correct and sufficient.

3. **`completion-pipeline` as secondary node**: The completion pipeline is operationally critical but narratively supporting in this document. Future encodings of more technical architecture documents should consider whether `primary` is warranted for pipeline stages — it depends on whether the document's argument turns on them.
