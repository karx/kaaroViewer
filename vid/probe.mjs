/**
 * vid/probe.mjs — structured media inspection (the "Probe" in VIDEO_AGENT_PLAN.md).
 *
 * probe(path)          → normalized Probe object
 * parseProbe(rawJson)  → pure parser, exported for tests
 *
 * The agent always probes before editing; every downstream decision
 * (fps, resolution, stream mapping) reads from this shape, never from
 * raw ffprobe output.
 */

import { ffprobe } from './ffmpeg.mjs';

/** Parse "num/den" fps strings ("30000/1001" → 29.97). */
export function parseFps(rate) {
  if (!rate || rate === '0/0') return null;
  const [num, den] = String(rate).split('/').map(Number);
  if (!num) return null;
  return den ? +(num / den).toFixed(3) : num;
}

/** Pure transform: raw ffprobe JSON (string or object) → Probe. */
export function parseProbe(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const fmt = data.format ?? {};
  const streams = (data.streams ?? []).map(s => {
    const base = {
      index: s.index,
      kind: s.codec_type,           // 'video' | 'audio' | 'subtitle' | ...
      codec: s.codec_name ?? null,
      duration: s.duration != null ? Number(s.duration) : null,
    };
    if (s.codec_type === 'video') {
      return {
        ...base,
        width: s.width ?? null,
        height: s.height ?? null,
        fps: parseFps(s.avg_frame_rate) ?? parseFps(s.r_frame_rate),
        pixFmt: s.pix_fmt ?? null,
        frames: s.nb_frames != null ? Number(s.nb_frames) : null,
      };
    }
    if (s.codec_type === 'audio') {
      return {
        ...base,
        sampleRate: s.sample_rate != null ? Number(s.sample_rate) : null,
        channels: s.channels ?? null,
        channelLayout: s.channel_layout ?? null,
      };
    }
    return base;
  });

  return {
    path: fmt.filename ?? null,
    container: fmt.format_name ?? null,
    duration: fmt.duration != null ? Number(fmt.duration) : null,
    sizeBytes: fmt.size != null ? Number(fmt.size) : null,
    bitrate: fmt.bit_rate != null ? Number(fmt.bit_rate) : null,
    streams,
    video: streams.find(s => s.kind === 'video') ?? null,
    audio: streams.find(s => s.kind === 'audio') ?? null,
  };
}

/** Probe a media file on disk. */
export async function probe(path) {
  const { stdout } = await ffprobe([
    '-print_format', 'json',
    '-show_format', '-show_streams',
    path,
  ]);
  return parseProbe(stdout);
}
