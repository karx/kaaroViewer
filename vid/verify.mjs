/**
 * vid/verify.mjs — Verifiers (VIDEO_AGENT_PLAN.md §3): automatic checks
 * that gate whether a render counts as successful and whether a session
 * trace is admissible as a golden trace.
 *
 * verifyDeliverable(path, timeline) runs the V1 suite and returns
 * { ok, checks: [{ id, ok, detail }] } — it never throws on a failed
 * check, only on unreadable input.
 */

import { probe } from './probe.mjs';
import { ffmpeg } from './ffmpeg.mjs';

/** Expected sequence duration = sum of video clip durations (V1: no gaps). */
export function expectedDuration(timeline) {
  const videoTrack = timeline.tracks.find(tr => tr.kind === 'video');
  return videoTrack.clips.reduce((sum, clip) => {
    const src = clip.source;
    if (src.kind === 'generator') return sum + src.duration;
    if (src.out == null) return sum + 0; // unknown tail length — skip from expectation
    return sum + (src.out - (src.in ?? 0));
  }, 0);
}

export async function verifyDeliverable(path, timeline, { durationTolerance = 0.35 } = {}) {
  const p = await probe(path);
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok, detail });

  // stream layout
  add('has-video-stream', !!p.video, p.video ? `video ${p.video.codec} ${p.video.width}x${p.video.height}` : 'no video stream');
  add('has-audio-stream', !!p.audio, p.audio ? `audio ${p.audio.codec} ${p.audio.sampleRate}Hz` : 'no audio stream');

  // geometry + fps against the timeline spec
  if (p.video) {
    const { width, height, fps } = timeline.meta;
    add('resolution', p.video.width === width && p.video.height === height,
      `expected ${width}x${height}, got ${p.video.width}x${p.video.height}`);
    add('fps', p.video.fps != null && Math.abs(p.video.fps - fps) < 0.51,
      `expected ${fps}, got ${p.video.fps}`);
  }

  // duration
  const expected = expectedDuration(timeline);
  if (expected > 0) {
    const ok = p.duration != null && Math.abs(p.duration - expected) <= durationTolerance;
    add('duration', ok, `expected ~${expected}s ±${durationTolerance}, got ${p.duration}s`);
  }

  // decode integrity: a full silent decode pass must not error
  try {
    await ffmpeg(['-i', path, '-f', 'null', '-']);
    add('decodes-cleanly', true, 'full decode pass ok');
  } catch (err) {
    add('decodes-cleanly', false, err.message.split('\n')[0]);
  }

  return { ok: checks.every(c => c.ok), checks, probe: p };
}

export function formatChecks({ ok, checks }) {
  const lines = checks.map(c => ` ${c.ok ? '✓' : '✗'} ${c.id.padEnd(18)} ${c.detail}`);
  return [...lines, ok ? 'VERIFY: PASS' : 'VERIFY: FAIL'].join('\n');
}
