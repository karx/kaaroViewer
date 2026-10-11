/**
 * enrichers/wikidata.mjs — deep SPARQL enrichment adapter.
 *
 * AdapterFn contract:
 *   enrich(entityId: string, wikidataQid: string|null, idMap: object) → AdapterResult
 *
 * When called without a QID (wikidataQid is null), skips silently.
 * hop depth is configurable; default 1 for speed, 2 for exploration mode.
 *
 * Returns: facts (P-statements), related QIDs, dates, and a canonical label.
 */

import { log }        from '../logger.mjs';
import { makeResult, nullResult } from './index.mjs';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const HEADERS = {
  'User-Agent': 'kaaroViewer/3.0 (karx@akriya.co.in)',
  'Accept':     'application/sparql-results+json',
};

// P-statement IDs we extract as metrics
const METRIC_PROPS = {
  P18:   'image',           // image
  P571:  'inception',       // date founded/created
  P576:  'dissolved',       // dissolved date
  P577:  'publication_date',
  P580:  'start_time',
  P582:  'end_time',
  P856:  'official_website',
  P1082: 'population',
  P1036: 'dewey_decimal',
  P6375: 'street_address',
};

// ── Internal SPARQL helper ────────────────────────────────────────────────────

async function _sparql(query, label) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const t0  = performance.now();

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const ms   = Math.round(performance.now() - t0);
    const rows = json?.results?.bindings ?? [];
    log('SPARQL', `[wikidata] ${label} ← ${rows.length} rows (${ms}ms)`);
    return rows;
  } catch (err) {
    log('ERROR', `[wikidata] SPARQL failed: ${label}`, { message: err.message });
    return null;
  }
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch entity facts (label + key P-statements) for a QID.
 */
async function _fetchEntityFacts(qid) {
  const propsFilter = Object.keys(METRIC_PROPS).map(p => `wdt:${p}`).join('|');
  const query = `
SELECT ?propLabel ?valueLabel ?value WHERE {
  BIND(wd:${qid} AS ?entity)
  ?entity ?prop ?value .
  ?propEntity wikibase:directClaim ?prop .
  FILTER(?prop IN (${Object.keys(METRIC_PROPS).map(p => `wdt:${p}`).join(', ')}))
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en" .
    ?propEntity rdfs:label ?propLabel .
    ?value      rdfs:label ?valueLabel .
  }
}
LIMIT 30`;
  return _sparql(query, `facts:${qid}`);
}

/**
 * Fetch related entities (1-hop neighbours) for a QID.
 * Only fetches nodes that are themselves Wikidata items (not literals).
 */
async function _fetchRelatedQIDs(qid, hopDepth = 1) {
  // hopDepth > 1: we do a simple label-only second hop (not full traversal)
  const query = `
SELECT DISTINCT ?related ?relatedLabel WHERE {
  BIND(wd:${qid} AS ?entity)
  ?entity ?prop ?related .
  FILTER(isIRI(?related))
  FILTER(STRSTARTS(STR(?related), "http://www.wikidata.org/entity/Q"))
  FILTER(?related != ?entity)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en" .
    ?related rdfs:label ?relatedLabel .
  }
}
LIMIT ${hopDepth === 2 ? 40 : 20}`;
  return _sparql(query, `related:${qid}`);
}

/**
 * Fetch a short description and label for the QID.
 */
async function _fetchLabel(qid) {
  const query = `
SELECT ?label ?description WHERE {
  BIND(wd:${qid} AS ?entity)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en" .
    ?entity rdfs:label       ?label .
    ?entity schema:description ?description .
  }
}
LIMIT 1`;
  return _sparql(query, `label:${qid}`);
}

// ── Adapter export ────────────────────────────────────────────────────────────

/**
 * @param {string}      entityId   — entity label (e.g. "Lex Fridman")
 * @param {string|null} wikidataQid — QID resolved by NED++ (e.g. "Q59735")
 * @param {object}      idMap       — full cross-source ID map
 * @param {object}      [opts]
 * @param {number}      [opts.hopDepth=1]  — 1 or 2 hops for related QIDs
 * @returns {Promise<AdapterResult>}
 */
export async function enrich(entityId, wikidataQid, idMap, { hopDepth = 1 } = {}) {
  if (!wikidataQid) {
    log('ENRICHER', `[wikidata] no QID for "${entityId}" — skipping`);
    return nullResult('wikidata');
  }

  const qid = wikidataQid.startsWith('Q') ? wikidataQid : `Q${wikidataQid}`;
  log('ENRICHER', `[wikidata] enriching ${entityId} (${qid})`, { hopDepth });

  // Parallel SPARQL calls
  const [factRows, relatedRows, labelRows] = await Promise.all([
    _fetchEntityFacts(qid),
    _fetchRelatedQIDs(qid, hopDepth),
    _fetchLabel(qid),
  ]);

  if (!factRows && !relatedRows && !labelRows) {
    return makeResult('wikidata', { error: 'all SPARQL queries failed' });
  }

  // ── Build metrics from P-statements ──────────────────────────────────────
  const metrics = {};
  const links   = [];

  for (const row of (factRows ?? [])) {
    const propLabel  = row.propLabel?.value;
    const valueLabel = row.valueLabel?.value ?? row.value?.value ?? '';
    const valueRaw   = row.value?.value ?? '';

    if (!propLabel) continue;

    // Collect URLs separately
    if (valueRaw.startsWith('http')) {
      links.push(valueRaw);
    }

    const key = propLabel.toLowerCase().replace(/\s+/g, '_').slice(0, 32);
    metrics[key] = valueLabel || valueRaw;
  }

  // ── Summary from label query ──────────────────────────────────────────────
  const labelRow   = labelRows?.[0];
  const description = labelRow?.description?.value ?? '';
  const canonicalLabel = labelRow?.label?.value ?? entityId;

  // ── Related QIDs ─────────────────────────────────────────────────────────
  const related_ids = (relatedRows ?? [])
    .map(r => r.related?.value?.replace('http://www.wikidata.org/entity/', '') ?? '')
    .filter(Boolean);

  // ── Thumbnail from metrics ────────────────────────────────────────────────
  // The P18 image URL comes through as a Wikimedia Commons link via fact rows
  const imgRow = (factRows ?? []).find(r => {
    const val = r.value?.value ?? '';
    return val.includes('wikimedia.org') || val.includes('commons.wikimedia');
  });
  const thumbnail = imgRow?.value?.value ?? null;

  log('ENRICHER', `[wikidata] ${qid} — ${Object.keys(metrics).length} metrics, ${related_ids.length} related, desc: ${description.slice(0, 60) ?? '(none)'}`);

  return makeResult('wikidata', {
    metrics,
    links,
    related_ids,
    summary:   description || `Wikidata entity: ${canonicalLabel}`,
    thumbnail,
  });
}
