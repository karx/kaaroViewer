/**
 * spawn-capture.mjs — run a child process to completion, capturing stdout/stderr.
 *
 * Shared by every agent backend so timeout/kill/exit-code handling only
 * lives in one place.
 */

import { spawn } from 'child_process';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, timeoutMs?: number, env?: object,
 *           onOutput?: (chunk: { stream: 'stdout'|'stderr', text: string }) => void }} opts
 *   onOutput fires per chunk, live, in addition to the buffered result below —
 *   this is what lets a caller stream progress instead of waiting for the
 *   whole process to finish before showing anything.
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number|null, timedOut: boolean }>}
 */
export function spawnCapture(command, args, opts) {
  const { cwd, timeoutMs = 8 * 60 * 1000, env = process.env, onOutput } = opts;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', chunk => {
      stdout += chunk;
      onOutput?.({ stream: 'stdout', text: chunk.toString() });
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk;
      onOutput?.({ stream: 'stderr', text: chunk.toString() });
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', exitCode => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut });
    });
  });
}
