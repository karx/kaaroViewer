import { describe, it, expect, afterEach } from 'vitest';
import { ensurePythonShim } from './python-shim.mjs';

describe('ensurePythonShim', () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('is a no-op on non-Windows platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const logs = [];
    const result = await ensurePythonShim('/tmp/does-not-matter', m => logs.push(m));
    expect(result).toEqual({ shimmed: false, resolved: 'python3', pythonCmd: ['python3'] });
    expect(logs).toEqual([]);
  });
});
