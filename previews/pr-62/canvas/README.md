---
published: false
title: "canvas/ — Three.js Knowledge Graph Canvas"
tags: [canvas, three-js, knowledge-graph, kaaroviewer]
description: "The Three.js rendering layer for kaaroViewer. Modules handle scene, nodes, edges, layout, detail panel, tooltip, narrative, slides overlay, and report view."
date: 2026-04-23
layer: L2-System
maturity: BUDDING
para: Area
---

# canvas/ — Three.js Knowledge Graph Canvas

The rendering layer. Each module is a single responsibility; `main.mjs` and `garden-main.mjs` are the orchestrators that wire them together.

## Modules

| Module | Role |
|--------|------|
| `scene.mjs` | Three.js renderer init, camera, OrbitControls, render loop, resize |
| `nodes.mjs` | Node mesh creation, state (unvisited/active/dimmed), hover, click |
| `edges.mjs` | Edge line rendering, weight → opacity/thickness |
| `layout.mjs` | Force-directed layout, `runForceRelax()`, layout modes |
| `node-factory.mjs` | Creates node meshes by type/tier from ontology |
| `tooltip.mjs` | 3D-positioned DOM tooltip on hover |
| `detail.mjs` | Right-panel detail view; branches on `node.type`: entity vs vault-note |
| `narrative.mjs` | Guided tour mode — steps through story beats |
| `slides.mjs` | Horizontally-scrollable brief slides overlay |
| `report.mjs` | Dashboard report view with KPIs and story arc |
| `breadcrumb.mjs` | Navigation breadcrumb trail |
| `causal-layout.mjs` | Causal/temporal layout mode for directed graphs |
| `explore-ui.mjs` | Explore mode UI controls (EXPAND / RETHINK buttons) |

## Slides (`slides.mjs`)

Slides ride on top of the Three.js scene. Each slide is one unit of the brief: title card, briefing, story beat, insight, cluster, analytics, closer. When the active slide changes, `slides:frame { nodeIds[] }` fires → canvas reframes the node set. Entity pills in slides emit `slides:navigate { qid }` → canvas focuses the node.

Keyboard: `←` / `→` navigate slides. Reader toggle bar (top) switches to fullscreen reader mode.

## Detail panel branches

`detail.mjs` branches on `node.type`:
- **`vault-note`**: shows garden note metadata (tags, date, WikiLinks, "Read full note ↗")
- **everything else**: shows entity data from enricher patches (Wikidata, Wikipedia, metrics, links)

## Canvas events (consumed)

| Event | Source | Effect |
|-------|--------|--------|
| `explore:brief-ready` | `explore.mjs` | Build + render graph from brief |
| `explore:node-update` | enrichment coordinator | Update node patch in-place + repaint |
| `explore:delta` | enrichment coordinator | Surface EXPAND / RETHINK controls |
| `slides:frame` | `slides.mjs` | Camera framing to node subset |
| `slides:navigate` | `slides.mjs` | Focus node in canvas |
| `detail:navigate` | `detail.mjs` | Navigate to linked node |

## Layout notes

Force relaxation (`layout.mjs:runForceRelax`) settles the graph after initial load. For vault/garden mode, cluster centroids are seeded first (`garden-main.mjs:buildClusterCentroids`) then relaxation runs within clusters. A proper intra-cluster spring force in `layout.mjs` is an open item (see [[GARDEN_INTEGRATION]] §4).

## Related

- [[pipeline-README]] — pipeline that feeds data into this canvas
- [[GARDEN_INTEGRATION]] — vault-note rendering branch, garden-main.mjs orchestration
- [[enrichment-pipeline-crystallized]] — streaming delta updates to canvas
