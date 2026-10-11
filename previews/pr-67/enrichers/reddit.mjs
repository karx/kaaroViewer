/**
 * enrichers/reddit.mjs — Reddit public JSON API enrichment adapter.
 *
 * No auth required. Uses the public .json endpoints.
 * Endpoints:
 *   /r/{subreddit}/about.json        — subreddit metadata (subscribers, description)
 *   /r/{subreddit}/hot.json?limit=5  — recent hot post titles
 *
 * Rate limit: ~1 req/sec for unauthenticated. The enrichment coordinator
 * is responsible for pacing Reddit calls when running multiple entities.
 *
 * CORS: Reddit doesn't set CORS headers, so we use a lightweight proxy
 * (corsproxy.io — same as existing pipeline/sources/reddit.mjs).
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const REDDIT_BASE = 'https://www.reddit.com';
const CORS_PROXY  = 'https://corsproxy.io/?';

function _proxy(url) { return CORS_PROXY + encodeURIComponent(url); }

async function _redditGet(path) {
  const url = _proxy(`${REDDIT_BASE}${path}`);
  const res  = await fetch(url, { headers: { 'User-Agent': 'kaaroViewer/3.0' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  return res.json();
}

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId    — entity label, e.g. "r/webdev" or "webdev"
 * @param {string|null} subredditName — subreddit name resolved by NED++
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, subredditName) {
  // Derive subreddit name from entityId if not pre-resolved
  const sub = subredditName
    ?? entityId.replace(/^r\//, '').trim();

  if (!sub) return nullResult('reddit');

  log('ENRICHER', `[reddit] enriching r/${sub}`);

  try {
    const [about, hot] = await Promise.all([
      _redditGet(`/r/${sub}/about.json`),
      _redditGet(`/r/${sub}/hot.json?limit=5`),
    ]);

    if (!about || about.kind !== 't5') {
      log('ENRICHER', `[reddit] r/${sub} not found or not a subreddit`);
      return nullResult('reddit');
    }

    const data = about.data ?? {};

    const metrics = {};
    if (data.subscribers)    metrics['subscribers']    = data.subscribers;
    if (data.active_user_count !== undefined) metrics['active_users'] = data.active_user_count;
    if (data.accounts_active !== undefined)   metrics['accounts_active'] = data.accounts_active;
    if (data.created_utc)    metrics['created_utc']    = new Date(data.created_utc * 1000).getFullYear();
    if (data.lang)           metrics['language']        = data.lang;
    if (data.over18)         metrics['nsfw']            = true;

    const hotPosts = (hot?.data?.children ?? [])
      .slice(0, 5)
      .map(c => c.data?.title)
      .filter(Boolean);
    if (hotPosts.length) metrics['hot_posts_sample'] = hotPosts.slice(0, 2).join(' | ');

    const links = [`https://www.reddit.com/r/${sub}/`];

    const summary = (data.public_description || data.description || '')
      .slice(0, 600);

    log('ENRICHER', `[reddit] r/${sub} — ${data.subscribers ?? '?'} subscribers`);

    return makeResult('reddit', {
      metrics,
      links,
      related_ids: [],
      summary: summary || `Reddit community: r/${sub}`,
      thumbnail: data.icon_img || data.header_img || null,
    });

  } catch (err) {
    log('ERROR', `[reddit] enrich failed for "${entityId}"`, { message: err.message });
    return makeResult('reddit', { error: err.message });
  }
}
