/**
 * python-shim.mjs — makes `python3` actually resolve on Windows.
 *
 * What happened without this (session d0b79095, 2026-09-08): the headless
 * claude-code backend ran `python3 .claude/hooks/validate-library-json.py`
 * exactly as SKILL.md's Step 6 documents, and on this machine that hit
 * Windows' "python3" App Execution Alias stub — exit code 49, "Python was
 * not found; run without arguments to install from the Microsoft Store."
 * Every other invocation it tried (`/c/Python313/python ...`, plain
 * `python ...`, the same via PowerShell) got denied by the permission
 * system because none of them matched the `Bash(python3*)` allowlist —
 * correct behavior for a headless run with no one to approve a new command
 * pattern. Net effect: 6 minutes of retries, then the process was killed by
 * the job timeout before it ever reached git/PR — even though the JSON it
 * had already produced was fine (30 nodes, 67 edges, density 2.23).
 *
 * Fix: resolve a real Python once at bot startup and, if `python3` itself
 * isn't it, write TWO shim files and prepend their directory to this
 * process's PATH:
 *   - `python3.cmd`   — resolved by plain Win32 CreateProcess (PATHEXT),
 *                       which is what Node's own child_process.spawn uses
 *                       (validate.mjs's direct python3 re-check).
 *   - `python3`       — an extensionless #!/bin/sh script. This one is the
 *                       one that actually matters: Claude Code's own Bash
 *                       tool resolves commands through Git Bash (MSYS), and
 *                       MSYS's bare-name PATH search does NOT consider
 *                       .cmd/.bat files at all — confirmed empirically, a
 *                       .cmd-only shim was silently skipped in favor of the
 *                       broken WindowsApps python3 stub even with zero name
 *                       collisions and the directory first in PATH. Only an
 *                       extensionless executable file resolves.
 * Every child process spawned from here on inherits the extended PATH for
 * free, so `python3` just works without touching SKILL.md's (portable,
 * correct-on-Mac/Linux) documented invocation.
 */

import { spawnSync } from 'child_process';
import { mkdir, writeFile, chmod } from 'fs/promises';
import path from 'path';

const WINDOWS_CANDIDATES = [
  'python3', 'py', 'python',
  'C:\\Python313\\python.exe', 'C:\\Python312\\python.exe', 'C:\\Python311\\python.exe',
];

function worksAsPython(cmd) {
  try {
    const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
    const result = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    return result.status === 0 && /Python \d/.test((result.stdout || '') + (result.stderr || ''));
  } catch {
    return false;
  }
}

/**
 * @param {string} shimDir — directory to hold the generated python3 shims
 * @param {(msg: string) => void} log
 * @returns {Promise<{ shimmed: boolean, resolved: string|null, pythonCmd: string[] }>}
 *   pythonCmd is what THIS Node process should spawn directly (shell:false)
 *   to run Python — the PATH shims above fix Git-Bash-resolved subprocesses
 *   (Claude Code's own Bash tool), but Node's own child_process.spawn does
 *   NOT apply Windows' PATHEXT/.cmd resolution without shell:true, so a bare
 *   "python3" would still ENOENT from our own validate.mjs re-check even
 *   after the PATH shims above are in place. Callers that spawn python
 *   directly (not through Claude's Bash tool) should use this instead of
 *   the literal string "python3".
 */
export async function ensurePythonShim(shimDir, log = console.log) {
  if (process.platform !== 'win32') return { shimmed: false, resolved: 'python3', pythonCmd: ['python3'] };

  const working = WINDOWS_CANDIDATES.find(worksAsPython);
  if (!working) {
    log('[python-shim] no working Python interpreter found on this machine — ' +
        'validator steps will fail until one is installed.');
    return { shimmed: false, resolved: null, pythonCmd: ['python3'] };
  }
  if (working === 'python3') {
    log('[python-shim] python3 already resolves correctly — no shim needed.');
    return { shimmed: false, resolved: 'python3', pythonCmd: ['python3'] };
  }

  await mkdir(shimDir, { recursive: true });

  const cmdPath = path.join(shimDir, 'python3.cmd');
  const cmdInvocation = working === 'py' ? '@py -3 %*\r\n' : `@"${working}" %*\r\n`;
  await writeFile(cmdPath, cmdInvocation, 'utf8');

  const shPath = path.join(shimDir, 'python3');
  const shTarget = working === 'py' ? 'py -3' : `"${working.replace(/\\/g, '/')}"`;
  await writeFile(shPath, `#!/bin/sh\nexec ${shTarget} "$@"\n`, 'utf8');
  await chmod(shPath, 0o755);

  process.env.PATH = `${shimDir}${path.delimiter}${process.env.PATH}`;
  log(`[python-shim] python3 -> ${working} (shims written to ${shimDir})`);
  const pythonCmd = working === 'py' ? ['py', '-3'] : [working];
  return { shimmed: true, resolved: working, pythonCmd };
}
