/**
 * pipeline/ned-resolver.mjs — NED++ multi-source entity resolution.
 *
 * Resolves an entity { label, type } to a cross-source ID map:
 *   { label, type, ids: { wikidata?, youtube?, reddit?, github? }, confidence: {…} }
 *
 * Resolution paths:
 *   Path A — OpenTapioca / Wikidata wbsearchentities → QID + confidence
 *   Path B — Source-type heuristics (channel→YouTube, subreddit→Reddit, software→GitHub)
 *   Path C — LLM disambiguation from top-3 Wikidata candidates + seed context
 *
 * Cache: localStorage key `ned::${label}::${type}` (permanent, cleared manually).
 *        Falls back gracefully if localStorage is unavailable.
 *
 * Usage:
 *   import { resolveEntity } from './pipeline/ned-resolver.mjs';
 *   const idMap = await resolveEntity({ label: 'Lex Fridman', type: 'person' });
 *   // → { label: 'Lex Fridman', ids: { wikidata: 'Q59735', youtube: 'UCnUYZLuoy1rq1aVMwx4wneg' }, confidence: {…} }
 */

import { log }         from '../logger.mjs';
import { entityMatch } from '../entity_matching.mjs';

// ── Cache helpers (localStorage) ─────────────────────────────────────────────

const CACHE_PREFIX = 'ned::';

function _cacheKey(label, type) {
  return `${CACHE_PREFIX}${label.trim().toLowerCase()}::${(type ?? 'unknown').toLowerCase()}`;
}

function _readCache(label, type) {
  try {
    const raw = localStorage.getItem(_cacheKey(label, type));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _writeCache(label, type, idMap) {
  try {
    localStorage.setItem(_cacheKey(label, type), JSON.stringify({ ...idMap, _cachedAt: Date.now() }));
    log('ENTITY_MATCH', `[NED] cached: "${label}" (${type ?? 'unknown'})`, { idMap });
  } catch (_) { /* storage full — silently skip */ }
}

/** Remove all NED++ cache entries. */
export function clearNEDCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
    log('SYSTEM', `[NED] cache cleared — ${keys.length} entries removed`);
    return keys.length;
  } catch (_) { return 0; }
}

/** Read all NED++ cache entries. */
export function listNEDCache() {
  try {
    return Object.entries(localStorage)
      .filter(([k]) => k.startsWith(CACHE_PREFIX))
      .map(([k, v]) => ({ key: k, ...JSON.parse(v) }));
  } catch (_) { return []; }
}

// ── Path A — Wikidata resolution ──────────────────────────────────────────────

/**
 * Wikidata wbsearchentities API — returns top candidates with descriptions.
 * More structured than OpenTapioca for direct label search.
 */
async function _wikidataSearch(label, limit = 5) {
  const url = `https://www.wikidata.org/w/api.php?` + new URLSearchParams({
    action:   'wbsearchentities',
    search:   label,
    language: 'en',
    limit:    String(limit),
    format:   'json',
    origin:   '*',
  });

  try {
    const res  = await fetch(url);
    const json = await res.json();
    return (json.search ?? []).map(r => ({
      qid:         r.id,
      label:       r.label ?? '',
      description: r.description ?? '',
      match:       r.match,
    }));
  } catch (err) {
    log('ERROR', `[NED] Wikidata search failed for "${label}"`, { message: err.message });
    return [];
  }
}

/**
 * Confidence heuristic: exact label match = 0.95, alias match = 0.75, first result = 0.60.
 */
function _wikidataConfidence(candidate, label) {
  const norm = s => s.toLowerCase().trim();
  if (norm(candidate.label) === norm(label))           return 0.95;
  if (candidate.match?.type === 'alias')               return 0.75;
  if (candidate.match?.type === 'label')               return 0.85;
  return 0.60;
}

async function _pathA(label) {
  log('ENTITY_MATCH', `[NED] Path A — Wikidata search for "${label}"`);
  const candidates = await _wikidataSearch(label, 5);
  if (!candidates.length) return { qid: null, confidence: 0, candidates: [] };

  const top = candidates[0];
  const confidence = _wikidataConfidence(top, label);
  log('ENTITY_MATCH', `[NED] Path A → ${top.qid} (conf: ${confidence})`, { top, candidateCount: candidates.length });
  return { qid: top.qid, confidence, candidates };
}

// ── Path B — Source-type heuristic matchers ───────────────────────────────────

/** YouTube: search for a channel by name, return channelId. Threshold 0.85. */
async function _pathB_youtube(label) {
  const key = _getYTKey();
  if (!key) return { channelId: null, confidence: 0 };

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?` + new URLSearchParams({
      part: 'snippet', q: label, type: 'channel', maxResults: '3', key,
    });
    const res  = await fetch(url);
    const json = await res.json();
    const item = json.items?.[0];
    if (!item) return { channelId: null, confidence: 0 };

    const title = item.snippet?.channelTitle ?? '';
    const conf  = _stringSim(title, label);
    log('ENTITY_MATCH', `[NED] Path B:YouTube → ${item.id?.channelId} (sim: ${conf.toFixed(2)})`, { title });
    if (conf < 0.85) return { channelId: null, confidence: conf };
    return { channelId: item.id?.channelId ?? null, confidence: conf };
  } catch (err) {
    log('ERROR', `[NED] Path B:YouTube failed for "${label}"`, { message: err.message });
    return { channelId: null, confidence: 0 };
  }
}

/** Reddit: check if /r/{name} exists. Returns subreddit name if found. */
async function _pathB_reddit(label) {
  // Normalise: "r/webdev" → "webdev"
  const sub = label.replace(/^r\//, '').replace(/\s+/g, '_');
  const CORS_PROXY = 'https://corsproxy.io/?';
  const url = CORS_PROXY + encodeURIComponent(`https://www.reddit.com/r/${sub}/about.json`);

  try {
    const res  = await fetch(url, { headers: { 'User-Agent': 'kaaroViewer/3.0' } });
    if (!res.ok) return { subreddit: null, confidence: 0 };
    const json = await res.json();
    if (json.kind !== 't5') return { subreddit: null, confidence: 0 };
    log('ENTITY_MATCH', `[NED] Path B:Reddit → r/${sub} exists`);
    return { subreddit: sub, confidence: 0.92 };
  } catch (err) {
    log('ERROR', `[NED] Path B:Reddit failed for "${label}"`, { message: err.message });
    return { subreddit: null, confidence: 0 };
  }
}

/** GitHub: search repos/users by entity name. Returns slug "owner/repo" or "username". */
async function _pathB_github(label) {
  const GH_HEADERS = {
    'User-Agent': 'kaaroViewer/3.0',
    'Accept':     'application/vnd.github.v3+json',
  };

  // Try direct repo match first (for "owner/repo" style labels)
  if (label.includes('/')) {
    try {
      const res = await fetch(`https://api.github.com/repos/${label}`, { headers: GH_HEADERS });
      if (res.ok) {
        const json = await res.json();
        log('ENTITY_MATCH', `[NED] Path B:GitHub → direct repo "${json.full_name}"`);
        return { slug: json.full_name, confidence: 0.99 };
      }
    } catch (_) {}
  }

  // Search repositories
  try {
    const url  = `https://api.github.com/search/repositories?q=${encodeURIComponent(label)}&per_page=3`;
    const res  = await fetch(url, { headers: GH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const item = json.items?.[0];
    if (!item) return { slug: null, confidence: 0 };

    const conf = _stringSim(item.name, label);
    log('ENTITY_MATCH', `[NED] Path B:GitHub → ${item.full_name} (sim: ${conf.toFixed(2)})`);
    if (conf < 0.75) return { slug: null, confidence: conf };
    return { slug: item.full_name, confidence: conf };
  } catch (err) {
    log('ERROR', `[NED] Path B:GitHub failed for "${label}"`, { message: err.message });
    return { slug: null, confidence: 0 };
  }
}

// ── Path C — LLM disambiguation ───────────────────────────────────────────────

/**
 * When Path A confidence is low (<0.80) and there are multiple Wikidata candidates,
 * use the LLM to pick the right QID given the seed context.
 *
 * Requires: window.kaaro_llm_disambiguate(candidates, label, seedContext) → Promise<string>
 * This is a hook — main.mjs or explore.mjs registers the actual LLM call.
 * If not registered, Path C is silently skipped.
 */
async function _pathC(label, candidates, seedContext) {
  if (!candidates.length) return null;

  const disambiguate = window.kaaro_llm_disambiguate;
  if (typeof disambiguate !== 'function') {
    log('ENTITY_MATCH', `[NED] Path C — LLM hook not registered, skipping for "${label}"`);
    return null;
  }

  log('ENTITY_MATCH', `[NED] Path C — LLM disambiguating "${label}" from ${candidates.length} candidates`);
  try {
    const qid = await disambiguate(candidates.slice(0, 3), label, seedContext ?? '');
    log('ENTITY_MATCH', `[NED] Path C → ${qid}`, { label });
    return qid ?? null;
  } catch (err) {
    log('ERROR', `[NED] Path C LLM failed for "${label}"`, { message: err.message });
    return null;
  }
}

// ── Main resolution entry point ───────────────────────────────────────────────

/**
 * Resolve an entity to a cross-source ID map.
 *
 * @param {object} entity
 * @param {string} entity.label      — entity display name, e.g. "Lex Fridman"
 * @param {string} [entity.type]     — entity type hint: 'person' | 'channel' | 'subreddit' | 'software' | 'company' | etc.
 * @param {string} [entity.seedContext] — optional seed text for Path C disambiguation
 * @param {object} [opts]
 * @param {boolean} [opts.forceRefresh=false] — bypass cache and re-resolve
 * @returns {Promise<NEDResult>}   — { label, type, ids:{…}, confidence:{…} }
 */
export async function resolveEntity(entity, opts = {}) {
  const { label, type = 'unknown', seedContext = '' } = entity;
  const { forceRefresh = false } = opts;

  if (!label?.trim()) return _emptyResult(label, type);

  // ── Cache check ──────────────────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = _readCache(label, type);
    if (cached) {
      log('ENTITY_MATCH', `[NED] cache hit for "${label}" (${type})`, { ids: cached.ids });
      return cached;
    }
  }

  log('ENTITY_MATCH', `[NED] resolving "${label}" type="${type}"`, { seedContext: seedContext.slice(0, 60) });

  const ids        = {};
  const confidence = {};

  // ── Path A: Wikidata ─────────────────────────────────────────────────────
  const pathAPromise = _pathA(label);

  // ── Path B: Source-type heuristics (run in parallel with Path A) ─────────
  const pathBPromises = {};

  const t = (type ?? '').toLowerCase();

  // Always try YouTube for channel/person types
  if (t === 'channel' || t === 'person' || t === 'creator') {
    pathBPromises.youtube = _pathB_youtube(label);
  }

  // Always try Reddit for subreddit/community types
  if (t === 'subreddit' || t === 'community' || t === 'forum') {
    pathBPromises.reddit = _pathB_reddit(label);
  }

  // Always try GitHub for software/tool/library types
  if (t === 'software' || t === 'tool' || t === 'library' || t === 'framework' || t === 'company') {
    pathBPromises.github = _pathB_github(label);
  }

  // Await all in parallel
  const [pathA, ...pathBResults] = await Promise.all([
    pathAPromise,
    ...Object.values(pathBPromises),
  ]);

  const pathBKeys = Object.keys(pathBPromises);
  pathBResults.forEach((result, i) => {
    const source = pathBKeys[i];
    if (source === 'youtube' && result.channelId) {
      ids.youtube         = result.channelId;
      confidence.youtube  = result.confidence;
    }
    if (source === 'reddit' && result.subreddit) {
      ids.reddit          = result.subreddit;
      confidence.reddit   = result.confidence;
    }
    if (source === 'github' && result.slug) {
      ids.github          = result.slug;
      confidence.github   = result.confidence;
    }
  });

  // ── Path A result — may trigger Path C ──────────────────────────────────
  if (pathA.qid && pathA.confidence >= 0.80) {
    ids.wikidata         = pathA.qid;
    confidence.wikidata  = pathA.confidence;
  } else if (pathA.candidates.length) {
    // Path C: LLM disambiguation
    const chosenQid = await _pathC(label, pathA.candidates, seedContext);
    if (chosenQid) {
      ids.wikidata         = chosenQid;
      confidence.wikidata  = 0.75; // LLM-chosen, moderate confidence
    } else if (pathA.qid) {
      // Fall back to Path A best guess even below threshold
      ids.wikidata         = pathA.qid;
      confidence.wikidata  = pathA.confidence;
    }
  }

  const result = { label, type, ids, confidence };

  // ── Persist to cache ─────────────────────────────────────────────────────
  _writeCache(label, type, result);

  log('ENTITY_MATCH', `[NED] resolved "${label}" → ${JSON.stringify(ids)}`, { confidence });
  return result;
}

/**
 * Resolve a batch of entities in parallel.
 * Honours enrichment_targets priority: high first, then medium, then low.
 *
 * @param {Array<{label, type, priority?, seedContext?}>} entities
 * @param {object} [opts]
 * @param {number} [opts.concurrency=4] — max simultaneous resolves
 * @returns {Promise<NEDResult[]>}
 */
export async function resolveEntities(entities, opts = {}) {
  const { concurrency = 4 } = opts;

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...entities].sort(
    (a, b) => (priorityOrder[a.priority ?? 'low'] ?? 2) - (priorityOrder[b.priority ?? 'low'] ?? 2)
  );

  const results = [];
  for (let i = 0; i < sorted.length; i += concurrency) {
    const batch = sorted.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(e => resolveEntity(e, opts)));
    results.push(...batchResults);
  }

  log('ENTITY_MATCH', `[NED] batch resolved ${results.length} entities`, {
    withWikidata: results.filter(r => r.ids.wikidata).length,
  });
  return results;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _emptyResult(label, type) {
  return { label: label ?? '', type: type ?? 'unknown', ids: {}, confidence: {} };
}

function _getYTKey() {
  try { return localStorage.getItem('yt_api_key') ?? ''; }
  catch (_) { return ''; }
}

/**
 * Simple string similarity (Dice coefficient on bigrams).
 * Returns 0.0–1.0.
 */
function _stringSim(a, b) {
  if (!a || !b) return 0;
  const na = a.toLowerCase(), nb = b.toLowerCase();
  if (na === nb) return 1;

  const bigrams = s => {
    const set = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) ?? 0) + 1);
    }
    return set;
  };

  const ma = bigrams(na), mb = bigrams(nb);
  let intersection = 0;
  for (const [bg, cnt] of ma) intersection += Math.min(cnt, mb.get(bg) ?? 0);
  return (2 * intersection) / (na.length + nb.length - 2);
}

// ── Global console helpers ───────────────────────────────────────────────────

window.ned = {
  resolve:    (label, type) => resolveEntity({ label, type }),
  resolveAll: (entities)   => resolveEntities(entities),
  cache:      listNEDCache,
  clearCache: clearNEDCache,
};
