/**
 * vid/beats.mjs — kaaroViewer integration (VIDEO_AGENT_PLAN.md Phase 5):
 * intelligence brief → story-video Timeline.
 *
 * v0 encoding: an opening title card (brief title/subtitle) followed by
 * one beat-card generator clip per story beat. Beat duration scales with
 * narration length at a fixed reading rate; each card carries the accent
 * color of the cluster owning its focus node, and a tension-pitched drone.
 */

import { readFile } from 'node:fs/promises';
import { parseTimeline } from './timeline.mjs';

const READ_RATE_CHARS_PER_SEC = 30;   // reveal pacing for narration text
const MIN_BEAT_SEC = 4;
const MAX_BEAT_SEC = 10;
const TITLE_SEC = 3;

export function beatDuration(narration = '') {
  const sec = narration.length / READ_RATE_CHARS_PER_SEC;
  return Math.round(Math.min(MAX_BEAT_SEC, Math.max(MIN_BEAT_SEC, sec)) * 10) / 10;
}

/** color of the cluster containing nodeId, else fallback. */
function clusterColor(brief, nodeId, fallback = '#ff6600') {
  const cluster = (brief.clusters ?? []).find(c => (c.nodes ?? []).includes(nodeId));
  return cluster?.color ?? fallback;
}

/**
 * Convert a parsed intelligence brief into a Timeline.
 * sceneDir lets tests point at the scenes from any cwd.
 */
export function briefToTimeline(brief, {
  fps = 24, width = 1280, height = 720,
  sceneDir = 'vid/scenes',
} = {}) {
  const beats = brief.story ?? [];
  if (!beats.length) throw new Error(`brief "${brief.meta?.id}" has no story beats`);

  const clips = [{
    id: 'opening-title',
    source: {
      kind: 'generator',
      scene: `${sceneDir}/title-card.mjs`,
      duration: TITLE_SEC,
      params: {
        title: brief.meta.title ?? brief.meta.id,
        subtitle: brief.meta.subtitle ?? '',
        tone: 196,
      },
    },
  }];

  beats.forEach((beat, i) => {
    clips.push({
      id: beat.id ?? `beat-${i + 1}`,
      source: {
        kind: 'generator',
        scene: `${sceneDir}/beat-card.mjs`,
        duration: beatDuration(beat.narration),
        params: {
          index: i + 1,
          count: beats.length,
          title: beat.title ?? '',
          narration: beat.narration ?? '',
          tension: beat.tension ?? 'low',
          accent: clusterColor(brief, beat.node),
          docTitle: brief.meta.title ?? brief.meta.id,
        },
      },
    });
  });

  return parseTimeline({
    meta: {
      id: `${brief.meta.id}-story`,
      title: `${brief.meta.title ?? brief.meta.id} — story video`,
      fps, width, height,
    },
    tracks: [{ id: 'v1', kind: 'video', clips }],
  });
}

/** Load library/{id}.json and convert. libraryDir override is for tests. */
export async function libraryToTimeline(libraryId, { libraryDir = 'library', ...opts } = {}) {
  const raw = await readFile(`${libraryDir}/${libraryId}.json`, 'utf8');
  return briefToTimeline(JSON.parse(raw), opts);
}
