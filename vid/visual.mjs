/**
 * vid/visual.mjs — visual artifacts and visual regression primitives.
 *
 * ssim(a, b)              structural similarity of two images/videos (0..1)
 *                         via ffmpeg's ssim filter — no extra dependencies.
 * compareToGolden(...)    render-vs-golden verdict for regression tests.
 * contactSheet(video,...) tiled grid of sampled frames — the embeddable
 *                         "whole film at a glance" artifact for SAMPLES.md
 *                         and CTDD review.
 */

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { run, ffmpegBin, ffprobeBin } from './ffmpeg.mjs';

/** Mean SSIM between two same-sized images (or videos). 1 = identical. */
export async function ssim(a, b) {
  const { stderr } = await run(ffmpegBin(), [
    '-hide_banner', '-i', a, '-i', b,
    '-lavfi', 'ssim', '-f', 'null', '-',
  ]);
  const m = stderr.match(/All:\s*([\d.]+)/);
  if (!m) throw new Error(`ssim: could not parse ffmpeg output:\n${stderr.slice(-400)}`);
  return Number(m[1]);
}

/**
 * Compare a freshly rendered image against a committed golden.
 * Returns { ok, score, golden, reason }. A missing golden is a failure
 * with reason 'missing-golden' — regenerate with KAARO_UPDATE_GOLDENS=1.
 */
export async function compareToGolden(rendered, golden, { threshold = 0.97 } = {}) {
  if (!existsSync(golden)) return { ok: false, score: 0, golden, reason: 'missing-golden' };
  const score = await ssim(rendered, golden);
  return { ok: score >= threshold, score, golden, reason: score >= threshold ? 'match' : 'below-threshold' };
}

/**
 * Build a contact sheet: cols×rows tiles sampled evenly across the video.
 * Returns the output path.
 */
export async function contactSheet(video, out, { cols = 5, rows = 6, tileWidth = 320 } = {}) {
  await mkdir(dirname(resolve(out)), { recursive: true });
  const tiles = cols * rows;

  // count frames cheaply from container metadata
  const { stdout } = await run(ffprobeBin(), [
    '-v', 'error', '-select_streams', 'v:0',
    '-count_packets', '-show_entries', 'stream=nb_read_packets',
    '-of', 'csv=p=0', video,
  ]);
  const frames = Number(stdout.trim());
  if (!frames) throw new Error(`contactSheet: could not count frames of ${video}`);
  const step = Math.max(1, Math.floor(frames / tiles));

  await run(ffmpegBin(), [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', video,
    '-vf', `select=not(mod(n\\,${step})),scale=${tileWidth}:-1,tile=${cols}x${rows}:padding=2:color=0x0a0a0f`,
    '-frames:v', '1', out,
  ]);
  return out;
}
