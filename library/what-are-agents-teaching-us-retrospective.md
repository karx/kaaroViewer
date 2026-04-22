# Encoding Retrospective: What Are Agents Teaching Us?

**Source**: `D:/src/karx.github.io/what-agents-are-teaching-us.md` (LinkedIn post draft)
**Output**: `library/what-are-agents-teaching-us.json`
**Encoded**: 2026-04-22

## What Went Well

- **The three-term framework (skill / agent / context) became the structural backbone.** Making each term a primary node with directed edges (`skill-concept → agent-runtime`, `agent-runtime → context-surface`) reproduces the essay's opening definition as graph topology. A reader tracing those edges recovers the thesis without the prose.
- **The five "teachings" mapped cleanly onto story beats, not nodes.** Each teaching is a beat; the concepts inside each teaching are nodes. This avoided the trap of creating meta-nodes like "teaching-1-agency" and kept the graph about ideas, not about the essay's rhetorical scaffolding.
- **Langton's Ant as the climax worked structurally.** Beat 7 ties `langtons-ant → emergence → legibility → ai-agents` — four spine/primary nodes in one beat. Tension arc landed clean (low → low → medium → medium → high → high → climax → medium → low).
- **Insight titles passed the headline test.** Each declares a named subject, a named mechanism, and a direction — e.g. "Engineering craft has shifted from authoring software to architecting the systems that author software." Rewrote a weak initial pass of "GTO-like" category titles.
- **Edge density hit the 2.0 target exactly (50/25).** The cross-cluster sweep forced pkm-layer ↔ atomic-discipline ↔ legibility-emergence connections that the essay implies but never states explicitly.

## What the Skill Could Have Done Better

- **The SOP's Step 1 analysis template (datable events, named laws, compliance relationships) is awkward for reflective essays.** Most rows in the template were "N/A" or "none." The SOP needs a **reflective / opinion / essay** domain profile alongside the existing Legal, Toolkit, and Academic profiles. Essays care about: named concepts, named tools referenced, named metaphors, named sections, and author-position sentiment — not datable events or compliance matrices.
- **`creates` rel was a skill-blind spot.** I wrote five edges with `rel: "creates"` before the validator caught it — the valid form is `creation`. The SOP prompt should list the precise validator enum inline, not a paraphrase. I had been going on memory of the `visualize` skill's prompt which lists `creates` in the allowed rel set.
- **No guidance for essays with sparse `key_stats`.** Reports full of numbers make key_stats easy. An opinion essay has few numbers — I had to invent stats like "Teachings surfaced: 5", "Haiku syllable budget: 17", "Craft shift: authoring → architecting." Some of these are borderline; others land. A profile-specific key_stats rubric ("for essays: enumerate named concepts, explicit numeric references, and one-sentence claim counts") would help.

## How This Topic Could Have Been Better Visualized

- **A dedicated spotlight for Langton's Ant.** The node has a real QID (Q680961), emergence metrics ("highway at step 10,000"), and is the central metaphor. In the rendered report, a Langton's Ant GIF embedded alongside beat 7 would carry the essay's argument visually in a way no graph can.
- **The agent-runtime / skill / context trio deserves a diagram.** The Excalidraw pattern from `advanced-git-workflows` could produce a simple triangle diagram on beat 1 — three nodes, labelled handoffs — and that diagram is already sketched in `agent-runtime-diagram-spec.md` from the source vault. The encoder did not generate one; that is a follow-up.
- **The essay has two rhetorical halves (philosophical reflection + lighter-note close).** The cluster `closer` already splits these visually, but a subtle visual distinction (e.g. dim the closer cluster) would help the reader understand the arc of the piece.

## Summary Table

| Dimension            | Grade | Notes |
|----------------------|-------|-------|
| Node coverage        | A-    | All 4 named PKM tools, the framework trio, all the named characters/products. 25 nodes — mid-range for a 1,500-word essay. |
| Edge density         | A     | 2.0 exactly (50/25). Cross-cluster sweep worked — pkm-layer ↔ atomic-discipline and craft-shift ↔ legibility-emergence edges added value. |
| Story arc quality    | A-    | 9 beats, clean tension arc, one climax. Langton's Ant climax lands. Beat 9 (closer) could be tighter. |
| Insight title quality| A     | Seven insights; all pass the headline test. Mix: 2 finding, 1 warning, 2 pattern, 1 paradox, 1 opportunity. |
| Cluster design       | A     | 6 clusters, each maps to a functional role (framework, pkm infra, craft shift, atomic discipline, legibility/emergence, closer). Every node in exactly one cluster. |

## Skill-Level Recommendations

1. **Add a `Reflective / Essay / Opinion` domain profile to the SOP** alongside Legal, Toolkit, and Academic. Include:
   - Mandatory nodes: named concepts, named metaphors, named tools referenced, named products the author built.
   - Skip: datable-events chain, compliance matrices, temporal `precedes` edges.
   - Story beat pattern: opening framework → each "teaching" or "section" as its own beat → climactic metaphor → closer.
   - Key_stats pattern: count named sections, count named tools, extract any numeric references in the prose, encode the core shift as a "before → after" stat.

2. **Inline the validator's precise rel enum in the SOP and prompt.** The visualize skill currently lists `creates` as a common rel; the validator rejects it in favour of `creation`. Either the validator should accept both, or the SOP should cite the validator's allow-list verbatim. I lost one round-trip to this.

3. **Surface Excalidraw diagram generation as a first-class step for Reflective encodings.** Essays benefit more from diagrams than reports do, because the argument is often a shape (triangle, axis shift, emergence curve). The `/visualize` skill should check `library/diagrams/{id}/` and offer to emit one diagram per climax-or-higher beat when the domain is Reflective.
