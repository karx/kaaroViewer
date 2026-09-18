# HeroVisual retrospective — kaaro-viewer — 2026-09-17

**Provider:** TypeSafe Jev (`jev-latest`), gate 0.7 · **Hops:** 19 (13 model / 6 heuristic) · **Layout:** compact-deck · **Elements:** 23 · **Usage:** 3 460 in / 695 out tokens, one call.

## Decisions

| Hop | Heuristic | Jev | Confidence | Shipped |
|---|---|---|---|---|
| layout | compact-deck | compact-deck | 0.88 | Jev (agrees) |
| slot:compact-deck:grouping | cluster-overview | cluster-overview | 0.78 | Jev (agrees) |
| capacity:compact-deck:narrative | all (12) | all | 0.85 | Jev (agrees) |
| slot:compact-deck:analysis | insight-matrix | insight-matrix | **0.40** | heuristic (below gate) |
| capacity:compact-deck:analysis | all (4) | all | **0.50** | heuristic (below gate) |
| capacity:compact-deck:grouping | all (1) | all | **0.63** | heuristic (below gate) |
| slot:slide-deck:analysis | insight-slide | insight-slide | **0.45** | heuristic (unchosen layout) |
| slot:slide-deck:grouping | cluster-slide | cluster-slide | **0.44** | heuristic (unchosen layout) |

Every Jev answer matched the heuristic's answer; the difference is that 13 of them now carry a
calibrated confidence, and the six that fell back are exactly the subjective ones (how to present
insights, how many).

## What the deck gained

- Nothing structural on this entry: Jev confirmed the compact-deck routing end to end, with high
  confidence on layout, overview, arc, narrative and metrics. That is the useful result: the
  heuristic's rules for large briefs are not idiosyncratic.
- Five authored enrichment lines: a tagline, captions on the cluster overview, insight matrix and
  bridges, and a "why" on the causal chains. These are what the plain routed deck lacked.

## What fell back, and why

All six fallbacks are about the **analysis** slot (matrix vs per-item insights, and how many) and the
grouping capacity. Jev's probabilities were flat there. That is a real signal about the question, not
the model: the slot hop asks which widget should *lead*, but the good answer on a large brief is
"both, matrix first", which the options do not express. Candidate fix: a `composition` hop kind
("matrix only / matrix + top 3 / all items") that replaces slot+capacity for slots with a summary widget.

## Enrichment notes

- The causal chains all terminate at the Three-Part Lock, which made the `why` line easy and true.
- The bridges caption had to name the bidirectional Drift ↔ Lock pair; the widget shows both edges
  as separate rows, so the caption is what tells the reader they are one relationship.

## Registry gaps observed

- `composition` decision kind (see above) — a questionnaire change, not a widget.
- A `decision-trail` HUD widget (input: `hero.decisions`) would let a reader see which slides were
  model-chosen; the data is already in the hero.

## First build defects (fixed before this hero shipped)

- Capacity hop default was `String(min(n, max))`, which can be `4`, outside the level set → validator caught it.
- A forced slot answer restricted the slot to one widget; it now *leads* the slot and the remaining
  candidates fill leftover capacity, which restored insight-slide ×3, causal-chain and cluster-bridges.
