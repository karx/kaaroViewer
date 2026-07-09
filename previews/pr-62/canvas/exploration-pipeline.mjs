/**
 * canvas/exploration-pipeline.mjs
 *
 * Standalone exploration pipeline module extracted from main.mjs.
 * Handles: full exploration, expand, rethink, and canvas loading.
 */

import { log } from '../logger.mjs';
import { explore, rethink } from '../pipeline/explore.mjs';
import { runEnrichment } from '../pipeline/enrichment-coordinator.mjs';
import { runCompletion } from '../pipeline/completion.mjs';
import { notifyBriefReady } from '../embed.mjs';
import { graph } from '../pipeline/graph.mjs';
import { addNodeMesh, setNodeState, updateNodeDegree, clearAllNodes,
         clearNodeColorOverrides } from './nodes.mjs';
import { addEdgeLine, syncEdgePositions, clearAllEdges } from './edges.mjs';
import { placeNode, runForceRelax, setPosition, clearLayout } from './layout.mjs';
import { clearCrumbs } from './breadcrumb.mjs';
import { resolveEntityType } from '../ontology.mjs';
import { getActiveBrief, setActiveBrief, getActivePatches, setActivePatches,
         setLastLoadedDocId, setCurrentDocMeta } from './app-state.mjs';
import { showBrief } from './brief-controller.mjs';

// ── Canvas loader helpers ──────────────────────────────────────────────────────

const _clEl      = () => document.getElementById('canvas-loader');
const _clLabelEl = () => document.getElementById('cl-label');
const _clProgEl  = () => document.getElementById('cl-progress');
const _clSeedEl  = () => document.getElementById('cl-seed-echo');

function _showLoader(seed, label = 'exploring…', pct = 5) {
  const el = _clEl(); if (!el) return;
  el.classList.remove('hidden');
  const lbl = _clLabelEl(); if (lbl) lbl.textContent = label;
  const prg = _clProgEl();  if (prg) prg.style.width = `${pct}%`;
  const ech = _clSeedEl();  if (ech) ech.textContent = seed ?? '';
}

function _updateLoader(label, pct) {
  const lbl = _clLabelEl(); if (lbl) lbl.textContent = label;
  const prg = _clProgEl();  if (prg) prg.style.width = `${pct}%`;
}

function _hideLoader() {
  const el = _clEl(); if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.classList.add('hidden');
    el.style.opacity = '';
  }, 380);
}

// ── Core canvas loading ────────────────────────────────────────────────────────

/**
 * Clear graph state and populate the canvas from a brief.
 * Exported so session-manager can call it for restore operations.
 */
export function loadBriefIntoCanvas(brief) {
  // Clear existing graph
  clearAllNodes();
  clearAllEdges();
  graph.clear();
  clearCrumbs();
  clearLayout();
  clearNodeColorOverrides();
  document.dispatchEvent(new CustomEvent('kaaro:overlay-reset'));

  // Place and add all nodes
  const spine = new Set(brief.report_card?.spine ?? []);
  for (const node of (brief.nodes ?? [])) {
    const pos = placeNode(node.id, null);
    graph.addNode(node.id, {
      qid:             node.id,
      label:           node.label,
      type:            node.type ?? 'concept',
      description:     node.description ?? '',
      image:           node.image ?? null,
      instanceofLabel: node.type ?? '',
      instanceofQids:  [],
      tier:            node.tier ?? 'primary',
      sentiment:       node.sentiment ?? 'neutral',
      metrics:         node.metrics ?? {},
      wikidata:        node.wikidata ?? null,
      _links:          node._links ?? [],
      _source:         'explore',
      _state:          spine.has(node.id) ? 'focused' : 'unvisited',
      confidence:      node.confidence ?? 0.5,
    });
    setPosition(node.id, pos);
  }

  // Add edges
  for (const edge of (brief.edges ?? [])) {
    if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
    graph.addEdge(edge.from, edge.to, edge.rel ?? 'association', edge.label ?? edge.rel ?? '');
  }

  runForceRelax(180);

  // Focus first spine node
  const firstSpine = (brief.report_card?.spine ?? [])[0]
    ?? brief.nodes?.[0]?.id;
  if (firstSpine && graph.hasNode(firstSpine)) {
    document.dispatchEvent(new CustomEvent('kaaro:focus-entity', { detail: { qid: firstSpine } }));
  }

  log('SYSTEM', `[explore] canvas loaded: ${brief.nodes?.length ?? 0} nodes, ${brief.edges?.length ?? 0} edges`);
}

// ── Public pipeline functions ─────────────────────────────────────────────────

/**
 * Full exploration pipeline: Stage 1 → canvas → Stage 3 (streaming) → Stage 4 → re-render.
 */
export async function runExploration(seed) {
  log('SYSTEM', `[explore] starting full pipeline for: "${seed}"`);
  _showLoader(seed, 'generating brief…', 5);

  try {
    // Stage 1: LLM brief generation
    const brief = await explore(seed);
    setActiveBrief(brief);
    _updateLoader('building graph…', 55);

    // Load canvas immediately — Stage 3 streaming updates need nodes to be present
    loadBriefIntoCanvas(brief);
    setLastLoadedDocId(brief.meta.id);
    setCurrentDocMeta(brief);
    showBrief(brief);
    document.dispatchEvent(new CustomEvent('kaaro:cluster-pills-update', { detail: { brief } }));
    document.dispatchEvent(new CustomEvent('kaaro:stats-strip-update', { detail: { brief } }));
    document.dispatchEvent(new CustomEvent('kaaro:fn-bar-update'));
    _updateLoader('enriching entities…', 72);

    // Stage 3: Enrichment coordinator — streams explore:node-update to canvas
    const enrichReport = await runEnrichment(brief, {
      concurrency:    3,
      stream:         true,
      priorityFilter: null,
    });
    setActivePatches(enrichReport.patches);
    _updateLoader('finishing…', 90);

    // Stage 4: Completion pass — fill narrative gaps
    await runCompletion(brief, enrichReport.patches);

    // Re-render brief with enriched node data (metrics, descriptions may have changed)
    showBrief(brief);
    document.dispatchEvent(new CustomEvent('kaaro:cluster-pills-update', { detail: { brief } }));
    document.dispatchEvent(new CustomEvent('kaaro:stats-strip-update', { detail: { brief } }));

    _updateLoader('done', 100);
    _hideLoader();
    log('SYSTEM', `[explore] pipeline complete — ${brief.nodes?.length} nodes`);
    notifyBriefReady(brief);

  } catch (err) {
    _updateLoader('exploration failed', 100);
    _hideLoader();
    log('ERROR', `[explore] pipeline failed: ${err.message}`, { message: err.message });
  }
}

/**
 * EXPAND: run another enrichment pass, adding enrichment-discovered nodes.
 */
export async function runExpand(deltas) {
  const activeBrief = getActiveBrief();
  if (!activeBrief) { log('SYSTEM', '[explore] no active brief for EXPAND'); return; }
  log('SYSTEM', '[explore] EXPAND triggered', { deltas: deltas?.length ?? 0 });

  const enrichReport = await runEnrichment(activeBrief, { concurrency: 3, stream: true });
  setActivePatches(enrichReport.patches);
  await runCompletion(activeBrief, enrichReport.patches);
  loadBriefIntoCanvas(activeBrief);

  showBrief(activeBrief);
  document.dispatchEvent(new CustomEvent('kaaro:cluster-pills-update', { detail: { brief: activeBrief } }));
  document.dispatchEvent(new CustomEvent('kaaro:stats-strip-update', { detail: { brief: activeBrief } }));
}

/**
 * RETHINK: re-generate brief with enrichment context, then re-run pipeline.
 */
export async function runRethink(deltas) {
  const activeBrief = getActiveBrief();
  if (!activeBrief) { log('SYSTEM', '[explore] no active brief for RETHINK'); return; }
  log('SYSTEM', '[explore] RETHINK triggered');

  try {
    const revised = await rethink(activeBrief, getActivePatches() ?? {});
    setActiveBrief(revised);

    const enrichReport = await runEnrichment(revised, { concurrency: 3, stream: true });
    setActivePatches(enrichReport.patches);
    await runCompletion(revised, enrichReport.patches);
    loadBriefIntoCanvas(revised);

    setLastLoadedDocId(revised.meta.id);
    setCurrentDocMeta(revised);
    showBrief(revised);
    document.dispatchEvent(new CustomEvent('kaaro:cluster-pills-update', { detail: { brief: revised } }));
    document.dispatchEvent(new CustomEvent('kaaro:stats-strip-update', { detail: { brief: revised } }));
    document.dispatchEvent(new CustomEvent('kaaro:fn-bar-update'));
  } catch (err) {
    log('ERROR', `[explore] RETHINK failed: ${err.message}`);
  }
}
