# ui/ — Agent Web UI SDK (widget registry + routing)

A registry-driven UI generation kit, extracted from kaaroViewer's slide deck and
reader report. kaaroViewer is its first consumer: `canvas/slides.mjs` builds the
deck from a routed plan instead of a hard-coded sequence.

No build step, no DOM dependency, no network. Runs in the browser (ES modules +
JSON import attributes) and in Node / vitest.

```
ui/
  registry.json          ← the single source of truth: every widget, what it consumes, where it mounts
  layouts.json           ← layout templates: ordered slots with family + capacity
  registry.mjs           ← loader, predicate mini-language, derived enums, schema validation
  state-descriptor.mjs   ← adapters: brief | raw text | agent trace → StateDescriptor
  router.mjs             ← deterministic heuristic router: descriptor → WidgetPlan
  questionnaire.mjs      ← typed LLM hop derived from the registry; rejects out-of-set answers
  validate-registry.mjs  ← CLI: schema + LOCKSTEP check (mount fn must exist; renderers must be registered)
  index.mjs              ← createUIKit() entry point
scripts/ui-plan-all.mjs  ← runs every LIBRARY entry through the router → library/ui-plans/*.json
```

## Pipeline

```
input ──describe()──▶ StateDescriptor ──routeHeuristic()──▶ WidgetPlan ──hydrate──▶ render
                                             │ confidence < gate?
                                             ▼
                              buildQuestionnaire() → ask(hop) → acceptAnswer() → applyAnswers()
```

1. **Describe.** `describeBrief(doc)` reduces a brief to numbers and id refs (node/edge counts, beat
   count, insight severity mix, cluster coverage, which analytics exist). `describeText()` and
   `describeAgentState()` do the same for raw text and chain-of-thought traces. No free text leaves
   the adapter, so the descriptor is safe to put in a prompt.
2. **Route.** `routeHeuristic(descriptor, { mode })` picks the most specific layout whose `when`
   predicates hold, then fills each slot with active widgets whose `requires` predicates hold, in
   registry order, honouring slot capacity and `prefer` rules. Output is a plan whose every widget
   id exists in the registry by construction.
3. **Ask (optional).** Ambiguities the heuristic could not settle become multiple-choice hops whose
   options are registry ids. Any `ask()` function may answer: an LLM, a human, a test stub. Answers
   outside the option set are rejected and the heuristic default stands.
4. **Hydrate + render.** The consumer maps widget ids to its renderers. In kaaroViewer that is
   `WIDGET_TO_SLIDE` in `canvas/slides.mjs`.

## Registry entry

```json
{
  "id": "cluster-overview",
  "component": "ClusterOverviewSlide",
  "family": "slide",                       // slide | section | chart | atom
  "modes": ["slides"],                     // which layout modes may place it
  "mount": { "file": "canvas/slides.mjs", "fn": "_renderClusterOverview" },
  "input": "clusters",                     // primary input shape (enum: registry.input_shapes)
  "consumes": ["clusters.item"],           // extra inputs it renders (for gap analysis)
  "cardinality": "one",                    // one | per-item
  "requires": ["clusters.count >= 5"],     // predicates over the descriptor
  "slot": "grouping",                      // slot family (enum: registry.slot_families)
  "size": "full",
  "frames": "all-clusters",                // which node ids the canvas frames when shown
  "status": "active",                      // active | proposed | deprecated | orphan
  "description": "…", "source": "…"        // provenance: where it came from and why
}
```

Predicates: `path op value` joined by `&&` / `||` (`&&` binds tighter, no parentheses).
`path` walks the descriptor; values are numbers, `'strings'`, booleans or other paths.

## Lockstep rule (the only hand-maintained coupling)

A widget ships when **both** land in the same commit:

1. its entry in `ui/registry.json`
2. its mount function in the file the entry names

Everything else is derived. `node ui/validate-registry.mjs` fails (exit 2) when an `active`
widget's mount function is missing or when a renderer in a mount file has no registry entry.
Infrastructure functions that are not widgets go in `registry.mount_ignore`.

Widget lifecycle: `proposed` (entry exists, no mount; the router reports it as *ready* when its
requires hold) → `active` → `deprecated` → `orphan`.

## Commands

```
pnpm ui:validate        # schema + lockstep, exit 0/1/2 like the library validator
pnpm ui:plan            # route every LIBRARY entry (slides mode) → library/ui-plans/
pnpm ui:plan:reader     # same, reader mode
pnpm test               # ui/*.test.mjs + canvas/slides.test.mjs cover the SDK and the wiring
```

## Improvement loop

`scripts/ui-plan-all.mjs` is to the widget axis what `scripts/health-check.mjs` is to the library
axis. Read its output for three signals:

| Signal | Meaning | Action |
|---|---|---|
| `gaps` | descriptor data no active widget consumes | add a `proposed` entry naming the input |
| `proposed ready` | a proposed widget's requires hold for N entries | implement its mount, promote to `active` |
| low `confidence` / `amb` | the heuristic had to guess | add a `prefer` rule, a layout, or let the questionnaire ask |

History: the first run (2026-09-17) placed 22 widgets at mean confidence 0.74 with 4 gaps.
Implementing the four proposed widgets it surfaced (cluster-overview, insight-matrix,
causal-chain, cluster-bridges) took it to 0.93 with one gap left (`timeline`, 2 of 11 entries).

## Using the SDK elsewhere

```js
import { createUIKit } from './ui/index.mjs';
const kit = createUIKit({ registry: myRegistry, layouts: myLayouts });
const d = kit.describe(input);                  // brief | text | { steps: [...] }
const { plan } = await kit.routeWith(d, { ask: myLLM, mode: 'slides' });
for (const slot of plan.slots) mount(slot.widget, slot.item, slot.frames);
```

`ask(hop)` receives `{ id, kind, question, options: [{ id, label, description }], default }` and
returns an option id. With any structured-output LLM, constrain the response to
`hop.options.map(o => o.id)`; `acceptAnswer` enforces it again regardless.

## Jev-first routing and HeroVisual (added 2026-09-17)

- `buildFullQuestionnaire()` asks every decision (layout, slot lead, capacity, promotion), keyed by
  layout so all candidate layouts go in one call. `routeJevFirst()` sends it through `askBatch`
  (`ui/ask/typesafe.mjs`), keeps the heuristic answer for any hop below the gate, and records
  `{ source, confidence }` per hop in `plan.decisions`.
- `ui/hero.mjs` builds the HeroVisual DSL (`kaaro.hero/v1`): queries + pages → elements with
  `$$bind` data-path props, enrichment fields from each widget's `enrich_schema`, and the decision
  trail. `heroToPlan()` turns it back into a plan for `renderSlides(doc, { plan })`.
- `scripts/herovisual.mjs` is the CLI; `scripts/hero-html.mjs` renders the deck through the real
  slide renderers in jsdom and emits a dependency-free HTML file.
- First live run (kaaro-viewer, esp-ecosystem): Jev agreed with the heuristic on every hop it was
  confident about; its low-confidence hops were all "how to present insights", which is a
  questionnaire-design signal (see `library/hero/*-retrospective.md`).
