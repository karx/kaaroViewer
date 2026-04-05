/**
 * knowledge.mjs — clean Wikidata SPARQL fetcher.
 *
 * getEntityCore(qid)      → core facts: label, type, image, description
 * getEntityNeighbors(qid) → first-hop related entities with relationship metadata
 */

import { log } from '../logger.mjs';
import { resolveEntityType } from '../ontology.mjs';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const HEADERS  = {
  'User-Agent': 'kaaroViewer/2.0 (https://github.com/karx/kaaroViewer)',
  'Accept':     'application/sparql-results+json',
};


async function _sparql(query, label) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const t0  = performance.now();
  try {
    const res  = await fetch(url, { method: 'GET', headers: HEADERS });
    const json = await res.json();
    const rows = json?.results?.bindings ?? [];
    const ms   = Math.round(performance.now() - t0);
    log('SPARQL', `${label} · ${rows.length} rows (${ms}ms)`, { label, ms, count: rows.length });
    return rows;
  } catch (err) {
    log('ERROR', `SPARQL failed: ${label}`, { message: err.message });
    return [];
  }
}

export async function getEntityCore(qid) {
  const query = `
SELECT ?label ?description ?image ?instanceOf ?instanceOfLabel WHERE {
  OPTIONAL { wd:${qid} wdt:P18 ?image. }
  OPTIONAL { wd:${qid} wdt:P31 ?instanceOf. }
  OPTIONAL {
    wd:${qid} schema:description ?description.
    FILTER(LANG(?description) = "en")
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    wd:${qid} rdfs:label ?label.
    ?instanceOf rdfs:label ?instanceOfLabel.
  }
} LIMIT 6`;

  const rows = await _sparql(query, `core:${qid}`);
  if (!rows.length) return null;

  const instanceofQids = [...new Set(
    rows.filter(r => r.instanceOf).map(r => r.instanceOf.value.split('/').pop())
  )];

  return {
    qid,
    label:          rows[0]?.label?.value           ?? qid,
    description:    rows[0]?.description?.value      ?? '',
    image:          rows[0]?.image?.value             ?? null,
    instanceofQids,
    instanceofLabel: rows[0]?.instanceOfLabel?.value ?? '',
    type:           resolveEntityType(instanceofQids),
  };
}

export async function getEntityNeighbors(qid) {
  // Notability filter: only neighbors with an English Wikipedia article.
  // This is more inclusive than filtering by instance-of type and works across
  // all entity classes (capitals, organizations, people, events, etc.)
  const query = `
SELECT DISTINCT ?prop ?propLabel ?neighbor ?neighborLabel ?neighborImage ?neighborInstanceOf WHERE {
  wd:${qid} ?propUrl ?neighbor.
  ?prop wikibase:directClaim ?propUrl.
  FILTER(isIRI(?neighbor))
  FILTER(?neighbor != wd:${qid})
  ?sitelink schema:about ?neighbor.
  ?sitelink schema:isPartOf <https://en.wikipedia.org/>.
  OPTIONAL { ?neighbor wdt:P31 ?neighborInstanceOf. }
  OPTIONAL { ?neighbor wdt:P18 ?neighborImage. }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?prop     rdfs:label ?propLabel.
    ?neighbor rdfs:label ?neighborLabel.
  }
} LIMIT 24`;

  const rows = await _sparql(query, `neighbors:${qid}`);

  return rows.map(r => ({
    qid:           r.neighbor.value.split('/').pop(),
    label:         r.neighborLabel?.value      ?? '',
    image:         r.neighborImage?.value       ?? null,
    instanceofQid: r.neighborInstanceOf?.value?.split('/').pop() ?? '',
    pid:           r.prop?.value?.split('/').pop()               ?? '',
    relLabel:      r.propLabel?.value           ?? '',
  }));
}
