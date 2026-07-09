import { describe, it, expect } from 'vitest';
import { briefToTimeline, beatDuration, VIDEO_PALETTE } from './beats.mjs';
import { compile } from './compiler.mjs';

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

  it('yields a timeline that compiles (all generators + concat + finalize)', async () => {
    const plan = compile(await briefToTimeline(BRIEF), { workDir: '/w' });
    expect(plan.steps.map(s => s.kind)).toEqual(
      ['generator', 'generator', 'generator', 'generator', 'generator', 'concat', 'finalize']);
  });

  it('rejects a brief with no story beats', async () => {
    await expect(briefToTimeline({ meta: { id: 'empty' }, story: [] })).rejects.toThrow(/no story beats/);
  });
});
