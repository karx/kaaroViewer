/**
 * agent-service/index.mjs — the one place that knows which backend to run.
 *
 * Adding a third backend later means one new file exporting a `run(job,
 * spawnFn?)` function with this same shape, plus one new case here. Nothing
 * in discord-bot/src/discord/ or src/git-workflow.mjs needs to change.
 */

import { runClaudeCode }    from './claude-code-backend.mjs';
import { runPiCodingAgent } from './pi-coding-agent-backend.mjs';

export const BACKENDS = {
  'claude-code':    runClaudeCode,
  'pi-coding-agent': runPiCodingAgent,
};

/**
 * @param {{ cwd: string, sourceArg: string, timeoutMs?: number, env?: object,
 *           onOutput?: (chunk: { stream: 'stdout'|'stderr', text: string }) => void }} job
 * @param {string} [backendName] — defaults to AGENT_BACKEND env, then 'claude-code'
 */
export async function runVisualize(job, backendName = process.env.AGENT_BACKEND || 'claude-code') {
  const run = BACKENDS[backendName];
  if (!run) {
    throw new Error(
      `Unknown AGENT_BACKEND "${backendName}". Known backends: ${Object.keys(BACKENDS).join(', ')}`,
    );
  }
  return run(job);
}
