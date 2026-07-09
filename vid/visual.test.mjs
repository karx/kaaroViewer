/**
 * Visual regression: golden-frame tests for every Scene Script.
 *
 * Each probe renders one deterministic frame (fixed t, fixed fixture
 * params — never live library data) and compares it against the
 * committed golden in vid/goldens/ by SSIM. The goldens are the embedded
 * visual artifacts referenced by vid/CTDD.md — changing a scene's look
 * on purpose means regenerating them:
 *
 *   KAARO_UPDATE_GOLDENS=1 npx vitest run vid/visual.test.mjs
 *
 * and reviewing the image diff in the PR like any other code change.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { available } from './ffmpeg.mjs';
import { renderScene } from './harness.mjs';
import { compareToGolden, ssim } from './visual.mjs';

const VID = dirname(fileURLToPath(import.meta.url));
const GOLDENS = join(VID, 'goldens');
const UPDATE = !!process.env.KAARO_UPDATE_GOLDENS;

const hasFfmpeg = await available();
const hasChromium = !!process.env.KAARO_CHROMIUM || existsSync('/opt/pw-browsers/chromium');

const FIXTURE_GRAPH = {
  nodes: [
    { id: 'a', label: 'Alpha Node', tier: 'primary', focus: true },
    { id: 'b', label: 'Beta', tier: 'secondary', focus: false },
    { id: 'c', label: 'Gamma', tier: 'secondary', focus: false },
    { id: 'd', label: 'Delta', tier: 'tertiary', focus: false },
  ],
  edges: [
    { from: 'a', to: 'b', rel: 'features' },
    { from: 'a', to: 'c', rel: 'governs' },
    { from: 'c', to: 'd', rel: 'influences' },
  ],
};

/** Probe moments: name → { scene, t, duration, params }. Fixed forever unless the look changes on purpose. */
const PROBES = {
  'title-card-settled': {
    scene: join(VID, 'scenes/title-card.mjs'), t: 2.0, duration: 4,
    params: { title: 'Golden Title', subtitle: 'a fixed subtitle for regression', meta: 'Domain · 2026 · 10 beats', accent: '#f05500' },
  },
  'beat-card-constellation': {
    scene: join(VID, 'scenes/beat-card.mjs'), t: 3.0, duration: 8,
    params: {
      index: 3, count: 10, title: 'The Golden Beat',
      narration: 'First sentence of a fixed narration. Second sentence keeps the caption band honest. Third one paces the chunks.',
      tension: 'climax', accent: '#3498db', docTitle: 'Golden Doc', graph: FIXTURE_GRAPH,
    },
  },
  'end-card-stats': {
    scene: join(VID, 'scenes/end-card.mjs'), t: 2.5, duration: 7,
    params: { title: 'Golden Doc', stats: ['Tests: 204 passing', 'Nodes: 31 encoded', 'Edges: 64 wired', 'Beats: 10 told'], accent: '#f05500' },
  },
};

describe.skipIf(!hasFfmpeg || !hasChromium)('scene golden frames (ffmpeg + chromium)', () => {
  let dir;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kaaro-goldens-'));
    await mkdir(GOLDENS, { recursive: true });
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  for (const [name, probe] of Object.entries(PROBES)) {
    it(`${name} matches its golden`, async () => {
      const outDir = join(dir, name);
      await renderScene(probe.scene, {
        params: probe.params, duration: probe.duration,
        width: 640, height: 360, outDir, frameTimes: [probe.t],
      });
      const rendered = join(outDir, 'frame_00000.png');
      const golden = join(GOLDENS, `${name}.png`);

      if (UPDATE) {
        await copyFile(rendered, golden);
        return; // regenerated on purpose; the PR diff is the review
      }
      const result = await compareToGolden(rendered, golden);
      expect(result, `SSIM ${result.score} vs ${golden} (${result.reason}) — if intentional, rerun with KAARO_UPDATE_GOLDENS=1`)
        .toMatchObject({ ok: true });
    }, 60000);
  }

  it('scene rendering is deterministic: same t twice → identical pixels', async () => {
    const probe = PROBES['beat-card-constellation'];
    const [d1, d2] = [join(dir, 'det1'), join(dir, 'det2')];
    for (const outDir of [d1, d2]) {
      await renderScene(probe.scene, {
        params: probe.params, duration: probe.duration,
        width: 640, height: 360, outDir, frameTimes: [probe.t],
      });
    }
    const score = await ssim(join(d1, 'frame_00000.png'), join(d2, 'frame_00000.png'));
    expect(score).toBeGreaterThanOrEqual(0.999);
  }, 90000);
});
