# RFC: Widget Registry & Routing Layer (Agent Web UI SDK)

**Status:** v2 — Phases 1 and 2 implemented 2026-09-17 (`ui/`), Phase 3 open
**Supersedes:** v1 draft of the same date (heuristic-only proposal, shadcn generation, TypeSafe vendor)

## Summary

kaaroViewer now carries a registry-driven UI generation layer, built as a small
framework-agnostic SDK in `ui/` with kaaroViewer as its first consumer. A **Widget
Registry** (`ui/registry.json`) is the single source of truth for every UI widget: what
it consumes, where it mounts, when it applies. A **deterministic router** turns a
**StateDescriptor** (a brief, a raw text seed, or an agent trace) into a **WidgetPlan**
whose every widget id exists in the registry by construction. A **questionnaire** layer,
derived from the registry, turns the router's residual ambiguities into typed
multiple-choice hops that any LLM or human can answer; out-of-set answers are rejected.

This extends kaaroViewer's ontology-lockstep discipline (validator + SOP + renderer) to
the widget axis, with one important difference: the lockstep is reduced to a single
hand-maintained coupling (registry entry ↔ mount function), and everything else, from
router option sets to questionnaire enums to validator checks, is derived from the
registry file.

## What changed from v1

| v1 claim | Finding | v2 decision |
|---|---|---|
| Generate widgets with the shadcn skill against `components.json` / Tailwind | Neither exists. kaaroViewer is no-build vanilla ES modules + Three.js + a hand-written Bloomberg-palette stylesheet | No shadcn. Widgets are plain render functions in the existing mount files, styled in `style.css` |
| The registry has to be built | 19 renderers already existed uncatalogued (9 slide kinds, 10 report sections) | Registry was **extracted** first, then extended |
| `causal-layout.mjs` tier sizing as heuristic prior art | That file does topological layering; the real lookup-table prior art is `ontology.mjs` | Predicates over a descriptor replaced a size table |
| A generic LLM call loses typed guarantees | False with structured output / tool-use enums, and the SDK re-validates every answer anyway | TypeSafe demoted to "any `ask()` function"; no vendor adopted |
| Four lock surfaces (registry, generator, router, renderer) | Would not scale by hand | Derive, don't duplicate: one lock surface |

## Architecture

```
input ──describe()──▶ StateDescriptor ──routeHeuristic()──▶ WidgetPlan ──hydrate──▶ render
   brief | text | trace        numbers + id refs only          confidence < gate?
                                                                      ▼
                                              buildQuestionnaire() → ask() → acceptAnswer() → applyAnswers()
```

- **`ui/registry.json`** — 27 widgets (26 active, 1 proposed), enumerations for input shapes,
  slot families, frame modes, sizes, statuses, modes, plus `mount_ignore` for infrastructure
  functions that live in mount files but are not widgets.
- **`ui/layouts.json`** — 4 layouts: `slide-deck`, `compact-deck` (large briefs), `reader-report`,
  `hud-overlay` (non-brief states). Each is an ordered list of slots with family, min/max and an
  optional `prefer` rule.
- **`ui/state-descriptor.mjs`** — adapters. The descriptor is the SDK's public input contract; a
  kaaroViewer brief is one adapter. Analytics derivation was extracted to `pipeline/analytics.mjs`
  so the loader and the SDK share one implementation.
- **`ui/router.mjs`** — pure function. Picks the most specific layout, fills slots from active
  widgets whose predicates hold, records ambiguities, unused widgets, data gaps and proposed widgets
  whose requirements are met.
- **`ui/questionnaire.mjs`** — hops derived from ambiguities; `routeWithQuestionnaire()` gates the
  ask behind a confidence threshold and re-runs the deterministic router with forced choices.
- **`ui/validate-registry.mjs`** — schema + lockstep. Exit codes mirror the library validator.
- **`scripts/ui-plan-all.mjs`** — the improvement mirror: routes every library entry and reports
  usage, gaps, proposed-ready widgets and mean confidence.

## Evidence from the first loop (2026-09-17)

| Run | Active widgets | Mean confidence (slides) | Gaps | Action taken |
|---|---|---|---|---|
| 1 | 22 (extracted) | 0.74 | causalChains, crossClusterEdges, tierDist, temporalSequence | mode gating; `consumes` field |
| 2 | 22 | 0.85 | same | implemented 4 proposed widgets |
| 3 | 26 | 0.93 | temporalSequence (2 of 11 entries) | `timeline` registered as proposed |

The router also exposed that reader-view sections were leaking into slide decks (no mode gating),
and that the health check's two `validator-exit2` entries would route fine but render broken; both
were re-encoded to the ontology in the same pass (density 1.57 → 2.44 and 1.47 → 2.35).

## Routing contract

**Input:** a `StateDescriptor` — `kind` (`brief` | `text` | `agent`), `scale`, per-section counts,
`analytics.has.*`, and id-only item refs for frames. Never free text.

**Output:** `{ layout, mode, slots: [{ slot, family, widget, item?, frames }], confidence,
ambiguities, unused, gaps, proposedReady }`.

**Fallback ordering:** heuristic first, always. The questionnaire is consulted only when
confidence is below the gate (default 0.85) or a proposed widget is ready. A confident plan never
touches an LLM.

## Lockstep rule

A widget ships when its registry entry and its mount function land in the same commit.
`pnpm ui:validate` fails when an active widget has no mount, or a renderer has no entry.
This is the same rule CLAUDE.md states for node types and rels, applied to the third axis.

## Open questions (Phase 3)

- **Questionnaire in production.** `routeWithQuestionnaire` is wired and tested with stub `ask()`
  functions. Which LLM path to attach (`window.kaaro.registerLLM`, the settings-UI provider) and
  whether to cache answers per document are open. Recommendation: attach the existing provider
  abstraction with structured output constrained to `hop.options`, cache per `(doc id, layout)`.
- **Agent traces.** `describeAgentState` exists and routes to the HUD, but no HUD widgets are
  registered yet. The first candidates are a step strip and a tool-call ledger.
- **Timeline widget.** Proposed, not built: only 2 of 11 entries carry temporal edges. Build when
  a third entry appears or when a source is chronological by nature.
- **Reader view.** `report.mjs` sections are registered and routed (all 11 entries at confidence
  1.0), but `renderReport` still calls them in a hard-coded order. Wiring it to the plan is
  mechanical and deferred.
