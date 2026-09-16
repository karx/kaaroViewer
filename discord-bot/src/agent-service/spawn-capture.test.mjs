import { describe, it, expect } from 'vitest';
import { spawnCapture } from './spawn-capture.mjs';

const isWin = process.platform === 'win32';
const [cmd, args] = isWin ? ['cmd', ['/c', 'echo hello']] : ['echo', ['hello']];

describe('spawnCapture', () => {
  it('captures stdout and a clean exit code', async () => {
    const result = await spawnCapture(cmd, args, { cwd: process.cwd() });
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('streams output live via onOutput in addition to buffering it', async () => {
    const chunks = [];
    const result = await spawnCapture(cmd, args, {
      cwd: process.cwd(),
      onOutput: chunk => chunks.push(chunk),
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => c.stream === 'stdout')).toBe(true);
    expect(chunks.map(c => c.text).join('')).toBe(result.stdout);
  });

  it('kills the process and reports timedOut when it runs past timeoutMs', async () => {
    const [sleepCmd, sleepArgs] = isWin
      ? ['powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 5']]
      : ['sleep', ['5']];
    const result = await spawnCapture(sleepCmd, sleepArgs, { cwd: process.cwd(), timeoutMs: 200 });
    expect(result.timedOut).toBe(true);
  }, 10_000);
});
