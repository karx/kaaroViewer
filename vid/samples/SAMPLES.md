# vid/samples — progression log

Baseline renders checked in to trace how story-video output improves over
time. Each version entry re-renders the **same source** (`library/kaaro-viewer.json`)
so differences are attributable to the pipeline, not the material.

Reproduce any entry:

```bash
pnpm vid beats kaaro-viewer --width 640 --height 360 --fps 24 --out vid/samples/kaaro-viewer-story.timeline.json
pnpm vid render vid/samples/kaaro-viewer-story.timeline.json --out vid/samples/kaaro-viewer-story.mp4 --trace vid/samples/kaaro-viewer-story.trace.json
pnpm vid verify vid/samples/kaaro-viewer-story.mp4 --timeline vid/samples/kaaro-viewer-story.timeline.json --trace vid/samples/kaaro-viewer-story.trace.json
```

When output quality changes, add a new version entry below (do not rewrite old
ones) and replace the three artifacts. The trace's `golden` flag must be true
before an entry is added.

---

## v0 — 2026-07-08 — beat cards baseline

**Source:** `library/kaaro-viewer.json` (10 story beats)
**Artifacts:** `kaaro-viewer-story.{timeline.json,mp4,trace.json}`

| Metric | Value |
|---|---|
| Deliverable | 640×360 @ 24fps, h264+aac, 102.1s, 2.3 MB |
| Verifiers | 6/6 PASS (trace golden) |
| Render time | ~46s wall (11 generator clips ≈ 3.5s each + 10s cold-start, concat 0.3s) |
| Encoding | opening title card + one beat card per story beat |

**What v0 does:** typographic beat cards — beat index, title, line-revealed
narration, tension badge, cluster-colored accents and drifting node field,
tension-pitched Web Audio drone (low 165Hz → climax 330Hz). Beat length scales
with narration size (4–10s @ 30 chars/s).

**Known gaps / improvement axes (in rough priority order):**

1. **Narration audio** — text-on-screen only; no voiceover. Next: TTS track on
   an audio lane, beat durations driven by VO length instead of reading rate.
2. **Real graph visuals** — cards show no actual graph. Next: render the
   Three.js scene per beat (camera at each beat's canonical position, reusing
   `getCanonicalCamera` from `canvas/scene-painter.mjs`) as the card backdrop.
3. **Clamped pacing** — 8 of 10 beats hit the 10s max clamp, flattening rhythm;
   narration longer than the card is ellipsized (`…`).
4. **No transitions** — hard cuts between cards; no crossfade/dip-to-black
   vocabulary in the Timeline yet.
5. **Audio continuity** — per-clip drones reset at each cut; no continuous bed
   or tension arc across the whole piece.
