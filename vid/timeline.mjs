/**
 * vid/timeline.mjs — the Timeline: declarative JSON edit description.
 *
 * The Timeline is the single source of truth for a video (see
 * VIDEO_AGENT_PLAN.md §3). The agent edits the Timeline; the compiler
 * turns it into a Render plan; nothing renders except from a Timeline.
 *
 * V1 shape (validated here):
 * {
 *   "meta":        { "id", "title", "fps": 30, "width": 1280, "height": 720 },
 *   "deliverable": { "container": "mp4", "vcodec": "libx264", "acodec": "aac", "crf": 20 },
 *   "tracks": [
 *     { "id": "v1", "kind": "video", "clips": [
 *        { "id": "c1", "source": { "kind": "asset", "path": "in.mp4", "in": 0, "out": 5 } },
 *        { "id": "c2", "source": { "kind": "generator", "scene": "vid/scenes/title-card.mjs",
 *                                   "duration": 3, "params": { "title": "Hello" } } }
 *     ]},
 *     { "id": "a1", "kind": "audio", "clips": [
 *        { "id": "m1", "source": { "kind": "asset", "path": "music.mp3", "in": 0, "out": 8 }, "gain": 0.4 }
 *     ]}
 *   ]
 * }
 *
 * V1 semantics: video-track clips play in array order (a sequence, no
 * gaps); audio clips are mixed under the video at their `at` offset
 * (seconds, default 0) with `gain`. Multi-video-track compositing is V2.
 * An empty clips array is valid while authoring; compiling requires at
 * least one video clip.
 */

export class TimelineError extends Error {
  constructor(errors) {
    super(`invalid timeline:\n - ${errors.join('\n - ')}`);
    this.name = 'TimelineError';
    this.errors = errors;
  }
}

const TRACK_KINDS = ['video', 'audio'];
const SOURCE_KINDS = ['asset', 'generator'];

/**
 * Validate a timeline object. Returns { ok, errors, timeline } where
 * timeline is a normalized deep copy (defaults filled). Does not touch
 * the filesystem — asset existence is checked at compile time.
 */
export function validateTimeline(input) {
  const errors = [];
  const t = structuredClone(input ?? {});

  // meta
  t.meta = { fps: 30, width: 1280, height: 720, ...t.meta };
  if (!t.meta.id) errors.push('meta.id is required');
  if (!(t.meta.fps > 0)) errors.push('meta.fps must be > 0');
  if (!(t.meta.width > 0 && t.meta.height > 0)) errors.push('meta.width/height must be > 0');

  // deliverable
  t.deliverable = { container: 'mp4', vcodec: 'libx264', acodec: 'aac', crf: 20, ...t.deliverable };

  // tracks
  if (!Array.isArray(t.tracks) || t.tracks.length === 0) {
    errors.push('tracks must be a non-empty array');
    t.tracks = [];
  }
  const seenTrackIds = new Set();
  const seenClipIds = new Set();
  t.tracks.forEach((track, ti) => {
    const where = `tracks[${ti}]`;
    if (!track.id) errors.push(`${where}.id is required`);
    else if (seenTrackIds.has(track.id)) errors.push(`${where}.id "${track.id}" is duplicated`);
    else seenTrackIds.add(track.id);

    if (!TRACK_KINDS.includes(track.kind)) errors.push(`${where}.kind must be one of ${TRACK_KINDS.join('|')}`);
    if (!Array.isArray(track.clips)) {
      errors.push(`${where}.clips must be an array`);
      track.clips = [];
    }

    track.clips.forEach((clip, ci) => {
      const cwhere = `${where}.clips[${ci}]`;
      if (!clip.id) errors.push(`${cwhere}.id is required`);
      else if (seenClipIds.has(clip.id)) errors.push(`${cwhere}.id "${clip.id}" is duplicated`);
      else seenClipIds.add(clip.id);

      const src = clip.source;
      if (!src || !SOURCE_KINDS.includes(src.kind)) {
        errors.push(`${cwhere}.source.kind must be one of ${SOURCE_KINDS.join('|')}`);
        return;
      }
      if (src.kind === 'asset') {
        if (!src.path) errors.push(`${cwhere}.source.path is required for asset sources`);
        src.in ??= 0;
        if (src.out != null && !(src.out > src.in)) errors.push(`${cwhere}.source.out must be > source.in`);
      } else { // generator
        if (!src.scene) errors.push(`${cwhere}.source.scene is required for generator sources`);
        if (!(src.duration > 0)) errors.push(`${cwhere}.source.duration must be > 0`);
        if (track.kind === 'audio') errors.push(`${cwhere}: generator sources on audio tracks are not supported in V1`);
        src.params ??= {};
      }
      if (track.kind === 'audio') clip.gain ??= 1;
    });
  });

  const videoTracks = t.tracks.filter(tr => tr.kind === 'video');
  if (videoTracks.length !== 1 && t.tracks.length > 0) {
    errors.push(`exactly one video track is required in V1 (found ${videoTracks.length})`);
  }

  return { ok: errors.length === 0, errors, timeline: t };
}

/** Validate or throw TimelineError; returns the normalized timeline. */
export function parseTimeline(input) {
  const { ok, errors, timeline } = validateTimeline(input);
  if (!ok) throw new TimelineError(errors);
  return timeline;
}

/** Convenience constructor for a fresh single-sequence timeline. */
export function createTimeline({ id, title = id, fps = 30, width = 1280, height = 720 } = {}) {
  return parseTimeline({
    meta: { id, title, fps, width, height },
    tracks: [{ id: 'v1', kind: 'video', clips: [] }],
  });
}
