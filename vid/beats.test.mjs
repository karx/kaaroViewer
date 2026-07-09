import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { briefToTimeline, beatDuration, chunkNarration, VIDEO_PALETTE } from './beats.mjs';
import { compile } from './compiler.mjs';
import { PROVIDERS } from './tts.mjs';
import { available as ffmpegAvailable } from './ffmpeg.mjs';

const BRIEF = {
  meta: { id: 'doc', title: 'Doc Title', subtitle: 'A subtitle', domain: 'Testing', year: '2026' },
  report_card: { key_stats: ['Tests: 198 passing', 'Nodes: 31'] },
  clusters: [
    { id: 'c1', color: '#123456', nodes: ['n1', 'n2'] },
    { id: 'c2', color: '#654321', nodes: ['n3'] },
  ],
  nodes: [
    { id: 'n1', label: 'Node One', type: 'concept', tier: 'primary' },
    { id: 'n2', label: 'Node Two', type: 'tool', tier: 'secondary' },
    { id: 'n3', label: 'Node Three', type: 'person', tier: 'tertiary' },
  ],
  edges: [
    { from: 'n1', to: 'n2', rel: 'features' },
    { from: 'n2', to: 'n3', rel: 'influences' },
  ],
  story: [
    { id: 'beat-1', title: 'Start', node: 'n1', nodes: ['n1', 'n2'], narration: 'x'.repeat(60), tension: 'low' },
    { id: 'beat-2', title: 'Peak', node: 'n3', nodes: ['n3', 'n1'], narration: 'y'.repeat(600), tension: 'climax' },
    { id: 'beat-3', title: 'End', node: 'unknown', narration: 'short', tension: 'resolution' },
  ],
};

describe('beatDuration', () => {
  it('scales with narration length within clamps', () => {
    expect(beatDuration('')).toBe(4);
    expect(beatDuration('x'.repeat(180))).toBe(6);
    expect(beatDuration('x'.repeat(9000))).toBe(10);
  });
});

describe('briefToTimeline', () => {
  it('produces title + beat cards + closing stats card', async () => {
    const t = await briefToTimeline(BRIEF);
    const clips = t.tracks[0].clips;
    expect(clips.map(c => c.id)).toEqual(['opening-title', 'beat-1', 'beat-2', 'beat-3', 'closing-stats']);
    expect(clips[0].source.params.meta).toContain('Testing');
    expect(clips[0].source.params.meta).toContain('3 beats');
    expect(clips.at(-1).source.scene).toMatch(/end-card\.mjs$/);
    expect(clips.at(-1).source.params.stats).toEqual(['Tests: 198 passing', 'Nodes: 31']);
  });

  it('assigns validated palette accents by cluster order, default for unknown', async () => {
    const clips = (await briefToTimeline(BRIEF)).tracks[0].clips;
    expect(clips[1].source.params.accent).toBe(VIDEO_PALETTE[0]); // n1 → cluster 0
    expect(clips[2].source.params.accent).toBe(VIDEO_PALETTE[1]); // n3 → cluster 1
    expect(clips[3].source.params.accent).toBe(VIDEO_PALETTE[0]); // unknown → default
  });

  it('embeds the beat subgraph: nodes with labels/tiers/focus and intra-beat edges', async () => {
    const clips = (await briefToTimeline(BRIEF)).tracks[0].clips;
    const g1 = clips[1].source.params.graph;
    expect(g1.nodes).toEqual([
      { id: 'n1', label: 'Node One', tier: 'primary', focus: true },
      { id: 'n2', label: 'Node Two', tier: 'secondary', focus: false },
    ]);
    expect(g1.edges).toEqual([{ from: 'n1', to: 'n2', rel: 'features' }]);
    const g2 = clips[2].source.params.graph;
    expect(g2.edges).toEqual([]); // n3–n1 have no direct edge
  });

  it('adds crossfades into every card after the first', async () => {
    const clips = (await briefToTimeline(BRIEF)).tracks[0].clips;
    expect(clips[0].transition).toBeUndefined();
    for (const clip of clips.slice(1)) {
      expect(clip.transition).toEqual({ kind: 'crossfade', duration: 0.6 });
    }
  });

  it('yields a timeline that compiles (all generators + xfade + finalize)', async () => {
    const plan = compile(await briefToTimeline(BRIEF), { workDir: '/w' });
    expect(plan.steps.map(s => s.kind)).toEqual(
      ['generator', 'generator', 'generator', 'generator', 'generator', 'xfade', 'finalize']);
  });

  it('rejects a brief with no story beats', async () => {
    await expect(briefToTimeline({ meta: { id: 'empty' }, story: [] })).rejects.toThrow(/no story beats/);
  });
});

describe('chunkNarration', () => {
  it('splits on sentence boundaries under the char budget', () => {
    const chunks = chunkNarration('One short. ' + 'Second sentence that is somewhat longer than the first. '.repeat(3));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(170);
    expect(chunks[0]).toMatch(/^One short\./);
  });
});

const hasEspeak = await PROVIDERS.espeak.available();
const hasFfmpeg = await ffmpegAvailable();

describe.skipIf(!hasEspeak || !hasFfmpeg)('narrated timeline (espeak + ffprobe)', () => {
  it('caption timings are measured, monotone, and VO clips land at effective card starts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kaaro-beats-vo-'));
    try {
      const brief = {
        ...BRIEF,
        story: [
          { id: 'beat-1', title: 'One', node: 'n1', nodes: ['n1'], narration: 'First sentence spoken aloud. Then a second sentence follows it.', tension: 'low' },
          { id: 'beat-2', title: 'Two', node: 'n3', nodes: ['n3'], narration: 'Another beat with words to say.', tension: 'high' },
        ],
      };
      const t = await briefToTimeline(brief, { narrate: 'espeak', ttsDir: dir });
      const clips = t.tracks[0].clips;
      const beat1 = clips.find(c => c.id === 'beat-1');

      // captions: measured chunk windows, strictly ordered, inside the card
      const caps = beat1.source.params.captions;
      expect(caps.length).toBeGreaterThanOrEqual(1);
      for (const [i, c] of caps.entries()) {
        expect(c.end).toBeGreaterThan(c.start);
        if (i > 0) expect(c.start).toBeGreaterThan(caps[i - 1].end);
      }
      expect(caps.at(-1).end).toBeLessThanOrEqual(beat1.source.duration);

      // VO clips: one per chunk, placed at effective start (transition-shifted)
      const voTrack = t.tracks.find(tr => tr.id === 'vo');
      const beat1Start = clips[0].source.duration - beat1.transition.duration;
      const beat1Vo = voTrack.clips.filter(c => c.id.startsWith('vo-beat-1-'));
      expect(beat1Vo.length).toBe(caps.length);
      expect(beat1Vo[0].at).toBeCloseTo(beat1Start + caps[0].start, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);
});
