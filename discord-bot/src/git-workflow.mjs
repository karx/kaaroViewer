/**
 * git-workflow.mjs — worktree lifecycle + PR creation for a single job.
 *
 * Every Discord-triggered encoding lands as a PR, never a direct push to
 * master — see the plan's "Output destination" decision. No auto-merge
 * anywhere in this file.
 */

import path from 'path';
import { spawnCapture } from './agent-service/spawn-capture.mjs';

const GITHUB_API = 'https://api.github.com';

/** Lowercase, hyphenated, ASCII-only, capped — safe in a branch name and a URL. */
export function slugify(input, maxLen = 40) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
}

/** e.g. discord/visualize-poker-tooling-20260908T031500Z */
export function makeBranchName(seed, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '').replace(/-/g, '').slice(0, 15) + 'Z';
  return `discord/visualize-${slugify(seed)}-${stamp}`;
}

/**
 * Fetches latest master and adds a fresh worktree on a new branch off it.
 * Reuses this machine's existing git credentials — no separate clone.
 *
 * @param {{ repoDir: string, worktreesRoot: string, branchName: string }} opts
 * @param {typeof spawnCapture} spawnFn — injectable for tests
 * @returns {Promise<string>} absolute path to the new worktree
 */
export async function prepareWorktree({ repoDir, worktreesRoot, branchName }, spawnFn = spawnCapture) {
  const worktreeDir = path.join(worktreesRoot, slugify(branchName, 60));

  await run(spawnFn, repoDir, ['fetch', 'origin', 'master']);
  await run(spawnFn, repoDir, [
    'worktree', 'add', '-f', worktreeDir, '-b', branchName, 'origin/master',
  ]);

  return worktreeDir;
}

/**
 * @param {{ worktreeDir: string, branchName: string, message: string }} opts
 * @param {typeof spawnCapture} spawnFn
 */
export async function commitAndPush({ worktreeDir, branchName, message }, spawnFn = spawnCapture) {
  await run(spawnFn, worktreeDir, ['add', '-A']);
  await run(spawnFn, worktreeDir, ['commit', '-m', message]);
  await run(spawnFn, worktreeDir, ['push', '-u', 'origin', branchName]);
}

/**
 * @param {{ repoDir: string, worktreeDir: string }} opts
 * @param {typeof spawnCapture} spawnFn
 */
export async function removeWorktree({ repoDir, worktreeDir }, spawnFn = spawnCapture) {
  await run(spawnFn, repoDir, ['worktree', 'remove', '--force', worktreeDir]);
}

/**
 * Opens a PR via the GitHub REST API directly (no `gh` CLI dependency).
 *
 * @param {{ owner: string, repo: string, branch: string, base?: string,
 *           title: string, body: string, token: string }} opts
 * @param {typeof fetch} fetchFn — injectable for tests
 * @returns {Promise<{ number: number, htmlUrl: string }>}
 */
export async function openPullRequest(
  { owner, repo, branch, base = 'master', title, body, token },
  fetchFn = fetch,
) {
  const res = await fetchFn(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${token}`,
      Accept:          'application/vnd.github+json',
      'User-Agent':    'kaaro-discord-bot',
    },
    body: JSON.stringify({ title, head: branch, base, body }),
  });

  if (!res.ok) {
    let errorBody = {};
    try { errorBody = await res.json(); } catch {}
    const err = new Error(`GitHub PR creation failed: HTTP ${res.status}`);
    err.httpStatus = res.status;
    err.githubMessage = errorBody?.message ?? '';
    throw err;
  }

  const data = await res.json();
  return { number: data.number, htmlUrl: data.html_url };
}

async function run(spawnFn, cwd, args) {
  const result = await spawnFn('git', args, { cwd, timeoutMs: 2 * 60 * 1000 });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return result;
}
