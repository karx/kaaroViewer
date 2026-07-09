import { describe, it, expect } from 'vitest';
import { expectedDuration, formatChecks } from './verify.mjs';

describe('expectedDuration', () => {
  const base = { meta: { id: 'x' } };

  it('sums generator durations and asset in/out ranges', () => {
    const t = {
      ...base,
      tracks: [{ id: 'v1', kind: 'video', clips: [
        { id: 'g', source: { kind: 'generator', scene: 's.mjs', duration: 3 } },
        { id: 'a', source: { kind: 'asset', path: 'f.mp4', in: 1, out: 4.5 } },
      ]}],
    };
    expect(expectedDuration(t)).toBeCloseTo(6.5);
  });

  it('skips open-ended asset clips (unknown tail) from the expectation', () => {
    const t = {
      ...base,
      tracks: [{ id: 'v1', kind: 'video', clips: [
        { id: 'g', source: { kind: 'generator', scene: 's.mjs', duration: 2 } },
        { id: 'a', source: { kind: 'asset', path: 'f.mp4', in: 1 } },
      ]}],
    };
    expect(expectedDuration(t)).toBe(2);
  });

  it('ignores audio tracks', () => {
    const t = {
      ...base,
      tracks: [
        { id: 'v1', kind: 'video', clips: [{ id: 'g', source: { kind: 'generator', scene: 's', duration: 5 } }] },
        { id: 'a1', kind: 'audio', clips: [{ id: 'm', source: { kind: 'asset', path: 'm.wav', in: 0, out: 99 } }] },
      ],
    };
    expect(expectedDuration(t)).toBe(5);
  });
});

describe('formatChecks', () => {
  it('renders pass and fail lines with a verdict', () => {
    const text = formatChecks({
      ok: false,
      checks: [
        { id: 'duration', ok: true, detail: 'expected ~5s' },
        { id: 'fps', ok: false, detail: 'expected 30, got 24' },
      ],
    });
    expect(text).toMatch(/✓ duration/);
    expect(text).toMatch(/✗ fps/);
    expect(text).toMatch(/VERIFY: FAIL$/);
  });
});
