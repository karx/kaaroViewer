/**
 * vid/beats.mjs — kaaroViewer integration (VIDEO_AGENT_PLAN.md Phase 5):
 * intelligence brief → story-video Timeline.
 *
 * v1 encoding: opening title card → one beat card per story beat → closing
 * stats card. Beat cards receive the beat's actual subgraph (nodes + intra-
 * beat edges) for the constellation panel. With { narrate }, narration is
 * synthesized per card (vid/tts.mjs), card durations are driven by the
 * measured voiceover length — never estimated from text — and the VO clips
 * land on an audio track at each card's offset.
 *
 * Accent colors come from VIDEO_PALETTE — validated against the dark
 * surface (#0a0a0f) with the dataviz six-checks — assigned to clusters in
 * brief order, never cycled: clusters beyond the palette fold to neutral.
 */

import { readFile } from 'node:fs/promises';
import { parseTimeline } from './timeline.mjs';
import { synthesize } from './tts.mjs';
import { probe } from './probe.mjs';

// slot 0 doubles as the kaaro brand accent / default
export const VIDEO_PALETTE = ['#f05500', '#e74c3c', '#3498db', '#27ae60', '#8e44ad', '#d3691e', '#16a085'];
const NEUTRAL_ACCENT = '#8899aa';

const READ_RATE_CHARS_PER_SEC = 30;   // silent-card pacing only
const MIN_BEAT_SEC = 4;
const MAX_BEAT_SEC = 10;
const TITLE_SEC = 4;
const END_SEC = 7;
const VO_LEAD_SEC = 0.8;              // silence before a card's VO starts
const VO_TAIL_SEC = 1.0;              // breathing room after it ends

export function beatDuration(narration = '') {
  const sec = narration.length / READ_RATE_CHARS_PER_SEC;
  return Math.round(Math.min(MAX_BEAT_SEC, Math.max(MIN_BEAT_SEC, sec)) * 10) / 10;
}

/** cluster index of nodeId in brief order, or -1. */
function clusterIndex(brief, nodeId) {
  return (brief.clusters ?? []).findIndex(c => (c.nodes ?? []).includes(nodeId));
}

function accentFor(brief, nodeId) {
  const i = clusterIndex(brief, nodeId);
  if (i < 0) return VIDEO_PALETTE[0];
  return i < VIDEO_PALETTE.length ? VIDEO_PALETTE[i] : NEUTRAL_ACCENT;
}

/** The beat's subgraph: its nodes (label/tier/focus) + intra-beat edges. */
function beatGraph(brief, beat) {
  const ids = beat.nodes?.length ? beat.nodes : (beat.node ? [beat.node] : []);
  const idSet = new Set(ids);
  const byId = new Map((brief.nodes ?? []).map(n => [n.id, n]));
  const nodes = ids.map(id => {
    const n = byId.get(id);
    return {
      id,
      label: n?.label ?? id,
      tier: n?.tier ?? 'secondary',
      focus: id === beat.node,
    };
  });
  const edges = (brief.edges ?? [])
    .filter(e => idSet.has(e.from) && idSet.has(e.to))
    .map(e => ({ from: e.from, to: e.to, rel: e.rel }));
  return { nodes, edges };
}

/**
 * Convert a parsed intelligence brief into a Timeline.
 * options.narrate: false | true | provider name ('piper'|'command'|'espeak').
 * VO wavs are written to options.ttsDir.
 */
export async function briefToTimeline(brief, {
  fps = 24, width = 1280, height = 720,
  sceneDir = 'vid/scenes',
  narrate = false,
  ttsDir = `.kaaro-vid/tts/${brief.meta?.id ?? 'brief'}`,
} = {}) {
  const beats = brief.story ?? [];
  if (!beats.length) throw new Error(`brief "${brief.meta?.id}" has no story beats`);
  const provider = narrate === true ? 'auto' : narrate;

  // ── narration synthesis (measured durations, never estimated) ────────
  const vo = new Map(); // cardId → { path, duration }
  if (narrate) {
    const jobs = [
      { id: 'opening-title', text: `${brief.meta.title ?? brief.meta.id}. ${brief.meta.subtitle ?? ''}`.trim() },
      ...beats.map((b, i) => ({ id: b.id ?? `beat-${i + 1}`, text: b.narration ?? '' })),
    ].filter(j => j.text);
    for (const job of jobs) {
      const path = `${ttsDir}/${job.id}.wav`;
      await synthesize(job.text, path, { provider });
      const p = await probe(path);
      vo.set(job.id, { path, duration: p.duration });
    }
  }

  const cardSec = (cardId, fallbackSec) => {
    const v = vo.get(cardId);
    if (!v) return fallbackSec;
    return Math.max(MIN_BEAT_SEC, Math.round((VO_LEAD_SEC + v.duration + VO_TAIL_SEC) * 10) / 10);
  };

  // ── video track ───────────────────────────────────────────────────────
  const graphTotals = { nodes: (brief.nodes ?? []).length, edges: (brief.edges ?? []).length };
  const clips = [{
    id: 'opening-title',
    source: {
      kind: 'generator',
      scene: `${sceneDir}/title-card.mjs`,
      duration: cardSec('opening-title', TITLE_SEC),
      params: {
        title: brief.meta.title ?? brief.meta.id,
        subtitle: brief.meta.subtitle ?? '',
        meta: [brief.meta.domain, brief.meta.year, `${beats.length} beats`, `${graphTotals.nodes}N · ${graphTotals.edges}E`]
          .filter(Boolean).join('  ·  '),
        accent: VIDEO_PALETTE[0],
        tone: narrate ? 0 : 196,
      },
    },
  }];

  beats.forEach((beat, i) => {
    const id = beat.id ?? `beat-${i + 1}`;
    clips.push({
      id,
      source: {
        kind: 'generator',
        scene: `${sceneDir}/beat-card.mjs`,
        duration: cardSec(id, beatDuration(beat.narration)),
        params: {
          index: i + 1,
          count: beats.length,
          title: beat.title ?? '',
          narration: beat.narration ?? '',
          tension: beat.tension ?? 'low',
          accent: accentFor(brief, beat.node),
          docTitle: brief.meta.title ?? brief.meta.id,
          graph: beatGraph(brief, beat),
        },
      },
    });
  });

  const stats = (brief.report_card?.key_stats ?? []).slice(0, 4);
  if (stats.length) {
    clips.push({
      id: 'closing-stats',
      source: {
        kind: 'generator',
        scene: `${sceneDir}/end-card.mjs`,
        duration: END_SEC,
        params: {
          title: brief.meta.title ?? brief.meta.id,
          stats,
          accent: VIDEO_PALETTE[0],
        },
      },
    });
  }

  // ── audio track: VO clips at each card's start offset ────────────────
  const tracks = [{ id: 'v1', kind: 'video', clips }];
  if (vo.size) {
    let offset = 0;
    const voClips = [];
    for (const clip of clips) {
      const v = vo.get(clip.id);
      if (v) {
        voClips.push({
          id: `vo-${clip.id}`,
          source: { kind: 'asset', path: v.path, in: 0, out: v.duration },
          gain: 1,
          at: Math.round((offset + VO_LEAD_SEC) * 10) / 10,
        });
      }
      offset += clip.source.duration;
    }
    tracks.push({ id: 'vo', kind: 'audio', clips: voClips });
  }

  return parseTimeline({
    meta: {
      id: `${brief.meta.id}-story`,
      title: `${brief.meta.title ?? brief.meta.id} — story video`,
      fps, width, height,
    },
    tracks,
  });
}

/** Load library/{id}.json and convert. libraryDir override is for tests. */
export async function libraryToTimeline(libraryId, { libraryDir = 'library', ...opts } = {}) {
  const raw = await readFile(`${libraryDir}/${libraryId}.json`, 'utf8');
  return briefToTimeline(JSON.parse(raw), opts);
}
