---
published: false
title: "enrichers/ — Enrichment Adapter Registry"
tags: [enrichment-pipeline, adapters, knowledge-graph, kaaroviewer]
description: "Seven enrichment adapters for the Stage 3 fan-out pipeline. Each adapter takes a cross-source ID map and returns a structured AdapterResult: metrics, summary, thumbnail, external links, related IDs."
date: 2026-04-23
layer: L2-System
maturity: BUDDING
para: Area
---

# enrichers/ — Enrichment Adapter Registry

Seven adapters, all registered at pipeline startup via `enrichment-coordinator.mjs`. Each implements the `AdapterFn` contract:

```js
async function enrich(entityId, sourceId, idMap) → AdapterResult
```

`sourceId` is the source-specific identifier from the Stage 2 NED++ resolution (e.g. a Wikidata QID for the wikidata adapter, a YouTube channel ID for youtube). If null, the adapter should skip silently via `nullResult(source)`.

## Adapters

| Adapter | Source | Auth required | What it fetches |
|---------|--------|--------------|-----------------|
| `wikidata.mjs` | Wikidata SPARQL endpoint | None | P-statements (dates, images, website, population), related QIDs, canonical label |
| `wikipedia.mjs` | Wikipedia REST API v1 | None | Summary prose + first 3 content sections |
| `youtube.mjs` | YouTube Data API v3 | API key (`yt_api_key` in localStorage) | Channel stats (subscribers, views, videoCount), latest 6 video titles |
| `reddit.mjs` | Reddit public JSON API | None | Subreddit metadata (subscribers, description), hot post titles. Uses corsproxy.io for CORS |
| `github.mjs` | GitHub REST API | None (60 req/hr unauthenticated) | Repo stats (stars, forks, issues, language), user top repos, name search fallback |
| `npm.mjs` | npm registry + downloads API | None | Package metadata (version, description, homepage), last-month download count |
| `hackernews.mjs` | HN Algolia API | None | Story count, top story score, total comment volume, best-matching story title |

## AdapterResult schema

```js
{
  source:      string,       // adapter name
  metrics:     object,       // key → { value, unit } pairs — namespaced by coordinator
  links:       string[],     // external URLs
  related_ids: string[],     // IDs of linked entities within this source
  summary:     string,       // prose description (wikipedia preferred, then wikidata)
  thumbnail:   string|null,  // representative image URL
  error:       string|null,  // set if adapter failed (non-throwing)
}
```

## Registry (`index.mjs`)

`index.mjs` provides the adapter registry and fan-out runner:

- `register(source, fn)` — register an adapter
- `getAdapter(source)` — retrieve by name
- `listAdapters()` — list registered names
- `runAdapters(idMap, sources?)` — fan-out, returns `AdapterResult[]`
- `mergeResults(results[])` — merge into a single node patch (wikipedia > wikidata for summary; metrics namespaced by source)
- `makeResult(source, fields)` / `nullResult(source)` — factory helpers

## Adding a new adapter

1. Create `enrichers/<source>.mjs` exporting `async function enrich(entityId, sourceId, idMap)`
2. Import and call `makeResult` / `nullResult` from `./index.mjs`
3. Add a `{ source, path }` entry in `_loadAdapters()` in `pipeline/enrichment-coordinator.mjs`

Adapters must not throw — catch errors and return `makeResult(source, { error: err.message })`.

## Related

- [[pipeline-README]] — coordinator that loads and runs these adapters
- [[enrichment-pipeline-crystallized]] — decisions and lessons from building the Stage 3 system
