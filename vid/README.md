# vid/ — kaaro-vid: the video agent tool layer

Implements Phases 1–4 (partial) of [`VIDEO_AGENT_PLAN.md`](../VIDEO_AGENT_PLAN.md).
Vocabulary (Timeline, Clip, Generator, Scene Script, Render plan, Verifier…) is
defined there; this README covers usage only.

## Requirements

- **ffmpeg / ffprobe** on PATH (`apt-get install ffmpeg`), or point
  `KAARO_FFMPEG` / `KAARO_FFPROBE` at binaries.
- **Headless Chromium** for generator clips only — `playwright-core` plus either
  its own browser download, this environment's pre-install at
  `/opt/pw-browsers/chromium`, or a `KAARO_CHROMIUM` path override.
  Media-only timelines (no generators) never touch the browser.

## CLI

```bash
pnpm vid probe footage.mp4                 # structured media inspection (JSON)
pnpm vid new my-video                      # scaffold my-video.timeline.json
pnpm vid render my-video.timeline.json --out final.mp4 [--dry-run]
pnpm vid verify final.mp4 --timeline my-video.timeline.json
pnpm vid scene vid/scenes/title-card.mjs --duration 3 --params '{"title":"Hi"}'
```

`render` always prints the Render plan first; `--dry-run` stops there.
`verify` exits 1 on any failed check — wire it into scripts/CI directly.

## Timeline in 20 lines

```json
{
  "meta": { "id": "demo", "fps": 30, "width": 1280, "height": 720 },
  "tracks": [
    { "id": "v1", "kind": "video", "clips": [
      { "id": "title", "source": { "kind": "generator",
          "scene": "vid/scenes/title-card.mjs", "duration": 2,
          "params": { "title": "Hello", "tone": 220 } } },
      { "id": "main", "source": { "kind": "asset",
          "path": "footage.mp4", "in": 0.5, "out": 4 } }
    ]},
    { "id": "a1", "kind": "audio", "clips": [
      { "id": "music", "source": { "kind": "asset", "path": "music.wav",
          "in": 0, "out": 5 }, "gain": 0.3, "at": 0 }
    ]}
  ]
}
```

V1 semantics: one video track, clips play in order (no gaps); audio clips are
mixed under the video at their `at` offset with `gain`.

## Scene Scripts

A Scene Script is a **self-contained ES module** (no imports) run in headless
Chromium. Exports:

```js
export function init(env) {}                    // optional one-time setup
export function renderFrame(env) {}             // draw frame at env.t (seconds)
export function renderAudio(offlineCtx, env) {} // optional: schedule Web Audio
                                                // nodes; rendered offline to WAV
```

`env = { canvas, ctx, width, height, duration, fps, frame, t, params }`.
Determinism is the contract: same `t` in → same pixels out. Never read clocks.
See `scenes/title-card.mjs` for the reference implementation.

## Module map

| Module | Role |
|---|---|
| `ffmpeg.mjs` | binary discovery + subprocess runner (one error shape) |
| `probe.mjs` | ffprobe → normalized Probe object |
| `media-core.mjs` | trim / concat / transcode / mux / audio-mix primitives |
| `timeline.mjs` | Timeline validation + normalization |
| `compiler.mjs` | Timeline → Render plan (pure, dry-runnable) |
| `render.mjs` | executes a Render plan |
| `harness.mjs` | Scene Script → PNG frames + offline WAV (headless Chromium) |
| `verify.mjs` | deliverable verifiers (streams, geometry, fps, duration, decode) |
| `cli.mjs` | `kaaro-vid` command surface |
| `scenes/` | Scene Script library |
