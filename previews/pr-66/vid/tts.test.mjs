import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVIDERS, detectProvider, synthesize } from './tts.mjs';
import { probe } from './probe.mjs';
import { available as ffmpegAvailable } from './ffmpeg.mjs';

const hasEspeak = await PROVIDERS.espeak.available();
const hasFfmpeg = await ffmpegAvailable();

describe('tts providers', () => {
  it('piper is unavailable without a voice model configured', async () => {
    const saved = process.env.KAARO_PIPER_VOICE;
    delete process.env.KAARO_PIPER_VOICE;
    try {
      expect(await PROVIDERS.piper.available()).toBe(false);
    } finally {
      if (saved != null) process.env.KAARO_PIPER_VOICE = saved;
    }
  });

  it('command provider follows KAARO_TTS_CMD', async () => {
    const saved = process.env.KAARO_TTS_CMD;
    try {
      delete process.env.KAARO_TTS_CMD;
      expect(await PROVIDERS.command.available()).toBe(false);
      process.env.KAARO_TTS_CMD = 'echo {text} > {out}';
      expect(await PROVIDERS.command.available()).toBe(true);
    } finally {
      if (saved != null) process.env.KAARO_TTS_CMD = saved;
      else delete process.env.KAARO_TTS_CMD;
    }
  });

  it('synthesize rejects unknown providers', async () => {
    await expect(synthesize('hi', '/tmp/x.wav', { provider: 'nope' })).rejects.toThrow(/unknown TTS provider/);
  });
});

describe.skipIf(!hasEspeak || !hasFfmpeg)('espeak synthesis (requires espeak-ng + ffprobe)', () => {
  it('produces a probeable wav whose duration scales with text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kaaro-tts-'));
    try {
      const short = await synthesize('Hello.', join(dir, 'short.wav'), { provider: 'espeak' });
      expect(short.provider).toBe('espeak');
      const long = await synthesize(
        'This is a considerably longer sentence, spoken to verify that measured duration grows with text length.',
        join(dir, 'long.wav'), { provider: 'espeak' });
      const [ps, pl] = [await probe(short.out), await probe(long.out)];
      expect(ps.audio).not.toBeNull();
      expect(ps.duration).toBeGreaterThan(0.2);
      expect(pl.duration).toBeGreaterThan(ps.duration);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('detectProvider finds something in this environment', async () => {
    expect(await detectProvider()).not.toBeNull();
  });
});
