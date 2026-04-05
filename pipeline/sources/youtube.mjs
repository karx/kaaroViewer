/**
 * youtube.mjs — YouTube content source.
 *
 * Uses YouTube Data API v3 search.list endpoint.
 * Requires an API key stored in localStorage('yt_api_key').
 * Free tier: 10,000 units/day, search.list costs 100 units per call.
 *
 * Flow:
 *   search.list → video snippets
 *   Each video becomes a node; channel becomes an organization node.
 */

import { ContentSource } from './source-base.mjs';
import { log } from '../../logger.mjs';

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _videoId(id)   { return `yt:v:${id}`; }
function _channelId(id) { return `yt:c:${id}`; }

// ── Source class ───────────────────────────────────────────────────────────────

export class YouTubeSource extends ContentSource {
  name        = 'youtube';
  displayName = 'YouTube';
  icon        = '▶';

  _getKey() {
    return localStorage.getItem('yt_api_key') ?? '';
  }

  /**
   * Search YouTube for videos matching a query.
   * @param {string} query
   */
  async search(query) {
    const key = this._getKey();
    if (!key) {
      log('SOURCE', '[YouTube] no API key — set via localStorage.setItem("yt_api_key", "YOUR_KEY")');
      return { nodes: [], edges: [] };
    }

    log('SOURCE', `[YouTube] searching "${query}"`);

    const url = `${YT_SEARCH}?${new URLSearchParams({
      part:       'snippet',
      q:          query,
      type:       'video',
      maxResults: '6',
      key,
    })}`;

    let items;
    try {
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
      const json = await res.json();
      items = json.items ?? [];
    } catch (err) {
      log('ERROR', `[YouTube] search failed`, { message: err.message });
      return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];
    const seenChannels = new Map();

    for (const item of items) {
      const s   = item.snippet;
      const vid = item.id?.videoId;
      if (!vid) continue;

      // Video node
      nodes.push({
        id:             _videoId(vid),
        label:          s.title?.slice(0, 80) ?? 'Untitled',
        type:           'video',
        description:    s.description?.slice(0, 200) ?? '',
        image:          s.thumbnails?.medium?.url ?? s.thumbnails?.default?.url ?? null,
        url:            `https://www.youtube.com/watch?v=${vid}`,
        _source:        'youtube',
        _sourceIcon:    this.icon,
        instanceofLabel:'video',
        instanceofQids: [],
        _meta: {
          channelId:    s.channelId,
          channelTitle: s.channelTitle,
          publishedAt:  s.publishedAt,
        },
      });

      // Channel node (deduplicated)
      if (s.channelId && !seenChannels.has(s.channelId)) {
        seenChannels.set(s.channelId, true);
        nodes.push({
          id:             _channelId(s.channelId),
          label:          s.channelTitle ?? 'Channel',
          type:           'channel',
          description:    `YouTube channel: ${s.channelTitle}`,
          image:          null,
          url:            `https://www.youtube.com/channel/${s.channelId}`,
          _source:        'youtube',
          _sourceIcon:    this.icon,
          instanceofLabel:'channel',
          instanceofQids: [],
        });
      }

      // Edge: video → channel
      if (s.channelId) {
        edges.push({
          from: _videoId(vid),
          to:   _channelId(s.channelId),
          rel:  'creation',
          label: 'uploaded by',
        });
      }
    }

    log('SOURCE', `[YouTube] returning ${nodes.length} nodes`, { ids: nodes.map(n => n.id) });
    return { nodes, edges };
  }

  describe() {
    return 'YouTube Data API v3 — video search (requires API key in localStorage)';
  }
}
