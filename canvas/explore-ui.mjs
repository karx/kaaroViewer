/**
 * canvas/explore-ui.mjs — Seed input + exploration controls.
 *
 * Provides:
 *   • Seed input field (text box + submit), wired to hotkey G
 *   • [ EXPAND ] button — shown when structural delta detected
 *   • [ RETHINK ] button — shown when sentiment flip detected
 *   • Delta callout panel — explains what enrichment found that changed the story
 *
 * Events emitted:
 *   explore:seed-submit   — { seed: string }
 *   explore:expand        — user confirmed EXPAND
 *   explore:rethink       — user confirmed RETHINK
 *
 * Events listened to:
 *   explore:delta         — from enrichment-coordinator (shows/hides controls)
 *   explore:node-update   — (optional) forwarded to canvas for live updates
 */

import { log } from '../logger.mjs';

// ── State ─────────────────────────────────────────────────────────────────────

let _pendingDeltas = [];
let _expandVisible  = false;
let _rethinkVisible = false;

// ── DOM construction ──────────────────────────────────────────────────────────

/**
 * Mount the Explore UI into the DOM.
 * Must be called after DOMContentLoaded.
 *
 * @param {object} [opts]
 * @param {string|HTMLElement} [opts.container='body'] — where to inject
 * @param {Function} [opts.onSeed]   — async (seed: string) → void
 * @param {Function} [opts.onExpand] — async () → void
 * @param {Function} [opts.onRethink] — async () → void
 */
export function mountExploreUI({ container = 'body', onSeed, onExpand, onRethink } = {}) {
  const parent = typeof container === 'string'
    ? document.querySelector(container)
    : container;
  if (!parent) { log('ERROR', '[ExploreUI] container not found'); return; }

  // ── Inject shell HTML ────────────────────────────────────────────────────
  const shell = document.createElement('div');
  shell.id = 'explore-ui';
  shell.innerHTML = `
    <div id="explore-bar" class="explore-bar">
      <span class="explore-prompt">G</span>
      <input
        id="explore-input"
        type="text"
        class="explore-input"
        placeholder="explore a topic, person, or URL…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Exploration seed — enter a topic to generate a knowledge graph"
      >
      <button id="explore-submit" class="explore-submit" aria-label="Start exploration">
        ▶ EXPLORE
      </button>
    </div>

    <div id="explore-delta-bar" class="explore-delta-bar hidden" role="alert" aria-live="polite">
      <div id="explore-delta-callout" class="explore-delta-callout"></div>
      <div class="explore-delta-actions">
        <button id="explore-expand-btn"  class="explore-action-btn expand-btn  hidden" aria-label="Expand graph with enrichment findings">[ EXPAND ]</button>
        <button id="explore-rethink-btn" class="explore-action-btn rethink-btn hidden" aria-label="Regenerate narrative using enrichment data">[ RETHINK ]</button>
        <button id="explore-dismiss-btn" class="explore-dismiss-btn" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `;
  parent.appendChild(shell);

  // ── Wire submit ──────────────────────────────────────────────────────────
  const input      = document.getElementById('explore-input');
  const submitBtn  = document.getElementById('explore-submit');
  const deltaBar   = document.getElementById('explore-delta-bar');
  const callout    = document.getElementById('explore-delta-callout');
  const expandBtn  = document.getElementById('explore-expand-btn');
  const rethinkBtn = document.getElementById('explore-rethink-btn');
  const dismissBtn = document.getElementById('explore-dismiss-btn');

  function _submit() {
    const seed = input.value.trim();
    if (!seed) return;
    log('INPUT', `[ExploreUI] seed submitted: "${seed}"`);
    _hideDeltaBar();
    document.dispatchEvent(new CustomEvent('explore:seed-submit', { detail: { seed }, bubbles: true }));
    if (typeof onSeed === 'function') onSeed(seed);
    input.value = '';
    input.blur();
  }

  submitBtn.addEventListener('click', _submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') _submit();
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });

  // ── Hotkey G — focus explore input ──────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'g' || e.key === 'G') {
      // Only when no other input is focused
      const active = document.activeElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  // ── EXPAND button ────────────────────────────────────────────────────────
  expandBtn.addEventListener('click', () => {
    log('INPUT', '[ExploreUI] EXPAND confirmed');
    document.dispatchEvent(new CustomEvent('explore:expand', { detail: { deltas: _pendingDeltas }, bubbles: true }));
    if (typeof onExpand === 'function') onExpand(_pendingDeltas);
    _hideDeltaBar();
  });

  // ── RETHINK button ───────────────────────────────────────────────────────
  rethinkBtn.addEventListener('click', () => {
    log('INPUT', '[ExploreUI] RETHINK confirmed');
    document.dispatchEvent(new CustomEvent('explore:rethink', { detail: { deltas: _pendingDeltas }, bubbles: true }));
    if (typeof onRethink === 'function') onRethink(_pendingDeltas);
    _hideDeltaBar();
  });

  // ── Dismiss ──────────────────────────────────────────────────────────────
  dismissBtn.addEventListener('click', _hideDeltaBar);

  // ── Listen for delta events from coordinator ─────────────────────────────
  document.addEventListener('explore:delta', e => {
    const { type, deltas } = e.detail ?? {};
    _accumulateDelta(type, deltas);
  });

  log('SYSTEM', '[ExploreUI] mounted');
}

// ── Delta bar logic ───────────────────────────────────────────────────────────

function _accumulateDelta(type, deltas) {
  _pendingDeltas.push(...(deltas ?? []));

  const deltaBar   = document.getElementById('explore-delta-bar');
  const callout    = document.getElementById('explore-delta-callout');
  const expandBtn  = document.getElementById('explore-expand-btn');
  const rethinkBtn = document.getElementById('explore-rethink-btn');

  if (!deltaBar) return;

  // Update callout text
  const structural = _pendingDeltas.filter(d => d.type === 'structural');
  const sentiment  = _pendingDeltas.filter(d => d.type === 'sentiment');

  const messages = [];
  if (structural.length) {
    const newEntities = structural.flatMap(d => d.newEntities ?? []).slice(0, 3);
    messages.push(
      `⊕ Enrichment found ${structural.length} structural update${structural.length > 1 ? 's' : ''}.` +
      (newEntities.length ? ` New entities: ${newEntities.join(', ')}.` : '')
    );
  }
  if (sentiment.length) {
    messages.push(`⚠ Sentiment signal contradicts ${sentiment.length} node${sentiment.length > 1 ? 's' : ''} in the brief.`);
  }

  callout.textContent = messages.join(' ');

  // Show appropriate buttons
  if (structural.length > 0) {
    expandBtn.classList.remove('hidden');
    _expandVisible = true;
  }
  if (sentiment.length > 0 || structural.length > 1) {
    rethinkBtn.classList.remove('hidden');
    _rethinkVisible = true;
  }

  deltaBar.classList.remove('hidden');
  log('ENRICHER', `[ExploreUI] delta bar shown (${type})`, { structural: structural.length, sentiment: sentiment.length });
}

function _hideDeltaBar() {
  _pendingDeltas = [];
  _expandVisible  = false;
  _rethinkVisible = false;

  const deltaBar   = document.getElementById('explore-delta-bar');
  const expandBtn  = document.getElementById('explore-expand-btn');
  const rethinkBtn = document.getElementById('explore-rethink-btn');

  deltaBar?.classList.add('hidden');
  expandBtn?.classList.add('hidden');
  rethinkBtn?.classList.add('hidden');
}

/** Programmatically show a delta signal (for testing / external triggers). */
export function showDelta(type, deltas) {
  _accumulateDelta(type, deltas);
}

/** Programmatically hide the delta bar. */
export function hideDelta() {
  _hideDeltaBar();
}
