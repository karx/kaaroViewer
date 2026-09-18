/**
 * vid/ffmpeg.mjs — ffmpeg/ffprobe binary discovery and subprocess runner.
 *
 * Binary resolution order (per binary):
 *   1. env override: KAARO_FFMPEG / KAARO_FFPROBE
 *   2. PATH lookup
 *
 * All execution goes through run() so callers get one error shape:
 * { code, stdout, stderr, cmd }. Non-zero exit throws FfmpegError.
 */

import { spawn } from 'node:child_process';

export class FfmpegError extends Error {
  constructor(message, { code, stderr, cmd } = {}) {
    super(message);
    this.name = 'FfmpegError';
    this.code = code;
    this.stderr = stderr;
    this.cmd = cmd;
  }
}

export function ffmpegBin()  { return process.env.KAARO_FFMPEG  || 'ffmpeg'; }
export function ffprobeBin() { return process.env.KAARO_FFPROBE || 'ffprobe'; }

/**
 * Run a binary with args. Resolves { stdout, stderr, code, cmd }.
 * Rejects with FfmpegError on non-zero exit or spawn failure.
 */
export function run(bin, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const cmd = `${bin} ${args.join(' ')}`;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new FfmpegError(`timeout after ${timeoutMs}ms: ${cmd}`, { cmd }));
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => {
      clearTimeout(timer);
      reject(new FfmpegError(`spawn failed (is ${bin} installed?): ${err.message}`, { cmd }));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr, code, cmd });
      else reject(new FfmpegError(`exit ${code}: ${cmd}\n${stderr.slice(-2000)}`, { code, stderr, cmd }));
    });
  });
}

/** Run ffmpeg with -y (overwrite) and quiet banner. */
export function ffmpeg(args, opts) {
  return run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);
}

/** Run ffprobe. */
export function ffprobe(args, opts) {
  return run(ffprobeBin(), ['-hide_banner', ...args], opts);
}

/** True if both binaries are runnable — used by tests and CLI preflight. */
export async function available() {
  try {
    await run(ffmpegBin(), ['-version']);
    await run(ffprobeBin(), ['-version']);
    return true;
  } catch {
    return false;
  }
}
