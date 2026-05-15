/**
 * enrichers/index.mjs — Adapter registry for the Exploration Pipeline.
 *
 * AdapterResult schema (all fields optional except `source`):
 *   {
 *     source:      string,         // adapter name, e.g. 'wikidata'
 *     metrics:     object,         // key → { value, unit } pairs
 *     links:       string[],       // external URLs
 *     related_ids: string[],       // IDs of linked entities within this source
 *     summary:     string,         // prose description for Stage 4b / narrative
 *     thumbnail:   string|null,    // representative image URL
 *     error:       string|null,    // set if adapter failed (non-throwing)
 *   }
 *
 * Usage:
 *   import { register, getAdapter, runAdapters } from '../enrichers/index.mjs';
 *   register('wikidata', enrichFn);
 *   const results = await runAdapters(idMap, ['wikidata', 'wikipedia']);
 */

import { log } from '../logger.mjs';

// ── AdapterResult factory ─────────────────────────────────────────────────────

/**
 * Build a valid AdapterResult. Adapters should call this to ensure schema compliance.
 * @param {string} source
 * @param {Partial<AdapterResult>} fields
 * @returns {AdapterResult}
 */
export function makeResult(source, { metrics = {}, links = [], related_ids = [], summary = '', thumbnail = null, error = null } = {}) {
  return { source, metrics, links, related_ids, summary, thumbnail, error };
}

/** Empty (null) result — used when an adapter has no applicable data. */
export function nullResult(source) {
  return makeResult(source, { error: 'no data' });
}

// ── Registry ──────────────────────────────────────────────────────────────────

/** @type {Map<string, (entityId: string, sourceId: string|null) => Promise<AdapterResult>>} */
const _registry = new Map();

/**
 * Register an adapter function under a source name.
 * The function signature must match the AdapterFn contract:
 *   async function enrich(entityId: string, sourceId: string|null): Promise<AdapterResult>
 *
 * @param {string}   source  — unique source key, e.g. 'wikidata'
 * @param {Function} fn      — async enrich function
 */
export function register(source, fn) {
  if (_registry.has(source)) {
    log('SYSTEM', `[Enrichers] overwriting adapter: ${source}`);
  }
  _registry.set(source, fn);
  log('SYSTEM', `[Enrichers] registered adapter: ${source}`);
}

/**
 * Get adapter function by source name.
 * @param {string} source
 * @returns {Function|null}
 */
export function getAdapter(source) {
  return _registry.get(source) ?? null;
}

/** List all registered adapter names. */
export function listAdapters() {
  return [..._registry.keys()];
}

// ── Fan-out runner ────────────────────────────────────────────────────────────

/**
 * Run adapters in parallel for a single entity's cross-source ID map.
 *
 * @param {object} idMap     — { label, type, ids: { wikidata?, youtube?, reddit?, github? } }
 * @param {string[]} sources — which adapters to run; defaults to all registered
 * @returns {Promise<AdapterResult[]>}
 */
export async function runAdapters(idMap, sources = null) {
  const toRun = sources ?? listAdapters();
  const entityId = idMap.label ?? idMap.ids?.wikidata ?? 'unknown';

  log('ENRICHER', `[runAdapters] ${entityId} → [${toRun.join(', ')}]`, { idMap });

  const promises = toRun.map(async (source) => {
    const fn = _registry.get(source);
    if (!fn) {
      log('ENRICHER', `[runAdapters] no adapter registered for: ${source}`);
      return nullResult(source);
    }

    const sourceId = idMap.ids?.[source] ?? null;
    const t0 = performance.now();

    try {
      const result = await fn(entityId, sourceId, idMap);
      const ms = Math.round(performance.now() - t0);
      log('ENRICHER', `[${source}] ✓ ${entityId} (${ms}ms)`, { summary: result.summary?.slice(0, 80) ?? '' });
      return result;
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      log('ERROR', `[${source}] failed for ${entityId} (${ms}ms)`, { message: err.message });
      return makeResult(source, { error: err.message });
    }
  });

  return Promise.all(promises);
}

// ── Merge helper ──────────────────────────────────────────────────────────────

/**
 * Merge multiple AdapterResults into a single enriched node patch.
 * Priority rules:
 *   • `wikidata` wins on canonical properties (dates, relationships)
 *   • `wikipedia` preferred for prose summary
 *   • source-specific metrics are non-conflicting (keyed by source)
 *
 * @param {AdapterResult[]} results
 * @returns {object} merged node patch ready to apply
 */
export function mergeResults(results) {
  const merged = {
    metrics:     {},
    links:       [],
    related_ids: [],
    summary:     '',
    thumbnail:   null,
    sources:     [],
  };

  // Prioritised summary: wikipedia > wikidata > first available
  const summaryOrder = ['wikipedia', 'wikidata'];
  for (const source of summaryOrder) {
    const r = results.find(r => r.source === source && r.summary);
    if (r) { merged.summary = r.summary; break; }
  }
  if (!merged.summary) {
    const any = results.find(r => r.summary);
    if (any) merged.summary = any.summary;
  }

  // Thumbnail: first non-null
  for (const r of results) {
    if (r.thumbnail) { merged.thumbnail = r.thumbnail; break; }
  }

  // Namespace metrics by source to avoid key collisions
  for (const r of results) {
    if (r.error) continue;
    merged.sources.push(r.source);
    for (const [k, v] of Object.entries(r.metrics ?? {})) {
      merged.metrics[`${r.source}.${k}`] = v;
    }
    merged.links.push(...(r.links ?? []));
    merged.related_ids.push(...(r.related_ids ?? []));
  }

  // Deduplicate links and related_ids
  merged.links       = [...new Set(merged.links)];
  merged.related_ids = [...new Set(merged.related_ids)];

  return merged;
}
