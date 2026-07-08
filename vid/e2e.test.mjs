/**
 * End-to-end: Timeline (generator title card + asset footage + music bed)
 * → compile → execute → verify. Requires ffmpeg AND a headless Chromium,
 * so it skips itself where either is missing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { available } from './ffmpeg.mjs';
import { colorClip, extractAudio } from './media-core.mjs';
import { compile } from './compiler.mjs';
import { executePlan } from './render.mjs';
import { verifyDeliverable } from './verify.mjs';

const hasFfmpeg = await available();
const hasChromium = !!process.env.KAARO_CHROMIUM || existsSync('/opt/pw-browsers/chromium');

describe.skipIf(!hasFfmpeg || !hasChromium)('end-to-end render (ffmpeg + chromium)', () => {
  let dir;
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'kaaro-vid-e2e-')); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('renders a mixed generator+asset timeline that passes all verifiers', async () => {
    const footage = await colorClip(join(dir, 'footage.mp4'), { color: '0x224466', duration: 3, width: 640, height: 360, fps: 30, tone: 440 });
    const musicSrc = await colorClip(join(dir, 'musicsrc.mp4'), { color: 'black', duration: 5, tone: 110 });
    const music = await extractAudio(musicSrc, join(dir, 'music.wav'));

    const timeline = {
      meta: { id: 'e2e', title: 'E2E', fps: 30, width: 640, height: 360 },
      tracks: [
        { id: 'v1', kind: 'video', clips: [
          { id: 'title', source: { kind: 'generator', scene: 'vid/scenes/title-card.mjs', duration: 2, params: { title: 'E2E', tone: 220 } } },
          { id: 'main', source: { kind: 'asset', path: footage, in: 0.5, out: 2.5 } },
        ]},
        { id: 'a1', kind: 'audio', clips: [
          { id: 'music', source: { kind: 'asset', path: music, in: 0, out: 4 }, gain: 0.3 },
        ]},
      ],
    };

    const plan = compile(timeline, { workDir: join(dir, 'work') });
    expect(plan.steps.map(s => s.kind)).toEqual(['generator', 'normalize', 'concat', 'audiomix']);

    const out = await executePlan(plan);
    const result = await verifyDeliverable(out, plan.timeline);
    expect(result.checks.map(c => `${c.id}:${c.ok}`)).toEqual([
      'has-video-stream:true', 'has-audio-stream:true',
      'resolution:true', 'fps:true', 'duration:true', 'decodes-cleanly:true',
    ]);
    expect(result.ok).toBe(true);
  }, 120000);
});
