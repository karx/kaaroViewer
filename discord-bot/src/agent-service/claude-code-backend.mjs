/**
 * claude-code-backend.mjs — runs the real /visualize skill headlessly via the
 * `claude` CLI already installed and authenticated on this machine.
 *
 * This is the "library-grade" path: it reuses the exact three-pass SOP in
 * .claude/skills/visualize/SKILL.md, including the edge-density gate and the
 * mandatory retrospective, because it IS that skill — not a re-derived prompt.
 */

import { spawnCapture } from './spawn-capture.mjs';

const ALLOWED_TOOLS = 'Read Write Edit Glob Bash(python3*) Bash(git*)';

/**
 * @param {{ cwd: string, sourceArg: string, timeoutMs?: number, env?: object,
 *           onOutput?: Function }} job
 *   sourceArg is a file path or raw text, forwarded verbatim to /visualize.
 * @param {typeof spawnCapture} spawnFn — injectable for tests
 */
export async function runClaudeCode({ cwd, sourceArg, timeoutMs, env, onOutput }, spawnFn = spawnCapture) {
  const args = [
    '-p', `/visualize ${sourceArg}`,
    '--allowedTools', ALLOWED_TOOLS,
  ];

  const result = await spawnFn('claude', args, { cwd, timeoutMs, env, onOutput });
  return { backend: 'claude-code', ...result };
}
