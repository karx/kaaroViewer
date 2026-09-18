/**
 * enrichers/youtube.mjs — YouTube Data API v3 enrichment adapter.
 *
 * Requires API key. Reads from:
 *   localStorage.getItem('yt_api_key')   — set by user at runtime
 *
 * Endpoints used:
 *   channels?part=snippet,statistics&id={channelId}   — channel stats
 *   search?part=snippet&channelId={id}&type=video&maxResults=6 — latest videos
 *
 * Quota cost: ~1 unit for channel lookup, ~100 for search.list
 * Falls back to name search if only a label is provided (costs 100 units).
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function _getKey() {
  try { return localStorage.getItem('yt_api_key') ?? ''; }
  catch (_) { return ''; }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _ytFetch(path, params) {
  const key = _getKey();
  if (!key) throw new Error('no YouTube API key — set localStorage.yt_api_key');
  const url = `${YT_BASE}/${path}?${new URLSearchParams({ ...params, key })}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
  return res.json();
}

/**
 * Search for a channel by name. Returns channelId or null.
 * Cost: ~100 quota units.
 */
async function _searchChannelId(name) {
  const json = await _ytFetch('search', {
    part: 'snippet', q: name, type: 'channel', maxResults: '3',
  });
  const item = json.items?.[0];
  return item?.id?.channelId ?? null;
}

/**
 * Fetch channel statistics and snippet.
 * Cost: ~1 quota unit.
 */
async function _fetchChannelStats(channelId) {
  const json = await _ytFetch('channels', {
    part: 'snippet,statistics', id: channelId,
  });
  return json.items?.[0] ?? null;
}

/**
 * Fetch most recent videos for a channel.
 * Cost: ~100 quota units.
 */
async function _fetchRecentVideos(channelId, maxResults = 6) {
  const json = await _ytFetch('search', {
    part: 'snippet', channelId, type: 'video',
    maxResults: String(maxResults), order: 'date',
  });
  return json.items ?? [];
}

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId  — entity label, e.g. "Fireship"
 * @param {string|null} channelId — YouTube channel ID (from NED++ resolution)
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, channelId) {
  if (!_getKey()) {
    log('ENRICHER', `[youtube] no API key — skipping "${entityId}"`);
    return nullResult('youtube');
  }

  log('ENRICHER', `[youtube] enriching "${entityId}"`, { channelId });

  try {
    // Resolve channel ID if not pre-resolved by NED++
    let resolvedId = channelId;
    if (!resolvedId) {
      resolvedId = await _searchChannelId(entityId);
      if (!resolvedId) {
        log('ENRICHER', `[youtube] no channel found for "${entityId}"`);
        return nullResult('youtube');
      }
    }

    const [channelData, videos] = await Promise.all([
      _fetchChannelStats(resolvedId),
      _fetchRecentVideos(resolvedId, 6),
    ]);

    if (!channelData) return nullResult('youtube');

    const stats    = channelData.statistics ?? {};
    const snippet  = channelData.snippet    ?? {};

    const metrics = {};
    if (stats.subscriberCount) metrics['subscribers']  = Number(stats.subscriberCount);
    if (stats.videoCount)      metrics['video_count']  = Number(stats.videoCount);
    if (stats.viewCount)       metrics['total_views']  = Number(stats.viewCount);
    if (snippet.country)       metrics['country']      = snippet.country;

    const recentTitles = videos.map(v => v.snippet?.title).filter(Boolean);
    if (recentTitles.length) metrics['recent_videos'] = recentTitles.slice(0, 3).join(' | ');

    const links = [`https://www.youtube.com/channel/${resolvedId}`];

    const thumbnail = snippet.thumbnails?.medium?.url
      ?? snippet.thumbnails?.default?.url
      ?? null;

    const summary = snippet.description?.slice(0, 600) ?? `YouTube channel: ${snippet.title ?? entityId}`;

    log('ENRICHER', `[youtube] "${entityId}" — ${stats.subscriberCount ?? '?'} subs, ${videos.length} videos`);

    return makeResult('youtube', {
      metrics,
      links,
      related_ids: videos.map(v => v.id?.videoId).filter(Boolean),
      summary,
      thumbnail,
    });

  } catch (err) {
    log('ERROR', `[youtube] enrich failed for "${entityId}"`, { message: err.message });
    return makeResult('youtube', { error: err.message });
  }
}
