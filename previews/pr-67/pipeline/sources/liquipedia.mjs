/**
 * liquipedia.mjs — Liquipedia content source (Age of Empires).
 *
 * Uses the MediaWiki API at liquipedia.net/ageofempires/api.php.
 * Rate-limited: max 1 req / 2 sec, action=parse max 1 req / 30 sec.
 * Content is CC-BY-SA 3.0 — attribution required.
 *
 * Flow:
 *   opensearch → page titles
 *   parse (properties + sections + images) → structured node data
 */

import { ContentSource } from './source-base.mjs';
import { log } from '../../logger.mjs';

const WIKI_BASE = 'https://liquipedia.net/ageofempires';
const API       = `${WIKI_BASE}/api.php`;
const UA        = 'kaaroViewer/2.0 (https://github.com/karx/kaaroViewer; karx@akriya.co.in)';

// CORS proxy for browser-based access (Liquipedia doesn't pass CORS preflight)
// corsproxy.io is free, no signup. Replace with your own proxy in production.
const CORS_PROXY = 'https://corsproxy.io/?';

// ── Rate limiter ──────────────────────────────────────────────────────────────
let _lastReq  = 0;
const MIN_GAP = 2100; // 2.1 seconds between any request

async function _throttledFetch(url) {
  const wait = MIN_GAP - (Date.now() - _lastReq);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastReq = Date.now();

  const proxiedUrl = CORS_PROXY + encodeURIComponent(url);

  const res = await fetch(proxiedUrl);
  if (!res.ok) throw new Error(`Liquipedia HTTP ${res.status}`);
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _pageId(title) {
  return `lp:${title.replace(/\s+/g, '_')}`;
}

function _imageUrl(filename) {
  if (!filename) return null;
  // Liquipedia commons image URL pattern
  return `https://liquipedia.net/commons/images/${filename}`;
}

/**
 * Guess node type from the page title and sections.
 * Heuristic based on Liquipedia's category conventions.
 */
function _guessType(title, sections = []) {
  const sectionNames = sections.map(s => (s.line || '').toLowerCase());
  if (sectionNames.some(s => s.includes('biography') || s.includes('career'))) return 'player';
  if (sectionNames.some(s => s.includes('roster') || s.includes('player roster'))) return 'team';
  if (sectionNames.some(s => s.includes('format') || s.includes('prize pool') || s.includes('participants'))) return 'tournament';
  // Fallback heuristics on title
  if (/cup|league|championship|open|classic|invitational|wololo|desert/i.test(title)) return 'tournament';
  return 'player'; // default for Liquipedia — most pages are players
}

// ── Source class ───────────────────────────────────────────────────────────────

export class LiquipediaSource extends ContentSource {
  name        = 'liquipedia';
  displayName = 'Liquipedia';
  icon        = '🏰';

  /**
   * Search Liquipedia for pages matching a query.
   * @param {string} query
   * @returns {Promise<{nodes: object[], edges: object[]}>}
   */
  async search(query) {
    log('SOURCE', `[Liquipedia] searching "${query}"`);

    // Step 1: opensearch for titles
    const searchUrl = `${API}?${new URLSearchParams({
      action: 'opensearch', search: query, limit: '8', format: 'json',
    })}`;

    let titles;
    try {
      const data = await _throttledFetch(searchUrl);
      titles = data[1] ?? [];
    } catch (err) {
      log('ERROR', `[Liquipedia] opensearch failed`, { message: err.message });
      return { nodes: [], edges: [] };
    }

    if (!titles.length) {
      log('SOURCE', `[Liquipedia] no results for "${query}"`);
      return { nodes: [], edges: [] };
    }

    log('SOURCE', `[Liquipedia] ${titles.length} titles found`, { titles });

    // Step 2: fetch details for each title (respecting rate limit)
    const nodes = [];
    const edges = [];

    for (const title of titles.slice(0, 5)) {
      try {
        const detail = await this._fetchPageDetail(title);
        if (detail) nodes.push(detail);
      } catch (err) {
        log('ERROR', `[Liquipedia] detail fetch failed: ${title}`, { message: err.message });
      }
    }

    // Create edges between co-occurring entities (first node → rest)
    if (nodes.length > 1) {
      for (let i = 1; i < nodes.length; i++) {
        edges.push({
          from: nodes[0].id,
          to:   nodes[i].id,
          rel:  'association',
          label: 'related search result',
        });
      }
    }

    log('SOURCE', `[Liquipedia] returning ${nodes.length} nodes`, { ids: nodes.map(n => n.id) });
    return { nodes, edges };
  }

  /**
   * Fetch structured data for a single Liquipedia page.
   */
  async _fetchPageDetail(title) {
    const url = `${API}?${new URLSearchParams({
      action: 'parse', page: title,
      prop:   'properties|sections|images',
      format: 'json',
    })}`;

    const data = await _throttledFetch(url);
    const parsed = data?.parse;
    if (!parsed) return null;

    const sections = parsed.sections ?? [];
    const type     = _guessType(title, sections);

    // Get image from metaimage property (most Liquipedia pages set this)
    const metaImage = parsed.properties?.find(p => p.name === 'metaimageurl');
    const image     = metaImage?.['*'] ?? null;

    // Build description from section names
    const sectionList = sections
      .filter(s => s.toclevel === 1)
      .map(s => s.line)
      .join(' · ');

    return {
      id:             _pageId(title),
      label:          parsed.title ?? title,
      type,
      description:    sectionList || `Liquipedia: ${title}`,
      image,
      url:            `${WIKI_BASE}/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
      _source:        'liquipedia',
      _sourceIcon:    this.icon,
      instanceofLabel: type,
      instanceofQids:  [],
    };
  }

  /**
   * Get detail for a single Liquipedia page ID.
   */
  async getDetail(id) {
    const title = id.replace(/^lp:/, '').replace(/_/g, ' ');
    const node = await this._fetchPageDetail(title);
    return { node, neighbors: [] };
  }

  describe() {
    return 'Liquipedia Age of Empires — esports players, teams, and tournaments (CC-BY-SA 3.0)';
  }
}
