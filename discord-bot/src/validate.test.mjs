import { describe, it, expect, vi } from 'vitest';
import { validateLibraryDoc, VALIDATOR_PATH } from './validate.mjs';

function mockSpawn(exitCode, stdout = '', stderr = '') {
  return vi.fn().mockResolvedValue({ stdout, stderr, exitCode, timedOut: false });
}

describe('validateLibraryDoc', () => {
  it('defaults to plain python3 and maps exit codes to a status', async () => {
    const spawnFn = mockSpawn(0, 'ok output');
    const result = await validateLibraryDoc({ cwd: '/repo', docId: 'poker-tooling' }, spawnFn);

    expect(spawnFn).toHaveBeenCalledWith(
      'python3', [VALIDATOR_PATH, 'library/poker-tooling.json'], expect.objectContaining({ cwd: '/repo' }),
    );
    expect(result).toMatchObject({ exitCode: 0, status: 'ok' });
  });

  it('maps exit 1/2 to warnings/errors, anything else to unknown', async () => {
    expect((await validateLibraryDoc({ cwd: '/r', docId: 'x' }, mockSpawn(1))).status).toBe('warnings');
    expect((await validateLibraryDoc({ cwd: '/r', docId: 'x' }, mockSpawn(2))).status).toBe('errors');
    expect((await validateLibraryDoc({ cwd: '/r', docId: 'x' }, mockSpawn(null))).status).toBe('unknown');
  });

  it('splits a multi-part pythonCmd (e.g. the Windows py launcher) into command + prefix args', async () => {
    const spawnFn = mockSpawn(0);
    await validateLibraryDoc({ cwd: '/repo', docId: 'x', pythonCmd: ['py', '-3'] }, spawnFn);
    expect(spawnFn).toHaveBeenCalledWith(
      'py', ['-3', VALIDATOR_PATH, 'library/x.json'], expect.objectContaining({ cwd: '/repo' }),
    );
  });
});
