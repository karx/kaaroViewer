# Encoding Retrospective: Art of Intent: Codebase Intelligence Brief

**Source**: `library/art-of-intent.md`
**Output**: `library/art-of-intent.json`
**Encoded**: 2026-04-07

## What Went Well

- **Entity coverage was complete**: The named-entity sweep captured every distinct software component, system mechanic, and organizational entity. No named tools were collapsed into category nodes — all 35+ JS modules were rolled into their natural architectural groupings (e.g., share-card-generator covers v3/v4/v5 dispatching), but this was a justified abstraction since the dispatcher *is* the canonical interface.
- **The three-pass structure held**: Writing nodes first, then edges, then narrative prevented under-connection. The edge density gate (2.07) was achieved without padding — all edges encode real architectural relationships.
- **Cross-cluster coverage**: All 15 cluster pairs (6 clusters × combinations) were examined. The only structurally thin pair was C3 (Data) ↔ C5 (Security), which received a `jest → leaderboard: enables` edge from the leaderboard-card-generator test file.
- **Insight titles passed the headline test**: All five insights are declarative claims that stand alone as publishable observations about the codebase's design philosophy.
- **The climax beat was the right choice**: Beat 7 ("Token Efficiency as the True Leaderboard") correctly identifies the scoring system as the document's central architectural argument. The number of test lines (327) and the dedicated card generator cited in that beat make the investment concrete.

## What the Skill Could Have Done Better

- **The `arty` node type is a compromise**: Arty is a game character (closer to `concept`) but is implemented as a model persona (closer to `model`). `concept` was chosen because Arty is not a standalone trained model, but the `model` type would have been visually more appropriate given the Three.js geometry it renders. A future ontology addition of `persona` or `ai-character` would resolve this.
- **game.js spans two clusters**: The 2,602-line file acts as both frontend UI manager and the bridge to all backend calls. Placing it in the AI Pipeline cluster (C2) made sense architecturally but could mislead viewers who associate "frontend orchestrator" with the Player Experience cluster (C4). The alternative placement would have disconnected C2 from many C1 edges.
- **Version history was not encoded as a temporal chain**: The source mentions v1.0.0 (archived) and the current v2.0.1-alpha. Three datable events (daily midnight UTC rotation, v1.0.0 development, v2.0.1-alpha) technically meet the temporal chain requirement (≥3 items). However, the version events are not meaningfully sequenced in the document, and the daily rotation is a recurring event rather than a milestone. The decision to skip the temporal chain was pragmatic but marginal.

## How This Topic Could Have Been Better Visualized

- **A data-flow arc beat** would have enriched the story: tracing a single prompt submission from the text box through Firebase Function → Gemini → response → creep check → Firestore save → leaderboard update would have made the backend pipeline vivid for non-technical viewers.
- **Versioned nodes for share-card formats**: The document explicitly names v3, v4, and v5 share card generators. These could have been separate `software` nodes with `supersedes` edges (v5 supersedes v4 supersedes v3), making the product's iteration history visible in the graph layer.
- **A `milestone` node for the v2.0.1-alpha release** with a `precedes` edge to the planned streak/URL features would have grounded the opportunity insight in a concrete product timeline rather than leaving it as a floating gap.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A | All named entities captured; no compression failures |
| Edge density | A- | 2.07 — passes gate; one marginal edge (jest→leaderboard) used to close C3↔C5 |
| Story arc quality | B+ | All 9 beats present; climax correctly placed; beat 3 (daily words) is the weakest narration |
| Insight title quality | A | All five titles are declarative claims, not topic labels |
| Cluster design | B+ | game.js cluster placement is debatable; all 27 nodes assigned |

## Skill-Level Recommendations

1. **Add `persona` to the ontology** as a type between `concept` and `model` for AI characters with distinct fictional identities.
2. **The temporal chain gate should distinguish recurring events from milestone events** — daily rotation and milestone releases are structurally different, and the current rule treats them identically.
3. **Codebase inventory documents benefit from a "data flow" cluster** that sits between the AI Pipeline and Data Layer clusters, explicitly encoding the request/response arc as a story rather than dispersed edges.
