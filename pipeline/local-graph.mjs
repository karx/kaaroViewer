/**
 * local-graph.mjs — loads a library JSON document into the graph.
 *
 * JSON schema: { meta, nodes: [{id, label, type, description, metrics, wikidata}],
 *                             edges: [{from, to, rel, label}] }
 *
 * Nodes get _source:'local' and _docId so they render with a LOCAL badge.
 */

import { graph }           from './graph.mjs';
import { placeNode }       from '../canvas/layout.mjs';
import { resolveRelType }  from '../ontology.mjs';
import { log }             from '../logger.mjs';

/**
 * Fetch and load a library JSON file into the live graph.
 * @param {string} path  - relative path e.g. './library/gig-worker-projects.json'
 * @returns {object}     - the parsed doc meta
 */
export async function loadLocalDoc(path) {
  log('SYSTEM', `loading local doc: ${path}`);

  let doc;
  try {
    const res = await fetch(path);
    doc = await res.json();
  } catch (err) {
    log('ERROR', `failed to load ${path}`, { message: err.message });
    return null;
  }

  const { meta, nodes = [], edges = [] } = doc;
  log('SYSTEM', `doc "${meta.title}" — ${nodes.length} nodes, ${edges.length} edges`);

  // ── Place + add nodes ───────────────────────────────────────────────────────

  // First pass: place all nodes (so edge drawing has positions)
  for (const n of nodes) {
    if (graph.hasNode(n.id)) continue;
    const pos = placeNode(n.id, null);
    graph.addNode(n.id, {
      qid:            n.id,
      label:          n.label,
      type:           n.type ?? 'default',
      description:    n.description ?? '',
      image:          n.image ?? null,
      instanceofLabel:n.type ?? '',
      instanceofQids: [],
      metrics:        n.metrics ?? null,
      wikidata:       n.wikidata ?? null,   // optional Wikidata QID for later enrichment
      _source:        'local',
      _docId:         meta.id,
      position:       pos,
    });
  }

  // ── Add edges ───────────────────────────────────────────────────────────────

  for (const e of edges) {
    if (!graph.hasNode(e.from) || !graph.hasNode(e.to)) continue;
    graph.addEdge(e.from, e.to, e.rel ?? 'default', e.label ?? e.rel ?? '');
  }

  log('SYSTEM', `doc loaded — graph now ${graph.stats().nodes} nodes, ${graph.stats().edges} edges`);
  return meta;
}

/**
 * List available documents in /library/ (hardcoded index for now).
 * Extend this array as more docs are added.
 */
export const LIBRARY = [
  {
    id:     'gig-worker-projects',
    title:  'Algorithmic Panopticon: Gig Economy India',
    path:   './library/gig-worker-projects.json',
    domain: 'Labour / Technology',
    year:   '2025',
  },
];
