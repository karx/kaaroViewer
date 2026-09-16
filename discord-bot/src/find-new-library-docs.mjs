/**
 * find-new-library-docs.mjs — detects the doc id an encoding run produced by
 * diffing library/*.json before and after, instead of only regex-parsing the
 * agent's own stdout.
 *
 * Why this exists: session d0b79095 wrote library/discord-bot-integrations-
 * learnings.json successfully, then got stuck retrying a broken python3
 * invocation (see python-shim.mjs) and was killed by the job timeout before
 * it ever printed the skill's Step 7 "✅ {title}" report block. Relying only
 * on that stdout block meant the bot reported "no library JSON produced" for
 * a run that had, in fact, produced one — a false negative that discarded
 * real work. A directory snapshot is a strictly better ground truth, and it
 * costs nothing to check even when stdout parsing succeeds too.
 */

import { readdir } from 'fs/promises';
import path from 'path';

const LIBRARY_DIRNAME = 'library';

/** Call before the agent runs. */
export async function snapshotLibraryDocs(worktreeDir) {
  return new Set(await listJsonFiles(worktreeDir));
}

/**
 * Call after the agent runs (regardless of exit code / timedOut).
 * @returns {Promise<string[]>} docIds new since the snapshot, newest-looking last
 */
export async function findNewLibraryDocs(worktreeDir, before) {
  const after = await listJsonFiles(worktreeDir);
  return after.filter(f => !before.has(f)).map(f => f.replace(/\.json$/, ''));
}

async function listJsonFiles(worktreeDir) {
  try {
    const entries = await readdir(path.join(worktreeDir, LIBRARY_DIRNAME));
    return entries.filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
}
