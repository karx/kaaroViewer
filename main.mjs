/**
 * main.mjs — cognitive interface orchestrator.
 *
 * Modes:
 *   Discovery  — wander the graph, nodes pulse for attention
 *   Detail     — click a node → side panel with facts + connections
 *   Expansion  — double-click → load neighbors, grow the graph
 */

import { initScene, onNodeClick, onNodeDblClick, onNodeHover,
         focusOn, frameNodes, getCamera, getControls, addTick, tickHover } from './canvas/scene.mjs';
import { addNodeMesh, getNodeMesh, setNodeState, clearAllNodes, removeNodeMesh,
         updateNodeDegree } from './canvas/nodes.mjs';
import { addEdgeLine, syncEdgePositions, clearAllEdges, clearEdgesFor }         from './canvas/edges.mjs';
import { placeNode, runForceRelax, getPosition, setPosition, clearLayout } from './canvas/layout.mjs';
import { graph }                                                from './pipeline/graph.mjs';
import { getEntityCore, getEntityNeighbors }                   from './pipeline/knowledge.mjs';
import { resolve }                                              from './pipeline/resolver.mjs';
import { inputBus }                                            from './pipeline/input.mjs';
import { saveSession, listSessions, loadSession, deleteSession } from './pipeline/sessions.mjs';
import { initDetail, showDetail, hideDetail, getCurrentQid }   from './canvas/detail.mjs';
import { initTooltip, showTooltip, hideTooltip }               from './canvas/tooltip.mjs';
import { pushCrumb, getCrumbs, clearCrumbs }                   from './canvas/breadcrumb.mjs';
import { log }                                                  from './logger.mjs';
import { resolveEntityType }                                    from './ontology.mjs';
import { loadLocalDoc, LIBRARY, getDocMeta }                   from './pipeline/local-graph.mjs';
import { initReport, renderReport, showReport, hideReport, isReportVisible } from './canvas/report.mjs';
import { sourceManager }                                       from './pipeline/sources/source-manager.mjs';
import { LiquipediaSource }                                    from './pipeline/sources/liquipedia.mjs';
import { RedditSource }                                        from './pipeline/sources/reddit.mjs';
import { YouTubeSource }                                       from './pipeline/sources/youtube.mjs';
import { enrichNode }                                          from './pipeline/enrichment.mjs';
import { toggleCausalLayout, isCausalMode }                    from './canvas/causal-layout.mjs';
import { initNarrative, toggleNarrative, narrativeNext,
         narrativePrev, stopNarrative, isNarrativeActive,
         loadTour }                                            from './canvas/narrative.mjs';

// ── Init ──────────────────────────────────────────────────────────────────────

const container = document.getElementById('theScene');

// ── Register external sources ─────────────────────────────────────────────────
sourceManager.register(new LiquipediaSource());
sourceManager.register(new RedditSource());
sourceManager.register(new YouTubeSource());

requestAnimationFrame(() => {
  initScene(container);
  initDetail();
  initTooltip();
  initReport();
  initNarrative(focusEntity);
  updateFnBar();
  _renderSourceToggles();

  // Hover → tooltip
  let _hoveredQid = null;
  addTick(tickHover);
  onNodeHover(qid => {
    if (qid === _hoveredQid) return;
    _hoveredQid = qid;
    if (!qid) { hideTooltip(); return; }
    const node = graph.getNode(qid);
    if (!node) return;
    const rect = container.getBoundingClientRect();
    // position is approximate — tooltip follows pointermove anyway
    showTooltip(node.label, node.instanceofLabel || node.type, rect.left + rect.width / 2, rect.top + 40);
  });

  // ── Graph → canvas ──────────────────────────────────────────────────────────

  graph.on('node:added', node => {
    addNodeMesh(node);
    setNodeState(node.qid, node._state ?? 'unvisited');
  });

  graph.on('edge:added', edge => {
    addEdgeLine(edge);
    syncEdgePositions();
    // Update glow-ring size for both endpoints to reflect degree centrality
    updateNodeDegree(edge.from, graph.getEdgesFor(edge.from).length);
    updateNodeDegree(edge.to,   graph.getEdgesFor(edge.to).length);
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

const _loadingCore      = new Set();
const _loadingNeighbors = new Set();
const _expanded         = new Set(); // QIDs whose neighbors have been fetched

// ── Core: load entity facts only (no neighbors) ───────────────────────────────

async function focusEntity(qid) {
  if (_loadingCore.has(qid)) return;

  if (!graph.hasNode(qid)) {
    _loadingCore.add(qid);
    try {
      const core = await getEntityCore(qid);
      if (!core) { log('ERROR', `no data for ${qid}`); return; }
      const position = placeNode(qid, null);
      graph.addNode(qid, { ...core, position, _state: 'visited' });
    } finally {
      _loadingCore.delete(qid);
    }
  }

  const node = graph.getNode(qid);
  if (!node) return;

  // Unfocus previous
  const prev = getCurrentQid();
  if (prev && prev !== qid) {
    const prevState = _expanded.has(prev) ? 'expanded' : 'visited';
    setNodeState(prev, prevState);
  }

  setNodeState(qid, 'focused');
  pushCrumb(qid, node.label);
  updateFnBar();

  const mesh = getNodeMesh(qid);
  if (mesh) focusOn(mesh.position.toArray(), 12);

  showDetail(node, graph.getEdgesFor(qid), qid => graph.getNode(qid));

  // Auto-enrich: Wikipedia summary, thumbnail, geodata (async, non-blocking)
  enrichNode(qid).then(changed => {
    if (changed && getCurrentQid() === qid) {
      // Re-render detail with enriched data
      const fresh = graph.getNode(qid);
      if (fresh) showDetail(fresh, graph.getEdgesFor(qid), q => graph.getNode(q));
    }
  });
}

// ── Expansion: load neighbors ─────────────────────────────────────────────────

async function expandEntity(qid) {
  if (_expanded.has(qid) || _loadingNeighbors.has(qid)) return;
  _loadingNeighbors.add(qid);

  // Ensure the entity itself is loaded first
  if (!graph.hasNode(qid)) await focusEntity(qid);
  const parent = graph.getNode(qid);
  if (!parent) { _loadingNeighbors.delete(qid); return; }

  log('VIEWER', `expanding ${qid}`);
  try {
    const neighbors = await getEntityNeighbors(qid);
    for (const n of neighbors) {
      const nType = resolveEntityType([n.instanceofQid]);
      if (!graph.hasNode(n.qid)) {
        const nPos = placeNode(n.qid, qid);
        graph.addNode(n.qid, {
          qid: n.qid, label: n.label, type: nType,
          image: n.image, description: '', position: nPos,
          instanceofLabel: '', instanceofQids: [n.instanceofQid],
          _state: 'unvisited',
        });
      }
      graph.addEdge(qid, n.qid, n.pid, n.relLabel);
    }
    _expanded.add(qid);
    setNodeState(qid, 'expanded');
    runForceRelax(120);

    // Refresh detail panel if this node is focused
    if (getCurrentQid() === qid) {
      const node = graph.getNode(qid);
      showDetail(node, graph.getEdgesFor(qid), q => graph.getNode(q));
    }
  } finally {
    _loadingNeighbors.delete(qid);
  }
}

// Convenience: focus + expand (for seed / programmatic use)
async function loadEntity(qid) {
  await focusEntity(qid);
  await expandEntity(qid);
}

// ── Interactions ──────────────────────────────────────────────────────────────

onNodeClick(qid    => focusEntity(qid));
onNodeDblClick(qid => expandEntity(qid));

// Detail panel events
document.addEventListener('detail:navigate', e => focusEntity(e.detail.qid));
document.addEventListener('detail:expand',   e => expandEntity(e.detail.qid));
document.addEventListener('detail:pin',      e => {
  setNodeState(e.detail.qid, 'pinned');
  log('SYSTEM', `pinned ${e.detail.qid}`);
});

// Breadcrumb navigation
document.getElementById('breadcrumb')?.addEventListener('bc:navigate', e => focusEntity(e.detail.qid));

// ── Text / voice input ────────────────────────────────────────────────────────

// ── Source prefix detection ───────────────────────────────────────────────────

const SOURCE_PREFIX_RE = /^(lp|yt):\s*(.+)$/i;
const REDDIT_PREFIX_RE = /^r\/\w+\s+.+$/i;

inputBus.addEventListener('intent', async e => {
  const text = e.detail.text;

  // Check for source prefix commands
  const srcMatch = text.match(SOURCE_PREFIX_RE);
  if (srcMatch) {
    const prefix = srcMatch[1].toLowerCase();
    const query  = srcMatch[2].trim();
    const srcName = prefix === 'lp' ? 'liquipedia' : prefix === 'yt' ? 'youtube' : null;
    if (srcName) {
      const result = await sourceManager.searchSource(srcName, query);
      loadSourceResults(result);
      return;
    }
  }

  // Reddit prefix: r/subreddit query
  if (REDDIT_PREFIX_RE.test(text)) {
    const result = await sourceManager.searchSource('reddit', text);
    loadSourceResults(result);
    return;
  }

  // Default: Wikidata entity resolution
  const qids = await resolve(text);
  for (const qid of qids) await loadEntity(qid);
});

// ── Load source results into graph ────────────────────────────────────────────

function loadSourceResults({ nodes = [], edges = [] }) {
  if (!nodes.length) {
    log('SYSTEM', 'source returned no results');
    return;
  }

  for (const n of nodes) {
    if (graph.hasNode(n.id)) continue;
    const pos = placeNode(n.id, null);
    graph.addNode(n.id, {
      qid:             n.id,
      label:           n.label,
      type:            n.type ?? 'default',
      description:     n.description ?? '',
      image:           n.image ?? null,
      instanceofLabel: n.instanceofLabel ?? n.type ?? '',
      instanceofQids:  n.instanceofQids ?? [],
      _source:         n._source ?? 'external',
      _sourceIcon:     n._sourceIcon ?? '◆',
      _meta:           n._meta ?? null,
      url:             n.url ?? null,
      position:        pos,
    });
  }

  for (const e of edges) {
    if (!graph.hasNode(e.from) || !graph.hasNode(e.to)) continue;
    graph.addEdge(e.from, e.to, e.rel ?? 'default', e.label ?? e.rel ?? '');
  }

  runForceRelax(120);
  log('SYSTEM', `loaded ${nodes.length} nodes, ${edges.length} edges from source`);

  // Focus the first node
  if (nodes.length > 0 && graph.hasNode(nodes[0].id)) {
    focusEntity(nodes[0].id);
  }
}

const textInput = document.getElementById('main-input');
if (textInput) inputBus.bindTextInput(textInput);

const voiceBtn = document.getElementById('voice-btn');
if (voiceBtn) {
  voiceBtn.addEventListener('click', () => {
    if (inputBus.voiceActive) {
      inputBus.stopVoice();
      voiceBtn.classList.remove('active');
      voiceBtn.title = 'Start voice';
    } else {
      if (inputBus.startVoice()) {
        voiceBtn.classList.add('active');
        voiceBtn.title = 'Stop voice';
      }
    }
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function _snapshotSession(name) {
  const cam     = getCamera();
  const ctrl    = getControls();
  const nodes   = [...graph.nodes.values()].map(n => ({
    qid: n.qid, label: n.label, type: n.type,
    image: n.image, position: getPosition(n.qid) ?? [0,0,0],
  }));
  const edges   = [...graph.edges.values()];
  const camera  = {
    position: cam.position.toArray(),
    target:   ctrl.target.toArray(),
  };
  return saveSession({ name, nodes, edges, camera, breadcrumb: getCrumbs().map(c => c.qid) });
}

document.getElementById('save-btn')?.addEventListener('click', async () => {
  const name = prompt('Name this exploration:') || undefined;
  const session = await _snapshotSession(name);
  log('SYSTEM', `session saved: ${session.name}`, { id: session.id });
  _renderSessionsDrawer();
});

async function _renderSessionsDrawer() {
  const drawer = document.getElementById('sessions-drawer');
  if (!drawer) return;
  const list = await listSessions();
  if (!list.length) {
    drawer.innerHTML = '<p class="sd-empty">No saved sessions yet.</p>';
    return;
  }
  drawer.innerHTML = list.map(s => `
    <div class="sd-item" data-id="${s.id}">
      <span class="sd-name">${_esc(s.name)}</span>
      <span class="sd-date">${new Date(s.savedAt).toLocaleDateString()}</span>
      <span class="sd-count">${s.nodes?.length ?? 0} nodes</span>
      <button class="sd-load" data-action="load" data-id="${s.id}">Load</button>
      <button class="sd-del"  data-action="delete" data-id="${s.id}">✕</button>
    </div>
  `).join('');

  drawer.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === 'delete') {
        await deleteSession(id);
        _renderSessionsDrawer();
      }
      if (btn.dataset.action === 'load') {
        await _restoreSession(id);
        toggleSessionsDrawer(false);
      }
    });
  });
}

async function _restoreSession(id) {
  const session = await loadSession(id);
  if (!session) return;

  clearAllNodes();
  clearAllEdges();
  graph.clear();
  clearCrumbs();
  clearLayout();

  for (const n of session.nodes) {
    setPosition(n.qid, n.position ?? [0, 0, 0]);
    graph.addNode(n.qid, { ...n, _state: 'visited' });
  }
  for (const e of session.edges) {
    graph.addEdge(e.from, e.to, e.pid, e.relLabel);
  }

  const cam  = getCamera();
  const ctrl = getControls();
  if (session.camera) {
    cam.position.fromArray(session.camera.position);
    ctrl.target.fromArray(session.camera.target);
    ctrl.update();
  }

  log('SYSTEM', `session restored: ${session.name}`);
}

let _drawerOpen = false;
export function toggleSessionsDrawer(force) {
  _drawerOpen = force !== undefined ? force : !_drawerOpen;
  const drawer = document.getElementById('sessions-drawer');
  const wrap   = document.getElementById('sessions-wrap');
  if (!drawer || !wrap) return;
  if (_drawerOpen) { _renderSessionsDrawer(); wrap.classList.add('open'); }
  else             { wrap.classList.remove('open'); }
}

document.getElementById('sessions-btn')?.addEventListener('click', () => toggleSessionsDrawer());

// ── Console API ───────────────────────────────────────────────────────────────

// ── Library ───────────────────────────────────────────────────────────────────

function _renderLibrary() {
  const drawer = document.getElementById('library-drawer');
  if (!drawer) return;
  drawer.innerHTML = LIBRARY.map(doc => `
    <div class="lib-item">
      <div class="lib-meta">
        <span class="lib-title">${_esc(doc.title)}</span>
        <span class="lib-domain">${_esc(doc.domain)}</span>
        <span class="lib-year">${_esc(doc.year)}</span>
      </div>
      <button class="lib-load" data-path="${_esc(doc.path)}">F5 LOAD</button>
    </div>
  `).join('');

  drawer.querySelectorAll('.lib-load').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.textContent = 'LOADING…';
      btn.disabled = true;
      const meta = await loadLocalDoc(btn.dataset.path);
      if (meta) {
        _lastLoadedDocId = meta.id;
        runForceRelax(160);
        toggleLibrary(false);
        renderReport(meta);
        showReport();
        updateFnBar();
        log('SYSTEM', `loaded: ${meta.title}`);
      }
      btn.textContent = 'F5 LOAD';
      btn.disabled = false;
    });
  });
}

let _libraryOpen = false;
function toggleLibrary(force) {
  _libraryOpen = force !== undefined ? force : !_libraryOpen;
  const wrap = document.getElementById('library-wrap');
  if (!wrap) return;
  if (_libraryOpen) { _renderLibrary(); wrap.classList.add('open'); }
  else wrap.classList.remove('open');
}

document.getElementById('library-btn')?.addEventListener('click', () => toggleLibrary());
document.getElementById('library-close')?.addEventListener('click', () => toggleLibrary(false));

// ── Source toggles ────────────────────────────────────────────────────────────

function _renderSourceToggles() {
  const wrap = document.getElementById('source-toggles');
  if (!wrap) return;
  const sources = sourceManager.getAll();
  wrap.innerHTML = sources.map(s => `
    <button class="src-toggle ${s.enabled ? 'src-on' : ''}" data-src="${s.name}"
            title="${_esc(s.describe())}">
      <span class="src-icon">${s.icon}</span>
      <span class="src-label">${_esc(s.displayName)}</span>
    </button>
  `).join('');

  wrap.querySelectorAll('.src-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.src;
      const src  = sourceManager.getAll().find(s => s.name === name);
      if (!src) return;
      sourceManager.toggle(name, !src.enabled);
      btn.classList.toggle('src-on', src.enabled);
    });
  });
}

window.kaaro = { load: loadEntity, focus: focusEntity, expand: expandEntity, loadDoc: loadLocalDoc, graph, inputBus, sourceManager, loadSourceResults };

// ── Keyboard navigation (active when entity is focused) ───────────────────────

const _neighborCursor = new Map(); // qid → current neighbor index

async function refetchEntity(qid) {
  const pos = getPosition(qid);
  removeNodeMesh(qid);
  clearEdgesFor(qid);
  graph.removeNode(qid);
  _expanded.delete(qid);
  if (pos) setPosition(qid, pos);
  log('SYSTEM', `refetching ${qid}`);
  await loadEntity(qid);
}

async function enrichEntity(qid) {
  const neighbors = graph.getNeighborQids(qid).filter(q => !_expanded.has(q));
  const batch = neighbors.slice(0, 4); // expand up to 4 unvisited neighbors
  log('SYSTEM', `enriching ${qid} — expanding ${batch.length} neighbors`);
  for (const nQid of batch) await expandEntity(nQid);
}

function frameNeighbors(qid) {
  const qids   = [qid, ...graph.getNeighborQids(qid)];
  const meshes = qids.map(q => getNodeMesh(q)).filter(Boolean);
  frameNodes(meshes);
}

function focusNeighbor(qid, dir = 1) {
  const neighbors = graph.getNeighborQids(qid);
  if (!neighbors.length) { log('SYSTEM', 'No neighbors loaded — press E to expand'); return; }
  const cur = _neighborCursor.get(qid) ?? -1;
  const next = ((cur + dir) + neighbors.length) % neighbors.length;
  _neighborCursor.set(qid, next);
  focusEntity(neighbors[next]);
}

function cycleAllNodes(dir = 1) {
  const qids = [...graph.nodes.keys()];
  if (!qids.length) return;
  const cur  = getCurrentQid();
  const idx  = qids.indexOf(cur);
  const next = qids[((idx + dir) + qids.length) % qids.length];
  focusEntity(next);
}

// Context-aware fnkey bar
export function updateFnBar() {
  const bar = document.getElementById('fnkey-bar');
  if (!bar) return;
  const qid = getCurrentQid();
  if (!qid) {
    bar.innerHTML = `
      <span class="fnk"><em>Click</em> Detail</span>
      <span class="fnk"><em>Dbl-click</em> Expand</span>
      <span class="fnk"><em>Tab</em> Cycle nodes</span>
      <span class="fnk"><em>F2</em> Save</span>
      <span class="fnk"><em>F5</em> Library</span>
      <span class="fnk"><em>F6</em> Tour</span>
      <span class="fnk"><em>F7</em> Causal</span>
      <span class="fnk"><em>F9</em> Report</span>
      <span class="fnk"><em>F10</em> 📷</span>
      <span class="fnk fnk-right"><em>◎</em> Log</span>`;
  } else {
    const label = graph.getNode(qid)?.label ?? qid;
    bar.innerHTML = `
      <span class="fnk fnk-ctx"><em>E</em> Expand</span>
      <span class="fnk fnk-ctx"><em>I</em> Enrich</span>
      <span class="fnk fnk-ctx"><em>N</em> Next neighbor</span>
      <span class="fnk fnk-ctx"><em>F</em> Frame all</span>
      <span class="fnk fnk-ctx"><em>R</em> Refetch</span>
      <span class="fnk fnk-ctx"><em>F7</em> ${isCausalMode() ? 'Force' : 'Causal'}</span>
      <span class="fnk fnk-ctx"><em>F9</em> Report</span>
      <span class="fnk fnk-ctx"><em>Esc</em> Deselect</span>
      <span class="fnk fnk-right fnk-selected">◉ ${_esc(label.toUpperCase())}</span>`;
  }
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Global keybindings (always active)
  switch (e.key) {
    case 'F6':  e.preventDefault(); toggleNarrative();      updateFnBar(); return;
    case 'F7':  e.preventDefault(); toggleCausalLayout();   updateFnBar(); return;
    case 'F9':  e.preventDefault(); toggleReportMode();     return;
    case 'F10': e.preventDefault(); exportCanvasPNG();      return;
  }

  // Narrative arrow keys
  if (isNarrativeActive()) {
    if (e.key === 'ArrowRight') { e.preventDefault(); narrativeNext(); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); narrativePrev(); return; }
    if (e.key === 'Escape')     { e.preventDefault(); stopNarrative(); updateFnBar(); return; }
    if (e.key === ' ')          { e.preventDefault(); toggleNarrative(); return; }
  }

  // Tab always cycles nodes
  if (e.key === 'Tab') {
    e.preventDefault();
    cycleAllNodes(e.shiftKey ? -1 : 1);
    return;
  }

  // Arrow left = breadcrumb back (always)
  if (e.key === 'ArrowLeft') {
    const crumbs = getCrumbs();
    if (crumbs.length > 1) focusEntity(crumbs[crumbs.length - 2].qid);
    return;
  }

  const qid = getCurrentQid();
  if (!qid) return;

  switch (e.key) {
    case 'e': case 'E': e.preventDefault(); expandEntity(qid);          break;
    case 'i': case 'I': e.preventDefault(); enrichEntity(qid);          break;
    case 'n': case 'N': e.preventDefault(); focusNeighbor(qid, e.shiftKey ? -1 : 1); break;
    case 'f': case 'F': e.preventDefault(); frameNeighbors(qid);        break;
    case 'r': case 'R': e.preventDefault(); refetchEntity(qid);         break;
    case 'x': case 'X': e.preventDefault(); setNodeState(qid, 'pinned'); break;
    case 'Escape':
      hideDetail();
      setNodeState(qid, _expanded.has(qid) ? 'expanded' : 'visited');
      updateFnBar();
      break;
  }
});

// ── Report mode ───────────────────────────────────────────────────────────────

// Track the last loaded doc so F9 can render it
let _lastLoadedDocId = null;

function toggleReportMode() {
  if (isReportVisible()) {
    hideReport();
    log('SYSTEM', 'report mode OFF');
  } else {
    // Render the last loaded doc, or the first available doc
    const docId = _lastLoadedDocId;
    const meta  = docId ? getDocMeta(docId) : null;
    if (!meta) {
      log('SYSTEM', 'no doc loaded — use F5 LIB to load a document first');
      return;
    }
    renderReport(meta);
    showReport();
    log('SYSTEM', `report: ${meta.title}`);
  }
  updateFnBar();
}

// Navigate from report pills/cards → focus node in graph
document.addEventListener('report:navigate', e => {
  const { qid } = e.detail ?? {};
  if (!qid) return;
  // Switch back to graph if the node is a Wikidata entity (Q-prefixed)
  if (isReportVisible()) {
    hideReport();
    updateFnBar();
  }
  focusEntity(qid);
});

document.getElementById('report-btn')?.addEventListener('click', () => toggleReportMode());

// Frame all nodes in a cluster in the canvas
document.addEventListener('report:cluster-focus', e => {
  const { nodeIds } = e.detail ?? {};
  if (!nodeIds?.length) return;
  hideReport();
  updateFnBar();
  const meshes = nodeIds.map(q => getNodeMesh(q)).filter(Boolean);
  if (meshes.length) frameNodes(meshes);
  // Focus highest-degree node in the cluster
  const firstLoaded = nodeIds.find(q => graph.hasNode(q));
  if (firstLoaded) focusEntity(firstLoaded);
});

// Fly camera to a story beat's node set
document.addEventListener('report:beat-frame', e => {
  const { nodeIds } = e.detail ?? {};
  if (!nodeIds?.length) return;
  hideReport();
  updateFnBar();
  const meshes = nodeIds.map(q => getNodeMesh(q)).filter(Boolean);
  if (meshes.length) frameNodes(meshes);
  const primaryQid = nodeIds.find(q => graph.hasNode(q));
  if (primaryQid) focusEntity(primaryQid);
});

// ── PNG export ────────────────────────────────────────────────────────────────

import { getScene as _getScene, getCamera as _getCam } from './canvas/scene.mjs';

function exportCanvasPNG() {
  const canvas = document.querySelector('.canvas-wrap canvas');
  if (!canvas) { log('ERROR', 'no canvas found'); return; }

  // Force a fresh render
  const renderer = canvas.__renderer;

  // Create overlay canvas with title + timestamp
  const w = canvas.width, h = canvas.height;
  const overlay = document.createElement('canvas');
  overlay.width = w; overlay.height = h;
  const ctx = overlay.getContext('2d');

  // Draw the 3D canvas
  ctx.drawImage(canvas, 0, 0);

  // Title bar
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, w, 36);
  ctx.fillRect(0, h - 28, w, 28);

  ctx.font = 'bold 16px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#ff6600';
  ctx.textBaseline = 'middle';
  ctx.fillText('kaaroViewer', 12, 18);

  // Session info
  const nodeCount = graph.nodes.size;
  const edgeCount = graph.edges.size;
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#ccccaa';
  ctx.textAlign = 'right';
  ctx.fillText(`${nodeCount} nodes · ${edgeCount} edges · ${new Date().toLocaleDateString()}`, w - 12, 18);

  // Footer
  ctx.textAlign = 'left';
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#667755';
  ctx.fillText('Generated by kaaroViewer — Knowledge Graph Explorer', 12, h - 10);

  // Download
  const link = document.createElement('a');
  link.download = `kaaroViewer_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = overlay.toDataURL('image/png');
  link.click();

  log('SYSTEM', 'PNG exported');
}

// ── Seed ──────────────────────────────────────────────────────────────────────
// Auto-seed disabled — canvas starts empty. Use input bar or F5 LIB to load.
// requestAnimationFrame(() => setTimeout(() => loadEntity('Q668'), 300));

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
