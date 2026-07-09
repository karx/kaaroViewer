# Video Editing Agent — Shared Understanding & Vocabulary

> Status: **discovery draft** — this document exists to converge on vocabulary and
> scope before code. Open questions for the project owner are marked **❓Q1–Q4**
> and collected at the end. Everything else states the current working assumption.

---

## 1. Vision

A **purely CLI-based, agent-orchestrated video system**: an LLM-driven agent that
creates, edits, and fine-tunes videos by composing three engines —

| Engine | Role | Runs where |
|---|---|---|
| **FFmpeg / ffprobe** | Demux, trim, concat, transcode, filter graphs, audio mix, mux | Native binary, subprocess |
| **HTML Canvas (2D + WebGL)** | Programmatic visuals: overlays, titles, charts, Three.js scenes | Headless browser (see §4) |
| **Web Audio API** | Synthesis, ducking, envelopes, offline audio rendering | Headless browser (`OfflineAudioContext`) |

The end state is a **fine-tuned model** that is unusually good at driving these
engines — produced by first building the agent on a frontier model and harvesting
its successful sessions as training data (the "agent-first, fine-tune-later"
track, §6).

### Non-goals (for now)

- No GUI / NLE timeline editor. The interface is the CLI and natural-language briefs.
- No generative video models (no diffusion/video-gen). Visuals are *procedural*
  (Canvas/WebGL) or *edited footage* (FFmpeg).
- No live streaming; batch/offline rendering only.

---

## 2. Why here, in kaaroViewer

kaaroViewer already contains the seed of this system:

- `canvas/export.mjs` → `exportAssets()` renders **per-slide canvas PNGs** from the
  canonical camera of each story beat, bundles backdrops, and emits a
  `manifest.json` whose `ffmpegHint` is literally a hand-off to ffmpeg:
  `ffmpeg -framerate 1/4 -pattern_type glob -i 'slide_*_canvas.png' … out.mp4`.
- Intelligence briefs carry a **story** array (beats with narration, tension,
  camera focus) — i.e. a ready-made *screenplay* for a rendered video.
- `canvas/paint-strategies.mjs` defines swappable render styles
  (cinematic / documentary / abstract / blueprint) — i.e. ready-made *look profiles*.

**First customer**: turn a library brief / exploration session into a narrated
video (beats → camera moves → narration audio → titles → final MP4).
**Second customer**: general-purpose "here is footage + a brief, make the edit"
tasks, using the same agent and vocabulary. **❓Q3** asks which to prioritize.

---

## 3. Vocabulary

These terms are the contract between humans, the agent, docs, and code. Use them
exactly; do not invent synonyms.

### Assets & inspection

| Term | Meaning |
|---|---|
| **Asset** | Any input file: footage, image, audio, font, brief JSON. Immutable once registered. |
| **Probe** | Structured inspection of an asset (`ffprobe -print_format json`): streams, codecs, duration, fps, resolution, loudness. The agent **always probes before editing**. |
| **Proxy** | A low-res/fast-codec working copy used for cheap iteration; the final render uses originals. |
| **Artifact** | Any file the pipeline produces: intermediates, frames, stems, final renders. Addressed by content hash so steps are cacheable. |

### The edit

| Term | Meaning |
|---|---|
| **Brief** (video brief) | The natural-language + structured request: goal, assets, target duration, look, deliverable spec. (Distinct from kaaroViewer's *intelligence brief*; when both appear in one sentence, say **video brief** vs **graph brief**.) |
| **Timeline** | The declarative JSON edit description — the single source of truth for a video. Contains tracks, clips, transitions, and generator invocations. Everything renders *from* the Timeline; the agent edits *the Timeline*, not files. Analogous to an NLE project file / EDL, but diffable and machine-writable. |
| **Track** | An ordered lane in the Timeline: `video`, `audio`, or `overlay`. |
| **Clip** | A placement of an asset region on a track: `{ asset, in, out, at, speed, effects[] }`. |
| **Generator** | A procedural clip whose frames/samples come from a **Scene Script** (Canvas/Web Audio) instead of an asset file. |
| **Scene Script** | A self-contained JS module executed in the render harness. Exports `init(ctx)` + `renderFrame(t)` (Canvas) or `renderAudio(offlineCtx)` (Web Audio). Deterministic: same `t` → same frame. |
| **Filter graph** | The ffmpeg `-filter_complex` expression compiled from a Timeline segment. Agent-facing tools speak Timeline; the **compiler** speaks filter graph. |
| **Recipe** | A reusable, parameterized Timeline fragment ("lower-third title", "duck music under VO", "beat-to-slide sequence"). Recipes are the unit of skill reuse *and* of training data curation. |
| **Look** | A named visual style profile (palette, fonts, LUT, motion feel) applied across a Timeline — maps onto kaaroViewer's paint strategies. |

### Rendering

| Term | Meaning |
|---|---|
| **Render harness** | The headless runtime that executes Scene Scripts and emits frame sequences / audio buffers (§4). |
| **Frame pipe** | Transport from harness to ffmpeg: PNG sequence on disk (simple, cacheable) or rawvideo over stdin (fast). Start with PNG sequences. |
| **Offline audio render** | `OfflineAudioContext.startRendering()` → WAV. All Web Audio output is rendered offline, never realtime. |
| **Deliverable** | The final encoded output(s) with an explicit spec: container, codec, resolution, fps, loudness target (e.g. `mp4/h264/1080p/30/-14 LUFS`). |
| **Render plan** | The ordered DAG of concrete engine invocations (harness runs + ffmpeg commands) compiled from a Timeline. Dry-runnable: printed before execution. |

### Agent & learning

| Term | Meaning |
|---|---|
| **Operation** | One tool call the agent can make (`probe`, `timeline.addClip`, `render.preview`, …). Small, composable, JSON-in/JSON-out. |
| **Session** | One brief → final deliverable interaction, including all agent turns and operations. |
| **Trace** | The serialized record of a session: brief, every operation + result, verification outcomes, final artifacts. Traces are the raw material for fine-tuning. |
| **Verifier** | An automatic check on an artifact: duration ±tolerance, stream layout, black-frame/silence detection, loudness, SSIM against a reference frame. Verifiers gate whether a trace counts as a **golden trace**. |
| **Golden trace** | A verified-successful trace admitted to the training set. |
| **Eval** | A scripted brief + assets + verifiers, run against any model/agent version to score capability. The eval suite is the fitness function for both prompt iteration and fine-tuning. |

---

## 4. Architecture

```
 brief ──▶ ┌────────────┐   operations    ┌──────────────┐
           │   Agent    │ ◀─────────────▶ │  Tool layer  │
           │ (LLM loop) │                 │ (Operations) │
           └────────────┘                 └──────┬───────┘
                 │ traces                        │
                 ▼                        ┌──────┴────────────────────────┐
           trace store                    │           Engines             │
                 │                        │  ffmpeg/ffprobe (subprocess)  │
                 ▼                        │  Render harness (headless     │
           fine-tune / evals              │   Chromium: Canvas+WebGL+     │
                                          │   OfflineAudioContext)        │
                                          └───────────────────────────────┘
                       Timeline JSON = the shared state all of them edit
```

### Layers

1. **Media core** — thin, tested wrappers around `ffprobe`/`ffmpeg`: probe,
   extract, trim, concat, transcode, mux, filter-graph compiler. Pure Node, no LLM.
2. **Render harness** — **working assumption: headless Chromium via Playwright**
   (already pre-installed in this project's remote environment). Real Canvas 2D,
   WebGL (Three.js scenes render faithfully), real `OfflineAudioContext`.
   A node-canvas fallback for trivial 2D work is a possible later optimization,
   not a starting point. **❓Q2**
3. **Timeline & compiler** — Timeline JSON schema + validator (same spirit as
   `.claude/hooks/validate-library-json.py`) + compiler to a Render plan.
4. **Agent layer** — the LLM loop exposing Operations as tools. Ships first as a
   Claude Code skill (e.g. `/vid`) plus a standalone `kaaro-vid` CLI; the CLI is
   what a fine-tuned model will later drive.
5. **Learning layer** — trace store, verifiers, eval suite, fine-tune pipeline.

### Agent loop discipline (mirrors the /visualize three-pass rule)

Every session follows **probe → plan → execute → verify**:

1. **Probe** all assets; never assume codecs/durations.
2. **Plan**: write/modify the Timeline; print the Render plan (dry-run).
3. **Execute**: render proxies first for preview; originals for the deliverable.
4. **Verify**: run verifiers; on failure, diagnose from probe data and iterate.

Collapsing these passes is the video equivalent of the under-connected-graph
failure mode — it produces "works on my prompt" edits that fail verification.

---

## 5. CLI surface (draft)

```
kaaro-vid probe <asset...>                      # structured media inspection
kaaro-vid new <project> --brief "..."           # create project + Timeline
kaaro-vid timeline <project> [edit-ops|--json]  # inspect / patch the Timeline
kaaro-vid render <project> --preview|--final    # compile Render plan + execute
kaaro-vid verify <project>                      # run verifiers on last render
kaaro-vid agent "<natural language brief>"      # full agentic session
kaaro-vid trace export|list                     # training-data plumbing
kaaro-vid beats <library-id>                    # kaaroViewer: brief → Timeline seed
```

Every command is non-interactive, JSON-outputtable (`--json`), and exit-code
honest — designed to be driven by an agent, not just a human.

---

## 6. The fine-tuning track

**Working assumption (❓Q1): agent-first, fine-tune-later.**

1. **Phase A — frontier agent.** Build the tool layer + agent on Claude. Every
   session emits a trace; verifiers label success.
2. **Phase B — corpus.** Curate golden traces; augment with synthetic briefs
   over the eval suite (parameterized Recipes are the generator). Format as
   tool-use conversations (brief → operations → results → deliverable).
3. **Phase C — fine-tune.** LoRA/QLoRA on an open-weights tool-calling model
   (candidate default: Qwen2.5-Coder-class) against the trace corpus; score with
   the same eval suite; the tuned model plugs into the identical CLI tool layer.

Rationale: FFmpeg filter-graph syntax and Canvas/Web Audio idioms are exactly the
kind of dense, verifiable, syntax-heavy domain where a small tuned model can match
a frontier model at a fraction of the cost — but only once the *tool layer and
evals* exist to generate and grade data. Building the tuning corpus without the
agent would mean hand-authoring thousands of examples.

---

## 7. Proposed phases

| Phase | Deliverable | Exit criterion | Status |
|---|---|---|---|
| 0 | This document agreed; vocabulary frozen | ❓Q1–Q4 answered | ✅ proceeding on stated assumptions |
| 1 | Media core: probe/trim/concat/transcode + tests | `kaaro-vid probe/render` works on sample footage | ✅ `vid/` — see `vid/README.md` |
| 2 | Timeline schema + validator + compiler → Render plan | Timeline fixtures compile to deterministic, dry-runnable plans | ✅ `vid/timeline.mjs` + `vid/compiler.mjs` |
| 3 | Render harness: Scene Script → frames + offline audio → ffmpeg mux | A Canvas title card + synthesized audio renders to MP4 headlessly | ✅ `vid/harness.mjs` + `vid/scenes/title-card.mjs`; e2e test passes all verifiers |
| 4 | Agent layer (`/vid` skill + `kaaro-vid agent`) + verifiers + trace logging | Agent completes 5 scripted evals unassisted | 🔶 verifiers, traces (`vid/trace.mjs`, golden flag) and `/vid` skill done; standalone `kaaro-vid agent` loop + scripted evals pending (→ M1/M2 below) |
| 5 | kaaroViewer integration: `beats <library-id>` → narrated story video | One library entry rendered end-to-end | ✅ v2: per-chunk narration with lockstep captions, crossfaded constellation cards, closing stats — `vid/samples/SAMPLES.md` tracks v0→v2 |
| 6 | Corpus + fine-tune + eval comparison | Tuned model ≥ frontier baseline on eval suite | ⬜ gated on M1–M3 below; training run itself needs resources outside this repo |

The original ❓Q1–Q4 were resolved by proceeding on the stated assumptions
(agent-first; headless Chromium; kaaroViewer story videos first; in-repo
under `vid/`) — ratified by the work since.

---

## 8. Review — 2026-07-09 (post-v2)

### What exists and holds

Phases 1–3 and 5 are built, tested (228 passing), and disciplined:

- **Tool layer**: probe/trim/concat/xfade/transcode/audio-mix; Timeline with
  transitions; pure compiler → dry-runnable Render plans; headless harness
  (Canvas + offline Web Audio); verifiers; traces with a golden flag; the
  `kaaro-vid` CLI and `/vid` skill.
- **Quality infrastructure beyond the original plan**: visual TDD
  (`vid/CTDD.md` — 7 cognitive tests with embedded artifacts; SSIM golden
  frames per scene; determinism check; contact sheets), a validated accent
  palette, TTS provider abstraction, measured caption↔VO lockstep.
- **Proof of the loop**: three sample generations (v0→v2) of the same source
  with verifier-gated golden traces and visual progression records.

### The honest gap: the fine-tune goal

The stated goal is a **fine-tuned model**. What the corpus actually needs —
and doesn't have yet:

1. **Decision-level traces.** Current traces record *tool operations*
   (compile/steps/verify), not the *agent's choices* (which brief → which
   Timeline edits → why). Fine-tuning teaches decisions; the schema must
   grow agent turns, and something must emit them.
2. **An eval suite.** "Agent completes 5 scripted evals unassisted" is still
   the Phase 4 exit and is the fitness function for any tuned model. Without
   it, "better" is vibes.
3. **Volume.** One narrated brief ≠ a corpus. Synthetic brief generation over
   parameterized Recipes + more library entries + general-editing briefs.
4. **Training resources.** GPU + open-weights training cannot run in this
   environment. In-repo we produce corpus + baselines; the run happens
   elsewhere.

### Revised milestones

| # | Milestone | Deliverable | Exit criterion |
|---|---|---|---|
| M1 | **Eval suite** | `vid/evals/` — 6–8 scripted briefs (story videos, trims/concats on generated footage, mixed edits) each with fixtures + expected-verifier spec; `kaaro-vid eval` runner emitting a scorecard | One command scores any agent/model version; current tooling passes the non-agentic evals |
| M2 | **Agent loop + decision traces** | `kaaro-vid agent "<brief>"` driving the tool layer via a pluggable LLM (BYOM, mirroring the app's `registerLLM` pattern); trace schema v2 records turns (prompt, tool calls, results); `/vid` sessions harvestable into the same format | Agent completes the M1 evals unassisted; every session yields a decision-level trace |
| M3 | **Corpus tooling** | trace→training-example converter (tool-use conversation format); synthetic brief generator over Recipes; corpus stats + dedup | ≥100 golden decision-traces exportable in one command |
| M4 | **Fine-tune (external)** | corpus + eval baseline handed to a GPU environment; LoRA on an open-weights tool-caller; scored by M1 | tuned ≥ frontier baseline on the eval suite |

Parallel quality axes (any order, each starts as a CT-V entry):
**piper voice** (needs a network-policy allowance for huggingface.co or a
voice file placed in the environment — everything else is ready),
**continuous score with tension arc**, **per-beat Three.js scene renders**,
**overlay track** (lower-thirds over footage — first general-editing visual).

### Expectations to hold

- In this environment: everything through M3, plus all quality axes except
  piper's voice download. Renders of ~6 min cost ~4–5 min wall.
- Outside this environment: the M4 training run; a piper voice unless policy
  changes.
- The eval suite (M1) is the highest-leverage next step: it closes Phase 4,
  gates M2's "unassisted", and is the yardstick M4 is judged by.

### Decisions for the owner

- **D1 — Priority**: M1→M2→M3 in order (recommended), or a quality axis
  first (e.g. Three.js beat renders for wow-factor)?
- **D2 — Fine-tune commitment**: still the destination (M4), or is the
  agentic system + evals the product and M4 optional? Affects how much M3
  matters.
- **D3 — Voices**: adjust the environment network policy to allow
  huggingface.co (one-time ~60 MB voice fetch), or ship espeak until then?
