/**
 * main.mjs — cognitive interface orchestrator.
 *
 * Modes:
 *   Discovery  — wander the graph, nodes pulse for attention
 *   Detail     — click a node → side panel with facts + connections
 *   Expansion  — double-click → load neighbors, grow the graph
 */

import { initScene, onNodeClick, onNodeDblClick, onNodeHover,
         focusOn, frameNodes, getCamera, getRenderer, getScene,
         getControls, addTick, tickHover, animateCameraTo,
         getVisibleNodeQids, setCameraLock, isCameraLocked } from './canvas/scene.mjs';
import { addNodeMesh, getNodeMesh, getAllMeshes, setNodeState, clearAllNodes, removeNodeMesh,
         updateNodeDegree, dimAllExcept, clearDim,
         setNodeColorOverride, clearNodeColorOverrides } from './canvas/nodes.mjs';
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
import { initReport, renderReport, showReport, hideReport, isReportVisible,
         scrollToCluster } from './canvas/report.mjs';
import { initSlides, renderSlides, showSlides, hideSlides, isSlidesVisible,
         nextSlide, prevSlide, notifySceneResult,
         getSlideCount, getSlideIds,
         getActiveSlideIdx, getActiveSlide } from './canvas/slides.mjs';
import { sourceManager }                                       from './pipeline/sources/source-manager.mjs';
import { LiquipediaSource }                                    from './pipeline/sources/liquipedia.mjs';
import { RedditSource }                                        from './pipeline/sources/reddit.mjs';
import { YouTubeSource }                                       from './pipeline/sources/youtube.mjs';
import { enrichNode }                                          from './pipeline/enrichment.mjs';
import { toggleCausalLayout, isCausalMode }                    from './canvas/causal-layout.mjs';
import { initNarrative, toggleNarrative, narrativeNext,
         narrativePrev, stopNarrative, isNarrativeActive,
         loadTour }                                            from './canvas/narrative.mjs';
import { explore, rethink, registerLLM,
         registerLLMDisambiguate, validateBrief }             from './pipeline/explore.mjs';
import { runCompletion }                                       from './pipeline/completion.mjs';
import { runEnrichment, applyPatches }                        from './pipeline/enrichment-coordinator.mjs';
import { mountExploreUI }                                     from './canvas/explore-ui.mjs';
import { mountSettings, toggleSettings }                      from './canvas/settings.mjs';
import { initScenePainter, generateScene, rehydrateSlides, getCanonicalCamera,
         restoreScene, clearSlide, clearAllSlides,
         tickScenePainter, getImageKey,
         getAllBackdrops }                                    from './canvas/scene-painter.mjs';
import { EMBED_MODE, notifyBriefReady, signalReady }         from './embed.mjs';
import { assemblePaintContext }                               from './canvas/paint-context.mjs';
import { buildPrompt as buildStrategyPrompt,
         setActiveStrategy, getActiveStrategy,
         listStrategies } from './canvas/paint-strategies.mjs';

// ── Init ──────────────────────────────────────────────────────────────────────

const container = document.getElementById('theScene');

// ── Register external sources ─────────────────────────────────────────────────
sourceManager.register(new LiquipediaSource());
sourceManager.register(new RedditSource());
sourceManager.register(new YouTubeSource());

requestAnimationFrame(() => {
  initScene(container);
  initScenePainter(getScene());   // must come after initScene so the Three.js canvas exists
  addTick(tickScenePainter);
  initDetail();
  initTooltip();
  initReport();
  initSlides();
  initNarrative(focusEntity);
  updateFnBar();
  _renderSourceToggles();

  // ── Mount explore UI ──────────────────────────────────────────────────────
  mountExploreUI({
    container: 'body',
    onExpand:  deltas => _runExpand(deltas),
    onRethink: deltas => _runRethink(deltas),
  });

  // Mount settings panel (suppressed in embed mode — keys live in the host CF)
  if (!EMBED_MODE) {
    mountSettings();
    document.getElementById('settings-btn')
      ?.addEventListener('click', () => toggleSettings());
  }

  // ── Zero state ───────────────────────────────────────────────────────────
  const _zsEl = document.getElementById('zero-state');
  let   _zsDismissed = false;
  function _dismissZeroState() {
    if (_zsDismissed || !_zsEl) return;
    _zsDismissed = true;
    _zsEl.classList.add('zs-out');
    setTimeout(() => _zsEl.remove(), 500);
  }

  function _zsSubmit() {
    const inp = document.getElementById('zs-input');
    const val = inp?.value.trim();
    if (!val) return;
    _dismissZeroState();
    inputBus.push(val, 'zero-state');
  }
  document.getElementById('zs-submit')?.addEventListener('click', _zsSubmit);
  document.getElementById('zs-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _zsSubmit();
  });
  document.querySelectorAll('.zs-seed').forEach(btn => {
    btn.addEventListener('click', () => {
      _dismissZeroState();
      inputBus.push(btn.dataset.seed, 'zero-state-seed');
    });
  });
  // Dismiss on any node load (library path, Wikidata path, LLM path)
  graph.on('node:added', _dismissZeroState);
  // Boot ritual: show terminal handshake, then reveal explore UI
  const _bootEl = document.getElementById('zs-boot');
  const _zsBody = _zsEl?.querySelector('.zs-body');
  setTimeout(() => {
    _bootEl?.classList.add('zs-boot-out');
    _zsBody?.classList.add('zs-body-visible');
    setTimeout(() => {
      _bootEl?.remove();
      document.getElementById('zs-input')?.focus();
    }, 320);
  }, 2300);

  // Register Gemini as default LLM provider if key is set (standalone only)
  if (!EMBED_MODE) _tryRegisterGemini();

  // Embed mode: signal ready to parent, then process any queued seed
  if (EMBED_MODE) {
    signalReady();
    if (window.__kaaro_embed_seed) {
      inputBus.push(window.__kaaro_embed_seed, 'embed');
      window.__kaaro_embed_seed = null;
    }
  }

  document.getElementById('overlay-sent-btn')?.addEventListener('click', () => _applyOverlay('sentiment'));
  document.getElementById('overlay-tier-btn')?.addEventListener('click', () => _applyOverlay('tier'));
  document.getElementById('screenshot-btn')?.addEventListener('click', _takeScreenshot);

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
    showTooltip(node, rect.left + rect.width / 2, rect.top + 40);
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

  // ── Deeplink: ?lib=<doc-id> ─────────────────────────────────────────────────
  const _deeplinkId = new URLSearchParams(location.search).get('lib');
  if (_deeplinkId) {
    const _deeplinkEntry = LIBRARY.find(d => d.id === _deeplinkId);
    if (_deeplinkEntry) {
      loadLocalDoc(_deeplinkEntry.path).then(meta => {
        if (!meta) return;
        _lastLoadedDocId = meta.id;
        _currentDocMeta  = meta;
        runForceRelax(160);
        _showBrief(meta);
        _renderClusterPills(meta);
        _updateStatsStrip(meta);
        updateFnBar();
        if (meta.tour?.length) loadTour(meta.tour);
        log('SYSTEM', `deeplink loaded: ${meta.title}`);
      });
    } else {
      log('SYSTEM', `deeplink: unknown lib id "${_deeplinkId}"`);
    }
  }
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
  pushCrumb(qid, node.label, node.type);
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

onNodeClick(qid    => { clearDim(); focusEntity(qid); });
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

  // 1. Source prefix commands — deterministic, no fallback needed
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
  if (REDDIT_PREFIX_RE.test(text)) {
    const result = await sourceManager.searchSource('reddit', text);
    loadSourceResults(result);
    return;
  }

  // 2. Deterministic: Wikidata entity resolution (QID, wd:QID, or label match)
  const qids = await resolve(text);
  if (qids.length > 0) {
    console.log(`[kaaro/intent] Wikidata resolved "${text}" → [${qids.join(', ')}] — loading entities, skipping LLM`);
    log('SYSTEM', `[intent] Wikidata match: ${qids.join(', ')} — loading entities`);
    for (const qid of qids) await loadEntity(qid);
    return;
  }

  // 3. Fallback: no deterministic match — hand off to LLM exploration pipeline
  console.log(`[kaaro/intent] no Wikidata match for "${text}" — launching LLM exploration`);
  log('SYSTEM', `no wikidata match for "${text}" — launching exploration`);
  _runExploration(text);
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

// Text input surface lives in the hovering Explore UI (canvas/explore-ui.mjs),
// which pushes into inputBus directly. The legacy bottom-bar #main-input has
// been removed — the action bar now holds only chrome (source toggles, F-keys).

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
  const cam   = getCamera();
  const ctrl  = getControls();
  const nodes = [...graph.nodes.values()].map(n => ({
    qid:         n.qid,
    label:       n.label,
    type:        n.type,
    tier:        n.tier,
    sentiment:   n.sentiment,
    description: n.description,
    image:       n.image,
    metrics:     n.metrics,
    confidence:  n.confidence,
    wikidata:    n.wikidata,
    _links:      n._links,
    _enriched:   n._enriched,
    _source:     n._source,
    position:    getPosition(n.qid) ?? [0, 0, 0],
  }));
  const edges  = [...graph.edges.values()];
  const camera = { position: cam.position.toArray(), target: ctrl.target.toArray() };
  return saveSession({
    name,
    nodes, edges, camera,
    breadcrumb: getCrumbs().map(c => c.qid),
    brief:      _activeBrief   ?? null,
    patches:    _activePatches ?? null,
  });
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
      <span class="sd-name" title="${_esc(s.name)}">${_esc(s.name)}</span>
      <span class="sd-meta">
        <span class="sd-date">${new Date(s.savedAt).toLocaleDateString()}</span>
        <span class="sd-count">${s.nodes?.length ?? 0} nodes</span>
        ${s.brief ? '<span class="sd-has-brief">◆ brief</span>' : ''}
      </span>
      <button class="sd-load" data-action="load"   data-id="${_esc(s.id)}">LOAD</button>
      <button class="sd-del"  data-action="delete" data-id="${_esc(s.id)}" title="Delete">✕</button>
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
  clearNodeColorOverrides();
  _overlayMode = null;

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

  // Restore breadcrumbs
  for (const qid of (session.breadcrumb ?? [])) {
    const node = graph.getNode(qid);
    if (node) pushCrumb(qid, node.label ?? qid, node.type);
  }

  // Restore brief + report if the session has one
  if (session.brief) {
    _activeBrief      = session.brief;
    _activePatches    = session.patches ?? null;
    _lastLoadedDocId  = session.brief.meta?.id ?? null;
    _currentDocMeta   = session.brief;

    // Rebuild nodeLookup in case it wasn't persisted
    if (!_activeBrief.nodeLookup) {
      _activeBrief.nodeLookup = Object.fromEntries(
        (_activeBrief.nodes ?? []).map(n => [n.id, n])
      );
    }

    _showBrief(_activeBrief);
    _renderClusterPills(_activeBrief);
    _updateStatsStrip(_activeBrief);
  }

  updateFnBar();
  log('SYSTEM', `session restored: ${session.name} (${session.nodes?.length ?? 0} nodes${session.brief ? ', brief included' : ''})`);
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

function _renderLibrary(tagFilter = null) {
  const wrap   = document.getElementById('library-wrap');
  const drawer = document.getElementById('library-drawer');
  if (!drawer) return;

  // Collect all tags across all loaded docs (IA-02)
  const allTags = new Set();
  for (const doc of LIBRARY) {
    const meta = getDocMeta(doc.id);
    if (meta?.tags) meta.tags.forEach(t => allTags.add(t));
  }
  const tagBar = allTags.size
    ? `<div class="lib-tag-bar">
        <button class="lib-tag${!tagFilter ? ' lib-tag-active' : ''}" data-tag="">ALL</button>
        ${[...allTags].sort().map(t =>
          `<button class="lib-tag${tagFilter === t ? ' lib-tag-active' : ''}" data-tag="${_esc(t)}">${_esc(t)}</button>`
        ).join('')}
      </div>`
    : '';

  // Filter docs by tag
  const visible = LIBRARY.filter(doc => {
    if (!tagFilter) return true;
    const meta = getDocMeta(doc.id);
    return meta?.tags?.includes(tagFilter);
  });

  // Build doc list with counts from loaded docs (C-14)
  const items = visible.map(doc => {
    const meta  = getDocMeta(doc.id);
    const nc    = meta?.nodes?.length ?? '—';
    const ec    = meta ? Object.values(meta.analytics?.relTypeDist ?? {}).reduce((a, b) => a + b, 0) : '—';
    const bc    = meta?.story?.length ?? '—';
    const spine = meta?.report_card?.spine?.map(id => meta.nodeLookup?.[id]?.label ?? id).join(', ') ?? '';
    const tags  = (meta?.tags ?? doc.tags ?? []).map(t =>
      `<span class="lib-item-tag">${_esc(t)}</span>`
    ).join('');
    return `
    <div class="lib-item" data-path="${_esc(doc.path)}">
      <div class="lib-meta">
        <span class="lib-title">${_esc(doc.title)}</span>
        <div class="lib-meta-row">
          <span class="lib-domain">${_esc(doc.domain)}</span>
          <span class="lib-year">${_esc(doc.year)}</span>
          ${nc !== '—' ? `<span class="lib-counts">${nc}N · ${ec}E · ${bc}B</span>` : ''}
        </div>
        ${spine ? `<div class="lib-spine">⬡ ${_esc(spine)}</div>` : ''}
        ${tags ? `<div class="lib-item-tags">${tags}</div>` : ''}
      </div>
      <button class="lib-preview-btn">▾</button>
      <button class="lib-link-btn" title="Copy deeplink" data-id="${_esc(doc.id)}">🔗</button>
    </div>`;
  }).join('');

  // Build header area (tag bar goes in library-header if it exists)
  let headerEl = wrap?.querySelector('.lib-tag-bar-wrap');
  if (!headerEl && wrap && allTags.size) {
    headerEl = document.createElement('div');
    headerEl.className = 'lib-tag-bar-wrap';
    const header = wrap.querySelector('.library-header');
    if (header) header.insertAdjacentElement('afterend', headerEl);
  }
  if (headerEl) {
    headerEl.innerHTML = tagBar;
    headerEl.querySelectorAll('.lib-tag').forEach(btn => {
      btn.addEventListener('click', () => _renderLibrary(btn.dataset.tag || null));
    });
  }

  drawer.innerHTML = items || '<p class="sd-empty">No documents match this tag.</p>';

  drawer.querySelectorAll('.lib-item').forEach(item => {
    const path = item.dataset.path;

    // Copy deeplink button
    item.querySelector('.lib-link-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const id  = e.currentTarget.dataset.id;
      const url = `${location.origin}${location.pathname}?lib=${encodeURIComponent(id)}`;
      navigator.clipboard.writeText(url).then(() => {
        const btn = e.currentTarget;
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });

    // Preview toggle — fetches doc summary, shows inline
    item.querySelector('.lib-preview-btn')?.addEventListener('click', async () => {
      const existing = item.querySelector('.lib-preview');
      if (existing) { existing.remove(); item.classList.remove('lib-item-expanded'); return; }

      drawer.querySelectorAll('.lib-preview').forEach(p => { p.remove(); p.closest('.lib-item')?.classList.remove('lib-item-expanded'); });
      item.classList.add('lib-item-expanded');
      const pv = document.createElement('div');
      pv.className = 'lib-preview';
      pv.innerHTML = '<span class="lib-pv-loading">LOADING…</span>';
      item.appendChild(pv);

      try {
        const res = await fetch(path);
        const doc = await res.json();
        const rc  = doc.report_card ?? {};
        const nc  = doc.nodes?.length ?? 0;
        const ec  = doc.edges?.length ?? 0;
        const bc  = doc.story?.length  ?? 0;
        const stats = (rc.key_stats ?? []).slice(0, 4).map(s => {
          const label = typeof s === 'string'
            ? (s.indexOf(': ') > 0 ? s.slice(0, s.indexOf(': ')) : '')
            : (s.label ?? '');
          const value = typeof s === 'string'
            ? (s.indexOf(': ') > 0 ? s.slice(s.indexOf(': ') + 2) : s)
            : (s.value ?? '');
          return `<div class="lib-pv-stat"><span class="lib-pv-val">${_esc(value)}</span>${label ? `<span class="lib-pv-lbl">${_esc(label)}</span>` : ''}</div>`;
        }).join('');
        const protas = (rc.protagonists ?? []).map(id => {
          const n = (doc.nodes ?? []).find(n => n.id === id);
          return `<span class="lib-pv-actor lib-pv-pro">${_esc(n?.label ?? id)}</span>`;
        }).join('');
        const antags = (rc.antagonists ?? []).map(id => {
          const n = (doc.nodes ?? []).find(n => n.id === id);
          return `<span class="lib-pv-actor lib-pv-ant">${_esc(n?.label ?? id)}</span>`;
        }).join('');

        pv.innerHTML = `
          <p class="lib-pv-summary">${_esc(rc.summary ?? '')}</p>
          ${stats ? `<div class="lib-pv-stats">${stats}</div>` : ''}
          <div class="lib-pv-counts">${nc} entities · ${ec} relations · ${bc} beats</div>
          ${protas || antags ? `<div class="lib-pv-actors">${protas}${antags}</div>` : ''}
          <button class="lib-pv-load">▶ LOAD GRAPH</button>`;

        pv.querySelector('.lib-pv-load')?.addEventListener('click', async () => {
          pv.querySelector('.lib-pv-load').textContent = 'LOADING…';
          const meta = await loadLocalDoc(path);
          if (meta) {
            _lastLoadedDocId = meta.id;
            _currentDocMeta  = meta;
            runForceRelax(160);
            toggleLibrary(false);
            _showBrief(meta);
            _renderClusterPills(meta);
            _updateStatsStrip(meta);
            updateFnBar();
            if (meta.tour?.length) loadTour(meta.tour);
            history.replaceState(null, '', `?lib=${encodeURIComponent(meta.id)}`);
            log('SYSTEM', `loaded: ${meta.title}`);
          }
        });
      } catch {
        pv.innerHTML = '<span class="lib-pv-loading">LOAD FAILED</span>';
      }
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

// ── Cluster pills overlay (C-03 / IA-06) ──────────────────────────────────────

let _currentDocMeta = null;

function _focusCluster(cl) {
  if (!cl) return;
  const nodeIds = cl.nodes ?? [];
  clearDim();
  dimAllExcept(nodeIds);
  const meshes = nodeIds.map(q => getNodeMesh(q)).filter(Boolean);
  if (meshes.length) frameNodes(meshes);
  const first = nodeIds.find(q => graph.hasNode(q));
  if (first) focusEntity(first);
  // Scroll report panel to cluster section if report is visible
  if (isReportVisible()) scrollToCluster(cl.id);
}

function _renderClusterPills(meta) {
  const el = document.getElementById('cluster-pills');
  if (!el) return;
  const clusters = meta?.clusters ?? [];
  if (!clusters.length) { el.classList.add('hidden'); return; }

  el.innerHTML = clusters.map((cl, i) => `
    <button class="cl-pill" data-cluster-idx="${i}" title="${_esc(cl.description ?? cl.label)}"
            style="--cl-col:${_esc(cl.color ?? '#666')}">
      <span class="cl-pill-dot"></span>
      <span class="cl-pill-lbl">${_esc(cl.label)}</span>
      <span class="cl-pill-key">${i + 1}</span>
    </button>`
  ).join('');

  el.querySelectorAll('.cl-pill').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.clusterIdx, 10);
      const cl  = clusters[idx];
      if (!cl) return;
      const active = btn.classList.contains('cl-pill-active');
      el.querySelectorAll('.cl-pill').forEach(b => b.classList.remove('cl-pill-active'));
      if (active) { clearDim(); return; }
      btn.classList.add('cl-pill-active');
      _focusCluster(cl);
    });
  });

  el.classList.remove('hidden');
}

// ── Key stats strip (C-12) ────────────────────────────────────────────────────

function _updateStatsStrip(meta) {
  const el = document.getElementById('stats-strip');
  if (!el) return;
  const stats = meta?.report_card?.key_stats ?? [];
  if (!stats.length) { el.classList.add('hidden'); return; }
  el.innerHTML = `
    <span class="ss-title">${_esc(meta.title ?? '')}</span>
    <span class="ss-sep">·</span>
    ${stats.slice(0, 7).map(s => {
      const label = typeof s === 'string'
        ? (s.indexOf(': ') > 0 ? s.slice(0, s.indexOf(': ')) : '')
        : (s.label ?? '');
      const value = typeof s === 'string'
        ? (s.indexOf(': ') > 0 ? s.slice(s.indexOf(': ') + 2) : s)
        : (s.value ?? '');
      return `<span class="ss-stat"><span class="ss-val">${_esc(value)}</span>${label ? `<span class="ss-lbl">${_esc(label)}</span>` : ''}</span>`;
    }).join('<span class="ss-sep">·</span>')}
  `;
  el.classList.remove('hidden');
}

// ── Sentiment / tier overlay (C-06) ───────────────────────────────────────────

let _overlayMode = null; // null | 'sentiment' | 'tier'

const OVERLAY_SENT = { positive: 0x00ff88, negative: 0xff2244, contested: 0xffaa00, neutral: 0x334433 };
const OVERLAY_TIER = { spine: 0xffffff, primary: 0xff6600, secondary: 0x667755, anchor: 0x334433 };

function _applyOverlay(mode) {
  if (_overlayMode === mode) {
    clearNodeColorOverrides();
    _overlayMode = null;
    _updateOverlayBtns();
    return;
  }
  clearNodeColorOverrides();
  _overlayMode = mode;
  const colorMap = mode === 'sentiment' ? OVERLAY_SENT : OVERLAY_TIER;
  for (const [qid] of graph.nodes) {
    const node = graph.getNode(qid);
    if (!node) continue;
    const key   = mode === 'sentiment' ? (node.sentiment ?? 'neutral') : (node.tier ?? 'primary');
    const color = colorMap[key] ?? 0x334433;
    setNodeColorOverride(qid, color);
  }
  _updateOverlayBtns();
}

function _updateOverlayBtns() {
  const sentBtn = document.getElementById('overlay-sent-btn');
  const tierBtn = document.getElementById('overlay-tier-btn');
  sentBtn?.classList.toggle('overlay-active', _overlayMode === 'sentiment');
  tierBtn?.classList.toggle('overlay-active', _overlayMode === 'tier');
  sentBtn?.setAttribute('aria-pressed', String(_overlayMode === 'sentiment'));
  tierBtn?.setAttribute('aria-pressed', String(_overlayMode === 'tier'));
}

// ── Screenshot export (C-10) ─────────────────────────────────────────────────

function _takeScreenshot() {
  const r = getRenderer();
  if (!r) return;
  r.render(getScene(), getCamera());
  const url = r.domElement.toDataURL('image/png');
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `kaaroViewer-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

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

window.kaaro = { load: loadEntity, focus: focusEntity, expand: expandEntity, loadDoc: loadLocalDoc, graph, inputBus, sourceManager, loadSourceResults, explore: _runExploration, rethink: _runRethink };

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
      <span class="fnk"><em>F1</em> Voice</span>
      <span class="fnk"><em>F2</em> Save</span>
      <span class="fnk"><em>L</em> Library</span>
      <span class="fnk"><em>F6</em> Tour</span>
      <span class="fnk"><em>F7</em> Causal</span>
      <span class="fnk"><em>F9</em> Brief</span>
      <span class="fnk"><em>P</em> Paint</span>
      <span class="fnk ${isCameraLocked() ? 'fnk-active' : ''}"><em>C</em> ${isCameraLocked() ? '◎ CAM LOCKED' : '○ Cam'}</span>
      <span class="fnk"><em>F10</em> 📷</span>
      <span class="fnk"><em>F11</em> 📦</span>
      <span class="fnk fnk-right"><em>◎</em> Log</span>`;
  } else {
    const label = graph.getNode(qid)?.label ?? qid;
    bar.innerHTML = `
      <span class="fnk fnk-ctx"><em>E</em> Expand</span>
      <span class="fnk fnk-ctx"><em>I</em> Enrich</span>
      <span class="fnk fnk-ctx"><em>N</em> Next neighbor</span>
      <span class="fnk fnk-ctx"><em>F</em> Ego-graph</span>
      <span class="fnk fnk-ctx"><em>R</em> Refetch</span>
      <span class="fnk fnk-ctx"><em>F7</em> ${isCausalMode() ? 'Force' : 'Causal'}</span>
      <span class="fnk fnk-ctx"><em>F9</em> Brief</span>
      <span class="fnk fnk-ctx"><em>P</em> Paint</span>
      <span class="fnk fnk-ctx ${isCameraLocked() ? 'fnk-active' : ''}"><em>C</em> ${isCameraLocked() ? '◎ CAM LOCKED' : '○ Cam'}</span>
      <span class="fnk fnk-ctx"><em>Esc</em> Deselect</span>
      <span class="fnk fnk-right fnk-selected">◉ ${_esc(label.toUpperCase())}</span>`;
  }
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Global keybindings (always active)
  switch (e.key) {
    case 'F1':  e.preventDefault(); voiceBtn?.click();          return;
    case 'F2':  e.preventDefault(); document.getElementById('save-btn')?.click(); return;
    case 'F6':  e.preventDefault(); toggleNarrative();          updateFnBar(); return;
    case 'F7':  e.preventDefault(); toggleCausalLayout();       updateFnBar(); return;
    case 'F8':  e.preventDefault(); toggleSessionsDrawer();     return;
    case 'F9':  e.preventDefault(); toggleReportMode();         return;
    case 'F10': e.preventDefault(); exportCanvasPNG();          return;
    case 'F11': e.preventDefault(); exportAssets();             return;
    case 'l': case 'L': e.preventDefault(); toggleLibrary();    return;
    case 'p': case 'P':
      e.preventDefault();
      if (e.shiftKey) { _cycleStrategy(); return; }
      _triggerGlobalPaint();
      return;
    case 'c': case 'C':
      e.preventDefault();
      _toggleCameraLock();
      return;
  }

  // Cluster shortcuts: digits 1–6
  if (/^[1-6]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const idx = parseInt(e.key, 10) - 1;
    const cl  = _currentDocMeta?.clusters?.[idx];
    if (cl) {
      e.preventDefault();
      const pill = document.querySelector(`.cl-pill[data-cluster-idx="${idx}"]`);
      const active = pill?.classList.contains('cl-pill-active');
      document.querySelectorAll('.cl-pill').forEach(b => b.classList.remove('cl-pill-active'));
      if (active) { clearDim(); return; }
      pill?.classList.add('cl-pill-active');
      _focusCluster(cl);
    }
    return;
  }

  // Narrative arrow keys
  if (isNarrativeActive()) {
    if (e.key === 'ArrowRight') { e.preventDefault(); narrativeNext(); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); narrativePrev(); return; }
    if (e.key === 'Escape')     { e.preventDefault(); stopNarrative(); updateFnBar(); return; }
    if (e.key === ' ')          { e.preventDefault(); toggleNarrative(); return; }
  }

  // Slides arrow keys — consume left/right when slides panel is open
  if (isSlidesVisible()) {
    if (e.key === 'ArrowRight') { e.preventDefault(); nextSlide(); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prevSlide(); return; }
    if (e.key === 'Escape')     {
      e.preventDefault();
      hideSlides();
      document.dispatchEvent(new CustomEvent('slides:closed'));
      return;
    }
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
    case 'f': case 'F':
      e.preventDefault();
      frameNeighbors(qid);
      dimAllExcept([qid, ...graph.getNeighborQids(qid)]);
      break;
    case 's': case 'S': e.preventDefault(); _applyOverlay('sentiment'); break;
    case 't': case 'T': e.preventDefault(); _applyOverlay('tier');      break;
    case 'r': case 'R': e.preventDefault(); refetchEntity(qid);         break;
    case 'x': case 'X': e.preventDefault(); setNodeState(qid, 'pinned'); break;
    case 'Escape':
      clearDim();
      clearNodeColorOverrides();
      _overlayMode = null;
      _updateOverlayBtns();
      document.querySelectorAll('.cl-pill').forEach(b => b.classList.remove('cl-pill-active'));
      hideDetail();
      setNodeState(qid, _expanded.has(qid) ? 'expanded' : 'visited');
      updateFnBar();
      break;
  }
});

// ── Brief mode — slides (default) or reader ──────────────────────────────────

// Track the last loaded doc so F9 can render it
let _lastLoadedDocId = null;

// Persisted UI preference: 'slides' | 'reader' — slides is the default format.
let _briefMode = (sessionStorage.getItem('kv.briefMode') === 'reader') ? 'reader' : 'slides';

function _setBriefMode(mode) {
  _briefMode = (mode === 'reader') ? 'reader' : 'slides';
  try { sessionStorage.setItem('kv.briefMode', _briefMode); } catch {}
}

function _isBriefVisible() {
  return isSlidesVisible() || isReportVisible();
}

function _hideBrief() {
  hideSlides();
  hideReport();
}

async function _showBrief(meta) {
  if (_briefMode === 'reader') {
    hideSlides();
    renderReport(meta);
    showReport();
  } else {
    hideReport();
    renderSlides(meta);
    showSlides();
    // Reload any previously-painted scenes from localStorage
    const docId    = _lastLoadedDocId ?? meta?.id ?? meta?.meta?.id;
    const restored = await rehydrateSlides(docId, getCamera());
    for (const idx of restored) {
      notifySceneResult(idx, 'done', undefined, { restored: true });
    }
  }
}

function toggleReportMode() {
  const reportBtn = document.getElementById('report-btn');
  if (_isBriefVisible()) {
    _hideBrief();
    reportBtn?.setAttribute('aria-expanded', 'false');
    log('SYSTEM', 'brief OFF');
  } else {
    const docId = _lastLoadedDocId;
    const meta  = docId ? getDocMeta(docId) : null;
    if (!meta) {
      log('SYSTEM', 'no doc loaded — press L to open the library');
      return;
    }
    _showBrief(meta);
    reportBtn?.setAttribute('aria-expanded', 'true');
    log('SYSTEM', `${_briefMode}: ${meta.title}`);
  }
  updateFnBar();
}

// Switch between slides ↔ reader without closing the brief
document.addEventListener('slides:mode', e => {
  const requested = e.detail?.mode === 'reader' ? 'reader' : 'slides';
  const docId = _lastLoadedDocId;
  const meta  = docId ? getDocMeta(docId) : null;
  if (!meta) return;
  _setBriefMode(requested);
  _showBrief(meta);
  log('SYSTEM', `brief mode → ${requested}`);
});

// Reader → slides (or close) via the reader's sticky toggle bar
document.addEventListener('report:mode', e => {
  const mode = e.detail?.mode;
  if (mode === 'close') {
    _hideBrief();
    updateFnBar();
    log('SYSTEM', 'brief OFF');
    return;
  }
  const docId = _lastLoadedDocId;
  const meta  = docId ? getDocMeta(docId) : null;
  if (!meta) return;
  _setBriefMode('slides');
  _showBrief(meta);
  log('SYSTEM', 'brief mode → slides');
});

// Slides closed via the ✕ button → refresh fn-bar + log a hint so the user
// knows how to reopen
document.addEventListener('slides:closed', () => {
  clearDim();
  clearAllSlides();
  updateFnBar();
  log('SYSTEM', 'brief closed — F9 to reopen');
});

// Slides active-slide changed → frame the slide's node set (without closing slides)
document.addEventListener('slides:frame', e => {
  const { nodeIds, slideIdx } = e.detail ?? {};
  clearDim();
  if (!nodeIds?.length) return;
  dimAllExcept(nodeIds);
  const meshes = nodeIds.map(q => getNodeMesh(q)).filter(Boolean);
  if (meshes.length) {
    const fromDir = slideIdx != null ? getCanonicalCamera(slideIdx).pos.clone().normalize() : null;
    frameNodes(meshes, fromDir);
  }
});

// Entity pill clicked inside a slide → focus the entity in canvas but keep
// slides open so narrative context stays on screen.
document.addEventListener('slides:navigate', e => {
  const { qid } = e.detail ?? {};
  if (!qid) return;
  focusEntity(qid);
});

// ── Paint pipeline ────────────────────────────────────────────────────────────

const GLOBAL_PAINT_SLIDE_IDX = 999; // synthetic slot for view-based global paint

/**
 * Assemble PaintContext from live state: slide (if any), camera, frustum, selection.
 * If slideIdx is provided, slide data (central + frameNodes) is pulled from the slide;
 * otherwise only view and selection context are populated.
 */
function _assembleLiveContext(slideIdx = null) {
  const slide       = slideIdx != null ? getActiveSlide() : null;
  const slideNodes  = (slide?.frameNodes ?? []).map(id => graph.getNode(id)).filter(Boolean);
  const slideCentral = slideNodes[0] ?? null;

  const selectedQid  = getCurrentQid();
  const selectedNode = selectedQid ? graph.getNode(selectedQid) : null;

  const visibleQids  = getVisibleNodeQids(getAllMeshes());
  const visibleNodes = visibleQids.map(q => graph.getNode(q)).filter(Boolean);

  return assemblePaintContext({
    slideIdx,
    slideType:    slide?.type ?? null,
    slideCentral,
    slideNodes,
    camera:       getCamera(),
    visibleNodes,
    selectedNode,
  });
}

/**
 * Core paint execution: build enriched prompt → call generateScene → notify UI.
 * Used by both the slide paint button and the global P-key/HUD trigger.
 *
 * @param {number}  slideIdx         slide index (GLOBAL_PAINT_SLIDE_IDX for global paint)
 * @param {object}  centralNode      entity to center the image on
 * @param {object[]} frameNodes      entities to include in scene context
 * @param {object}  [canonicalOverride]  { pos, target } — use live camera instead of spiral
 */
async function _executePaint(slideIdx, centralNode, frameNodes, canonicalOverride = null) {
  const apiKey = getImageKey();
  if (!apiKey) {
    if (slideIdx !== GLOBAL_PAINT_SLIDE_IDX) {
      notifySceneResult(slideIdx, 'error', 'No image key — add one in ⚙ MODEL SETTINGS → Scene Painter');
    }
    log('SYSTEM', '[paint] no image key');
    return;
  }

  // When camera is locked: capture the live camera position NOW as the canonical
  // projection origin so the texture maps correctly to the current view.
  // animateCameraTo calls below are already no-ops when locked, but we still need
  // the override so the sphere shader projects from the right angle.
  const locked = isCameraLocked();
  const effectiveCanonical = canonicalOverride ?? (locked
    ? { pos: getCamera().position.clone(), target: getControls().target.clone() }
    : null);

  const ctx      = _assembleLiveContext(slideIdx !== GLOBAL_PAINT_SLIDE_IDX ? slideIdx : null);
  const strategy = getActiveStrategy();
  const prompt   = buildStrategyPrompt(ctx);

  log('SYSTEM', `[paint] strategy=${strategy} slide=${slideIdx} locked=${locked}`, {
    hero:    ctx.selectedNode?.label ?? ctx.slideCentral?.label,
    visible: ctx.visibleNodes.length,
    angle:   ctx.cameraAngle?.phrase,
  });

  // Fly to canonical before generation (skipped when locked or global)
  if (!effectiveCanonical) {
    const canon = getCanonicalCamera(slideIdx);
    animateCameraTo(canon.pos, canon.target, 700);
  }

  try {
    const result = await generateScene(
      centralNode, frameNodes, apiKey, getCamera(),
      slideIdx, _lastLoadedDocId,
      { prompt, strategy, canonicalOverride: effectiveCanonical },
    );
    if (slideIdx !== GLOBAL_PAINT_SLIDE_IDX) {
      notifySceneResult(slideIdx, 'done', undefined, result);
    }
    // Re-fly after generation (skipped when locked or global)
    if (!effectiveCanonical) {
      animateCameraTo(result.cameraPos, result.cameraTarget, 600);
    }
    _updatePaintHUD();
  } catch (err) {
    log('ERROR', `[paint] ${err.message}`);
    if (slideIdx !== GLOBAL_PAINT_SLIDE_IDX) {
      notifySceneResult(slideIdx, 'error', err.message);
    }
  }
}

/**
 * Global paint — triggered by P key or HUD button.
 * When slides are visible: paints the active slide with enriched context.
 * When slides are hidden: uses live camera position as the canonical and
 * synthesises hero/frame from current selection + visible nodes.
 */
async function _triggerGlobalPaint() {
  if (isSlidesVisible()) {
    // Use active slide's slot but enrich with live view + selection
    const slideIdx = getActiveSlideIdx();
    const slide    = getActiveSlide();
    if (!slide?.frameNodes?.length) {
      log('SYSTEM', '[paint] active slide has no paintable nodes');
      return;
    }
    const centralNode = graph.getNode(slide.frameNodes[0]);
    const frameNodes  = slide.frameNodes.map(id => graph.getNode(id)).filter(Boolean);
    await _executePaint(slideIdx, centralNode, frameNodes);
  } else {
    // Pure graph exploration — paint from live view
    const selectedQid  = getCurrentQid();
    const selectedNode = selectedQid ? graph.getNode(selectedQid) : null;
    const visibleQids  = getVisibleNodeQids(getAllMeshes());
    const visibleNodes = visibleQids.map(q => graph.getNode(q)).filter(Boolean);

    const centralNode  = selectedNode ?? visibleNodes[0] ?? null;
    if (!centralNode) { log('SYSTEM', '[paint] nothing in view to paint'); return; }

    const cam = getCamera();
    const ctrl = getControls();
    const canonicalOverride = {
      pos:    cam.position.clone(),
      target: ctrl.target.clone(),
    };

    await _executePaint(GLOBAL_PAINT_SLIDE_IDX, centralNode, visibleNodes, canonicalOverride);
  }
}

// Slide paint button → uses enriched pipeline
document.addEventListener('slides:paint-scene', async e => {
  const { slideIdx, centralNodeId, frameNodeIds } = e.detail ?? {};
  if (slideIdx == null || !centralNodeId) return;

  const central    = graph.getNode(centralNodeId);
  const frameNodes = (frameNodeIds ?? []).map(id => graph.getNode(id)).filter(Boolean);
  await _executePaint(slideIdx, central, frameNodes);
});

// ── Paint HUD button + P key ──────────────────────────────────────────────────

function _updatePaintHUD() {
  const paintBtn = document.getElementById('paint-hud-btn');
  const camBtn   = document.getElementById('cam-lock-btn');
  if (paintBtn) {
    const strategy = getActiveStrategy();
    paintBtn.textContent = `◆ PAINT [${strategy}]`;
    paintBtn.title = `Paint scene (P) — Shift+P to cycle strategy. Active: ${strategy}`;
  }
  if (camBtn) {
    const locked = isCameraLocked();
    camBtn.textContent = locked ? '◎ CAM' : '○ CAM';
    camBtn.setAttribute('aria-pressed', String(locked));
    camBtn.title = locked
      ? 'Camera locked — auto-movement disabled. C to unlock.'
      : 'Camera free — auto-movement enabled. C to lock.';
  }
}

function _toggleCameraLock() {
  setCameraLock(!isCameraLocked());
  _updatePaintHUD();
  updateFnBar();
  log('SYSTEM', `[camera] ${isCameraLocked() ? 'locked' : 'unlocked'}`);
}

function _cycleStrategy() {
  const all = listStrategies();
  const cur = getActiveStrategy();
  const next = all[(all.indexOf(cur) + 1) % all.length];
  setActiveStrategy(next);
  _updatePaintHUD();
  log('SYSTEM', `[paint] strategy → ${next}`);
}

// Wire HUD button: click = paint, shift-click = cycle strategy
document.getElementById('paint-hud-btn')?.addEventListener('click', e => {
  if (e.shiftKey) { _cycleStrategy(); return; }
  _triggerGlobalPaint();
});

document.getElementById('cam-lock-btn')?.addEventListener('click', _toggleCameraLock);

// Initialize button labels on load
_updatePaintHUD();

// Restore a previously-painted scene when navigating back to its slide
document.addEventListener('slides:restore-scene', e => {
  const { slideIdx } = e.detail ?? {};
  if (slideIdx == null) return;
  restoreScene(slideIdx);
  const canon = getCanonicalCamera(slideIdx);
  animateCameraTo(canon.pos, canon.target, 800);
});

// Cross-document navigation from detail panel (IA-01)
document.addEventListener('detail:navigate-doc', e => {
  const { docId } = e.detail ?? {};
  if (!docId) return;
  const meta = getDocMeta(docId);
  if (!meta) { log('SYSTEM', `doc ${docId} not yet loaded`); return; }
  _lastLoadedDocId = docId;
  _showBrief(meta);
  updateFnBar();
  log('SYSTEM', `cross-doc: switched to ${meta.title}`);
});

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

// Frame all nodes in a cluster — dim non-members so the cluster reads clearly
document.addEventListener('report:cluster-focus', e => {
  const { nodeIds } = e.detail ?? {};
  if (!nodeIds?.length) return;
  hideReport();
  updateFnBar();
  clearDim();
  dimAllExcept(nodeIds);
  const meshes = nodeIds.map(q => getNodeMesh(q)).filter(Boolean);
  if (meshes.length) frameNodes(meshes);
  const firstLoaded = nodeIds.find(q => graph.hasNode(q));
  if (firstLoaded) focusEntity(firstLoaded);
});

// Focus an insight node + highlight all evidence nodes simultaneously
document.addEventListener('report:insight-focus', e => {
  const { qid, highlightSet } = e.detail ?? {};
  if (!qid) return;
  hideReport();
  updateFnBar();
  clearDim();
  const all = [qid, ...(highlightSet ?? [])].filter(Boolean);
  dimAllExcept(all);
  const meshes = all.map(q => getNodeMesh(q)).filter(Boolean);
  if (meshes.length) frameNodes(meshes);
  focusEntity(qid);
});

// Live enrichment patch — apply Stage 3 adapter results to graph nodes as they arrive.
// Fires while _runExploration is mid-enrichment; canvas is already populated by Stage 1.
document.addEventListener('explore:node-update', e => {
  const { nodeId, patch, deltaType } = e.detail ?? {};
  if (!nodeId || !patch) return;

  const node = graph.getNode(nodeId);
  if (!node) return;

  // Merge enriched data into the live node
  node.metrics = { ...(node.metrics ?? {}), ...patch.metrics };
  if (patch.summary && (!node.description || node.description.length < 30)) {
    node.description = patch.summary.slice(0, 400);
  }
  if (!node.image && patch.thumbnail) node.image = patch.thumbnail;
  if (patch.links?.length) node._links = [...new Set([...(node._links ?? []), ...patch.links])];
  node._enriched = true;

  // If this node is open in the detail panel, refresh it with the new data
  if (getCurrentQid() === nodeId) {
    showDetail(node, graph.getEdgesFor(nodeId), q => graph.getNode(q));
  }

  log('ENRICHER', `[canvas] node-update: ${nodeId} (${deltaType})`);
});

// Fly camera to a story beat's node set — dim all non-beat nodes
document.addEventListener('report:beat-frame', e => {
  const { nodeIds } = e.detail ?? {};
  if (!nodeIds?.length) return;
  hideReport();
  updateFnBar();
  clearDim();
  dimAllExcept(nodeIds);
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

// ── Asset export (F11) ────────────────────────────────────────────────────────
// Bundles JSON + per-slide canvas PNGs + backdrop images into a ZIP for ffmpeg.

async function exportAssets() {
  if (!_currentDocMeta) { log('SYSTEM', 'no brief loaded — open a library doc first'); return; }

  const docId    = _currentDocMeta.id;
  const docTitle = _currentDocMeta.title ?? docId;
  log('SYSTEM', `asset export started for "${docTitle}"`);

  // Lazy-load JSZip from CDN
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip = new JSZip();

  // ── manifest.json ────────────────────────────────────────────────────────
  const slideCount = getSlideCount();
  const slideIds   = getSlideIds();
  zip.file('manifest.json', JSON.stringify({
    docId,
    title:      docTitle,
    exportedAt: new Date().toISOString(),
    nodes:      graph.nodes.size,
    edges:      graph.edges.size,
    slideCount,
    slideIds,
    ffmpegHint: `ffmpeg -framerate 1/4 -pattern_type glob -i 'slide_*_canvas.png' -c:v libx264 -pix_fmt yuv420p out.mp4`,
  }, null, 2));

  // ── doc.json ──────────────────────────────────────────────────────────────
  const libEntry = LIBRARY.find(l => l.id === docId);
  if (libEntry?.path) {
    try {
      const raw = await fetch(libEntry.path).then(r => r.text());
      zip.file('doc.json', raw);
    } catch (err) {
      log('SYSTEM', `asset export: doc.json fetch failed — ${err.message}`);
    }
  }

  // ── canvas_overview.png ──────────────────────────────────────────────────
  const renderer = getRenderer();
  const cam      = getCamera();
  const scene    = getScene();
  const threeCanvas = document.querySelector('.canvas-wrap canvas');
  if (threeCanvas) {
    if (renderer) renderer.render(scene, cam);
    zip.file('canvas_overview.png', threeCanvas.toDataURL('image/png').split(',')[1], { base64: true });
  }

  // ── Per-slide canvas renders ──────────────────────────────────────────────
  const savedPos    = cam.position.clone();
  const savedTarget = getControls().target.clone();

  if (renderer && cam && scene && slideCount > 0) {
    for (let i = 0; i < slideCount; i++) {
      const { pos, target } = getCanonicalCamera(i);
      cam.position.copy(pos);
      cam.lookAt(target);
      renderer.render(scene, cam);
      const dataURL = renderer.domElement.toDataURL('image/png');
      zip.file(`slide_${String(i).padStart(2,'0')}_canvas.png`, dataURL.split(',')[1], { base64: true });
    }
    // restore camera
    cam.position.copy(savedPos);
    cam.lookAt(savedTarget);
    getControls().target.copy(savedTarget);
    renderer.render(scene, cam);
  }

  // ── Backdrop images from IDB ──────────────────────────────────────────────
  const backdrops = await getAllBackdrops(docId);
  for (const { slideIdx, dataURL } of backdrops) {
    const base64 = dataURL.includes(',') ? dataURL.split(',')[1] : dataURL;
    zip.file(`slide_${String(slideIdx).padStart(2,'0')}_backdrop.png`, base64, { base64: true });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const blob    = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  link.href     = url;
  link.download = `kaaroViewer-export-${docId}-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  URL.revokeObjectURL(url);

  log('SYSTEM', `asset export complete — ${slideCount} slides, ${backdrops.length} backdrops`);
}

// ── Seed ──────────────────────────────────────────────────────────────────────
// Auto-seed disabled — canvas starts empty. Use the explore input or press L to load from library.
// requestAnimationFrame(() => setTimeout(() => loadEntity('Q668'), 300));

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Exploration pipeline ──────────────────────────────────────────────────────

let _activeBrief       = null; // current working brief
let _activePatches     = null; // current enrichment patches

/**
 * Register Gemini as the LLM provider if gemini_api_key is in localStorage.
 * Users can also call window.kaaro.registerLLM(fn) to inject a custom provider.
 */
function _tryRegisterGemini() {
  const key = localStorage.getItem('gemini_api_key');
  if (key) {
    // explore.mjs's built-in fallback covers this — just log confirmation
    log('SYSTEM', '[explore] Gemini API key found in localStorage — LLM ready');
  } else {
    log('SYSTEM', '[explore] No gemini_api_key in localStorage. Set it to enable AI exploration. window.kaaro.registerLLM(fn) for custom provider.');
  }
}

/**
 * Load a completed working brief into the canvas + report panel.
 */
async function _loadBriefIntoCanvas(brief) {
  // Clear existing graph
  clearAllNodes();
  clearAllEdges();
  graph.clear();
  clearCrumbs();
  clearLayout();
  clearNodeColorOverrides();
  _overlayMode = null;

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
    focusEntity(firstSpine);
  }

  log('SYSTEM', `[explore] canvas loaded: ${brief.nodes?.length ?? 0} nodes, ${brief.edges?.length ?? 0} edges`);
}

// ── Canvas loader helpers ─────────────────────────────────────────────────────

const _clEl       = () => document.getElementById('canvas-loader');
const _clLabelEl  = () => document.getElementById('cl-label');
const _clProgEl   = () => document.getElementById('cl-progress');
const _clSeedEl   = () => document.getElementById('cl-seed-echo');

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

/**
 * Full exploration pipeline: Stage 1 → canvas → Stage 3 (streaming) → Stage 4 → re-render.
 * Canvas is loaded after Stage 1 so streaming node-update events from Stage 3 land on
 * actual nodes rather than firing into an empty graph.
 */
async function _runExploration(seed) {
  log('SYSTEM', `[explore] starting full pipeline for: "${seed}"`);
  _showLoader(seed, 'generating brief…', 5);

  try {
    // Stage 1: LLM brief generation
    const brief = await explore(seed);
    _activeBrief = brief;
    _updateLoader('building graph…', 55);

    // Load canvas immediately — Stage 3 streaming updates need nodes to be present
    await _loadBriefIntoCanvas(brief);
    _lastLoadedDocId = brief.meta.id;
    _currentDocMeta  = brief;
    _showBrief(brief);
    _renderClusterPills(brief);
    _updateStatsStrip(brief);
    updateFnBar();
    _updateLoader('enriching entities…', 72);

    // Stage 3: Enrichment coordinator — streams explore:node-update to canvas
    const enrichReport = await runEnrichment(brief, {
      concurrency:    3,
      stream:         true,
      priorityFilter: null,
    });
    _activePatches = enrichReport.patches;
    _updateLoader('finishing…', 90);

    // Stage 4: Completion pass — fill narrative gaps
    await runCompletion(brief, enrichReport.patches);

    // Re-render brief with enriched node data (metrics, descriptions may have changed)
    _showBrief(brief);
    _renderClusterPills(brief);
    _updateStatsStrip(brief);

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
async function _runExpand(deltas) {
  if (!_activeBrief) { log('SYSTEM', '[explore] no active brief for EXPAND'); return; }
  log('SYSTEM', '[explore] EXPAND triggered', { deltas: deltas?.length ?? 0 });

  const enrichReport = await runEnrichment(_activeBrief, { concurrency: 3, stream: true });
  _activePatches = enrichReport.patches;
  await runCompletion(_activeBrief, enrichReport.patches);
  await _loadBriefIntoCanvas(_activeBrief);

  _showBrief(_activeBrief);
  _renderClusterPills(_activeBrief);
  _updateStatsStrip(_activeBrief);
}

/**
 * RETHINK: re-generate brief with enrichment context, then re-run pipeline.
 */
async function _runRethink(deltas) {
  if (!_activeBrief) { log('SYSTEM', '[explore] no active brief for RETHINK'); return; }
  log('SYSTEM', '[explore] RETHINK triggered');

  try {
    const revised = await rethink(_activeBrief, _activePatches ?? {});
    _activeBrief = revised;

    const enrichReport = await runEnrichment(revised, { concurrency: 3, stream: true });
    _activePatches = enrichReport.patches;
    await runCompletion(revised, enrichReport.patches);
    await _loadBriefIntoCanvas(revised);

    _lastLoadedDocId = revised.meta.id;
    _currentDocMeta  = revised;
    _showBrief(revised);
    _renderClusterPills(revised);
    _updateStatsStrip(revised);
    updateFnBar();
  } catch (err) {
    log('ERROR', `[explore] RETHINK failed: ${err.message}`);
  }
}

// Expose on window.kaaro for console access
Object.assign(window.kaaro, {
  explore:         _runExploration,
  rethink:         _runRethink,
  expand:          _runExpand,
  registerLLM,
  registerLLMDisambiguate,
  validateBrief,
  getActiveBrief:  () => _activeBrief,
  getPatches:      () => _activePatches,
});
