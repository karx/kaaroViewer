# kaaroViewer — Exploration Pipeline Plan

**Created**: 2026-04-20  
**Status**: ✓ Shipped — April 2026 (PR #48)
**Scope**: Seed-to-canvas exploration pipeline with parallel deterministic enrichment  
**Prior art**: `PRODUCT_ROADMAP.md` (infra), `IMPROVEMENT_PLAN.md` (canvas UX), `named-entity-detection-improvement.md` (NED research)

> **Crystallized.** This was the planning document for the enrichment pipeline. It shipped as `pipeline/explore.mjs` (Stage 1), `pipeline/ned-resolver.mjs` (Stage 2), `pipeline/enrichment-coordinator.mjs` (Stage 3), and `pipeline/completion.mjs` (Stage 4). See `library/enrichment-pipeline-crystallized.md` for decisions, hard-won lessons, and reusable patterns.

---

## Problem Statement

The current data loading model requires a pre-existing document. The user manually gathers a source, the `/visualize` skill encodes it into a library JSON, and the canvas renders that fixed artifact. This works for known documents but breaks down for exploration:

- **Coverage ceiling** — Wikidata is an encyclopedia. It covers major entities well; anything niche (a YouTube channel, a subreddit, a mid-tier tool) returns near-empty SPARQL results.
- **No enrichment adapters** — YouTube, Reddit, Wikipedia prose, GitHub all have well-structured APIs but no pipeline module targets them.
- **Single input path** — everything goes through text → OpenTapioca → Wikidata SPARQL. One point of failure, no fallback, no depth.
- **Document-first** — there is no "I'm curious about X, show me a graph" entry point. The user must already have a document.

---

## Solution: 5-Stage Exploration Pipeline

A seed (topic / URL / name / text) enters the pipeline. Stage 1 produces a renderable working brief immediately. Stages 2–4 enrich and complete it. Stage 5 emits to canvas. Enrichment results surface as user-driven `[ EXPAND ]` / `[ RETHINK ]` controls — there is no algorithmic rewrite threshold.

```
SEED
(topic / URL / name / text snippet)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1 — LLM EXPLORATION + NARRATIVE                      │
│                                                             │
│  Input : seed + optional context                            │
│  Output: working brief (renderable immediately)             │
│                                                             │
│  • Entity list with inferred relationships                  │
│  • Confidence score per entity (0.0–1.0)                    │
│  • Full story arc: beats, tension levels, climax            │
│  • Draft insights (finding / warning / pattern / etc.)      │
│  • Cluster hypotheses                                       │
│  • Layout hints (spatial intent signals for Stage 4d)       │
│  • enrichment_targets[] with priority per node              │
│                                                             │
│  → Canvas renders this brief immediately, no quality gate   │
│    Low-confidence nodes show dimmed aura                    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2 — NED++ RESOLUTION                                 │
│                                                             │
│  Input : entity list from Stage 1                           │
│  Output: cross-source ID map per entity (cached)            │
│                                                             │
│  Path A  high-confidence text match                         │
│            OpenTapioca → Wikidata QID                       │
│  Path B  source-specific heuristic                          │
│            entity.type === 'channel' → YouTube search API   │
│            entity.type === 'subreddit' → Reddit name match  │
│            entity.type === 'software' → GitHub slug search  │
│  Path C  ambiguous                                          │
│            LLM picks from top-3 candidates using seed ctx   │
│                                                             │
│  ID map: { wikidata, youtube, reddit, github, ... }         │
│  Cached permanently by entity label + type                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 3 — PARALLEL ENRICHMENT ENGINE                       │
│                                                             │
│  Input : cross-source ID map from Stage 2                   │
│  Output: enriched node objects + delta classification       │
│                                                             │
│  Adapters run in parallel, isolated pure functions:         │
│    wikidata   → facts, P-statements, related QIDs, dates    │
│    wikipedia  → prose summary, infobox, key sections        │
│    youtube    → subscriber count, videos, topics, collabs   │
│    reddit     → sub count, post volume, sentiment signal    │
│    github     → stars, forks, language, recent activity     │
│    rss / web  → recent article titles, publication dates    │
│                                                             │
│  Common adapter output schema:                              │
│    { source, metrics{}, links[], related_ids[], summary }   │
│                                                             │
│  Adapter failure: silent. Logs to logger.mjs. No block.     │
│  Canvas streams node updates as adapters resolve.           │
│                                                             │
│  Delta classification on completion:                        │
│    node-level patch   → silent update (metrics / desc)      │
│    structural delta   → expose [ EXPAND ] [ RETHINK ]       │
│    sentiment flip     → expose [ RETHINK ] + callout        │
│                                                             │
│  [ EXPAND ]   → add enrichment findings, preserve arc       │
│  [ RETHINK ]  → feed enriched data back to Stage 1,         │
│                 regenerate narrative from scratch            │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 4 — COMPLETION + LAYOUT                              │
│                                                             │
│  4a  ENTITY COMPLETENESS                                    │
│      Story beats reference node X → X must exist as node   │
│      Add any nodes missing from the graph                   │
│                                                             │
│  4b  BACKGROUND ENRICHMENT                                  │
│      Attach adapter data to nodes:                          │
│      metrics{}, description, external links, wikidata QID   │
│                                                             │
│  4c  RELATIONSHIP GAP FILL                                  │
│      Cross-check edges vs enriched data                     │
│      Add relationships surfaced by adapters that Stage 1    │
│      did not infer (collab edges, fork chains, cross-posts) │
│                                                             │
│  4d  LAYOUT + PLACEMENT                                     │
│      Pre-compute spatial anchor positions:                  │
│      • tier → radial distance from origin                   │
│      • cluster → spatial zone assignment                    │
│      • edge weight → proximity pull strength                │
│      • spine nodes → canvas origin anchors                  │
│      • Stage 1 layout_hints as soft constraint signals:     │
│          oppose[]          → opposite canvas hemispheres    │
│          anchor[]          → locked to origin zone          │
│          timeline_axis[]   → arranged left-to-right         │
│          push_peripheral[] → pushed to outer ring           │
│      Physics engine fine-tunes within these constraints     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 5 — PLOT + VISUALIZE                                 │
│                                                             │
│  Input : finalized brief + layout coordinates               │
│  Output: live canvas                                        │
│                                                             │
│  • Emit nodes incrementally (spine first, then primary)     │
│  • Apply pre-computed layout anchor positions               │
│  • Set initial camera to spine cluster centroid             │
│  • Trigger narrative overlay if story beats exist           │
│  • Stream enrichment patches as remaining adapters land     │
│                                                             │
│  No decisions made here — pure emission only.               │
│  Output target is swappable:                                │
│    Three.js canvas / static SVG / shareable JSON URL        │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Decisions (Resolved)

| Decision | Resolution |
|---|---|
| Rewrite threshold | **User-driven**. No algorithmic threshold. Enrichment delta surfaces `[ EXPAND ]` / `[ RETHINK ]` controls. |
| Layout authority | **Hybrid**. LLM outputs `layout_hints` in Stage 1 as spatial intent signals. Layout engine in Stage 4d uses them as soft constraints; physics fine-tunes. |
| Stage 1 quality gate | **None**. Working brief renders immediately regardless of completeness. 3-node stubs are valid. |
| Adapter failure policy | **Silent**. Each adapter is an isolated pure function. Failures log to `logger.mjs` but do not block the pipeline. |
| NED++ cache | **Permanent**. Cross-source ID map cached by `(label, type)`. Once "Lex Fridman" resolves, all future briefs reuse the map. |
| Adapter conflict resolution | `wikidata` wins on canonical properties (dates, relationships). Source-specific metrics are non-conflicting keys. `wikipedia` preferred for prose. |
| Stage 5 coupling | Stage 5 is output-target agnostic. Three.js canvas is the default target; same pipeline can emit to SVG or JSON. |

---

## Stage 1 — LLM Output Schema

Stage 1 produces a partial library JSON with two additional fields:

```jsonc
{
  // Standard brief fields
  "meta":        { "id", "title", "subtitle", "domain", "year", "tags", "tone" },
  "nodes":       [ { ...standard node, "confidence": 0.0 } ],
  "edges":       [ { ...standard edge } ],
  "story":       [ { ...standard beat } ],
  "insights":    [ { ...standard insight } ],
  "clusters":    [ { ...standard cluster } ],
  "report_card": { ...standard report_card },

  // New fields
  "layout_hints": {
    "oppose":           [["cluster-id-a", "cluster-id-b"]],
    "anchor":           ["node-id"],
    "timeline_axis":    ["event-1", "event-2", "event-3"],
    "push_peripheral":  ["node-id"]
  },
  "enrichment_targets": [
    { "node_id": "string", "priority": "high | medium | low" }
  ]
}
```

`confidence` on nodes: drives visual treatment in Stage 5 — dimmed aura until NED++ resolves or adapter confirms.  
`enrichment_targets`: Stage 3 prioritizes spine and primary nodes first when adapter slots are constrained.

---

## Adapter Interface

All adapters implement the same pure function contract:

```js
// enrichers/{source}.mjs
export async function enrich(entityId, sourceId) {
  return {
    source:      'string',          // adapter name
    metrics:     {},                // key-value pairs with units
    links:       [],                // external URLs
    related_ids: [],                // IDs of linked entities in this source
    summary:     'string',          // prose for Stage 4b / narrative use
  };
}
```

Adapter registry in `enrichers/index.mjs` — add a source by registering one file. Pipeline does not change.

---

## NED++ Resolution Detail

One entity resolves to a cross-source ID map:

```json
{
  "label": "Lex Fridman",
  "ids": {
    "wikidata": "Q59735",
    "youtube":  "UCnUYZLuoy1rq1aVMwx4wneg",
    "reddit":   "lexfridman",
    "github":   "lexfridman"
  },
  "confidence": { "wikidata": 0.97, "youtube": 0.91 }
}
```

Resolution paths:
- **Path A**: OpenTapioca → QID (extends existing `entity_matching.mjs`)
- **Path B**: Source-type heuristic matchers (new — one per source)
- **Path C**: LLM disambiguation prompt with top-3 candidates + seed context

Cache store: `pipeline/ned-cache.json` (gitignored, local). In-memory during session, persisted on resolve.

---

## Files to Create / Modify

```
kaaroViewer/
├── pipeline/
│   ├── explore.mjs              NEW  Stage 1: seed → working brief via LLM
│   ├── ned-resolver.mjs         NEW  Stage 2: NED++ multi-source resolution
│   ├── ned-cache.json           NEW  Persistent ID map cache (gitignored)
│   ├── enrichment-coordinator.mjs  NEW  Stage 3: fan-out + merge + delta check
│   ├── completion.mjs           NEW  Stage 4a–4c: entity/edge gap fill
│   ├── layout-engine.mjs        NEW  Stage 4d: anchor position computation
│   └── local-graph.mjs          MOD  Register explore output as live graph entry
│
├── enrichers/
│   ├── index.mjs                NEW  Adapter registry
│   ├── wikidata.mjs             NEW  Deep SPARQL (extends fetch_knowledge.mjs)
│   ├── wikipedia.mjs            NEW  Prose summary + infobox
│   ├── youtube.mjs              NEW  YouTube Data API v3
│   ├── reddit.mjs               NEW  Reddit public JSON API
│   └── github.mjs               NEW  GitHub REST API (public repos, no auth)
│
├── canvas/
│   ├── explore-ui.mjs           NEW  Seed input + [ EXPAND ] / [ RETHINK ] controls
│   └── report.mjs               MOD  Handle live/streaming brief updates
│
└── EXPLORATION_PIPELINE_PLAN.md THIS FILE
```

---

## Implementation Phases

### Phase 1 — Adapter Foundation
*Build the enrichment interface before anything talks to it*

- [x] **EF-01** Define `AdapterResult` schema in `enrichers/index.mjs`
- [x] **EF-02** Create `enrichers/wikidata.mjs` — deep SPARQL with configurable hop depth (extract + extend from `fetch_knowledge.mjs`)
- [x] **EF-03** Create `enrichers/wikipedia.mjs` — Wikipedia REST API → prose summary + first 3 sections
- [x] **EF-04** Adapter registry in `enrichers/index.mjs` — `register(source, fn)` + `getAdapter(source)`
- [x] **EF-05** Logger integration — adapters emit `ENRICHER` type events to `logger.mjs`
- [ ] **EF-06** Unit tests: each adapter returns valid schema on a known entity; fails gracefully on invalid ID

**Acceptance criteria**: `enrichers/wikidata.mjs` called with `Q12345` returns a valid `AdapterResult`. `enrichers/wikipedia.mjs` called with `"Git"` returns prose summary. Unknown ID returns `null` without throwing.

---

### Phase 2 — NED++ Resolution Layer
*Deterministic entity → ID map, cached*

- [x] **NE-01** Create `pipeline/ned-resolver.mjs` — main resolution entry point
- [x] **NE-02** Integrate Path A: wrap existing OpenTapioca call in `entity_matching.mjs`, return QID + confidence
- [x] **NE-03** Implement cache layer — localStorage read/write, keyed by `${label}::${type}`
- [x] **NE-04** Implement Path B heuristic matchers:
  - [x] **NE-04a** YouTube: `channel` type → YouTube Data API search by name, threshold 0.85
  - [x] **NE-04b** Reddit: `subreddit` / `community` type → Reddit `/r/{name}/about.json` existence check
  - [x] **NE-04c** GitHub: `software` / `company` type → GitHub `/search/repositories` by name
- [ ] **NE-05** Implement Path C: LLM disambiguation — prompt with top-3 Wikidata candidates + seed context
- [x] **NE-06** Confidence scores attached to each resolved ID
- [ ] **NE-07** Unit tests: known entity resolves to correct QID; ambiguous entity invokes Path C; cache hit skips API call

**Acceptance criteria**: "Git" resolves to `Q186055` via Path A with confidence ≥ 0.9. "Fireship" resolves to a YouTube channel ID via Path B. Resolved map is written to `ned-cache.json`. Second call for same entity reads from cache without network round-trip.

---

### Phase 3 — Enrichment Coordinator + High-Signal Adapters
*Fan-out, merge, delta detection, UI controls*

- [x] **EC-01** Create `pipeline/enrichment-coordinator.mjs` — takes ID map array, fans out to adapters in parallel
- [x] **EC-02** Merge logic — combine adapter results into enriched node objects by priority rules
- [x] **EC-03** Delta classification:
  - [x] **EC-03a** Node-level patch: metrics/description changed → silent update
  - [x] **EC-03b** Structural delta: new high-weight entity found OR spine entity unresolvable → flag
  - [x] **EC-03c** Sentiment flip: Stage 1 sentiment contradicted by adapter signal → flag
- [x] **EC-04** Incremental canvas stream — emit node updates via `CustomEvent('explore:node-update')` as adapters resolve
- [x] **EC-05** `enrichers/youtube.mjs` — YouTube Data API v3 (channels + videos endpoint)
- [x] **EC-06** `enrichers/reddit.mjs` — Reddit public JSON API (no auth, `/r/{name}/about.json` + `/hot.json`)
- [x] **EC-07** `enrichers/github.mjs` — GitHub REST API `/repos/{owner}/{repo}`
- [x] **EC-07b** `enrichers/npm.mjs` — npm registry + downloads API (free, no auth) *(added)*
- [x] **EC-07c** `enrichers/hackernews.mjs` — Hacker News Algolia API, story count + top score *(added)*
- [x] **EC-08** Create `canvas/explore-ui.mjs`:
  - Seed input field (text box + submit, hotkey G)
  - `[ EXPAND ]` button (hidden by default, shown on structural delta)
  - `[ RETHINK ]` button (hidden by default, shown on structural delta or sentiment flip)
  - Delta callout panel (shows what enrichment found that changed the story)

**Acceptance criteria**: Seeding "Fireship" fans out to Wikidata + YouTube adapters in parallel. Both resolve within 5s. `[ EXPAND ]` appears if YouTube returns subscriber count and video list not in Stage 1 brief. Canvas updates channel node metrics without full re-render.

---

### Phase 4 — Stage 1 LLM Exploration Prompt + Completion Pass
*The narrative generation entry point*

- [x] **EX-01** Create `pipeline/explore.mjs` — main Stage 1 entry point
- [x] **EX-02** LLM exploration prompt: structured output → nodes + edges + story + insights + clusters + layout_hints + enrichment_targets
- [x] **EX-03** Confidence scoring per entity in prompt instruction
- [x] **EX-04** Layout hints schema: `oppose`, `anchor`, `timeline_axis`, `push_peripheral`
- [x] **EX-05** Working brief validation — ensure minimum: id, ≥1 node, valid meta. No quality gate on content.
- [x] **EX-06** Create `pipeline/completion.mjs` — Stage 4a–4c:
  - [x] **EX-06a** 4a: scan story beats for node references; add missing nodes as secondary stubs
  - [x] **EX-06b** 4b: attach enriched adapter data to matching nodes (merge into metrics, description, links)
  - [x] **EX-06c** 4c: compare enriched `related_ids` from adapters against edges; add missing edge stubs
- [x] **EX-07** `[ RETHINK ]` flow: pass enriched node data as context to Stage 1, regenerate full brief

**Acceptance criteria**: Seeding "Trunk-Based Development" produces a working brief with ≥ 5 nodes, ≥ 1 climax beat, ≥ 1 insight. Canvas renders within 3s of seed submission. Completion pass adds GitHub node if enrichment found a related repo not in Stage 1 output.

---

### Phase 5 — Layout Engine + Stage 5 Emission
*Intentional spatial placement, incremental canvas rendering*

- [ ] **LA-01** Create `pipeline/layout-engine.mjs` — Stage 4d spatial pre-computation
- [ ] **LA-02** Tier → radial distance mapping (spine: 0–2 units, primary: 3–6, secondary: 6–10, anchor: 10–14)
- [ ] **LA-03** Cluster → spatial zone assignment (divide canvas into N zones by cluster count)
- [ ] **LA-04** Layout hint processing:
  - [ ] **LA-04a** `oppose` pairs → assign to opposite hemispheres
  - [ ] **LA-04b** `anchor` nodes → lock to origin zone
  - [ ] **LA-04c** `timeline_axis` nodes → sort by date, distribute left-to-right on X axis
  - [ ] **LA-04d** `push_peripheral` nodes → place at outer ring regardless of tier
- [ ] **LA-05** Output: `node.position: { x, y, z }` added to each node before Stage 5
- [ ] **LA-06** Physics engine receives pre-computed positions as initial anchors, not random seed
- [ ] **LA-07** Stage 5 incremental emission: spine nodes first → primary → secondary → anchor
- [ ] **LA-08** Initial camera position: centroid of spine node positions, 15 units back

**Acceptance criteria**: Seeding "GitFlow vs Trunk-Based Development" places GitFlow and TBD on opposite sides of canvas (layout hint `oppose`). Timeline events appear left-to-right. Camera initialises facing the spine cluster. Nodes appear in order: spine (instant) → primary (200ms delay) → secondary (400ms) → anchor (600ms).

---

## Dependencies + External APIs

| API | Auth Required | Rate Limit | Free Tier |
|---|---|---|---|
| OpenTapioca | None | Generous | Yes |
| Wikidata SPARQL | None | 60 req/min | Yes |
| Wikipedia REST API | None | Generous | Yes |
| YouTube Data API v3 | API Key | 10,000 units/day | Yes |
| Reddit JSON API | None (public) | 1 req/sec | Yes (public endpoints) |
| GitHub REST API | None (public repos) | 60 req/hr unauth | Yes |
| LLM (Claude API) | API Key | Model rate limits | Paid |

YouTube and LLM require API keys. Store in `.env` (already gitignored). Reddit and GitHub public endpoints need no auth for basic stats.

---

## Open Items

- [ ] **Decide LLM provider for Stage 1 + Path C** — Claude API (Anthropic SDK) is the natural fit given existing skill infrastructure. Confirm model: `claude-sonnet-4-6` for Stage 1 (full narrative), `claude-haiku-4-5` for Path C disambiguation (cheaper, faster).
- [ ] **ned-cache.json persistence strategy** — local JSON file is fine for single-user. If multi-user, move to IndexedDB or a simple SQLite via better-sqlite3.
- [ ] **YouTube API key quota** — 10,000 units/day. Each search costs ~100 units, channel lookup ~1 unit. Monitor via logger.
- [ ] **Reddit rate limit handling** — 1 req/sec for unauthenticated. Enrichment coordinator needs a per-adapter rate limiter for Reddit specifically.
- [ ] **Wikidata deep hop depth** — currently 1 hop. Propose configurable (1–3). Default 2 for exploration mode, 1 for quick enrichment.

---

## Progress Tracker

| Phase | Status | Completed | Total |
|---|---|---|---|
| Phase 1 — Adapter Foundation | ✅ 5/6 done (EF-06 pending tests) | 5 | 6 |
| Phase 2 — NED++ Resolution | ✅ 5/7 done (NE-05 Path C hook, NE-07 tests pending) | 5 | 7 |
| Phase 3 — Enrichment Coordinator | ✅ Done (+npm, +HN adapters) | 10 | 10 |
| Phase 4 — Exploration Prompt + Completion | ✅ Done | 7 | 7 |
| Phase 5 — Layout Engine | Not started | 0 | 8 |
| **Total** | | **27** | **38** |

---

## Related Documents

- `PRODUCT_ROADMAP.md` — infrastructure and platform stability (Phase 0–5 original roadmap)
- `IMPROVEMENT_PLAN.md` — canvas UX improvements (ego-graph, cluster filter, edge labels)
- `named-entity-detection-improvement.md` — NED research: OpenTapioca baseline, REL, ExtEnD, transformer architectures
- `ENCODING_SOP.md` — `/visualize` skill reference (current document-first encoding path)

---

**Last updated**: 2026-04-20  
**Next review**: When Phase 1 completes
