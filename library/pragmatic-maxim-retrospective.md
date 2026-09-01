---
published: false
title: "Encoding Retrospective: The Pragmatic Maxim"
tags: [visualize-skill, encoding-retrospective, peirce, pragmatism]
description: "Post-encoding analysis of the pragmatic maxim brief: reflective/academic hybrid, clean 1878→1905 timeline, maxim-as-visualization-instruction as closer."
date: 2026-09-01
layer: L1-Instance
maturity: BUDDING
para: Crystallized
---

# Encoding Retrospective: The Pragmatic Maxim

**Source**: `library/pragmatic-maxim.md`
**Output**: `library/pragmatic-maxim.json`
**Encoded**: 2026-09-01

## What Went Well

- **The maxim encoded as an instruction, not just a quotation.** Spine is `pragmatic-maxim` / `charles-sanders-peirce` / `practical-effects`. The closer beat turns the maxim on the graph itself: a name-list without effect-edges is only grade two. That is the topic doing work inside the encoding.
- **Timeline is visible in the graph layer.** 1878 statement → 1898 James print debut → 1903 lectures → 1905 pragmaticism coinage, chained with `precedes`. Story beats reference those milestone nodes instead of inventing a second chronology.
- **James vs Peirce is a real contested edge, not a polite association.** `pragmaticism → william-james` is `opposes`; James's sentiment is `contested`. The 1905 rename only makes sense if that tension is structural.
- **Reflective profile + Academic citations coexisted.** Named concepts and metaphors got nodes; named works (`How to Make Our Ideas Clear`, `The Fixation of Belief`, Collected Papers) stayed as `book`/`academic` rather than collapsing into "peirce-corpus."
- **Edge density cleared the gate on the first pass** (54/26 ≈ 2.08) after the cross-cluster sweep added scholarship → texts and magazine → essays broadcast edges.

## What the Skill Could Have Done Better

- **Philosophy-of-logic sources sit between Reflective and Academic.** Datable events exist (1878, 1898, 1903, 1905) so the temporal chain is not N/A, but there are no laws or compliance matrices. A thin "History of Ideas" profile would have named this hybrid instead of stretching two checklists.
- **Wikidata for the maxim itself is ambiguous.** The movement *pragmatism* has Q163188; the maxim as a distinct item is weaker. Several work QIDs were best-effort. The skill should say: prefer `null` over attaching a nearby movement QID to a more specific concept.
- **Reformulation count (61) is a scholarship fact, not a source-text fact.** It earned a node and a key_stat because it is the best available map of the maxim's verbal instability. An Academic profile would have demanded a `dataset` node; that would have been overfit.

## How This Topic Could Have Been Better Visualized

- **Grade-three diagram.** A three-row stack — familiarity / definition / practical bearings — with the third row exploding into effect-edges would carry beat 2 better than a generic concept orb.
- **Jamesian vs Peircean restatement as parallel text.** Beat 5–6 is a split. A two-column slide (1878 wording vs James 1906–07 wording vs 1903 imperative wording) would make the kidnap-and-fence story legible without reading narration.
- **Portrait opportunities.** Peirce (Q9317), James (Q123265), Dewey (Q131805) can carry Wikimedia portraits. Wright and the three scholars will render as primitives unless portraits are attached later.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A- | All named people, works, milestones, and coined terms from the seed. 26 nodes on a ~1,200-word seed — high end of small/medium. |
| Edge density | A | 2.08 (54/26). Cross-cluster: scholarship cites maxim; magazine broadcasts essays; pragmaticism opposes James. |
| Story arc quality | A | 9 beats, prescribed tension curve, climax on interpreter-conduct / 61 formulations. Closer applies the maxim to visualization. |
| Insight title quality | A | Seven claims, mix includes warning + finding + paradox + opportunity. Headline test held. |
| Cluster design | A- | Five clusters by function (core, people, 1877–78 texts, timeline, scholarship). Timeline cluster holding both milestones and `pragmaticism` is slightly mixed. |
| Entity visual-model opportunity | B+ | Three strong portraits (Peirce, James, Dewey), one magazine mark, no 3D asset. Most nodes are concepts and will stay geometric. |
| Slide / narrative surface | A- | Beats map to a horizontal deck. Beat 2 (grades) and beats 5–6 (split) want companion diagrams. |

## Skill-Level Recommendations

1. Add a short **History of Ideas** note under Reflective: keep the datable-event chain when years exist; skip legal/compliance rows without forcing N/A theatre.
2. SOP should warn against attaching a movement QID to a maxim/principle node.
3. When the source *is* a visualization instruction (maxim, method, SOP), require one insight that applies the method to the graph being built. That is the difference between illustrating a topic and obeying it.
