---
published: false
title: "pipeline/ — Knowledge Graph Generation Pipeline"
tags: [enrichment-pipeline, knowledge-graph, kaaroviewer]
description: "The 4-stage pipeline that turns a seed string into an enriched knowledge graph. Stage 1: LLM working brief. Stage 2: NED++ entity resolution. Stage 3: multi-adapter enrichment with delta classification. Stage 4: completion."
date: 2026-04-23
layer: L2-System
maturity: BUDDING
para: Area
---

# pipeline/ — Knowledge Graph Generation Pipeline

Four stages, each independent module. Stages communicate via the return value (sync hand-off) and via `document.dispatchEvent(CustomEvent)` (async streaming to canvas).

## Stages

### Stage 1 — `explore.mjs`
`explore(seed) → Promise<brief>`

LLM generates a **working brief**: nodes, edges, story beats, insights, clusters, enrichment targets, layout hints. Uses Gemini with a model cascade and 429 backoff. Emits `explore:brief-ready`.

Also exports `rethink(brief, patches)` — re-generates brief with enrichment context for the RETHINK flow.

### Stage 2 — `ned-resolver.mjs`
`resolveEntity({ label, type }) → Promise<idMap>`
`resolveEntities(entities[], opts) → Promise<idMap[]>`

NED++ entity resolution. Maps entity labels to source IDs: `{ wikidata?, youtube?, reddit?, github? }`. Resolution paths: OpenTapioca → Wikidata wbsearchentities → source-type heuristics → LLM disambiguation. Results cached in localStorage permanently.

### Stage 3 — `enrichment-coordinator.mjs`
`runEnrichment(brief, opts) → Promise<EnrichmentReport>`

Fan-out: resolves all brief nodes via Stage 2, then runs all registered adapters in parallel (concurrency=3 by default). Classifies delta per node (`none | patch | structural | sentiment`). Streams `explore:node-update` and `explore:delta` events to canvas as adapters resolve.

`applyPatches(brief, patches)` — merges enriched patches back into brief nodes in-place.

### Stage 4 — `completion.mjs`
`scanStoryBeats(brief)`, `attachEnrichment(brief, patches)`, `addEdgeStubs(brief, patches)`

Fills gaps: node stubs for beat references, merged enrichment data, edge stubs from adapter discoveries.

## Supporting modules

| Module | Role |
|--------|------|
| `graph.mjs` | Graph store — add/get/list nodes and edges |
| `input.mjs` | Unified input bus — text, speech, click |
| `resolver.mjs` | Legacy entity resolver (pre-NED++) |
| `enrichment.mjs` | Legacy enrichment (pre-coordinator) |
| `sessions.mjs` | Session save/restore (localStorage) |
| `knowledge.mjs` | Wikidata SPARQL knowledge fetcher |
| `local-graph.mjs` | Local codebase graph builder |
| `sources/vault.mjs` | VaultSource — loads personal knowledge garden |
| `sources/` | Other content source implementations |

## Event bus (CustomEvents on `document`)

| Event | Detail | Emitter | Consumer |
|-------|--------|---------|----------|
| `explore:brief-ready` | `{ brief, seed, isRethink? }` | `explore.mjs` | `main.mjs` canvas |
| `explore:node-update` | `{ nodeId, patch, deltaType }` | coordinator | canvas |
| `explore:delta` | `{ type, deltas[] }` | coordinator | UI controls |

## Adapter registration

Adapters auto-register via import in `enrichment-coordinator.mjs`. To add a new adapter:
1. Create `enrichers/<source>.mjs` exporting `async function enrich(idMap) → patch`
2. Add an import entry in `_loadAdapters()` in `enrichment-coordinator.mjs`

## Related

- [[enrichment-pipeline-crystallized]] — crystallization note, design decisions, hard-won lessons
- [[canvas-README]] — the canvas that consumes pipeline events
- [[GARDEN_INTEGRATION]] — vault source integration
