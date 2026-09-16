import { describe, it, expect } from 'vitest';
import { runVisualize, BACKENDS } from './index.mjs';

describe('runVisualize backend selection', () => {
  it('has both claude-code and pi-coding-agent registered', () => {
    expect(Object.keys(BACKENDS).sort()).toEqual(['claude-code', 'pi-coding-agent']);
  });

  it('throws a clear error for an unknown backend name', async () => {
    await expect(runVisualize({ cwd: '/repo', sourceArg: 'x' }, 'not-a-backend'))
      .rejects.toThrow(/Unknown AGENT_BACKEND "not-a-backend"/);
  });
});
