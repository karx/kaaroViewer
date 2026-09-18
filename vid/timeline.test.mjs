import { describe, it, expect } from 'vitest';
import { validateTimeline, parseTimeline, createTimeline, TimelineError } from './timeline.mjs';
import { compile, describePlan } from './compiler.mjs';

const VALID = {
  meta: { id: 'demo', title: 'Demo', fps: 30, width: 640, height: 360 },
  tracks: [
    {
      id: 'v1', kind: 'video', clips: [
        { id: 'title', source: { kind: 'generator', scene: 'vid/scenes/title-card.mjs', duration: 2, params: { title: 'Hi' } } },
        { id: 'main', source: { kind: 'asset', path: 'footage.mp4', in: 1, out: 4 } },
      ],
    },
    {
      id: 'a1', kind: 'audio', clips: [
        { id: 'music', source: { kind: 'asset', path: 'music.mp3', in: 0, out: 5 }, gain: 0.4, at: 0.5 },
      ],
    },
  ],
};

describe('validateTimeline', () => {
  it('accepts a valid timeline and fills defaults', () => {
    const { ok, timeline } = validateTimeline(VALID);
    expect(ok).toBe(true);
    expect(timeline.deliverable).toMatchObject({ container: 'mp4', vcodec: 'libx264' });
    expect(timeline.tracks[1].clips[0].gain).toBe(0.4);
  });

  it('collects all errors instead of stopping at the first', () => {
    const { ok, errors } = validateTimeline({
      meta: {},
      tracks: [
        { kind: 'nope', clips: [{ source: { kind: 'asset' } }] },
      ],
    });
    expect(ok).toBe(false);
    expect(errors.join('\n')).toMatch(/meta\.id/);
    expect(errors.join('\n')).toMatch(/kind must be one of/);
    expect(errors.join('\n')).toMatch(/source\.path/);
    expect(errors.join('\n')).toMatch(/exactly one video track/);
  });

  it('rejects duplicate clip ids, bad ranges, and audio generators', () => {
    const { errors } = validateTimeline({
      meta: { id: 'x' },
      tracks: [
        { id: 'v1', kind: 'video', clips: [
          { id: 'c', source: { kind: 'asset', path: 'a.mp4', in: 3, out: 2 } },
          { id: 'c', source: { kind: 'generator', duration: 0 } },
        ]},
        { id: 'a1', kind: 'audio', clips: [
          { id: 'g', source: { kind: 'generator', scene: 's.mjs', duration: 1 } },
        ]},
      ],
    });
    const all = errors.join('\n');
    expect(all).toMatch(/out must be > source\.in/);
    expect(all).toMatch(/"c" is duplicated/);
    expect(all).toMatch(/source\.scene is required/);
    expect(all).toMatch(/duration must be > 0/);
    expect(all).toMatch(/audio tracks are not supported in V1/);
  });

  it('validates transitions: video-only, not on first clip, sane kind/duration', () => {
    const { errors } = validateTimeline({
      meta: { id: 'x' },
      tracks: [
        { id: 'v1', kind: 'video', clips: [
          { id: 'c1', source: { kind: 'generator', scene: 's.mjs', duration: 2 }, transition: { kind: 'crossfade', duration: 0.5 } },
          { id: 'c2', source: { kind: 'generator', scene: 's.mjs', duration: 2 }, transition: { kind: 'wipe', duration: 3 } },
        ]},
        { id: 'a1', kind: 'audio', clips: [
          { id: 'm', source: { kind: 'asset', path: 'm.wav', in: 0, out: 1 }, transition: { kind: 'crossfade', duration: 0.5 } },
        ]},
      ],
    });
    const all = errors.join('\n');
    expect(all).toMatch(/first clip has nothing to transition from/);
    expect(all).toMatch(/transition\.kind must be one of crossfade\|dipblack/);
    expect(all).toMatch(/transition\.duration must be in \(0, 2\]/);
    expect(all).toMatch(/only valid on video clips/);
  });

  it('accepts a valid crossfade', () => {
    const { ok } = validateTimeline({
      meta: { id: 'x' },
      tracks: [{ id: 'v1', kind: 'video', clips: [
        { id: 'c1', source: { kind: 'generator', scene: 's.mjs', duration: 2 } },
        { id: 'c2', source: { kind: 'generator', scene: 's.mjs', duration: 2 }, transition: { kind: 'crossfade', duration: 0.6 } },
      ]}],
    });
    expect(ok).toBe(true);
  });

  it('parseTimeline throws TimelineError with the error list', () => {
    expect(() => parseTimeline({})).toThrow(TimelineError);
  });

  it('createTimeline yields a valid empty sequence', () => {
    const t = createTimeline({ id: 'fresh' });
    expect(t.meta).toMatchObject({ id: 'fresh', fps: 30 });
    expect(t.tracks[0].clips).toEqual([]);
  });
});

describe('compile', () => {
  it('produces generator → normalize → concat → audiomix in order', () => {
    const plan = compile(VALID, { workDir: '/w', output: '/out/demo.mp4' });
    expect(plan.steps.map(s => s.kind)).toEqual(['generator', 'normalize', 'concat', 'audiomix']);
    const [gen, norm, cat, mix] = plan.steps;
    expect(gen).toMatchObject({ scene: 'vid/scenes/title-card.mjs', duration: 2, fps: 30, width: 640, height: 360 });
    expect(norm).toMatchObject({ src: 'footage.mp4', in: 1, outSec: 4 });
    expect(cat.inputs).toEqual([gen.out, norm.out]);
    expect(mix.clips[0]).toMatchObject({ path: 'music.mp3', gain: 0.4, at: 0.5 });
    expect(plan.output).toBe('/out/demo.mp4');
  });

  it('emits finalize instead of audiomix when there are no audio tracks', () => {
    const t = structuredClone(VALID);
    t.tracks = [t.tracks[0]];
    const plan = compile(t, { workDir: '/w' });
    expect(plan.steps.at(-1).kind).toBe('finalize');
    expect(plan.output).toMatch(/demo\.mp4$/);
  });

  it('refuses an empty video track', () => {
    expect(() => compile(createTimeline({ id: 'empty' }))).toThrow(/no clips/);
  });

  it('emits xfade instead of concat when any clip carries a transition', () => {
    const t = structuredClone(VALID);
    t.tracks[0].clips[1].transition = { kind: 'crossfade', duration: 0.6 };
    const plan = compile(t, { workDir: '/w' });
    const xf = plan.steps.find(s => s.kind === 'xfade');
    expect(xf).toBeTruthy();
    expect(plan.steps.map(s => s.kind)).not.toContain('concat');
    expect(xf.transitions).toEqual([null, { kind: 'crossfade', duration: 0.6 }]);
    expect(xf.fps).toBe(30);
  });

  it('describePlan is dry-run readable', () => {
    const text = describePlan(compile(VALID, { workDir: '/w' }));
    expect(text).toMatch(/Render plan for "demo"/);
    expect(text).toMatch(/1\. generator/);
    expect(text).toMatch(/4\. audiomix/);
  });
});
