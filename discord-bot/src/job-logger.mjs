/**
 * job-logger.mjs — per-job console + file logging.
 *
 * Session d0b79095 was diagnosable only by reaching into ~/.claude/projects
 * JSONL transcripts by hand. This gives every job a plain-text log under
 * discord-bot/logs/<job-id>.log (gitignored) with lifecycle milestones and
 * the full raw agent stdout/stderr, so a failure can be read in one file.
 */

import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

export function createJobLogger(logDir, jobId) {
  const logPath = path.join(logDir, `${jobId}.log`);
  const ready = mkdir(logDir, { recursive: true });

  async function append(text) {
    await ready;
    await appendFile(logPath, text, 'utf8').catch(err => {
      console.error(`[job:${jobId}] failed to write log file:`, err.message);
    });
  }

  /** Timestamped lifecycle line — printed to console AND appended to the file. */
  function log(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    console.log(`[job:${jobId}] ${line}`);
    append(stamped + '\n');
  }

  /** Verbatim subprocess output chunk — file only (console would be too noisy). */
  function raw(chunk) {
    append(chunk);
  }

  return { log, raw, logPath };
}
