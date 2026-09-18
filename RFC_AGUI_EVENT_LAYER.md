# RFC: AG-UI Event Layer + Tiered LLM Hops for the Widget Library

**Status:** rev 3 — 2026-09-17 — phases 1–3 implemented (`ui/questionnaire.mjs` Jev-first, `ui/ask/typesafe.mjs`, `ui/hero.mjs`, `scripts/herovisual.mjs`, `scripts/hero-html.mjs`, `.claude/skills/herovisual/`); two reference heroes built live against Jev. Phases 4–6 open.

**Rev 3 decisions (owner):** the hero document follows a Toolpad-inspired page DSL (`kaaro.hero/v1`:
queries, pages, elements with `$$bind` data-path props), not the library's shape; `/herovisual`
also emits a standalone HTML deck; `TYPESAFE_API_KEY` lives in `.env` (now gitignored).
**Builds on:** `RFC_WIDGET_ROUTING_LAYER.md` v2 (registry + router + questionnaire, implemented in `ui/`)

**Rev 2 decisions (owner):**
1. **Jev first, heuristics as backup.** Every routing decision goes to TypeSafe Jev as one batched
   call; the heuristic router supplies structure and the fallback answer for any hop Jev returns
   below the confidence gate, or for every hop when no Jev key is configured.
2. **`/herovisual`** is the UI-producing variant of `/visualize`: a Claude Code skill whose output is
   a routed, enriched, replayable **HeroVisual** document.
3. **A clean new export layer.** HeroVisual documents live beside the library
   (`library/hero/{id}.hero.json`), reference a library entry by id, and never modify
   `library/{id}.json` or the `LIBRARY` array. Existing entries keep working unchanged.

## Summary

Turn kaaroViewer's canvas into an AG-UI-style surface: an agent run is an **event stream**
(run / step / tool-call / state-delta), the canvas is a **consumer** that re-routes widgets whenever
state changes, and the widget registry doubles as the agent's **tool manifest** so an agent can only
ever ask for a widget that exists. On top of that, three tiers of LLM use, each doing the one thing
it is good at:

| Tier | Job | Engine | When |
|---|---|---|---|
| 1 | Layout, slot, capacity and promotion decisions | TypeSafe Jev: Choice / Score / Noul, one batched call | first, whenever a Jev key is configured |
| 0 | Plan structure (slots, items, frames) and fallback answers | heuristic router (exists) | always computes structure; answers any hop Jev declines or when Jev is absent |
| 2a | Content enrichment (captions, props, summaries for a widget) | Claude / Gemini via the existing gateway, structured output | on demand, cached |
| 2b | Component enrichment (new widget = registry entry + mount + CSS + test) | Claude Code skill `/widget` | gardening cadence, never at runtime |
| 2c | Ontology / library enrichment | `/visualize`, Dream Loop, explore pipeline (exist) | as today, plus a widget axis |

Nothing in tiers 1–2a can put an unregistered widget on screen. The registry constrains every path.

## What AG-UI actually is, and what we take from it

AG-UI is a transport-agnostic event protocol between an agent and a front end. The event
vocabulary is lifecycle (`RunStarted/Finished/Error`, `StepStarted/Finished`), streaming text
(`TextMessageStart/Content/End`), tool calls (`ToolCallStart/Args/End/Result`), state
(`StateSnapshot`, `StateDelta` as RFC 6902 JSON Patch), plus `Custom`, `Raw`, and newer
reasoning / subagent / activity events. Generative UI in the AG-UI ecosystem is done by the agent
emitting tool calls whose names the front end maps to components.

We take four things:

1. **The event vocabulary**, as a subset. The canvas already has an ad-hoc event bus
   (`kaaro:*` and `slides:*` `CustomEvent`s in `exploration-pipeline.mjs`, `slides.mjs`). Those
   become `Custom` events on one typed stream.
2. **`StateDelta` as JSON Patch.** `app-state.mjs` already holds `activeBrief` + `activePatches`;
   the explore pipeline's `runExpand(deltas)` / `runRethink(deltas)` are deltas in all but name.
3. **Tool calls as the generative-UI channel.** `ui/registry.json` → tool manifest. An agent's
   `ToolCallStart{name: "cluster-overview"}` is rendered by the same mount function the router uses.
4. **Transport independence.** In-page `EventTarget` now; SSE / WebSocket adapter later so an
   external agent (the discord bot, a Claude Agent SDK run, a `/visualize` session) can drive the
   canvas live.

We do **not** adopt CopilotKit or any framework. The protocol is a JSON event shape; the codebase
stays no-build vanilla ES modules.

## Proposed modules

```
ui/
  agui.mjs             event bus: emit()/on()/replay(); AG-UI event types; RFC 6902 apply
  tools.mjs            registryToTools(registry) → tool manifest (name=id, description, input schema)
  ask/
    batch.mjs          askBatch(hops[]) contract + confidence gate + fallback + cache
    typesafe.mjs       adapter: hops → Choice/Score/Noul questions in ONE call → answers + confidence
    gateway.mjs        adapter: hops → structured-output call through pipeline/gateway (fallback)
  enrich/
    content.mjs        per-widget enrichment prompts (captions, props) — structured output, cached
pipeline/gateway/      + `schema` option: Gemini responseSchema, OpenAI json_schema, Anthropic forced tool
.claude/skills/widget/ Claude Code skill: gap or proposed widget → entry + mount + CSS + test + validator pass
```

### `ui/agui.mjs` — the stream

```js
emit({ type: 'RunStarted',   runId, threadId })
emit({ type: 'StepStarted',  runId, stepName: 'explore.stage1' })
emit({ type: 'ToolCallStart', runId, toolCallId, toolCallName: 'llm.generate' })
emit({ type: 'ToolCallResult', runId, toolCallId, content: '<brief json>' })
emit({ type: 'StateSnapshot', runId, snapshot: brief })
emit({ type: 'StateDelta',    runId, delta: [{ op: 'add', path: '/nodes/-', value: node }] })
emit({ type: 'Custom',        runId, name: 'kaaro:focus-entity', value: { qid } })
emit({ type: 'RunFinished',   runId })
```

Consumers subscribe by type. Three consumers on day one:

- **Router consumer**: on `StateSnapshot` / `StateDelta` → `describe()` → `route()` → diff against
  the current plan → re-render only changed slots. A delta that adds a sixth cluster flips the deck
  from `slide-deck` to `compact-deck` without a reload.
- **HUD consumer**: renders `agent.steps` (the `describeAgentState` adapter already exists, the
  HUD layout exists, no HUD widgets are registered yet). First two widgets: `step-strip`
  (Step*/ToolCall* events as a timeline) and `tool-ledger` (tool calls with results).
- **Session consumer**: `session-manager.mjs` persists the event log, not just the final brief.
  Replay = re-emit. This is the chain-of-thought viewer the SDK brief asked for.

### `ui/tools.mjs` — registry as tool manifest

Derived, not written. For each active widget:

```json
{ "name": "cluster-overview",
  "description": "One slide summarising every cluster … (requires clusters.count >= 5)",
  "parameters": { "type": "object", "properties": { "clusters": { "$ref": "#/shapes/clusters" } } } }
```

Passed to any agent as its front-end tool list. A tool call with an unknown name is rejected the
same way `acceptAnswer` rejects an unknown option today.

### Tier 1 — TypeSafe for routing/selection hops

Why it fits now, where v1 was premature: the questionnaire already produces exactly what Jev
consumes. Each hop is a typed question over a state; the state is the descriptor (numbers and ids,
no free text); the options are registry ids. TypeSafe's documentation states that Choice, Score and
Noul questions can be mixed in a single call, evaluated in parallel against shared state, so one
routing decision is one request regardless of hop count, and every answer carries a confidence.

Mapping:

| Hop kind (exists) | Primitive | State | Options / levels |
|---|---|---|---|
| `layout` | Choice | descriptor | `layoutCandidates` |
| `slot:<id>` | Choice | descriptor + slot family | candidate widget ids (+ `omit`) |
| `promote:<id>` | Noul | descriptor + widget description | yes/no: would this widget improve the plan |
| new: `capacity:<slot>` | Score | descriptor | levels: 1 / 3 / 5 / all items — replaces fixed `max` |

**Jev-first ordering (rev 2).** The current `routeWithQuestionnaire` asks only the hops the heuristic
flags as ambiguous. Jev-first inverts that: the questionnaire is built **in full** for every layout
and every slot that has at least one candidate (plus `omit` for optional slots, plus a `capacity`
Score per per-item slot), and the whole set goes to Jev in one call. The heuristic still runs, but
its role changes from decider to two things: it computes the plan structure Jev's answers hydrate
into, and it is the answer of record for any hop Jev returns below the gate.

Contract additions to `ui/questionnaire.mjs`:

- `buildFullQuestionnaire(descriptor, { registry, layouts, mode })` — every decision, not just ambiguities.
- `askBatch(hops) → { answers: {hopId → optionId}, confidence: {hopId → 0..1} }` alongside `ask(hop)`.
- `routeJevFirst(descriptor, { askBatch, gate = 0.7 })` — full questionnaire → one call → per-hop
  merge: Jev answer if `confidence ≥ gate` and in the option set, else heuristic default. Every hop
  records `{ source: 'jev' | 'heuristic', confidence }` in the plan so a HeroVisual can show which
  decisions were model-made and the gardening loop can see which questions are weak.
- Cache key `(doc id, registry.version, layouts.version, mode)`. A routing decision for a library
  entry is answered once per registry version, then free.

Adapter lives behind the `askBatch` interface. If no TypeSafe key is configured, `ask/gateway.mjs`
answers the same hops through the configured provider with structured output constrained to the
option ids. If neither is configured, the heuristic answers everything, as today, and the plan says so.

Settings: add a `decisions` provider slot in the ⚙ MODEL drawer (`typesafe` | `same as generation`
| `none`), separate from the generation provider. Decisions and generation are different jobs and
should be configured separately.

### Tier 2a — content enrichment via Claude / Gemini

Some widgets want text the brief does not carry: a one-line caption per cluster on the overview
slide, a "why this matters" line under the causal chain, a HUD summary of an agent step. These are
generation jobs, so they go through `pipeline/gateway` with a JSON schema per widget
(`widget.enrich_schema` in the registry, optional), cached in IndexedDB by
`(doc id, widget id, item id, model)`, and rendered only if they validate. The widget renders fine
without them; enrichment is progressive.

Gateway change (prerequisite, small): `routeToProvider(provider, prompt, config, { schema })` →
Gemini `responseMimeType: application/json` + `responseSchema`; OpenAI `response_format:
{type:'json_schema'}`; Anthropic forced tool use with the schema as the tool input; custom passes
the schema through. Today the gateway is prompt→text only.

### Tier 2b — component enrichment via a `/widget` skill (the "ever-growing" part)

Widgets are code. They are grown the way library entries are grown: by a Claude Code skill with a
validator gate, at gardening cadence, never at runtime.

```
/widget gap analytics.temporalSequence        # from ui:plan's gaps list
/widget promote timeline                      # a proposed entry whose requires hold for N entries
/widget from-eval <issue#>                    # an eval issue that names a missing view
```

The skill, mirroring `/visualize`:

1. reads `ui/registry.json`, `ui/README.md`, the target input's shape in `state-descriptor.mjs`,
   and the two or three closest existing mount functions as style anchors;
2. writes the registry entry (`status: active`, `source` recording the trigger and model), the
   mount function, the `WIDGET_TO_SLIDE` mapping, CSS in the Bloomberg palette, and a case in
   `canvas/slides.test.mjs`;
3. runs `pnpm ui:validate` and `pnpm test`; refuses to finish on exit 2;
4. runs `pnpm ui:plan` and reports the confidence / gap delta as its retrospective.

Gardening additions to `scripts/ui-plan-all.mjs`:
- `usage` persisted across runs; an active widget unused for N consecutive runs is flagged for
  `deprecated`; a deprecated widget whose mount is removed becomes `orphan` (validator already
  distinguishes these).
- `gaps` and `proposedReady` written as a `widget-agenda.json` the Dream Loop and Alone-Time
  loops read alongside `health.json`.

### Tier 2c — ontology / library enrichment

Unchanged in mechanism (`/visualize` for permanent entries, explore pipeline for transient briefs,
Dream Loop for ontology extension), with one addition: the Dream Loop gains a **widget axis**. When a
Dream Loop adds a node type or rel, it also asks whether any widget consumes it (e.g. a new
`temporal` rel with no `timeline` widget is a gap the same pass should register as `proposed`).

## `/herovisual` — the UI-producing skill, and the HeroVisual export layer

`/visualize` encodes a document into a brief (the graph). `/herovisual` takes a brief and produces
the **UI** for it: which layout, which widgets in which slots, what each widget says beyond the raw
brief, and the decision trail that got there. It is a new artifact class, not a change to the brief.

```
/herovisual <library-id>            # from an existing entry
/herovisual path/to/report.md       # runs /visualize first, then herovisual on the result
/herovisual <library-id> --mode reader
```

**HeroVisual document** — `library/hero/{id}.hero.json`:

```json
{
  "hero":       { "id": "kaaro-viewer", "version": 1, "generated": "2026-09-17", "mode": "slides" },
  "source":     { "library": "kaaro-viewer", "path": "./library/kaaro-viewer.json", "sha256": "…" },
  "registry":   { "version": 1, "layouts": 1 },
  "descriptor": { "…numbers and id refs only…" },
  "decisions":  { "provider": "typesafe", "model": "jev", "gate": 0.7,
                  "hops": [ { "id": "layout", "kind": "layout", "options": ["slide-deck", "compact-deck"],
                              "answer": "compact-deck", "confidence": 0.91, "source": "jev" } ] },
  "plan":       { "layout": "compact-deck", "slots": [ { "slot": "grouping", "widget": "cluster-overview", "frames": ["…"] } ] },
  "enrichment": { "cluster-overview": { "cluster-life": { "caption": "…" } },
                  "causal-chain":     { "_": { "why": "…" } } },
  "events":     [ { "type": "RunStarted" }, { "type": "StepStarted", "stepName": "route" }, "…" ]
}
```

Rules that keep it clean:
- The library entry is referenced, never copied and never edited. `source.sha256` lets the loader
  detect drift and flag the hero as stale rather than silently mismatching.
- Every `plan.slots[].widget` is an active registry id; every frame id exists in the referenced
  brief; every enrichment key is a `(widget id, item id)` pair the plan actually places. A new
  validator, `ui/validate-hero.mjs`, checks all three with the usual exit codes.
- `decisions.hops[].source` is per hop. A hero built without a Jev key is valid and says
  `"provider": "heuristic"` throughout.
- Enrichment text is authored by the skill (Claude) the way `/visualize` authors narration, so it
  is library-grade rather than a runtime generation. Runtime tier 2a enrichment remains for
  transient explore briefs, which never get a hero file.

**Loading.** `?hero=<id>` loads the library entry, then the hero, and renders the deck from
`hero.plan` without re-routing; `?lib=<id>` keeps routing live as today. `getActivePlan()` returns the
hero plan when one is loaded, so paint, export and eval see the same object either way.

**Skill steps** (mirrors `/visualize`'s structure; the SOP addendum is `.claude/skills/herovisual/`):

1. Resolve the source: a library id, or a markdown path → run `/visualize`, then continue.
2. `describe` → `buildFullQuestionnaire` → `askBatch` via Jev (env `TYPESAFE_API_KEY`), heuristic
   fallback per hop; write the decision trail.
3. Hydrate the plan; for each placed widget with an `enrich_schema`, author the enrichment text
   from the brief (not from the source document, so the hero never outruns the graph).
4. Write `library/hero/{id}.hero.json` and `library/hero/{id}-retrospective.md` (which hops Jev
   answered, which fell back, what the deck gained over the heuristic plan).
5. `node ui/validate-hero.mjs library/hero/{id}.hero.json` — refuse to finish on exit 2.
6. Report the delta against the plain routed plan (`library/ui-plans/{id}.json`).

**Why a separate layer rather than fields on the brief.** The brief is the ontology-locked artifact
three validators and eleven entries depend on. UI decisions change with every registry version and
every Jev answer; binding them to the brief would either churn the library on each gardening pass or
freeze the UI to the brief's encoding date. Keeping them beside the brief, keyed by registry
version, lets both evolve at their own cadence.

## Data flow, end to end

```
seed / library doc / external agent
        │
        ▼  AG-UI events (RunStarted … StateSnapshot / StateDelta … RunFinished)
   ui/agui.mjs ──────────────────────────────────────────────┐
        │                                                    │
        ▼                                                    ▼
   describe() → routeHeuristic()                    HUD widgets (steps, tool ledger)
        │ confidence < gate                         session log (replayable)
        ▼
   buildQuestionnaire() → askBatch()  ── TypeSafe (Choice/Score/Noul, one call, confidence)
        │                              └─ fallback: gateway structured output
        ▼
   applyAnswers() → plan → hydrate → render            enrich/content.mjs (captions, cached)
        │
        ▼ ui:plan (gardening)
   gaps / proposedReady / unused ──▶ /widget skill ──▶ registry entry + mount + test ──▶ ui:validate
```

## Risks

- **Vendor newness (TypeSafe).** Mitigated structurally: it sits behind `ask()`, with a
  gateway fallback and a heuristic-only floor. Adoption decision is reversible by config.
- **Two event systems during migration.** `kaaro:*` CustomEvents and the AG-UI stream coexist
  until every producer is ported. Rule: new producers emit AG-UI only; `agui.mjs` re-dispatches
  `Custom` events as legacy `CustomEvent`s so nothing breaks in between.
- **Cost and latency.** Decisions: one batched call per (doc, registry version), cached. Enrichment:
  per widget item, cached, progressive. Neither is on the camera / slide-change path.
- **Privacy.** The descriptor sent to the decisions provider contains counts and ids only.
  Enrichment sends content; it stays opt-in per provider in settings, as generation is today.
- **Lockstep pressure.** `/widget` produces code that must pass the same validator a human would.
  The registry lockstep is what makes an LLM-grown library safe to accept.

## Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | Jev-first routing: `buildFullQuestionnaire`, `askBatch`, `routeJevFirst`, TypeSafe adapter (`ask/typesafe.mjs`), per-hop source + confidence in the plan, cache | nothing new |
| 2 | HeroVisual export layer: `library/hero/` format, `ui/validate-hero.mjs`, `?hero=` loader, `getActivePlan()` returns the hero plan | phase 1 |
| 3 | `/herovisual` skill (`.claude/skills/herovisual/`): steps 1–6 above, retrospective template, `enrich_schema` on the first widgets (cluster-overview, causal-chain) | phase 2 |
| 4 | `ui/agui.mjs` + `ui/tools.mjs`; explore pipeline emits events; live re-route on `StateDelta`; two HUD widgets; `events[]` in the hero | phase 2 for the hero's event log |
| 5 | `/widget` skill; usage persistence + deprecation; `widget-agenda.json` for the loops | phases 1–3 for evidence |
| 6 | SSE / WebSocket transport; session replay; discord bot as external producer | phase 4 |

Rev 2 reorders: the owner's priority is cleaner, more contextful UI output, so Jev-first routing and
the HeroVisual layer come before the event bus. Phase 1 is a contained change to `ui/questionnaire.mjs`
plus one adapter. Phase 2 touches the loader but nothing in `library/*.json`.

## Decision requested

Approve phases 1–3. Phase 1 needs a `TYPESAFE_API_KEY` to exercise the Jev path; without it the
same code runs heuristic-only and the hero records that. Phase 3 is the first `/herovisual` run
against `kaaro-viewer` (large, compact-deck) and `esp-ecosystem` (small, slide-deck) as the two
reference heroes.

## Sources

- AG-UI event reference: https://docs.ag-ui.com/concepts/events
- TypeSafe introduction (Choice / Score / Noul, batching): https://docs.typesafe.ai/introduction
- TypeSafe GitHub org (SDKs, skills): https://github.com/typesafe-ai
