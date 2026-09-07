# Encoding Retrospective: Red Bull Wololo: Londinium — April 2026

**Source**: `library/aoe-2-redbull-april-2026.md`
**Output**: `library/aoe-2-redbull-april-2026.json`
**Encoded**: 2026-06-07
**Run type**: Alone-Time pilot re-encode (Phase 2 of Life Architecture)

## What Went Well

The three-pass structure cleanly resolved all four critical gaps from the health-check report. The cross-cluster sweep was decisive: adding ~22 edges across cluster pairs (Competition↔Venues, Metagame↔Players, Qualification↔AoE2/4 Field) was the single act that moved density from 1.40 to 2.50. The six-cluster architecture maps tightly to the document's six narrative axes — Competition, AoE2 Field, AoE4 Field, Qualification Gauntlet, London Venues, Metagame Disruption — making the graph legible without labels.

The node count reduction (45 → 34) was a quality gain, not a loss. The original encoding had created abstract intermediate nodes for organizational entities and categories that diluted the graph's causal signal. The rebuild folded these back into edges and descriptions, leaving only named actors and mechanisms.

Fixing climax from 3 → 1 sharpened the story arc considerably. The Royal Albert Hall beat is the only valid climax — the first orchestral esports Grand Final in history. The Score Victory controversy (formerly a climax) correctly sits at `high` as a moment of peak tension without resolution, which is more accurate to its role in the narrative.

## What the Skill Could Have Done Better

The original encoding used `reveals` as a rel — a validator-rejected auto-generated rel. The three-pass structure should have flagged this: `reveals` was never in the valid rel list, and the encoder should have caught it during Step 2b. The fix was mechanical (`association` or `causes` depending on context) but should not have been needed.

The original also missed 12 unclustered nodes — a significant structural failure. The cluster step in Step 2c explicitly requires "every node in exactly one cluster." The gap occurred because the original run created the nodes array incrementally across multiple passes and did not perform a final cluster-coverage audit before writing.

The first encoding used `product` and `location` as node types, which don't exist in the validator's VALID_TYPES. The skill's SOP now specifies VALID_TYPES in Step 2a. Future runs should check `place` for venues and `software`/`dlc` for game titles.

## How This Topic Could Have Been Better Visualized

The venue escalation (Shoreditch → Leicester Square → Royal Albert Hall) is inherently spatial and sequential — a map of London with venue nodes at real geographic positions would make this structure immediately obvious. The canvas's current layout algorithm doesn't support geo-anchored placement.

The civilization draft dynamics (Mapuche countered by Hera, Jin Dynasty's cavalry mechanics) would benefit from dedicated `civ` nodes per unique unit — Kona, Bolas Rider, Mounted Grenadier, Iron Pagoda — as secondary nodes linked to their parent civ. The current encoding collapses unit details into metrics, which the canvas can't render as interactive detail.

The broadcast co-stream ecosystem (Twitch, YouTube, Kick, SteamTV, Watch Parties) is entirely absent from the graph. For a tournament brief, audience infrastructure is a secondary narrative worth capturing.

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|
| Node coverage | A | 34 nodes covers all named players, venues, DLC, qualification events, format mechanisms |
| Edge density | A | 85 edges / 34 nodes = 2.50 — comfortably above 2.0 threshold |
| Story arc quality | A | 10 beats, clean tension arc, single climax at Royal Albert Hall with orchestra detail |
| Insight title quality | A | All six titles are declarative claims with named subject + mechanism + direction |
| Cluster design | A | 6 clusters map to 6 functional axes; all 34 nodes covered |
| Entity visual-model opportunity | B+ | hera, theviper, marinelord → portrait photos; rbw-londinium → tournament logo; royal-albert-hall → venue photo; mapuche → civilization artwork. 5–6 entities could carry real images vs. geometric primitives |
| Slide / narrative surface | A | 10 beats map cleanly to slides. Beat 6 (Score Victory) would benefit from a companion timeline diagram showing game-minutes vs. score trajectory. Beat 8 (Royal Albert Hall) benefits from the venue photo |

## Skill-Level Recommendations

1. **Add a type-lookup step in Step 2a**: Before writing any node, require a quick `VALID_TYPES` check. The `product` and `location` errors in the original encoding would be caught immediately.
2. **Mandatory cluster-coverage audit at end of Step 2c**: After writing clusters, compute `Set(nodes) - Set(clustered_node_ids)` and fail if non-empty.
3. **Esports-specific encoding profile**: The document has recurring structures (players, DLC, qualification circuits, venues, format mechanics) that don't fit cleanly into the existing profiles (Legal, Toolkit, Academic, Reflective). An Esports profile would specify `tournament` for events, `player` for competitors, `civ`/`dlc` for game content, `place` for venues.
