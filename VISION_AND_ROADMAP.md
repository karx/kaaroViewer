# kaaroViewer — Big Wins, Wishlist, Vision & Roadmap

**Prepared**: 2026-07-13 (repo gardening pass)
**Supersedes**: `PRODUCT_ROADMAP.md` (A-Frame era, April 2026)
**Inputs**: full test run (228 tests), `scripts/health-check.mjs`, all planning docs
(`VIDEO_AGENT_PLAN.md`, `LIFE.md`, `IMPROVEMENT_PLAN.md`, `EXPLORATION_PIPELINE_PLAN.md`,
`CLOUD_SYNC_GEMMA_PLAN.md`, `GARDEN_INTEGRATION.md`), library validator sweep.

---

## 1. Big Wins — what shipped and holds

These are proven, tested, and in daily use. Each one was a planning-doc bet that paid off.

### W1 · The intelligence brief became a real standard
One JSON schema (`meta / report_card / story / insights / clusters / nodes / edges`)
now feeds **three consumers**: the Three.js canvas, the report/slides view, and the
video agent (`vid/beats.mjs`). Encoding once and rendering three ways is the platform's
core leverage — it was a hypothesis in April, it is architecture now.

### W2 · Enrichment pipeline (Stages 1–4), shipped and tested
Seed → LLM brief → NED++ entity resolution → 7 parallel enrichment adapters
(Wikidata, Wikipedia, YouTube, Reddit, GitHub, npm, HN) → completion stubs.
`EXPLORATION_PIPELINE_PLAN.md` is fully crystallized; the pipeline carries the
"explore" half of the two-path encoding model.

### W3 · The life system works — the loop actually closed
`LIFE.md` is not aspirational anymore: `scripts/health-check.mjs` (the mirror),
4 Alone-Time runs + 1 Dream Loop run with handoff memory in `library/handoffs/`,
and a validator+tests immune system. The system found and re-encoded its own
degraded entries (e.g. `kaaro-viewer` 2024 → 2026). This is the most differentiated
capability in the repo.

### W4 · kaaro-vid: brief → verified narrated video
Phases 1–3 and 5 of `VIDEO_AGENT_PLAN.md` are done: Timeline JSON → compiler →
ffmpeg + headless-Chromium render, TTS narration with caption↔voice lockstep,
crossfade transitions, verifier-gated **golden traces**, and a committed v0→v2
sample progression on the same source. Quality infrastructure (SSIM golden frames,
visual CTDD, contact sheets) exceeds the original plan.

### W5 · Quality culture: validator + CTDD + TDD handoffs
The three-gate discipline — `validate-library-json.py`, `pnpm test`
(now **228 tests**, up from 168), and cognitive TDD (`CTDD.md`, `vid/CTDD.md`) —
is applied consistently enough that it has itself become source material
(`library/tdd-handoffs.json`). Methodology is compounding into content.

### W6 · BYOM everywhere
`window.kaaro.registerLLM(fn)`, the settings UI, and the gateway abstraction mean
no provider lock-in in the browser pipeline; the same pattern is the design template
for the vid agent loop (M2).

---

## 2. Garden log — what this pass fixed (2026-07-13)

| Fix | Detail |
|---|---|
| 🔴→🟡 `pkm-engineering-prompt.json` | report_card protagonists/antagonists referenced labels, not node ids — loader-breaking (validator exit 2 → 1) |
| 🔴→🟡 `esp-ecosystem.json` | same class of error, same fix (exit 2 → 1) |
| Registered `kaaro-sessions-platform` | valid entry (31N/63E, exit 0) committed in June but never added to `LIBRARY` — invisible in the app |
| Registered `tdd-handoffs` | valid entry (18N/43E, exit 0) with retrospective, untracked + unregistered |
| Removed `D:srckaaroViewerlibraryhandoffs/` | empty path-mangling artifact directory at repo root |
| CLAUDE.md test count | 168 → 228 (219 pass, 9 env-gated skips) |
| `PRODUCT_ROADMAP.md` | marked superseded (A-Frame/OpenTapioca era), points here |

**Left in the working tree (in-flight, not mine to commit):** `vid/beats.mjs`
key_stats normalization (good fix, tests pass), `vid/tts-sapi.ps1` (Windows SAPI
TTS helper — exists but is **not wired into `vid/tts.mjs`** as a provider),
`library/grok-harness.json` (exit 1 with 47 ontology warnings, **no retrospective**
— deliberately not registered; see R2).

---

## 3. Library health (post-gardening)

| Status | Entries |
|---|---|
| ok (10) | gig-worker-projects, aoe-2-redbull, poker-tooling, art-of-intent, minecraft-redstone, kaaro-viewer, advanced-git-workflows, what-are-agents-teaching-us, kaaro-sessions-platform, tdd-handoffs |
| watch | pkm-engineering-prompt (density 1.47, 30 warnings), esp-ecosystem (no climax beat, 15 warnings) |
| unregistered draft | grok-harness (47 warnings, no retrospective) |

**The dominant signal**: `grok-harness`, `pkm-engineering-prompt`, and `esp-ecosystem`
all fail on the **same missing ontology**: node types `system / process / framework /
tool / hardware / prompt / risk` and rels `enforces / drives / gates / wraps / includes /
contains / supports / …`. Three independent entries flagging the same gap **is exactly
the Dream Loop trigger condition defined in `LIFE.md` §Phase 4**. The ontology was built
for narrative/investigative reports; the library has drifted toward *technical-systems*
documents. This is the single highest-signal item in the repo.

---

## 4. Wishlist

Wanted, not yet scheduled. Grouped by surface; sources in parentheses.

**Ontology & library**
- Technical-systems ontology extension via Dream Loop — types + rels above, atomically across validator/SOP/renderer (LIFE.md Phase 4; trigger met)
- Re-encode `pkm-engineering-prompt` (density 1.47) and `esp-ecosystem` (no climax) after the ontology lands; write `grok-harness` retrospective and register it
- `gh` CLI in the local environment so health-check ingests eval-issue signal (currently `evals.available: false`)

**Canvas / UX** (IMPROVEMENT_PLAN + ui_direction)
- Wire `[ EXPAND ]` / `[ RETHINK ]` controls in `main.mjs` (last open Phase-1 item)
- Enrichable 2D/3D models per entity type — beyond primitive geometry
- Report as horizontally-scrollable slides embedded in canvas
- Remaining IMPROVEMENT_PLAN items not marked complete (C-04/05/08/09, IA-03/04)

**Video agent** (VIDEO_AGENT_PLAN §8 quality axes)
- Wire `tts-sapi.ps1` as a `sapi` provider in `vid/tts.mjs` (Windows-native neural-ish voice, zero install — the file already exists)
- Piper neural voice (needs network-policy allowance for huggingface.co, or a placed voice file)
- Continuous score with tension arc; per-beat Three.js scene renders; overlay track (lower-thirds — first general-editing visual)

**Platform**
- Cloud sync + per-user identity; in-browser Gemma provider (CLOUD_SYNC_GEMMA_PLAN — TDD plan already written)
- CI: lint + test on every PR (pages deploy exists; test gate does not)
- Integration test for Stage 4 completion (open since April)
- Root-directory archaeology: A-Frame-era files (`instagram.js` 245 KB, `kaaro.js`, `2viewr/gviewr_functions.mjs`, `entity_linking.js`, `pod_modules/`, `viz-*.html`, `gig-viz-Console.html`, `enricher-test.html`, `ned-test.html`) → move to `archive/` or delete once garden.html dependencies are confirmed; rewrite `DEVELOPER_GUIDE.md` for the Three.js era (currently stale-bannered)

---

## 5. Vision

Three loops around one data model:

> **kaaroViewer is a personal-ontology engine.** You feed it documents and topics;
> it encodes them into intelligence briefs; it renders them as explorable 3D graphs
> and narrated videos; and it observes, critiques, and re-encodes its own library —
> extending its own ontology when the material outgrows it.

1. **Encode** — two paths, one standard: in-browser explore pipeline (fast, transient)
   and `/visualize` (deliberate, library-grade). The LLM replaces NER for private
   knowledge that Wikidata can't cover.
2. **Express** — the same brief becomes an interactive canvas, a report/slide deck,
   and a verified MP4. New consumers (audio brief? printable dossier?) plug into the
   same schema.
3. **Evolve** — the life system (health mirror → Alone-Time → Dream Loop →
   generational handoff) keeps the library and the ontology alive without a human
   in the loop; the video agent's golden traces feed the long-bet fine-tune (M4),
   where a small tuned model drives the same CLI tool layer.

The end state: a system whose *content*, *ontology*, and eventually *models* all
improve as a byproduct of use.

---

## 6. Roadmap

### Now (July 2026) — close the loops that are one step from done
| # | Item | Why now | Exit criterion |
|---|---|---|---|
| R1 | Commit in-flight vid work (`beats.mjs` fix, `tts-sapi.ps1` + wire as provider) | Working tree carries unmerged value | `pnpm test` green; SAPI selectable in `--narrate` |
| R2 | **Dream Loop run #2: technical-systems ontology** | Trigger condition met (3 entries, same gap) | New VALID_TYPES/RELS + SOP + renderer in one commit; all 13 entries revalidated, none regress |
| R3 | Re-encode `pkm-engineering-prompt`, `esp-ecosystem`; retrospective + register `grok-harness` | Unblocked by R2 | All three exit 0, density ≥ 2.0, library 13/13 ok |
| R4 | **vid M1: eval suite** (`vid/evals/`, `kaaro-vid eval` scorecard) | Highest-leverage per VIDEO_AGENT_PLAN — closes Phase 4, gates M2, yardstick for M4 | One command scores any agent/model version |

### Next (Aug–Sep 2026)
- **vid M2**: `kaaro-vid agent "<brief>"` — pluggable BYOM loop + decision-level trace schema v2; passes M1 evals unassisted
- Canvas capability: EXPAND/RETHINK wiring; slides-in-canvas; first enriched entity models (needs ontology from R2 to know the shapes)
- CI test gate on PRs; Stage-4 integration test
- Schedule Alone-Time nightly via `/schedule` (currently manual runs only)

### Later (Q4 2026 →)
- **vid M3**: corpus tooling — ≥100 golden decision-traces exportable in one command
- **vid M4**: fine-tune run (external GPU environment), scored by M1
- Cloud sync + in-browser Gemma (independent halves; ship in either order)
- Root archaeology + DEVELOPER_GUIDE rewrite
- Generational handoff v1 tag + `GENERATIONS.md` once R2's schema change lands (LIFE.md Phase 5)

### Open owner decisions
| # | Decision | Recommendation |
|---|---|---|
| D1 | vid priority: M1→M2→M3 vs quality axis first | M1 first (unchanged from plan review) |
| D2 | Is M4 fine-tune still the destination, or is agent+evals the product? | Affects how much M3 matters — decide before Q4 |
| D3 | Network policy for piper voice vs ship espeak/SAPI | SAPI now (free on Windows), piper when policy allows |
| D4 | Ontology extension scope: one broad "technical-systems" generation or incremental types per Dream Loop | One deliberate generation (R2), then incremental |
| D5 | A-Frame-era files: archive, delete, or keep serving | Archive branch + delete from master after confirming `garden.html`/`index.html` imports |
