# HeroVisual retrospective — esp-ecosystem — 2026-09-17

**Provider:** TypeSafe Jev (`jev-latest`), gate 0.7 · **Hops:** 9 (6 model / 3 heuristic on the shipped build; the first build was 7 / 2) · **Layout:** slide-deck (only candidate; no layout hop) · **Elements:** 26 · **Usage:** ~2 000 in / ~320 out tokens, one call.

## Decisions (shipped build)

| Hop | Heuristic | Jev | Confidence | Shipped |
|---|---|---|---|---|
| slot:slide-deck:grouping | cluster-slide | cluster-slide | 0.86 | Jev (agrees) |
| capacity:slide-deck:grouping | all (4) | all | 0.74 | Jev (agrees) |
| capacity:slide-deck:narrative | all (8) | all | **0.66** | heuristic (below gate; 0.77 on the first build) |
| slot:slide-deck:analysis | insight-slide | insight-slide | **0.61** | heuristic (below gate) |
| capacity:slide-deck:analysis | all (5) | all | **0.68** | heuristic (below gate) |

Jev is not fully deterministic: the narrative-capacity hop moved from 0.77 to 0.66 between two
identical requests and crossed the gate. The answer did not change, and the heuristic default is the
same answer, so the deck is identical either way. Worth knowing before treating confidence as a
stable number; a hop that straddles the gate should be re-asked or the gate set with margin.

## What the deck gained

- Confirmation with numbers: on a small brief Jev is confident about one-slide-per-item
  (grouping 0.87, narrative 0.77) and, as on kaaro-viewer, least sure about how to present insights.
- Four enrichment lines. The `why` on the causal chain is the line the brief's own narration never
  states outright: Arduino → lock-in → maintenance burden is the cheapest start and the most
  expensive exit.

## What fell back, and why

The same two analysis hops as kaaro-viewer, at slightly higher confidence (0.62 / 0.66 vs 0.40 / 0.50).
Two entries, same weak spot: the analysis slot question. See the kaaro-viewer retrospective for the
proposed `composition` hop.

## Enrichment notes

- `cluster-overview` is not placed on this deck (4 clusters, requires ≥ 5), so there is no overview
  caption; the per-cluster slides carry their own descriptions.
- The bridges caption needed to cover three directions (frameworks → tooling, frameworks → hardware,
  deployment → frameworks); one sentence held it, but only just.

## Registry gaps observed

- No widget consumes `report_card.themes`; on a toolkit-comparison brief a `themes-strip` (input:
  `report_card`) would sit naturally after the briefing.
- `timeline` stays proposed: this brief has no temporal edges.
