---
published: false
title: "Enrichment Pipeline — Stage 1–3 Crystallization"
tags: [enrichment-pipeline, llm, knowledge-graph, kaaroviewer]
description: "Crystallization of the Stage 1–3 enrichment pipeline built in April 2026. Covers what was built, the key design decisions, hard-won lessons, and what is reusable."
date: 2026-04-23
layer: L1-Instance
maturity: BUDDING
para: Crystallized
---

# Enrichment Pipeline — Stage 1–3 Crystallization

**Merged:** April 2026 (PR #48)
**Branch:** `kaaro/feat/enrichment-pipeline`

## What was built

A 4-stage pipeline that turns a seed string into a richly enriched knowledge graph:

### Stage 1 — LLM Exploration (`pipeline/explore.mjs`)
- Builds a structured prompt instructing the LLM to act as a "knowledge cartographer"
- LLM returns a full **working brief** in the library JSON schema: nodes, edges, story beats, insights, clusters, enrichment targets, layout hints
- Post-processes raw LLM output: JSON extraction from fenced/unfenced text, normalization, validation
- Emits `explore:brief-ready` CustomEvent for canvas + UI
- Exposes `rethink()` — re-generates brief with enrichment context injected (RETHINK flow)

### Stage 2 — NED++ Entity Resolution (`pipeline/ned-resolver.mjs`)
- Resolves `{ label, type }` to cross-source ID map: `{ wikidata?, youtube?, reddit?, github? }`
- Three resolution paths in priority order: OpenTapioca → Wikidata wbsearchentities → source-type heuristics (channel→YouTube, subreddit→Reddit, software→GitHub)
- LLM disambiguation as fallback for ambiguous Wikidata candidates
- localStorage cache (`ned::label::type`) — permanent, cleared manually

### Stage 3 — Enrichment Coordinator (`pipeline/enrichment-coordinator.mjs`)
- Takes Stage 1 brief, runs Stage 2 on all targets, fans out to adapters in parallel (configurable concurrency, default 3)
- 7 adapters auto-loaded: wikidata, wikipedia, youtube, reddit, github, npm, hackernews
- **Delta classification**: categorizes each node's enrichment as `none | patch | structural | sentiment`
  - `sentiment`: Stage 1 polarity contradicted by adapter signal words
  - `structural`: spine node unresolvable, or ≥2 new related entities discovered
  - `patch`: metrics/description silently updated
- Streams updates to canvas via `explore:node-update` and `explore:delta` CustomEvents as adapters resolve
- Exposes `showExpand` / `showRethink` flags — surface [ EXPAND ] / [ RETHINK ] UI controls

### Stage 4 — Completion (`pipeline/completion.mjs`)
- `scanStoryBeats()`: adds missing node stubs referenced in story beats but absent from nodes[]
- `attachEnrichment()`: merges adapter data into nodes
- `addEdgeStubs()`: adds missing edges discovered during enrichment

## Key design decisions

**Gemini model cascade with 429 backoff**
The Stage 1 LLM call uses `gemini-2.0-flash-lite` first (highest free-tier capacity), falls back through `gemini-2.0-flash → gemini-1.5-flash → gemini-1.5-flash-8b`. Each model gets 2 retry attempts with 30s/60s waits before the cascade advances. `responseMimeType: 'application/json'` is intentionally omitted — JSON mode uses a separate quota bucket that triggers 429 even when main quota is healthy; `_extractJSON()` handles parsing from plain text instead.

**CustomEvent-based streaming to canvas**
Rather than a callback or shared state, the coordinator emits `explore:node-update` and `explore:delta` events on `document`. This keeps pipeline and canvas fully decoupled — the canvas listens and repaints without knowing about the pipeline internals.

**Delta escalation ladder**
Deltas escalate: `sentiment > structural > patch`. Only the top-ranked delta type surfaces for the user. This prevents notification fatigue when a node has both metric updates and a sentiment flip.

**Enrichment targets from Stage 1**
The LLM assigns `enrichment_targets` with `high | medium | low` priority during Stage 1. The coordinator respects this with a `priorityFilter` option — high-priority spine nodes can be enriched first without waiting for secondary nodes.

## Hard-won lessons

- **JSON mode quota bucket** — Gemini's `responseMimeType: application/json` hits a separate, tighter rate limit. Never use it; parse from plain text output.
- **Adapter partial failure must not block** — each adapter import is wrapped in try/catch; a failed module load logs an error but doesn't stop the coordinator. Without this, one broken adapter import killed the whole pipeline.
- **localStorage NED cache** — needed to avoid re-resolving the same entities across sessions. Cache is permanent (no TTL) because entity QIDs don't change. Clear manually if resolution was wrong.
- **Brief normalization before validation** — `_normaliseBrief()` must run before `validateBrief()`. The LLM occasionally returns `tier: "core"` instead of `"spine"`. Normalization coerces invalid enums; validation then has clean data to check.

## What is reusable

**Pattern: LLM → NED++ → adapter fan-out**
The three-stage shape (LLM generates structured seed → entity resolver maps labels to source IDs → source-specific adapters fan out and merge) is a general pattern for any "enrich a graph from a text description" task. The adapter registration/registry pattern in `enrichers/index.mjs` is clean and can be reused.

**Pattern: CustomEvent streaming pipeline→canvas**
Decoupling pipeline from rendering via `document.dispatchEvent(new CustomEvent(...))` works well in a browser-native ESM setup with no framework. The pipeline doesn't import from canvas; the canvas doesn't import from pipeline. Events are the interface.

**Pattern: Gemini model cascade with per-model retry**
The `_callLLM` implementation in `explore.mjs` (cascade → per-model retry → plain text response parsing) is a standalone, copy-pasteable pattern for robust Gemini API usage on free-tier quota.

## Open items

- Stage 3 `[ EXPAND ]` and `[ RETHINK ]` UI controls not yet wired up in `main.mjs`
- Stage 4 `completion.mjs` needs integration test coverage
- NED++ Path C (LLM disambiguation) fires on every ambiguous entity — consider a confidence threshold to suppress it for low-priority targets

## Related

- [[pipeline-README]] — Area overview for `pipeline/`
- [[GARDEN_INTEGRATION]] — vault integration built alongside this pipeline
- [[PRODUCT_ROADMAP]] — phase plan context
