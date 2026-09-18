/**
 * enrichers/hackernews.mjs — Hacker News enrichment adapter (via Algolia API).
 *
 * Completely free, no auth, no rate limit issues.
 * Gives a "social signal" for any tech topic: how many stories mention it,
 * top story score, total comment volume, and the best matching story title.
 *
 * Useful for: any entity type — works as a proxy for tech community interest.
 *
 * Endpoint: https://hn.algolia.com/api/v1/search?query={label}&tags=story
 *
 * CORS: Algolia HN API is fully CORS-enabled.
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const HN_API  = 'https://hn.algolia.com/api/v1';
const HN_BASE = 'https://news.ycombinator.com';

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId   — entity label, e.g. "React" or "Git"
 * @param {string|null} _sourceId  — unused (HN has no per-entity IDs)
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, _sourceId) {
  if (!entityId) return nullResult('hackernews');

  log('ENRICHER', `[hackernews] searching "${entityId}"`);

  let storyResults, commentResults;
  try {
    const [storyRes, commentRes] = await Promise.all([
      fetch(`${HN_API}/search?query=${encodeURIComponent(entityId)}&tags=story&hitsPerPage=20`),
      fetch(`${HN_API}/search?query=${encodeURIComponent(entityId)}&tags=comment&hitsPerPage=5`),
    ]);
    if (!storyRes.ok)   throw new Error(`HN HTTP ${storyRes.status}`);
    storyResults   = await storyRes.json();
    commentResults = storyRes.ok ? await commentRes.json() : { nbHits: 0 };
  } catch (err) {
    log('ERROR', `[hackernews] fetch failed for "${entityId}"`, { message: err.message });
    return makeResult('hackernews', { error: err.message });
  }

  const hits = storyResults?.hits ?? [];
  if (!hits.length) {
    log('ENRICHER', `[hackernews] no results for "${entityId}"`);
    return nullResult('hackernews');
  }

  // ── Aggregate metrics ─────────────────────────────────────────────────────
  const totalStories  = storyResults?.nbHits ?? hits.length;
  const totalComments = commentResults?.nbHits ?? 0;

  // Sort hits by score to find the most-discussed story
  const sortedByScore = [...hits].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const topStory      = sortedByScore[0];
  const totalPoints   = hits.reduce((acc, h) => acc + (h.points ?? 0), 0);
  const avgPoints     = hits.length ? Math.round(totalPoints / hits.length) : 0;

  const metrics = {
    story_count:    totalStories,
    comment_count:  totalComments,
    top_score:      topStory?.points ?? 0,
    avg_score:      avgPoints,
    top_story:      (topStory?.title ?? '').slice(0, 80),
  };

  const links = [];
  if (topStory?.objectID) {
    links.push(`${HN_BASE}/item?id=${topStory.objectID}`);
  }
  links.push(`https://hn.algolia.com/?q=${encodeURIComponent(entityId)}`);

  // Best-effort URL for the top story's external link
  if (topStory?.url) links.push(topStory.url);

  // Recent story titles as signal
  const recentTitles = hits.slice(0, 5).map(h => h.title).filter(Boolean);
  const summary = recentTitles.length
    ? `${totalStories} HN stories. Top: "${topStory?.title ?? ''}" (${topStory?.points ?? 0} pts). Recent: ${recentTitles.slice(1, 3).join(' | ')}`
    : `Mentioned in ${totalStories} Hacker News stories.`;

  log('ENRICHER', `[hackernews] "${entityId}" — ${totalStories} stories, top score ${topStory?.points ?? 0}`);

  return makeResult('hackernews', {
    metrics,
    links,
    related_ids: [],
    summary,
    thumbnail: null,
  });
}
