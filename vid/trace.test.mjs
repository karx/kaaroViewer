import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTrace, recordOp, attachVerification, saveTrace, loadTrace, formatTrace } from './trace.mjs';

describe('trace', () => {
  it('records successful and failed operations with timing', async () => {
    const trace = createTrace({ timelineId: 'demo' });
    const value = await recordOp(trace, 'probe', { path: 'a.mp4' }, async () => ({ duration: 2 }));
    expect(value).toEqual({ duration: 2 });
    await expect(
      recordOp(trace, 'render', {}, async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');

    expect(trace.operations).toHaveLength(2);
    expect(trace.operations[0]).toMatchObject({ op: 'probe', ok: true, result: { duration: 2 } });
    expect(trace.operations[1]).toMatchObject({ op: 'render', ok: false, error: 'boom' });
    expect(trace.operations[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('golden only when verification passes', () => {
    const t1 = attachVerification(createTrace(), { ok: true, checks: [{ id: 'x', ok: true }] });
    const t2 = attachVerification(createTrace(), { ok: false, checks: [{ id: 'x', ok: false }] });
    expect(t1.golden).toBe(true);
    expect(t2.golden).toBe(false);
  });

  it('round-trips through disk and formats readably', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kaaro-trace-'));
    try {
      const trace = createTrace({ timelineId: 'demo' });
      await recordOp(trace, 'compile', {}, async () => 'ok');
      attachVerification(trace, { ok: true, checks: [{ id: 'duration', ok: true, detail: '' }] });
      const path = await saveTrace(trace, join(dir, 'nested', 't.json'));
      const loaded = await loadTrace(path);
      expect(loaded.golden).toBe(true);
      expect(loaded.finishedAt).toBeTruthy();
      const text = formatTrace(loaded);
      expect(text).toMatch(/golden=YES/);
      expect(text).toMatch(/verify: PASS \(1\/1 checks\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('truncates oversized operation results', async () => {
    const trace = createTrace();
    await recordOp(trace, 'probe', {}, async () => 'z'.repeat(1000));
    expect(trace.operations[0].result.length).toBeLessThan(500);
  });
});
