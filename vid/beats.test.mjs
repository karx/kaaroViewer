import { describe, it, expect } from 'vitest';
import { briefToTimeline, beatDuration } from './beats.mjs';
import { compile } from './compiler.mjs';

const BRIEF = {
  meta: { id: 'doc', title: 'Doc Title', subtitle: 'A subtitle' },
  clusters: [
    { id: 'c1', color: '#3498db', nodes: ['n1', 'n2'] },
    { id: 'c2', color: '#27ae60', nodes: ['n3'] },
  ],
  story: [
    { id: 'beat-1', title: 'Start', node: 'n1', narration: 'x'.repeat(60), tension: 'low' },
    { id: 'beat-2', title: 'Peak', node: 'n3', narration: 'y'.repeat(600), tension: 'climax' },
    { id: 'beat-3', title: 'End', node: 'unknown', narration: 'short', tension: 'resolution' },
  ],
};

describe('beatDuration', () => {
  it('scales with narration length within clamps', () => {
    expect(beatDuration('')).toBe(4);                 // min clamp
    expect(beatDuration('x'.repeat(60))).toBe(4);     // 2s of text → min clamp
    expect(beatDuration('x'.repeat(180))).toBe(6);    // 180/30
    expect(beatDuration('x'.repeat(9000))).toBe(10);  // max clamp
  });
});

describe('briefToTimeline', () => {
  it('produces opening title + one beat card per story beat', () => {
    const t = briefToTimeline(BRIEF);
    const clips = t.tracks[0].clips;
    expect(clips).toHaveLength(4);
    expect(clips[0].id).toBe('opening-title');
    expect(clips[0].source.scene).toMatch(/title-card\.mjs$/);
    expect(clips[0].source.params.title).toBe('Doc Title');
    expect(clips.slice(1).map(c => c.id)).toEqual(['beat-1', 'beat-2', 'beat-3']);
    expect(clips[1].source.params).toMatchObject({ index: 1, count: 3, tension: 'low' });
  });

  it('picks the accent color from the cluster owning the focus node', () => {
    const clips = briefToTimeline(BRIEF).tracks[0].clips;
    expect(clips[1].source.params.accent).toBe('#3498db'); // n1 in c1
    expect(clips[2].source.params.accent).toBe('#27ae60'); // n3 in c2
    expect(clips[3].source.params.accent).toBe('#ff6600'); // unknown node → default
  });

  it('yields a timeline that compiles into generator steps + concat', () => {
    const plan = compile(briefToTimeline(BRIEF), { workDir: '/w' });
    expect(plan.steps.map(s => s.kind)).toEqual(['generator', 'generator', 'generator', 'generator', 'concat', 'finalize']);
  });

  it('rejects a brief with no story beats', () => {
    expect(() => briefToTimeline({ meta: { id: 'empty' }, story: [] })).toThrow(/no story beats/);
  });
});
