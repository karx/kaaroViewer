/**
 * enrichers/github.mjs — GitHub REST API enrichment adapter.
 *
 * Uses the public GitHub REST API. No auth required for public repos.
 * Rate limit: 60 req/hr unauthenticated.
 *
 * Resolution strategy:
 *   1. If sourceId looks like "owner/repo" → direct repo lookup
 *   2. If sourceId looks like a username/org → fetch top repos
 *   3. If no sourceId → search repos by entity label
 *
 * Endpoints:
 *   GET /repos/{owner}/{repo}                — single repo stats
 *   GET /users/{username}/repos?sort=stars   — user's top repos
 *   GET /search/repositories?q={name}        — name search
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const GH_BASE    = 'https://api.github.com';
const GH_HEADERS = {
  'User-Agent': 'kaaroViewer/3.0 (karx@akriya.co.in)',
  'Accept':     'application/vnd.github.v3+json',
};

async function _ghGet(path) {
  const res = await fetch(`${GH_BASE}${path}`, { headers: GH_HEADERS });
  if (res.status === 404) return null;
  if (res.status === 403) throw new Error('GitHub rate limit hit (60/hr)');
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  return res.json();
}

// ── Internal fetchers ─────────────────────────────────────────────────────────

async function _fetchRepo(ownerRepo) {
  return _ghGet(`/repos/${ownerRepo}`);
}

async function _fetchUserTopRepo(username) {
  const repos = await _ghGet(`/users/${username}/repos?sort=stars&per_page=5`);
  if (!Array.isArray(repos) || repos.length === 0) return null;
  return repos[0]; // top repo by stars
}

async function _searchRepo(query) {
  const data = await _ghGet(`/search/repositories?q=${encodeURIComponent(query)}&per_page=3`);
  return data?.items?.[0] ?? null;
}

function _repoMetrics(repo) {
  const metrics = {};
  if (repo.stargazers_count !== undefined) metrics['stars']         = repo.stargazers_count;
  if (repo.forks_count !== undefined)      metrics['forks']         = repo.forks_count;
  if (repo.language)                       metrics['language']      = repo.language;
  if (repo.open_issues_count !== undefined) metrics['open_issues']  = repo.open_issues_count;
  if (repo.pushed_at)                      metrics['last_push']     = repo.pushed_at.slice(0, 10);
  if (repo.topics?.length)                 metrics['topics']        = repo.topics.slice(0, 5).join(', ');
  if (repo.license?.spdx_id)              metrics['license']       = repo.license.spdx_id;
  if (repo.size !== undefined)             metrics['size_kb']       = repo.size;
  return metrics;
}

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId  — entity label, e.g. "Three.js"
 * @param {string|null} githubSlug — "owner/repo" or "username" from NED++
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, githubSlug) {
  log('ENRICHER', `[github] enriching "${entityId}"`, { githubSlug });

  try {
    let repo = null;

    if (githubSlug) {
      if (githubSlug.includes('/')) {
        // Direct owner/repo reference
        repo = await _fetchRepo(githubSlug);
      } else {
        // Username/org — fetch their top repository
        repo = await _fetchUserTopRepo(githubSlug);
      }
    }

    // Fallback: search by entity label
    if (!repo) {
      repo = await _searchRepo(entityId);
    }

    if (!repo) {
      log('ENRICHER', `[github] no repo found for "${entityId}"`);
      return nullResult('github');
    }

    const metrics = _repoMetrics(repo);
    const links   = [repo.html_url].filter(Boolean);
    if (repo.homepage) links.push(repo.homepage);

    const summary = repo.description
      ? `${repo.description} (${repo.full_name})`
      : `GitHub repository: ${repo.full_name}`;

    log('ENRICHER', `[github] "${entityId}" → ${repo.full_name} · ⭐ ${repo.stargazers_count}`);

    return makeResult('github', {
      metrics,
      links,
      related_ids: repo.topics ?? [],
      summary,
      thumbnail: null,
    });

  } catch (err) {
    log('ERROR', `[github] enrich failed for "${entityId}"`, { message: err.message });
    return makeResult('github', { error: err.message });
  }
}
