/**
 * CLI contract tests: kaaro-vid must stay non-interactive, JSON-friendly,
 * and exit-code honest, because agents script against it. These spawn the
 * real binary on cheap paths (no rendering).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');

function runCli(args, opts = {}) {
  return new Promise(resolve => {
    execFile('node', [CLI, ...args], opts, (err, stdout, stderr) =>
      resolve({ code: err?.code ?? 0, stdout, stderr }));
  });
}

describe('kaaro-vid CLI contract', () => {
  let dir;
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'kaaro-cli-')); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('no command → usage on stderr, exit 1', async () => {
    const r = await runCli([]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/usage:/);
  });

  it('unknown command → usage + named unknown, exit 1', async () => {
    const r = await runCli(['frobnicate']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unknown command: frobnicate/);
  });

  it('new scaffolds a valid timeline file, exit 0', async () => {
    const out = join(dir, 'fresh.timeline.json');
    const r = await runCli(['new', 'fresh', '--out', out, '--fps', '25']);
    expect(r.code).toBe(0);
    const t = JSON.parse(await readFile(out, 'utf8'));
    expect(t.meta).toMatchObject({ id: 'fresh', fps: 25 });
    expect(t.tracks[0]).toMatchObject({ kind: 'video', clips: [] });
  });

  it('render --dry-run prints the plan without executing, exit 0', async () => {
    const timeline = join(dir, 'dry.timeline.json');
    await writeFile(timeline, JSON.stringify({
      meta: { id: 'dry' },
      tracks: [{ id: 'v1', kind: 'video', clips: [
        { id: 'c1', source: { kind: 'asset', path: 'does-not-exist.mp4', in: 0, out: 2 } },
      ]}],
    }));
    const r = await runCli(['render', timeline, '--dry-run', '--work', join(dir, 'w')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Render plan for "dry"/);
    expect(r.stdout).toMatch(/1\. normalize/);
    expect(r.stdout).not.toMatch(/▶ step/); // nothing executed
  });

  it('render on an invalid timeline → validation errors, exit 1', async () => {
    const timeline = join(dir, 'bad.timeline.json');
    await writeFile(timeline, JSON.stringify({ meta: {}, tracks: [] }));
    const r = await runCli(['render', timeline, '--dry-run']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid timeline/);
    expect(r.stderr).toMatch(/meta\.id/);
  });

  it('trace summarizes a trace file, exit 0', async () => {
    const trace = join(dir, 't.json');
    await writeFile(trace, JSON.stringify({
      id: 'trace-x', timelineId: 'demo', golden: true,
      operations: [{ op: 'compile', args: {}, ms: 1, ok: true }],
      verification: { ok: true, checks: [{ id: 'duration', ok: true }] },
    }));
    const r = await runCli(['trace', trace]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/golden=YES/);
    expect(r.stdout).toMatch(/verify: PASS/);
  });

  it('probe on a missing file → exit 1 with a message', async () => {
    const r = await runCli(['probe', join(dir, 'nope.mp4')]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/kaaro-vid:/);
  });
});
