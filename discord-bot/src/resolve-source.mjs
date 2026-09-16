/**
 * resolve-source.mjs — turns whatever came in on the Discord interaction
 * (inline text, a URL, or a file attachment) into a source file written
 * inside the job's worktree, and returns its path.
 *
 * Always a file path, never a raw CLI arg: reports run 3,000+ words and
 * Windows caps a process's total command-line length — writing to disk and
 * passing the path avoids that entirely, and matches the "file path" branch
 * SKILL.md's own Step 0 already expects.
 */

import { writeFile } from 'fs/promises';
import path from 'path';

export const SOURCE_FILENAME = '_source.md';

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)\/?$/i;
const GITHUB_REPO_ROOT_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

/**
 * Rewrites a github.com page URL to the raw content GitHub actually serves,
 * so the encoder gets markdown/text instead of a rendered HTML/SPA payload.
 *
 * Session d0b79095 (2026-09-08) fetched `https://github.com/karx/alfred-
 * buildathon` verbatim and got GitHub's React page shell back — the agent
 * spent ~6 of its ~8 available minutes reverse-engineering the embedded JSON
 * payload for a README before it could even start encoding. This is the fix.
 *
 * Leaves anything that isn't a recognized github.com blob/repo-root URL
 * untouched (raw.githubusercontent.com links, gists, arbitrary sites, etc.).
 */
export function normalizeSourceUrl(url) {
  const blob = url.match(GITHUB_BLOB_RE);
  if (blob) {
    const [, owner, repo, branch, filePath] = blob;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }

  const repoRoot = url.match(GITHUB_REPO_ROOT_RE);
  if (repoRoot) {
    const [, owner, repo] = repoRoot;
    return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;
  }

  return url;
}

/**
 * @param {{ text?: string, sourceUrl?: string, attachmentUrl?: string }} input
 * @param {string} worktreeDir
 * @param {typeof fetch} fetchFn — injectable for tests
 * @param {(msg: string) => void} log — injectable for tests
 * @returns {Promise<string>} absolute path to the written source file
 */
export async function resolveSource(input, worktreeDir, fetchFn = fetch, log = console.warn) {
  const { text, sourceUrl, attachmentUrl } = input;

  let content;
  if (attachmentUrl) {
    content = await fetchText(attachmentUrl, 'attachment', fetchFn, log);
  } else if (sourceUrl) {
    content = await fetchText(normalizeSourceUrl(sourceUrl), 'source_url', fetchFn, log);
  } else if (text) {
    content = text;
  } else {
    throw new Error('resolveSource: one of text, sourceUrl, or attachmentUrl is required');
  }

  const sourcePath = path.join(worktreeDir, SOURCE_FILENAME);
  await writeFile(sourcePath, content, 'utf8');
  return sourcePath;
}

async function fetchText(url, label, fetchFn, log) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Failed to fetch ${label}: HTTP ${res.status}`);

  const contentType = res.headers?.get?.('content-type') ?? '';
  if (contentType.includes('text/html')) {
    log(`[resolve-source] ${label} "${url}" returned text/html — likely a rendered page, ` +
        'not raw text. Encoding quality may suffer; consider a raw/markdown URL instead.');
  }

  return res.text();
}
