/**
 * Integration tests for the media core. They exercise real ffmpeg on
 * generated footage and are skipped wholesale when ffmpeg/ffprobe are
 * not installed (available() preflight), so the suite stays green on
 * machines without media tooling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { available } from './ffmpeg.mjs';
import { probe } from './probe.mjs';
import { colorClip, trim, concat, xfadeConcat, transcode, extractAudio } from './media-core.mjs';

const hasFfmpeg = await available();

describe.skipIf(!hasFfmpeg)('media-core (requires ffmpeg)', () => {
  let dir;
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'kaaro-vid-test-')); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('colorClip + probe roundtrip', async () => {
    const clip = await colorClip(join(dir, 'red.mp4'), { color: 'red', duration: 2, fps: 30, tone: 440 });
    const p = await probe(clip);
    expect(p.duration).toBeCloseTo(2, 0);
    expect(p.video).toMatchObject({ codec: 'h264', width: 320, height: 240, fps: 30 });
    expect(p.audio.codec).toBe('aac');
  }, 30000);

  it('trim cuts an accurate sub-range', async () => {
    const src = await colorClip(join(dir, 'blue.mp4'), { color: 'blue', duration: 3, tone: 220 });
    const cut = await trim(src, join(dir, 'blue-cut.mp4'), { inSec: 0.5, outSec: 1.5 });
    const p = await probe(cut);
    expect(p.duration).toBeCloseTo(1, 1);
  }, 30000);

  it('trim rejects an empty range', async () => {
    await expect(trim('x.mp4', 'y.mp4', { inSec: 2, outSec: 1 })).rejects.toThrow(/outSec/);
  });

  it('concat joins uniform clips end to end', async () => {
    const a = await colorClip(join(dir, 'a.mp4'), { color: 'green', duration: 1, tone: 330 });
    const b = await colorClip(join(dir, 'b.mp4'), { color: 'yellow', duration: 1, tone: 550 });
    const out = await concat([a, b], join(dir, 'ab.mp4'));
    const p = await probe(out);
    expect(p.duration).toBeCloseTo(2, 0);
  }, 30000);

  it('xfadeConcat overlaps clips by the transition duration', async () => {
    const a = await colorClip(join(dir, 'xa.mp4'), { color: 'red', duration: 2, fps: 24, tone: 330 });
    const b = await colorClip(join(dir, 'xb.mp4'), { color: 'blue', duration: 2, fps: 24, tone: 550 });
    const out = await xfadeConcat([a, b], [null, { kind: 'crossfade', duration: 0.5 }], join(dir, 'xab.mp4'), { fps: 24 });
    const p = await probe(out);
    expect(p.duration).toBeCloseTo(3.5, 0);   // 2 + 2 − 0.5
    expect(p.video.fps).toBe(24);
    expect(p.audio).not.toBeNull();
  }, 30000);

  it('transcode normalizes size, fps, and adds silent audio when asked', async () => {
    const src = await colorClip(join(dir, 'silent.mp4'), { color: 'gray', duration: 1, fps: 25, width: 100, height: 100 });
    const out = await transcode(src, join(dir, 'norm.mp4'), { width: 320, height: 240, fps: 30, ensureAudio: true });
    const p = await probe(out);
    expect(p.video).toMatchObject({ width: 320, height: 240, fps: 30 });
    expect(p.audio).not.toBeNull();
  }, 30000);

  it('extractAudio pulls a wav from a clip', async () => {
    const src = await colorClip(join(dir, 'tone.mp4'), { color: 'black', duration: 1, tone: 440 });
    const wav = await extractAudio(src, join(dir, 'tone.wav'));
    const p = await probe(wav);
    expect(p.audio.codec).toBe('pcm_s16le');
    expect(p.video).toBeNull();
  }, 30000);
});
