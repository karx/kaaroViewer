/**
 * canvas/brief-controller.mjs — Brief display (slides / reader) and toggle logic.
 *
 * Public API:
 *   initBriefController()   — registers all document event listeners (call once)
 *   showBrief(meta)         — render + display brief in current mode
 *   hideBrief()             — hide slides and report
 *   toggleReportMode()      — toggle brief visibility; exported for keyboard handler
 */

import { log } from '../logger.mjs';
import { renderSlides, showSlides, hideSlides, isSlidesVisible,
         notifySceneResult } from './slides.mjs';
import { renderReport, showReport, hideReport, isReportVisible } from './report.mjs';
import { rehydrateSlides, clearAllSlides } from './scene-painter.mjs';
import { getCamera } from './scene.mjs';
import { clearDim } from './nodes.mjs';
import { getDocMeta } from '../pipeline/local-graph.mjs';
import { getBriefMode, setBriefMode, getLastLoadedDocId } from './app-state.mjs';

function _isBriefVisible() {
  return isSlidesVisible() || isReportVisible();
}

export function hideBrief() {
  hideSlides();
  hideReport();
}

export function showBrief(meta) {
  if (getBriefMode() === 'reader') {
    hideSlides();
    renderReport(meta);
    showReport();
  } else {
    hideReport();
    renderSlides(meta);
    showSlides();
    // Fire-and-forget — slides appear immediately; backdrops fade in as they load.
    const docId = getLastLoadedDocId() ?? meta?.id ?? meta?.meta?.id;
    rehydrateSlides(docId, getCamera()).then(restored => {
      for (const idx of restored) notifySceneResult(idx, 'done', undefined, { restored: true });
    }).catch(err => log('ERROR', `[rehydrate] ${err.message}`));
  }
}

export function toggleReportMode() {
  const reportBtn = document.getElementById('report-btn');
  if (_isBriefVisible()) {
    hideBrief();
    reportBtn?.setAttribute('aria-expanded', 'false');
    log('SYSTEM', 'brief OFF');
  } else {
    const docId = getLastLoadedDocId();
    const meta  = docId ? getDocMeta(docId) : null;
    if (!meta) {
      log('SYSTEM', 'no doc loaded — press L to open the library');
      return;
    }
    showBrief(meta);
    reportBtn?.setAttribute('aria-expanded', 'true');
    log('SYSTEM', `${getBriefMode()}: ${meta.title}`);
  }
  // Signal main.mjs to update the fn-bar (avoids circular import)
  document.dispatchEvent(new CustomEvent('kaaro:fn-bar-update'));
}

export function initBriefController() {
  // Switch between slides ↔ reader without closing the brief
  document.addEventListener('slides:mode', e => {
    const requested = e.detail?.mode === 'reader' ? 'reader' : 'slides';
    const docId = getLastLoadedDocId();
    const meta  = docId ? getDocMeta(docId) : null;
    if (!meta) return;
    setBriefMode(requested);
    showBrief(meta);
    log('SYSTEM', `brief mode → ${requested}`);
  });

  // Reader → slides (or close) via the reader's sticky toggle bar
  document.addEventListener('report:mode', e => {
    const mode = e.detail?.mode;
    if (mode === 'close') {
      hideBrief();
      document.dispatchEvent(new CustomEvent('kaaro:fn-bar-update'));
      log('SYSTEM', 'brief OFF');
      return;
    }
    const docId = getLastLoadedDocId();
    const meta  = docId ? getDocMeta(docId) : null;
    if (!meta) return;
    setBriefMode('slides');
    showBrief(meta);
    log('SYSTEM', 'brief mode → slides');
  });

  // Slides closed via ✕ button
  document.addEventListener('slides:closed', () => {
    clearDim();
    clearAllSlides();
    document.dispatchEvent(new CustomEvent('kaaro:fn-bar-update'));
    log('SYSTEM', 'brief closed — F9 to reopen');
  });
}
