---
published: true
title: "kaaroViewer"
tags: [kaaroviewer, knowledge-graph, three-js, enrichment-pipeline]
description: "A real-time knowledge graph viewer with an LLM-driven enrichment pipeline, Three.js canvas, and interactive narrative slides. Type or speak a seed → the system builds a richly connected graph, enriches it from Wikidata/Wikipedia/GitHub/HN/YouTube/Reddit/npm, and presents it as navigable story beats."
date: 2026-04-23
layer: L2-System
maturity: BUDDING
para: Area
---

# kaaroViewer

A real-time immersive knowledge graph platform. Type or speak any seed → an LLM builds a knowledge graph → seven enrichment adapters fill in real-world data → the graph renders on a Three.js canvas with navigable narrative slides.

## How it works

```
Seed (text / speech / click)
  → Stage 1: LLM generates working brief (nodes, edges, story beats, insights)
  → Stage 2: NED++ resolves entities to Wikidata QIDs / YouTube / GitHub IDs
  → Stage 3: Enrichment coordinator fans out to 7 adapters in parallel
  → Stage 4: Completion fills gaps (story beats, edge stubs)
  → Canvas: Three.js scene renders nodes + edges + slides overlay
```

## Key modules

| Module | Role |
|--------|------|
| `pipeline/explore.mjs` | Stage 1 — LLM prompt builder, brief validator, Gemini cascade |
| `pipeline/ned-resolver.mjs` | Stage 2 — NED++ entity resolution (Wikidata, heuristics, LLM disambiguation) |
| `pipeline/enrichment-coordinator.mjs` | Stage 3 — fan-out, merge, delta classification, canvas event streaming |
| `pipeline/completion.mjs` | Stage 4 — story beat completion, edge stubs |
| `enrichers/` | 7 adapters: wikidata, wikipedia, youtube, reddit, github, npm, hackernews |
| `canvas/scene.mjs` | Three.js renderer — nodes, edges, camera, tooltip |
| `canvas/slides.mjs` | Horizontally-scrollable narrative slides overlay |
| `canvas/report.mjs` | Dashboard report view |
| `canvas/detail.mjs` | Detail panel — entity data, vault-note branch |
| `pipeline/sources/vault.mjs` | Vault source — loads personal knowledge garden graph |

## Entry points

- `index.html` — main viewer (Wikidata / enrichment mode)
- `garden.html` — vault mode (personal knowledge garden)
- `garden-main.mjs` — vault-mode orchestrator

## Garden integration

kaaroViewer is the rendering engine for the `karx.github.io` knowledge garden. The homepage build pipeline emits `garden-graph.json`; kaaroViewer loads it as a `VaultSource` and renders the vault as an interactive 3D graph. See [[GARDEN_INTEGRATION]] for the full integration spec.

## Related

- [[PRODUCT_ROADMAP]] — phase plan and open items
- [[GARDEN_INTEGRATION]] — vault embed spec, VaultSource, build pipeline
- [[seed]] — platform vision
