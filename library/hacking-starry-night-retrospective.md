---
published: false
title: "Encoding Retrospective: Hacking Starry Night"
tags: [visualize-skill, encoding-retrospective, computer-vision, ebrain]
description: "Class-A encoding of the Starry Night puzzle co-pilot essay: dual Reflective+Toolkit profile, named-tool sweep held, FDV as climax, and SOP notes on missing puzzle/hardware types and camera FOV."
date: 2026-09-15
layer: L1-Instance
maturity: BUDDING
para: Crystallized
---

# Encoding Retrospective: Hacking Starry Night

**Source**: `Hacking Starry Night - An AI Co-pilot.md` (vault: `D:/src/eBrain/1 Projects/vanGoghPuzzle/`)
**Output**: `library/hacking-starry-night.json`
**Encoded**: 2026-09-15

## What Went Well

- **Dual-profile sweep held**: the source is a reflective eBrain essay *and* a named-tool build log. Every named product in the stack table (React, Vite, Node.js, Express, Google Cloud Vision, Gemini, JSON store, local Wi-Fi, GitHub kaaro-puzzle) became its own node. No `cv-stack` or `frontend-tools` category compression.
- **Causal spine is load-bearing**: staring strategy → Feature Distance Vector (3× gradient vs color) is the weight-5 edge; co-pilot → searching-vs-hunting is the other. The graph says the same thing the essay does.
- **Temporal chain is in the graph layer**: Attempt #1 → #2 → #3 (2026) → Art Project OOM → piece extraction, with `precedes` edges. Story beats reference those event nodes rather than inventing a floating timeline.
- **Climax beat is the right one**: beat 7 ("The Stare Becomes a Vector") is the moment the human heuristic is compiled into arithmetic. The 87% church-spire UX and the "we're going to finish" closer are aftermath, not the peak.
- **Insight titles pass the headline test**: each names a subject, a mechanism, and a direction (3× weight; 100% template failure; engine/instance split; refuse-to-place paradox; stare-was-right; Water Lilies as generalization test).
- **Validator**: `.claude/hooks/validate-library-json.py` exit 0, zero warnings.

## What the Skill Could Have Done Better

- **Two domain profiles at once**: Reflective says skip the datable-events chain; Toolkit says keep every named product. The source needed both. The skill presents profiles as exclusive. A "build essay / lab notebook" profile (physical-world tool-building with a thesis) would have named the required mix instead of forcing a choice.
- **No `puzzle` / `physical-object` type**: the 2,000-piece box is the gravitational object of the report. Encoded as `concept` because nothing else fits. `artwork` is the painting, not the jigsaw. After three physical-making documents this would be an ontology candidate; for now it is a stretch of `concept`.
- **`focus` is only `wide` | `tight`**: the canvas camera is 55° FOV in `canvas/scene.mjs`. The parent brief called FOV creative control on story beats; the SOP only exposes a binary zoom hint. Numeric per-beat FOV (or `dolly`) is not in the schema, so rhythm was encoded only as wide/tight alternation. Beat 7 (vector internals) wanted a tighter FOV than beat 2 (two blue pieces) but both are `tight`.
- **TaskRabbit was excluded**: named only as a gloss ("India's TaskRabbit") for Urban Company. Valid exclusion, but the Toolkit profile's "every named product" rule does not distinguish glosses from actors. The retrospective check would currently score this as a compression failure; it is not.
- **Author is in narration, not a `person` node**: consistent with `what-are-agents-teaching-us` and `art-of-intent`. Wife is unnamed. Van Gogh is the only person node. Fine for an essay, but a biographical profile would have demanded Kartik as protagonist.
- **Gemini QID `Q125923213` is a best-effort lookup** (Google Gemini chatbot). Cloud Vision has no QID (`null` deliberate). Google Art Project uses `Q1536343` (Google Arts & Culture, the successor). Enrichment may miss or mis-date these.

## How This Topic Could Have Been Better Visualized

- **Companion diagram (high value)**: the source already draws the pipeline as ASCII — Piece image → Feature extraction → Reference scan → Feature Distance Vector → Heatmap. That shape is the climax argument. An Excalidraw in `library/diagrams/hacking-starry-night/` would carry beat 7 better than the graph alone. Flagged as a slide/narrative surface need.
- **Entity visual models**: The Starry Night (Q45585) and Van Gogh (Q5582) should render as actual images, not primitives, once enrichment/Wikimedia is wired. React / Node / Google marks would also beat cyan spheres. The wooden table and heatmap overlay are the other two assets worth a real texture.
- **Live confidence as a metric arc**: 29% (R22 C9) and 22.4% (R35 C16) are the only empirical CV outputs in the source. They sit on `oom-art-project` metrics. A `metric` node pair with `achieves` edges from the matcher would make the "table-in-frame" warning visible as yellow arcs rather than only as insight evidence.
- **Data-flow story beat**: a single piece's path from phone camera → local Wi-Fi → Express upload → extraction mask → FDV scan → heatmap → human click would make the one-handed constraint vivid for non-CV viewers. Currently that path is edges plus beat 8 narration, not a dedicated beat.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A | Named-tool sweep complete; TaskRabbit gloss excluded on purpose; wife unnamed |
| Edge density | A | 91/39 = 2.33; weight 4–5 at 19.8% (18/91); two weight-5 thesis edges |
| Story arc quality | A- | 9 beats, one climax, numbers in both high beats and climax; beat 6 (OOM) is slightly more lab-log than drama |
| Insight title quality | A | All six are declarative claims; mix includes finding + warning as required |
| Cluster design | A- | Function/role names; C6 (stack) is membership-shaped by necessity — the stack table *is* a membership list |
| Entity visual-model opportunity | B+ | Painting + Van Gogh portrait are obvious; heatmap overlay and table photo exist in the vault note as pasted images but were not copied (vault is read-only) |
| Slide / narrative surface | A- | Arc maps to a 9-slide deck; beat 7 needs the FDV pipeline diagram to land for a non-technical audience |

## Skill-Level Recommendations

1. **Add a "Build essay / lab notebook" domain profile** for sources that are both a thesis and a named-stack build (this note, future eBrain writeups). Mandate: named tools as nodes, engine/instance or architecture split as a concept node, at least one `warning` about the physical/noisy world, and a temporal chain if attempts are numbered.
2. **Clarify Toolkit's "every named product" rule for analog glosses** ("X, India's Y"). Y should be excludable with a one-line reason without failing the retrospective check.
3. **If camera FOV becomes per-beat creative control**, extend `story[].focus` beyond `wide`/`tight` (numeric FOV or `wide|medium|tight`) and document it in `sop-reference.md` + validator. Until then, encoders should treat `focus` as the only legal camera knob.
4. **Consider `physical-object` or reuse `artwork` guidance for jigsaws, props, and capture environments** after two more physical-making briefs. One-off: keep stretching `concept` + `place`.
