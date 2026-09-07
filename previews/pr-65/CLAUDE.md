# kaaroViewer

A browser-based knowledge graph explorer. Users type a topic; an LLM pipeline generates a structured **intelligence brief** (nodes, edges, narrative beats, insights, clusters); Three.js renders it as an interactive 3D graph.

## Quick start for agents

**No build step.** Open `index.html` in any browser or static server.

```
pnpm test        # vitest run — 168 tests, all pass
pnpm test:watch  # watch mode
```

---

## Primary agent skill: /visualize

Use `/visualize` to encode a markdown document into a permanent library entry.

```
/visualize path/to/report.md
/visualize "inline text about a topic or document"
```

The skill reads the SOP reference automatically. You do not need to load it manually.

### What /visualize produces

| Output | Path |
|---|---|
| Intelligence brief JSON | `library/{id}.json` |
| Encoding retrospective | `library/{id}-retrospective.md` |
| Library registration | `pipeline/local-graph.mjs` → `LIBRARY` array |

### Quality gates (enforced by the skill)

| Gate | Threshold |
|---|---|
| Node count — small report (< 1 000 words) | 12–20 |
| Node count — medium (1 000–3 000 words) | 20–30 |
| Node count — large (> 3 000 words) | 28–40 |
| Edge density | ≥ 2.0 (edges ÷ nodes) |
| Story beats | 7–12, exactly **one** `"tension": "climax"` |
| Insights | 4–7, must include at least one `warning` + one `finding` |
| Validator | all ❌ errors + required ⚠ warnings fixed before registering |

### Run the validator manually

```
python3 .claude/hooks/validate-library-json.py library/{id}.json
```

Exit 0 = valid. Exit 1 = warnings. Exit 2 = cross-reference errors (breaking).

### Skill internals

The three-pass structure in SKILL.md is mandatory — nodes → edges → narrative. Collapsing passes produces under-connected graphs with compressed entities.

Domain-specific profiles (Legal, Toolkit, Academic, Reflective/Essay) are in SKILL.md under "Domain-specific encoding profiles". Use the matching profile's checklist instead of the generic one when the source fits.

### Extending the ontology

Update all three in the same commit:
1. `VALID_TYPES` / `VALID_RELS` in `.claude/hooks/validate-library-json.py` — canonical source
2. `sop-reference.md` — semantic + visual explanation for encoders
3. Canvas renderer — wire the new type/rel into the geometry/style switch

Never add a value to only one of these three.

---

## Architecture

### The Brief — core data model

```json
{
  "meta":        { "id": "", "title": "", "subtitle": "", "source": "", "domain": "", "year": "", "tags": [], "tone": "" },
  "report_card": { "summary": "", "key_stats": [], "spine": [], "protagonists": [], "antagonists": [], "themes": [] },
  "story":       [ { "id": "", "title": "", "node": "", "nodes": [], "narration": "", "tension": "", "focus": "" } ],
  "insights":    [ { "id": "", "title": "", "body": "", "type": "", "evidence": [], "severity": "" } ],
  "clusters":    [ { "id": "", "label": "", "color": "", "nodes": [], "description": "" } ],
  "nodes":       [ { "id": "", "label": "", "type": "", "tier": "", "sentiment": "", "description": "", "metrics": {}, "wikidata": "" } ],
  "edges":       [ { "from": "", "to": "", "rel": "", "label": "", "weight": 3, "directed": true } ]
}
```

### Pipeline stages

| Stage | Module | Role |
|---|---|---|
| 1 | `pipeline/explore.mjs` | LLM → parse + validate brief JSON |
| 4a | `pipeline/completion.mjs` | Stub nodes for missing story beat refs |
| 4b | `pipeline/completion.mjs` | Attach enrichment (metrics, descriptions, thumbnails) |
| 4c | `pipeline/completion.mjs` | Edge stubs for implied relationships |

### Two paths for brief creation

| Path | Speed | Quality | Use |
|---|---|---|---|
| `pipeline/explore.mjs` (in-browser LLM) | Fast | Draft | Exploratory canvas seed |
| `/visualize` (Claude skill) | Deliberate | Library-grade | Permanent library entries |

When a brief produced by the explore pipeline needs to become a permanent entry, re-encode it through `/visualize`.

### Key canvas modules

| Module | Role |
|---|---|
| `canvas/exploration-pipeline.mjs` | Orchestrates Stage 1 → completion → Three.js render |
| `canvas/brief-controller.mjs` | Active brief state, slide navigation (story beats) |
| `canvas/paint-orchestrator.mjs` | P-key: sends view to Gemini for image generation |
| `canvas/paint-context.mjs` | Assembles enriched context (nodes, camera, slide) for painter |
| `canvas/paint-strategies.mjs` | Swappable render styles: cinematic / documentary / abstract / blueprint |
| `canvas/session-manager.mjs` | Save/restore explorations via IndexedDB |
| `canvas/eval-modal.mjs` | UGC eval logging → pre-filled GitHub Issue |

### LLM configuration

The in-browser pipeline supports multiple providers:
- `window.kaaro.registerLLM(fn)` — inject any async function
- Settings UI (⚙ MODEL button) — BYOM via localStorage config
- Legacy: `localStorage.gemini_api_key`

---

## Library

Current entries: `pipeline/local-graph.mjs` → `LIBRARY` array.  
Files: `library/*.json` + `library/*-retrospective.md`.

To add a new entry: run `/visualize` → validator passes → entry auto-registered.

---

## Eval / UGC feedback

Users can submit evaluations of library entries directly from the browser.

**Flow:** Library drawer (`L` key) → **EVAL** button on any entry → fill rating + observations → opens a pre-filled GitHub Issue at `https://github.com/karx/kaaroViewer/issues` in a new tab (label: `eval`).

When triaging eval issues: the issue body contains doc ID, date, rating, and structured observations. Use them to identify encoding gaps for re-encoding via `/visualize`.
