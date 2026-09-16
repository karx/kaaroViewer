/**
 * validate.mjs — re-runs the repo's own library validator against the
 * produced JSON. Authoritative pass/fail signal, independent of whatever
 * the agent's own stdout claims it did.
 *
 * Exit codes (.claude/hooks/validate-library-json.py): 0 valid, 1 warnings,
 * 2 breaking cross-reference errors.
 */

import { spawnCapture } from './agent-service/spawn-capture.mjs';

export const VALIDATOR_PATH = '.claude/hooks/validate-library-json.py';

/**
 * @param {{ cwd: string, docId: string, pythonCmd?: string[] }} job
 *   pythonCmd defaults to ['python3'] — pass the resolved command from
 *   ensurePythonShim() on Windows, since Node's own spawn (shell:false)
 *   doesn't apply PATHEXT/.cmd resolution the way Git Bash or cmd.exe does.
 * @param {typeof spawnCapture} spawnFn — injectable for tests
 * @returns {Promise<{ exitCode: number|null, status: 'ok'|'warnings'|'errors'|'unknown', output: string }>}
 */
export async function validateLibraryDoc({ cwd, docId, pythonCmd = ['python3'] }, spawnFn = spawnCapture) {
  const target = `library/${docId}.json`;
  const [cmd, ...prefixArgs] = pythonCmd;
  const { stdout, stderr, exitCode } = await spawnFn(
    cmd, [...prefixArgs, VALIDATOR_PATH, target], { cwd, timeoutMs: 60_000 },
  );

  const status = exitCode === 0 ? 'ok'
    : exitCode === 1 ? 'warnings'
    : exitCode === 2 ? 'errors'
    : 'unknown';

  return { exitCode, status, output: stdout + stderr };
}
