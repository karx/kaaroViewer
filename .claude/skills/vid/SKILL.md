---
description: Create or edit a video with the kaaro-vid tool layer. Takes a natural-language video brief, a timeline.json, or a library entry id, and drives probe → plan → execute → verify to a verified deliverable, leaving a session trace. Use when asked to render, edit, or produce a video.
argument-hint: <library-id | timeline.json | "natural-language video brief">
allowed-tools: Read Write Edit Glob Bash
---

# vid — video agent session

You are running one **session** of the video agent (vocabulary: `VIDEO_AGENT_PLAN.md`;
tool layer: `vid/README.md`). The deliverable is a rendered video that **passes
`kaaro-vid verify`**, plus its session trace. Follow the loop in order — do not
collapse passes.

## Step 0 — Preflight

- `ffmpeg -version` / `ffprobe -version` must work. If missing:
  Linux `apt-get install -y ffmpeg`, or set `KAARO_FFMPEG` / `KAARO_FFPROBE`.
- Generator clips (Canvas Scene Scripts) also need headless Chromium
  (pre-installed at `/opt/pw-browsers/chromium` in remote sessions, or
  `KAARO_CHROMIUM`).
- All commands run from the repo root: `pnpm vid <command>` (alias for
  `node vid/cli.mjs`).

### Windows preflight

`tts.mjs` spawns `sh` and uses `command -v`. On Windows you need Git's
`usr\bin` on PATH plus an explicit TTS command (SAPI helper ships in-repo):

```powershell
$env:Path = "C:\Program Files\Git\usr\bin;" + $env:Path
# if ffmpeg is not already on PATH:
# $env:KAARO_FFMPEG = "…\ffmpeg.exe"; $env:KAARO_FFPROBE = "…\ffprobe.exe"
$env:KAARO_TTS_CMD = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File '$PWD\vid\tts-sapi.ps1' -Text {text} -Out {out}"
```

Confirm with `pnpm vid beats <id> --narrate command` (or let provider auto-pick
once `KAARO_TTS_CMD` is set). Prefer piper when `KAARO_PIPER_VOICE` is installed.

## Step 1 — Interpret `$ARGUMENTS` into a Timeline

| Input looks like | Do |
|---|---|
| a library id (matches `library/{id}.json`) | `pnpm vid beats <id> --narrate` → narrated story timeline (drop `--narrate` only if explicitly asked for a silent cut; needs a TTS provider — see `vid/README.md`; Linux minimum `apt-get install espeak-ng`, Windows use SAPI via `KAARO_TTS_CMD` above) |
| a `*.timeline.json` path | use it directly |
| a natural-language brief | build a timeline yourself (below) |

`briefToTimeline` adapts library fields for scenes: `report_card.key_stats`
objects `{label,value}` become end-card `"Label: value"` strings. Do not pass
raw objects into end-card `params.stats`.

Building from a brief:
1. **Probe every asset first**: `pnpm vid probe <file>` — never assume codecs,
   durations, or resolutions. If the ask exceeds an asset's actual duration or
   the assets don't exist, stop and say so.
2. Scaffold with `pnpm vid new <id>`, then edit the JSON: one video track,
   clips in play order; asset clips use `{ "kind": "asset", "path", "in", "out" }`,
   procedural visuals use `{ "kind": "generator", "scene", "duration", "params" }`
   (existing scenes: `vid/scenes/`); music/VO go on an audio track with
   `gain`/`at`. Write a new Scene Script only when no existing scene fits — it
   must be a self-contained ES module (no imports), deterministic in `t`
   (contract in `vid/README.md`).

## Step 2 — Plan (dry run)

```
pnpm vid render <timeline.json> --dry-run
```

Read the printed Render plan. Confirm step order and clip durations match the
intent **before** spending render time. Fix the timeline, not the plan.

## Step 3 — Execute

```
pnpm vid render <timeline.json> --out <final.mp4> --work .kaaro-vid/work
```

This writes the deliverable plus a trace at `<final.mp4>.trace.json`.

## Step 4 — Verify (mandatory)

```
pnpm vid verify <final.mp4> --timeline <timeline.json>
```

- Exit 0: the trace is marked golden. Report the deliverable path, duration,
  and trace path.
- Exit 1: read which check failed, diagnose from `pnpm vid probe <final.mp4>`
  and the trace step timings, fix the timeline (or scene), and re-run from
  Step 2. Never hand over an unverified render; if you cannot get it green,
  report the failing check and your diagnosis instead.

## Quality bar

- Frame-accurate cuts: prefer re-encode trims (the default) over stream copies.
- Keep intermediate work under `.kaaro-vid/` (gitignored territory) — never
  commit renders or work dirs unless explicitly asked to add a sample.
- If asked to record progression, follow the format in `vid/samples/SAMPLES.md`.
