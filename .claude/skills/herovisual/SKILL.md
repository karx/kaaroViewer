---
name: herovisual
description: Build a HeroVisual for a library entry — the UI-producing variant of /visualize. Routes the brief through the widget registry with TypeSafe Jev deciding first (heuristics as backup), writes a Toolpad-style hero document plus a standalone HTML deck, and authors the enrichment lines. Use when the user says "herovisual", "hero visual", "make the hero for <id>", or runs /herovisual.
---

# /herovisual — routed, enriched, exportable UI for a brief

`/visualize` encodes a document into a brief (the graph). `/herovisual` produces the **UI** for a
brief: which layout, which registry widgets in which slots, what each widget says beyond the raw
data, and the decision trail. Output is a new artifact class beside the library; it never edits
`library/{id}.json` or the `LIBRARY` array.

```
/herovisual <library-id>                 # e.g. /herovisual kaaro-viewer
/herovisual <library-id> --mode reader
/herovisual path/to/report.md            # run /visualize first, then continue with its id
```

Outputs (all under `library/hero/`):

| File | What |
|---|---|
| `{id}.hero.json` | HeroVisual document (`kaaro.hero/v1`): queries, decisions, pages → elements with `$$bind` props, enrichment |
| `{id}.hero.html` | standalone deck rendered through the real slide renderers, no dependencies |
| `{id}.decisions.json` | every hop with answer, confidence, source (model / heuristic) and the delta vs the pure heuristic plan |
| `{id}-retrospective.md` | what Jev changed, what fell back, what the deck gained |

## Step 0 — Resolve the source

- A library id: confirm `library/{id}.json` exists and is in `LIBRARY` (`pipeline/local-graph.mjs`).
- A markdown path or inline text: run `/visualize` to completion first, then continue with the id it registered.
- Never proceed on an entry that fails `python3 .claude/hooks/validate-library-json.py library/{id}.json` with exit 2.

## Step 1 — Build (Jev first, heuristic backup)

```
node scripts/herovisual.mjs <id> [--mode slides|reader] [--gate 0.7]
```

The script reads `TYPESAFE_API_KEY` from `.env`. It sends the **full** questionnaire (layout, every
slot, every capacity, every promotion) to Jev in one call and keeps the heuristic answer for any hop
below the gate. Read the printed report:

- `provider typesafe · hops N: M model / K heuristic` — if `provider heuristic` with an error, the key
  or network failed; the hero is still valid but say so in the retrospective.
- `✦` lines are model decisions that differed from or confirmed the heuristic; `✕` lines are rejected answers.
- `✎ enrichment to author:` lists elements whose enrichment fields are empty.

Do not hand-edit `decisions`. If a model decision looks wrong, lower or raise `--gate` and rerun; the
retrospective must record which gate produced the shipped hero.

## Step 2 — Author the enrichment

Open `library/hero/{id}.hero.json`. For each element with an `enrichment` object, fill every empty
field. The schema for each field is in `ui/registry.json` → that widget's `enrich_schema`.

Rules:
- Write from the **brief**, not from the original source document. The hero must never claim
  something the graph does not contain.
- One sentence, ≤ 160 characters (tagline ≤ 140), in the brief's `meta.tone`. No hedging, no "this slide shows".
- Name entities by their node labels so the line reads against the pills beneath it.
- A `caption` says what the widget's data means as a whole; a `why` says why the reader should care;
  a `tagline` states what the brief is really about.

Re-run `node scripts/herovisual.mjs <id>` after editing: enrichment is preserved across runs (it is
keyed by element name) and the HTML is regenerated with it.

## Step 3 — Validate

```
node ui/validate-hero.mjs library/hero/{id}.hero.json
```

Exit 0 required. Exit 1 (warnings) is acceptable only for a documented reason (e.g. a widget whose
enrichment is intentionally blank). Exit 2 means the loader would render wrong widgets: fix and rerun.

## Step 4 — Check the deck

Open `library/hero/{id}.hero.html` in a browser (or `index.html?hero={id}` for the live canvas).
Walk every slide. Compare against the pure heuristic plan (`library/ui-plans/{id}.json`): does the
Jev layout / capacity choice read better? If not, that is the retrospective's headline, not a reason
to edit the hero by hand.

## Step 5 — Retrospective (mandatory)

Write `library/hero/{id}-retrospective.md`:

```
# HeroVisual retrospective — {id} — {date}

## Decisions
| Hop | Heuristic | Jev | Confidence | Shipped |
(one row per hop where Jev and heuristic differ, plus the layout hop always)

## What the deck gained
## What fell back, and why
## Enrichment notes (what was hard to say from the brief alone)
## Registry gaps observed (candidate widgets, with the input they would consume)
```

The "Registry gaps observed" section feeds `pnpm ui:plan` and the `/widget` skill; be specific.

## Step 6 — Report back

State: provider used, hops model/heuristic, layout, element count, enrichment fields authored,
validator exit, and the paths written. Do not commit unless asked.

## Reference: the hero DSL

```json
{
  "apiVersion": "kaaro.hero/v1", "kind": "hero",
  "meta":     { "id", "title", "generated", "mode" },
  "source":   { "library", "path", "sha256" },
  "registry": { "version", "layouts" },
  "queries":  [ { "name": "brief", "kind": "library", "id" }, { "name": "analytics", "kind": "derive", "from": "brief" } ],
  "decisions": { "provider", "gate", "hops": [ { "id", "kind", "options", "answer", "confidence", "source" } ], "counts" },
  "pages": [ { "name": "deck", "title", "display": "slides", "layout": "compact-deck",
               "content": [ { "component": "beat-slide", "name": "beat-slide.beat-1", "key": "beat-1",
                              "props": { "beat": { "$$bind": "brief.story[id=beat-1]" } },
                              "frames": ["…"], "layout": { "slot": "narrative", "family": "narrative", "size": "full" },
                              "enrichment": { "…": "…" }, "decision": { "source": "model", "confidence": 0.91 } } ] } ],
  "events": []
}
```

Bindings are data paths (`brief.<section>[id=…]`, `analytics.<key>`), never code. Elements reference
registry widgets by id; the validator rejects anything not active in `ui/registry.json`.
