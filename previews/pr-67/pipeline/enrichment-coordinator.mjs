/**
 * pipeline/enrichment-coordinator.mjs — Stage 3 fan-out + merge + delta detection.
 *
 * Takes a brief (from Stage 1 or an existing library doc) and:
 *   1. Resolves all nodes through NED++ (ned-resolver.mjs)
 *   2. Fans out resolved ID maps to all registered adapters in parallel
 *   3. Merges adapter results into enriched node patches
 *   4. Classifies deltas vs. the working brief
 *   5. Streams node updates via CustomEvent('explore:node-update')
 *   6. Exposes structural / sentiment deltas for [ EXPAND ] / [ RETHINK ] UI
 *
 * Usage:
 *   import { runEnrichment } from './pipeline/enrichment-coordinator.mjs';
 *   const report = await runEnrichment(brief, { adapters: ['wikidata','wikipedia','npm','hackernews'] });
 */

import { log }               from '../logger.mjs';
import { resolveEntities }   from './ned-resolver.mjs';
import { runAdapters, mergeResults, register } from '../enrichers/index.mjs';

// ── Auto-register default adapters ───────────────────────────────────────────
// Importing registers them into the registry if not already done.
// Each import is guarded so partial failures don't block the coordinator.

async function _loadAdapters() {
  const modules = [
    { source: 'wikidata',    path: '../enrichers/wikidata.mjs'    },
    { source: 'wikipedia',   path: '../enrichers/wikipedia.mjs'   },
    { source: 'youtube',     path: '../enrichers/youtube.mjs'     },
    { source: 'reddit',      path: '../enrichers/reddit.mjs'      },
    { source: 'github',      path: '../enrichers/github.mjs'      },
    { source: 'npm',         path: '../enrichers/npm.mjs'         },
    { source: 'hackernews',  path: '../enrichers/hackernews.mjs'  },
  ];

  for (const { source, path } of modules) {
    try {
      const mod = await import(path);
      if (typeof mod.enrich === 'function') {
        register(source, mod.enrich);
      }
    } catch (err) {
      log('ERROR', `[Coordinator] failed to load adapter: ${source}`, { message: err.message });
    }
  }
}

let _adaptersLoaded = false;
async function _ensureAdapters() {
  if (_adaptersLoaded) return;
  await _loadAdapters();
  _adaptersLoaded = true;
}

// ── Delta Classifier ──────────────────────────────────────────────────────────

/**
 * Delta types:
 *   'patch'     — metrics or description changed silently
 *   'structural' — new high-weight entity found or spine node unresolvable
 *   'sentiment' — Stage 1 sentiment contradicted by adapter data
 */

const DELTA_NONE       = 'none';
const DELTA_PATCH      = 'patch';
const DELTA_STRUCTURAL = 'structural';
const DELTA_SENTIMENT  = 'sentiment';

/**
 * Classify the delta between a node's Stage 1 state and enriched adapter data.
 * @param {object} node         — original node from brief
 * @param {object} enrichedPatch — merged adapter result
 * @param {object} brief         — full Stage 1 brief (for context)
 */
function _classifyDelta(node, enrichedPatch, brief) {
  // No enrichment data at all → no delta
  if (!enrichedPatch || !enrichedPatch.sources?.length) return DELTA_NONE;

  const deltas = [];

  // ── Sentiment flip ──────────────────────────────────────────────────────
  // Detect if enriched summary contains strong contradicting sentiment signals
  const originalSentiment = node.sentiment ?? 'neutral';
  const summary = (enrichedPatch.summary ?? '').toLowerCase();
  const negative_signals = ['deprecated', 'abandoned', 'controversy', 'criticized', 'failed', 'deleted', 'banned'];
  const positive_signals = ['popular', 'growing', 'leading', 'industry standard', 'widely used'];

  if (originalSentiment === 'positive' && negative_signals.some(s => summary.includes(s))) {
    deltas.push({ type: DELTA_SENTIMENT, reason: 'positive node has negative enrichment signals', node: node.id });
  }
  if (originalSentiment === 'negative' && positive_signals.some(s => summary.includes(s))) {
    deltas.push({ type: DELTA_SENTIMENT, reason: 'negative node has positive enrichment signals', node: node.id });
  }

  // ── Structural: spine node unresolvable ─────────────────────────────────
  const spineIds = new Set(brief.report_card?.spine ?? []);
  if (spineIds.has(node.id) && !enrichedPatch.sources.includes('wikidata')) {
    deltas.push({ type: DELTA_STRUCTURAL, reason: 'spine node unresolvable via Wikidata', node: node.id });
  }

  // ── Structural: new high-signal related entities ─────────────────────────
  const existingNodeIds = new Set((brief.nodes ?? []).map(n => n.id));
  const newRelated = (enrichedPatch.related_ids ?? [])
    .filter(id => !existingNodeIds.has(id))
    .slice(0, 5);

  if (newRelated.length >= 2) {
    deltas.push({ type: DELTA_STRUCTURAL, reason: `${newRelated.length} new related entities from adapters`, node: node.id, newEntities: newRelated });
  }

  // ── Patch: metrics or description changed ────────────────────────────────
  const hasNewMetrics = Object.keys(enrichedPatch.metrics ?? {}).length > 0;
  const hasNewSummary = enrichedPatch.summary && (!node.description || node.description.length < 30);
  if ((hasNewMetrics || hasNewSummary) && !deltas.length) {
    deltas.push({ type: DELTA_PATCH, reason: 'metrics or description updated', node: node.id });
  }

  if (!deltas.length) return { type: DELTA_NONE, deltas: [] };

  // Escalate: sentiment > structural > patch
  const topType = deltas.find(d => d.type === DELTA_SENTIMENT)?.type
    ?? deltas.find(d => d.type === DELTA_STRUCTURAL)?.type
    ?? DELTA_PATCH;

  return { type: topType, deltas };
}

// ── Canvas event emitter ──────────────────────────────────────────────────────

/**
 * Emit a node update to the canvas via CustomEvent.
 * Canvas listens on document for 'explore:node-update'.
 */
function _emitNodeUpdate(nodeId, patch, deltaType) {
  const event = new CustomEvent('explore:node-update', {
    detail: { nodeId, patch, deltaType },
    bubbles: true,
  });
  document.dispatchEvent(event);
  log('ENRICHER', `[Coordinator] emit explore:node-update → ${nodeId} (${deltaType})`);
}

/**
 * Emit a delta signal that should surface [ EXPAND ] or [ RETHINK ] controls.
 */
function _emitDeltaSignal(type, deltas) {
  const event = new CustomEvent('explore:delta', {
    detail: { type, deltas },
    bubbles: true,
  });
  document.dispatchEvent(event);
  log('ENRICHER', `[Coordinator] emit explore:delta → ${type}`, { deltaCount: deltas.length });
}

// ── Main coordinator ──────────────────────────────────────────────────────────

/**
 * Run the full Stage 3 enrichment pass for a brief.
 *
 * @param {object} brief — Stage 1 output (nodes, edges, report_card, enrichment_targets)
 * @param {object} [opts]
 * @param {string[]} [opts.adapters]       — adapter names to run (default: all registered)
 * @param {number}  [opts.concurrency=3]   — parallel node batches
 * @param {boolean} [opts.stream=true]     — emit canvas events as adapters resolve
 * @param {string}  [opts.priorityFilter]  — 'high' | 'medium' | 'low' | null (all)
 * @returns {Promise<EnrichmentReport>}
 */
export async function runEnrichment(brief, opts = {}) {
  await _ensureAdapters();

  const {
    adapters      = null,
    concurrency   = 3,
    stream        = true,
    priorityFilter = null,
  } = opts;

  const nodes  = brief.nodes ?? [];
  const targets = brief.enrichment_targets ?? nodes.map(n => ({ node_id: n.id, priority: 'medium' }));

  // Apply priority filter
  const filteredTargets = priorityFilter
    ? targets.filter(t => t.priority === priorityFilter)
    : targets;

  log('ENRICHER', `[Coordinator] starting enrichment — ${nodes.length} nodes, ${filteredTargets.length} targets`, {
    adapters: adapters ?? 'all',
    concurrency,
  });

  // Build node lookup
  const nodeLookup = {};
  for (const n of nodes) nodeLookup[n.id] = n;

  // ── Stage 2 integration: resolve entities via NED++ ──────────────────────
  const entitiesToResolve = filteredTargets.map(t => {
    const node = nodeLookup[t.node_id];
    return {
      label:       node?.label ?? t.node_id,
      type:        node?.type  ?? 'unknown',
      priority:    t.priority  ?? 'medium',
      seedContext: brief.meta?.title ?? '',
    };
  });

  log('ENRICHER', `[Coordinator] resolving ${entitiesToResolve.length} entities via NED++`);
  const idMaps = await resolveEntities(entitiesToResolve, { concurrency });

  // ── Fan-out: run adapters per entity ─────────────────────────────────────
  const enrichedPatches  = {};   // nodeId → merged patch
  const deltasByNode     = {};   // nodeId → delta classification
  const allDeltas        = [];

  for (let i = 0; i < idMaps.length; i += concurrency) {
    const batch = idMaps.slice(i, i + concurrency);
    const batchTargets = filteredTargets.slice(i, i + concurrency);

    await Promise.all(batch.map(async (idMap, batchIndex) => {
      const target = batchTargets[batchIndex];
      const nodeId = target?.node_id ?? idMap.label;
      const node   = nodeLookup[nodeId];

      try {
        // Run all adapters for this entity
        const results = await runAdapters(idMap, adapters);
        const merged  = mergeResults(results);

        enrichedPatches[nodeId]  = merged;

        // Classify delta
        const delta = _classifyDelta(node ?? { id: nodeId }, merged, brief);
        deltasByNode[nodeId] = delta;

        if (delta.type !== DELTA_NONE) {
          allDeltas.push(...(delta.deltas ?? []));
        }

        // Stream to canvas
        if (stream) {
          _emitNodeUpdate(nodeId, merged, delta.type);
          if (delta.type === DELTA_STRUCTURAL || delta.type === DELTA_SENTIMENT) {
            _emitDeltaSignal(delta.type, delta.deltas ?? []);
          }
        }

      } catch (err) {
        log('ERROR', `[Coordinator] enrichment failed for ${nodeId}`, { message: err.message });
      }
    }));
  }

  // ── Build report ─────────────────────────────────────────────────────────
  const structuralDeltas = allDeltas.filter(d => d.type === DELTA_STRUCTURAL);
  const sentimentDeltas  = allDeltas.filter(d => d.type === DELTA_SENTIMENT);

  const report = {
    nodesEnriched:   Object.keys(enrichedPatches).length,
    patches:         enrichedPatches,
    deltas:          deltasByNode,
    structuralCount: structuralDeltas.length,
    sentimentCount:  sentimentDeltas.length,
    showExpand:      structuralDeltas.length > 0,
    showRethink:     sentimentDeltas.length > 0 || structuralDeltas.length > 1,
    allDeltas,
  };

  log('ENRICHER', `[Coordinator] enrichment complete`, {
    nodesEnriched:   report.nodesEnriched,
    structural:      report.structuralCount,
    sentiment:       report.sentimentCount,
    showExpand:      report.showExpand,
    showRethink:     report.showRethink,
  });

  return report;
}

/**
 * Apply enriched patches from the coordinator back into a brief's node array.
 * Mutates the nodes in-place for efficiency.
 *
 * @param {object}   brief   — the working brief
 * @param {object}   patches — enrichedPatches map from runEnrichment()
 */
export function applyPatches(brief, patches) {
  let applied = 0;
  for (const node of (brief.nodes ?? [])) {
    const patch = patches[node.id];
    if (!patch) continue;

    // Merge metrics (namespaced by source — no collisions)
    node.metrics = { ...(node.metrics ?? {}), ...patch.metrics };

    // Description: prefer enriched if current is short/empty
    if (patch.summary && (!node.description || node.description.length < 30)) {
      node.description = patch.summary.slice(0, 400);
    }

    // Image: first available
    if (!node.image && patch.thumbnail) node.image = patch.thumbnail;

    // External links
    if (patch.links?.length) node._links = [...new Set([...(node._links ?? []), ...patch.links])];

    node._enriched = true;
    applied++;
  }
  log('ENRICHER', `[Coordinator] applied patches to ${applied}/${brief.nodes?.length ?? 0} nodes`);
  return applied;
}
