/**
 * enrichers/wikipedia.mjs — Wikipedia REST API v1 enrichment adapter.
 *
 * Extends the existing pipeline/sources/wikipedia.mjs (which fetches summary only).
 * This adapter additionally fetches the first 3 content sections for richer prose.
 *
 * Free, CORS-enabled, no auth required.
 * Endpoints:
 *   Summary:  https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *   Sections: https://en.wikipedia.org/api/rest_v1/page/mobile-sections/{title}
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const WIKI_BASE    = 'https://en.wikipedia.org/api/rest_v1';
const WIKI_HEADERS = { 'Api-User-Agent': 'kaaroViewer/3.0 (karx@akriya.co.in)' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function _title(label) {
  return encodeURIComponent(label.trim().replace(/\s+/g, '_'));
}

async function _get(url) {
  const res = await fetch(url, { headers: WIKI_HEADERS });
  if (res.status === 404)   return null;   // no article
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId    — entity label (e.g. "Git")
 * @param {string|null} _sourceId   — unused for Wikipedia (search by label)
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, _sourceId) {
  if (!entityId) return nullResult('wikipedia');

  const title    = _title(entityId);
  log('ENRICHER', `[wikipedia] fetching "${entityId}"`, { title });

  // ── Summary ───────────────────────────────────────────────────────────────
  let summary = null;
  try {
    const data = await _get(`${WIKI_BASE}/page/summary/${title}`);

    if (!data) {
      log('ENRICHER', `[wikipedia] no article for "${entityId}"`);
      return nullResult('wikipedia');
    }
    if (data.type === 'disambiguation') {
      log('ENRICHER', `[wikipedia] "${entityId}" is a disambiguation page`);
      return nullResult('wikipedia');
    }

    summary = {
      extract:   data.extract ?? '',
      thumbnail: data.thumbnail?.source ?? null,
      wikiUrl:   data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
      description: data.description ?? '',
    };
  } catch (err) {
    log('ERROR', `[wikipedia] summary fetch failed for "${entityId}"`, { message: err.message });
    return makeResult('wikipedia', { error: err.message });
  }

  // ── First 3 sections ─────────────────────────────────────────────────────
  let sectionText = '';
  try {
    const sectData = await _get(`${WIKI_BASE}/page/mobile-sections/${title}`);
    if (sectData?.remaining?.sections?.length) {
      sectionText = sectData.remaining.sections
        .slice(0, 3)
        .map(s => `### ${s.line ?? ''}\n${_stripHtml(s.text ?? '')}`.trim())
        .join('\n\n');
    }
  } catch (_) {
    // Sections are supplemental — silently skip on failure
  }

  const fullSummary = sectionText
    ? `${summary.extract}\n\n${sectionText}`.slice(0, 2000)
    : summary.extract;

  const links = [summary.wikiUrl];

  log('ENRICHER', `[wikipedia] "${entityId}" — ${fullSummary.length} chars, thumb: ${summary.thumbnail ? 'yes' : 'no'}`);

  return makeResult('wikipedia', {
    metrics:  summary.description ? { description: summary.description } : {},
    links,
    related_ids: [],
    summary:  fullSummary,
    thumbnail: summary.thumbnail,
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
