/**
 * canvas/testSetup.mjs — shared jsdom DOM fixture for canvas module tests.
 *
 * Import in any test file that needs DOM elements:
 *   import './testSetup.mjs';
 *
 * Provides the minimal HTML shell that canvas modules query with getElementById.
 * Call resetDOM() in beforeEach when tests mutate DOM state.
 */

export function seedDOM() {
  document.body.innerHTML = `
    <div id="report-btn" aria-expanded="false"></div>
    <div id="report-wrap" class="hidden"></div>
    <div id="report-inner"></div>
    <div id="sessions-wrap" aria-hidden="true"></div>
    <div id="sessions-drawer"></div>
    <div id="sessions-close"></div>
    <div id="sessions-title"></div>
    <div id="library-wrap" aria-hidden="true"></div>
    <div id="library-drawer"></div>
    <div id="library-close"></div>
    <div id="paint-hud-btn" aria-label="Paint"></div>
    <div id="cam-lock-btn" aria-pressed="false"></div>
    <div id="paint-indicator" class="paint-indicator hidden">
      <span class="paint-indicator-spinner"></span>
      <span id="paint-indicator-label">generating scene…</span>
    </div>
    <div id="stats-strip" class="hidden"></div>
    <div id="cluster-pills" class="hidden"></div>
    <div id="canvas-loader" class="hidden"></div>
    <span id="cl-label"></span>
    <div id="cl-progress"></div>
    <span id="cl-seed-echo"></span>
    <div id="zero-state"></div>
    <div id="theScene"></div>
    <button id="save-btn"></button>
    <button id="sessions-btn"></button>
    <button id="log-toggle"></button>
  `;
}

export const resetDOM = seedDOM;

// Seed on first import so modules that run top-level getElementById calls don't fail.
seedDOM();
