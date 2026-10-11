/**
 * pipeline/completion.mjs — Stages 4a, 4b, 4c: Post-enrichment completion pass.
 *
 * Takes the working brief (from Stage 1/explore.mjs) +
 * enrichment patches (from Stage 3/enrichment-coordinator.mjs) and:
 *
 *   Stage 4a (scanStoryBeats)   — scan all story narrations for node name
 *                                  mentions; add missing nodes as secondary stubs
 *   Stage 4b (attachEnrichment) — merge enriched adapter data into matching nodes
 *                                  (metrics, description, image, links)
 *   Stage 4c (addEdgeStubs)     — compare enriched related_ids against existing
 *                                  edges; add missing edge stubs
 *
 * Usage:
 *   import { runCompletion } from './pipeline/completion.mjs';
 *   const completedBrief = await runCompletion(brief, enrichmentReport.patches);
 */

import { log } from '../logger.mjs';

// ── Stage 4a: Scan story beats for missing node references ────────────────────

/**
 * Scans story beat narrations for mentions of known entity labels.
 * If a label appears in a narration but has no corresponding node,
 * a stub secondary node is added.
 *
 * Also checks beat.node and beat.nodes[] references.
 *
 * @param {object} brief — working brief (mutated in-place)
 * @returns {{ added: string[] }} — list of new node IDs added
 */
export function scanStoryBeats(brief) {
  const nodeIds  = new Set((brief.nodes ?? []).map(n => n.id));
  const added    = [];
  const stubs    = [];

  for (const beat of (brief.story ?? [])) {
    // Ensure beat.node exists
    if (beat.node && !nodeIds.has(beat.node)) {
      const stub = _makeStub(beat.node, beat.title);
      stubs.push(stub);
      nodeIds.add(beat.node);
      added.push(beat.node);
      log('ENRICHER', `[completion:4a] stub added for missing beat.node: ${beat.node}`);
    }

    // Ensure all beat.nodes[] exist
    for (const nid of (beat.nodes ?? [])) {
      if (!nodeIds.has(nid)) {
        const stub = _makeStub(nid, null);
        stubs.push(stub);
        nodeIds.add(nid);
        added.push(nid);
        log('ENRICHER', `[completion:4a] stub added for missing beat.nodes[]: ${nid}`);
      }
    }
  }

  // Ensure all insight evidence nodes exist
  for (const insight of (brief.insights ?? [])) {
    for (const nid of (insight.evidence ?? [])) {
      if (!nodeIds.has(nid)) {
        const stub = _makeStub(nid, null);
        stubs.push(stub);
        nodeIds.add(nid);
        added.push(nid);
        log('ENRICHER', `[completion:4a] stub added for missing insight.evidence: ${nid}`);
      }
    }
  }

  if (stubs.length) {
    brief.nodes = [...(brief.nodes ?? []), ...stubs];
    // Rebuild nodeLookup
    for (const s of stubs) (brief.nodeLookup ??= {})[s.id] = s;
    log('ENRICHER', `[completion:4a] ${stubs.length} stub node(s) added`);
  }

  return { added };
}

function _makeStub(id, beatTitle) {
  return {
    id,
    label:       _idToLabel(id),
    type:        'concept',
    tier:        'secondary',
    sentiment:   'neutral',
    description: beatTitle ? `Referenced in: "${beatTitle}"` : `Stub node for: ${id}`,
    metrics:     {},
    confidence:  0.3,
    wikidata:    null,
    _stub:       true,
  };
}

function _idToLabel(id) {
  // "force-with-lease" → "Force With Lease"
  return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Stage 4b: Attach enrichment data to nodes ─────────────────────────────────

/**
 * Merge enriched adapter patches into the node objects.
 * Namespaces metrics by source to avoid collisions.
 *
 * @param {object} brief   — working brief (mutated in-place)
 * @param {object} patches — enrichedPatches from runEnrichment()
 * @returns {{ enriched: number, skipped: number }}
 */
export function attachEnrichment(brief, patches) {
  if (!patches || !Object.keys(patches).length) return { enriched: 0, skipped: 0 };

  let enriched = 0;
  let skipped  = 0;

  for (const node of (brief.nodes ?? [])) {
    const patch = patches[node.id];
    if (!patch) { skipped++; continue; }

    // ── Metrics: merge (adapter metrics are already namespaced) ──────────────
    node.metrics = { ...(node.metrics ?? {}), ...(patch.metrics ?? {}) };

    // ── Description: prefer enriched if node has stub/short description ──────
    if (patch.summary) {
      const isShort = !node.description || node.description.length < 40 || node._stub;
      if (isShort) {
        node.description = patch.summary.slice(0, 600);
      }
    }

    // ── Image: first available from adapters ─────────────────────────────────
    if (!node.image && patch.thumbnail) node.image = patch.thumbnail;

    // ── External links ────────────────────────────────────────────────────────
    if (patch.links?.length) {
      node._links = [...new Set([...(node._links ?? []), ...patch.links])];
    }

    // ── Wikidata QID: fill in if missing and enrichment resolved it ───────────
    if (!node.wikidata && patch.metrics?.wikidata_qid) {
      node.wikidata = patch.metrics.wikidata_qid;
    }

    // ── Sources ───────────────────────────────────────────────────────────────
    node._enrichedSources = patch.sources ?? [];
    node._enriched = true;

    if (node._stub) delete node._stub; // promoted from stub
    enriched++;
  }

  // Rebuild nodeLookup
  brief.nodeLookup = {};
  for (const n of (brief.nodes ?? [])) brief.nodeLookup[n.id] = n;

  log('ENRICHER', `[completion:4b] enriched ${enriched} nodes, skipped ${skipped}`);
  return { enriched, skipped };
}

// ── Stage 4c: Add missing edge stubs from enrichment's related_ids ────────────

/**
 * Compares related_ids from adapter patches against existing edges.
 * Creates lightweight association edge stubs for new relationships.
 *
 * Only adds edges when both the source node AND the related node exist
 * (either already in the brief, or mentioned in patches).
 *
 * @param {object} brief   — working brief (mutated in-place)
 * @param {object} patches — enrichedPatches from runEnrichment()
 * @returns {{ added: number }}
 */
export function addEdgeStubs(brief, patches) {
  if (!patches) return { added: 0 };

  const nodeIds  = new Set((brief.nodes ?? []).map(n => n.id));
  const edgeSet  = new Set(
    (brief.edges ?? []).map(e => `${e.from}→${e.to}`)
  );

  let added = 0;
  const newEdges = [];

  for (const [nodeId, patch] of Object.entries(patches)) {
    if (!nodeIds.has(nodeId)) continue;
    const relatedIds = patch.related_ids ?? [];

    for (const relId of relatedIds) {
      // Only connect if the target exists in the brief
      if (!nodeIds.has(relId)) continue;

      const fwd = `${nodeId}→${relId}`;
      const rev = `${relId}→${nodeId}`;
      if (edgeSet.has(fwd) || edgeSet.has(rev)) continue;

      newEdges.push({
        from:     nodeId,
        to:       relId,
        rel:      'association',
        weight:   1,
        directed: false,
        label:    'enrichment association',
        _stub:    true,
      });
      edgeSet.add(fwd);
      added++;
      log('ENRICHER', `[completion:4c] edge stub: ${nodeId} ↔ ${relId}`);
    }
  }

  if (newEdges.length) brief.edges = [...(brief.edges ?? []), ...newEdges];
  log('ENRICHER', `[completion:4c] ${added} edge stub(s) added`);
  return { added };
}

// ── Combined runner ───────────────────────────────────────────────────────────

/**
 * Run all three completion stages in sequence.
 *
 * @param {object} brief           — working brief from Stage 1
 * @param {object} patches         — enrichedPatches from runEnrichment()
 * @returns {Promise<object>}       — mutated brief (same object)
 */
export async function runCompletion(brief, patches) {
  log('ENRICHER', '[completion] running Stages 4a → 4b → 4c');

  const r4a = scanStoryBeats(brief);
  const r4b = attachEnrichment(brief, patches);
  const r4c = addEdgeStubs(brief, patches);

  log('ENRICHER', '[completion] complete', {
    stubs_added:    r4a.added.length,
    nodes_enriched: r4b.enriched,
    edges_added:    r4c.added,
  });

  // Emit event for canvas integration
  document.dispatchEvent(new CustomEvent('explore:completion-done', {
    detail: { brief, summary: { stubs: r4a.added.length, enriched: r4b.enriched, edges: r4c.added } },
    bubbles: true,
  }));

  return brief;
}
