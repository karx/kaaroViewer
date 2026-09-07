/**
 * canvas/session-manager.mjs — Session drawer logic extracted from main.mjs.
 *
 * Public API:
 *   initSessionManager()          — wire save-btn + sessions-btn listeners (call once at startup)
 *   toggleSessionsDrawer(force?)  — force=true open, force=false close, undefined=toggle
 */

import { log }                             from '../logger.mjs';
import { saveSession, listSessions, loadSession, deleteSession } from '../pipeline/sessions.mjs';
import { getActiveBrief, getActivePatches, setActiveBrief, setActivePatches,
         setLastLoadedDocId, setCurrentDocMeta }                 from './app-state.mjs';
import { graph }                           from '../pipeline/graph.mjs';
import { getCamera, getControls }          from './scene.mjs';
import { clearAllNodes, clearNodeColorOverrides }                from './nodes.mjs';
import { clearAllEdges }                   from './edges.mjs';
import { getPosition, setPosition, clearLayout }                 from './layout.mjs';
import { clearCrumbs, pushCrumb, getCrumbs }                    from './breadcrumb.mjs';

// ── Escape helper ─────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Callbacks injected by initSessionManager ──────────────────────────────────
// These allow the extracted module to invoke main.mjs-private presentation logic
// without creating a circular dependency. They are no-ops until wired.

let _onRestoreComplete = () => {};

// ── Drawer state ──────────────────────────────────────────────────────────────

let _drawerOpen = false;

// ── Private helpers ───────────────────────────────────────────────────────────

async function _snapshotSession(name) {
  const cam  = getCamera();
  const ctrl = getControls();
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
  const camera = {
    position: cam.position.toArray ? cam.position.toArray() : [0, 0, 0],
    target:   ctrl.target.toArray  ? ctrl.target.toArray()  : [0, 0, 0],
  };
  return saveSession({
    name,
    nodes, edges, camera,
    breadcrumb: (getCrumbs?.() ?? []).map(c => c.qid),
    brief:      getActiveBrief()   ?? null,
    patches:    getActivePatches() ?? null,
  });
}

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

  for (const n of session.nodes ?? []) {
    setPosition(n.qid, n.position ?? [0, 0, 0]);
    graph.addNode(n.qid, { ...n, _state: 'visited' });
  }
  for (const e of session.edges ?? []) {
    graph.addEdge(e.from, e.to, e.pid, e.relLabel);
  }

  const cam  = getCamera();
  const ctrl = getControls();
  if (session.camera) {
    if (cam.position.fromArray) cam.position.fromArray(session.camera.position);
    if (ctrl.target.fromArray)  ctrl.target.fromArray(session.camera.target);
    if (ctrl.update)            ctrl.update();
  }

  // Restore breadcrumbs
  for (const qid of (session.breadcrumb ?? [])) {
    const node = graph.getNode(qid);
    if (node) pushCrumb(qid, node.label ?? qid, node.type);
  }

  // Restore brief + patches into app-state
  if (session.brief) {
    const brief = session.brief;
    if (!brief.nodeLookup) {
      brief.nodeLookup = Object.fromEntries(
        (brief.nodes ?? []).map(n => [n.id, n])
      );
    }
    setActiveBrief(brief);
    setActivePatches(session.patches ?? null);
    setLastLoadedDocId(brief.meta?.id ?? null);
    setCurrentDocMeta(brief);
  }

  // Notify main.mjs to re-render presentation layer
  _onRestoreComplete(session);

  log('SYSTEM', `session restored: ${session.name} (${session.nodes?.length ?? 0} nodes${session.brief ? ', brief included' : ''})`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire save-btn + sessions-btn click listeners.
 * Optionally pass callbacks so main.mjs can hook into restore completion.
 *
 * @param {{ onRestoreComplete?: (session: object) => void }} [opts]
 */
export function initSessionManager(opts = {}) {
  if (opts.onRestoreComplete) _onRestoreComplete = opts.onRestoreComplete;

  document.getElementById('save-btn')?.addEventListener('click', async () => {
    const name = prompt('Name this exploration:') || undefined;
    const session = await _snapshotSession(name);
    log('SYSTEM', `session saved: ${session.name}`, { id: session.id });
    _renderSessionsDrawer();
  });

  document.getElementById('sessions-btn')?.addEventListener('click', () => toggleSessionsDrawer());
}

/**
 * Open, close, or toggle the sessions drawer.
 * @param {boolean} [force]  true=open, false=close, undefined=toggle
 */
export async function toggleSessionsDrawer(force) {
  _drawerOpen = force !== undefined ? force : !_drawerOpen;
  const wrap = document.getElementById('sessions-wrap');
  if (!wrap) return;
  if (_drawerOpen) {
    await _renderSessionsDrawer();
    wrap.classList.add('open');
  } else {
    wrap.classList.remove('open');
  }
}
