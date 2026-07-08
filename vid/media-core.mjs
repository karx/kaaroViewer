/**
 * vid/media-core.mjs — Phase 1 primitives over ffmpeg.
 *
 * All functions take/return file paths; nothing here knows about the
 * Timeline. The compiler (vid/compiler.mjs) sequences these into a
 * Render plan. Times are seconds (float), sizes are pixels.
 */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ffmpeg } from './ffmpeg.mjs';

async function ensureDir(path) {
  await mkdir(dirname(resolve(path)), { recursive: true });
}

/** Cut [inSec, outSec) from src into out; outSec omitted = to end. Re-encodes for frame accuracy. */
export async function trim(src, out, { inSec = 0, outSec, vcodec = 'libx264', acodec = 'aac', crf = 20 } = {}) {
  if (outSec != null && outSec <= inSec) throw new Error(`trim: outSec (${outSec}) must be > inSec (${inSec})`);
  await ensureDir(out);
  await ffmpeg([
    '-ss', String(inSec), ...(outSec != null ? ['-to', String(outSec)] : []), '-i', src,
    '-c:v', vcodec, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', acodec,
    out,
  ]);
  return out;
}

/**
 * Concatenate clips (paths) into out using the concat demuxer.
 * Inputs must already share codec/resolution/fps — the compiler
 * normalizes clips before calling this.
 */
export async function concat(clips, out) {
  if (!clips?.length) throw new Error('concat: no input clips');
  await ensureDir(out);
  const listFile = join(tmpdir(), `kaaro-vid-concat-${randomBytes(4).toString('hex')}.txt`);
  const listBody = clips.map(c => `file '${resolve(c).replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listFile, listBody + '\n');
  try {
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
  } finally {
    await rm(listFile, { force: true });
  }
  return out;
}

/** Normalize/transcode src to a target spec (the compiler's intermediate format). */
export async function transcode(src, out, {
  width, height, fps,
  vcodec = 'libx264', acodec = 'aac', crf = 20,
  ensureAudio = false,   // add a silent track if src has none (keeps concat inputs uniform)
} = {}) {
  await ensureDir(out);
  const filters = [];
  if (width && height) filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);
  if (fps) filters.push(`fps=${fps}`);

  const args = ['-i', src];
  if (ensureAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  if (filters.length) args.push('-vf', filters.join(','));
  args.push('-c:v', vcodec, '-crf', String(crf), '-pix_fmt', 'yuv420p');
  if (ensureAudio) args.push('-c:a', acodec, '-map', '0:v:0', '-map', '1:a:0', '-shortest');
  else args.push('-c:a', acodec);
  args.push(out);

  await ffmpeg(args);
  return out;
}

/** Encode a PNG frame sequence (printf pattern, e.g. dir/frame_%05d.png) to video. */
export async function framesToVideo(pattern, out, { fps = 30, vcodec = 'libx264', crf = 20 } = {}) {
  await ensureDir(out);
  await ffmpeg([
    '-framerate', String(fps), '-i', pattern,
    '-c:v', vcodec, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    out,
  ]);
  return out;
}

/** Mux/replace: video stream from videoSrc + audio stream from audioSrc. */
export async function muxAudio(videoSrc, audioSrc, out, { acodec = 'aac' } = {}) {
  await ensureDir(out);
  await ffmpeg([
    '-i', videoSrc, '-i', audioSrc,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', acodec, '-shortest',
    out,
  ]);
  return out;
}

/**
 * Mix audio clips into a video's existing audio track.
 * clips: [{ path, in=0, out?, gain=1, at=0 }] — each is trimmed, gained,
 * delayed to its `at` offset, then amixed with the video's own audio.
 * Output duration stays that of the video.
 */
export async function mixAudioIntoVideo(videoSrc, clips, out, { acodec = 'aac' } = {}) {
  if (!clips?.length) throw new Error('mixAudioIntoVideo: no audio clips');
  await ensureDir(out);
  const args = ['-i', videoSrc];
  const chains = [];
  const labels = ['[0:a]'];
  clips.forEach((c, i) => {
    args.push('-i', c.path);
    const steps = [];
    steps.push(c.out != null ? `atrim=${c.in ?? 0}:${c.out}` : `atrim=start=${c.in ?? 0}`);
    steps.push('asetpts=PTS-STARTPTS', 'aresample=48000');
    if (c.gain != null && c.gain !== 1) steps.push(`volume=${c.gain}`);
    if (c.at) steps.push(`adelay=${Math.round(c.at * 1000)}:all=1`);
    chains.push(`[${i + 1}:a]${steps.join(',')}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  chains.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0[aout]`);
  args.push(
    '-filter_complex', chains.join(';'),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', acodec,
    out,
  );
  await ffmpeg(args);
  return out;
}

/** Extract the audio track of src to out (wav by default via extension). */
export async function extractAudio(src, out) {
  await ensureDir(out);
  await ffmpeg(['-i', src, '-vn', out]);
  return out;
}

/** Generate test footage: solid color + optional tone. Used by tests and evals. */
export async function colorClip(out, {
  color = 'red', duration = 2, width = 320, height = 240, fps = 30, tone = null,
} = {}) {
  await ensureDir(out);
  const args = ['-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}:r=${fps}:d=${duration}`];
  if (tone != null) args.push('-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=${duration}:sample_rate=48000`, '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-shortest', out);
  await ffmpeg(args);
  return out;
}
