/**
 * canvas/paint-orchestrator.mjs
 *
 * Paint pipeline orchestration extracted from main.mjs.
 * Wires HUD buttons and slide events; exposes public API for keyboard
 * handler (triggerGlobalPaint) and post-load refresh (updatePaintHUD).
 */

import { log } from '../logger.mjs';

// Paint Indicator Helpers
function _showPaintIndicator(label = 'generating scene…') {
  const indicator = document.getElementById('paint-indicator');
  const labelEl   = document.getElementById('paint-indicator-label');
  if (indicator) indicator.classList.remove('hidden');
  if (labelEl) labelEl.textContent = label;
}

function _hidePaintIndicator() {
  const indicator = document.getElementById('paint-indicator');
  if (indicator) indicator.classList.add('hidden');
}
import { graph } from '../pipeline/graph.mjs';
import { assemblePaintContext } from './paint-context.mjs';
import {
  buildPrompt as buildStrategyPrompt,
  getActiveStrategy, getStrategyConfig,
  setActiveStrategy, listStrategies,
} from './paint-strategies.mjs';
import {
  generateScene, getCanonicalCamera, restoreScene, getImageKey,
} from './scene-painter.mjs';
import {
  getCamera, getControls, getVisibleNodeQids, animateCameraTo,
  isCameraLocked, setCameraLock,
} from './scene.mjs';
import { getAllMeshes } from './nodes.mjs';
import {
  getActiveSlideIdx, getActiveSlide, notifySceneResult, isSlidesVisible,
} from './slides.mjs';
import { getCurrentQid } from './detail.mjs';
import { getLastLoadedDocId } from './app-state.mjs';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Assemble PaintContext from live state: slide (if any), camera, frustum, selection.
 * slideIdx null → free-roam context only (no slide data pulled).
 */
function _assembleLiveContext(slideIdx = null) {
  const slide        = slideIdx != null ? getActiveSlide() : null;
  const slideNodes   = (slide?.frameNodes ?? []).map(id => graph.getNode(id)).filter(Boolean);
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
 * Core paint execution: build enriched prompt → call generateScene → notify slide UI.
 *
 * @param {number|null} slideIdx          slide slot, or null for free-roam paints
 * @param {object}      centralNode
 * @param {object[]}    frameNodes
 * @param {object}      [canonicalOverride]  { pos, target } — skip golden-angle spiral
 */
async function _executePaint(slideIdx, centralNode, frameNodes, canonicalOverride = null) {
  const apiKey = getImageKey();
  if (!apiKey) {
    if (slideIdx != null) {
      notifySceneResult(slideIdx, 'error', 'No image key — add one in ⚙ MODEL SETTINGS → Scene Painter');
    }
    log('SYSTEM', '[paint] no image key');
    return;
  }

  // When camera is locked: capture the live camera position NOW as the canonical
  // projection origin so the texture maps correctly to the current view.
  const locked = isCameraLocked();
  const effectiveCanonical = canonicalOverride ?? (locked
    ? { pos: getCamera().position.clone(), target: getControls().target.clone() }
    : null);

  const ctx            = _assembleLiveContext(slideIdx);
  const strategy       = getActiveStrategy();
  const prompt         = buildStrategyPrompt(ctx);
  const compositingCfg = getStrategyConfig(strategy);

  log('SYSTEM', `[paint] strategy=${strategy} compositing=${compositingCfg.compositing} slide=${slideIdx ?? 'free-roam'} locked=${locked}`, {
    hero:    ctx.selectedNode?.label ?? ctx.slideCentral?.label,
    visible: ctx.visibleNodes.length,
    angle:   ctx.cameraAngle?.phrase,
  });

  // Fly to canonical before generation (slide paints, unlocked)
  if (slideIdx != null && !effectiveCanonical) {
    const canon = getCanonicalCamera(slideIdx);
    animateCameraTo(canon.pos, canon.target, 700);
  }

  // Show progress indicator
  _showPaintIndicator();

  try {
    const result = await generateScene(
      centralNode, frameNodes, apiKey, getCamera(),
      slideIdx, getLastLoadedDocId(),
      { prompt, canonicalOverride: effectiveCanonical, compositingCfg },
    );
    if (slideIdx != null) {
      notifySceneResult(slideIdx, 'done', undefined, result);
    }
    // Re-fly after generation (slide paints, unlocked)
    if (slideIdx != null && !effectiveCanonical) {
      animateCameraTo(result.cameraPos, result.cameraTarget, 600);
    }
    _updatePaintHUD();
  } catch (err) {
    log('ERROR', `[paint] ${err.message}`);
    if (slideIdx != null) notifySceneResult(slideIdx, 'error', err.message);
  } finally {
    _hidePaintIndicator();
  }
}

/**
 * Global paint — P key or HUD button.
 * Slides visible → paints active slide (slot retained, enriched with live context).
 * Free roam      → slideIdx null, live camera as projection origin, accumulates.
 */
async function _triggerGlobalPaint() {
  if (isSlidesVisible()) {
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
    const selectedQid  = getCurrentQid();
    const selectedNode = selectedQid ? graph.getNode(selectedQid) : null;
    const visibleQids  = getVisibleNodeQids(getAllMeshes());
    const visibleNodes = visibleQids.map(q => graph.getNode(q)).filter(Boolean);

    const centralNode = selectedNode ?? visibleNodes[0] ?? null;
    if (!centralNode) { log('SYSTEM', '[paint] nothing in view to paint'); return; }

    const cam  = getCamera();
    const ctrl = getControls();
    await _executePaint(null, centralNode, visibleNodes, {
      pos:    cam.position.clone(),
      target: ctrl.target.clone(),
    });
  }
}

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
  document.dispatchEvent(new CustomEvent('kaaro:fn-bar-update'));
  log('SYSTEM', `[camera] ${isCameraLocked() ? 'locked' : 'unlocked'}`);
}

function _cycleStrategy() {
  const all  = listStrategies();
  const cur  = getActiveStrategy();
  const next = all[(all.indexOf(cur) + 1) % all.length];
  setActiveStrategy(next);
  _updatePaintHUD();
  log('SYSTEM', `[paint] strategy → ${next}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire all paint-related event listeners and initialise HUD labels.
 * Call once during app boot (after DOM is ready).
 */
export function initPaintOrchestrator() {
  // HUD button: click = paint, shift-click = cycle strategy
  document.getElementById('paint-hud-btn')?.addEventListener('click', e => {
    if (e.shiftKey) { _cycleStrategy(); return; }
    _triggerGlobalPaint();
  });

  // Camera lock toggle button
  document.getElementById('cam-lock-btn')?.addEventListener('click', _toggleCameraLock);

  // Slide paint button → uses enriched pipeline
  document.addEventListener('slides:paint-scene', async e => {
    const { slideIdx, centralNodeId, frameNodeIds } = e.detail ?? {};
    if (slideIdx == null || !centralNodeId) return;

    const central    = graph.getNode(centralNodeId);
    const frameNodes = (frameNodeIds ?? []).map(id => graph.getNode(id)).filter(Boolean);
    await _executePaint(slideIdx, central, frameNodes);
  });

  // Restore a previously-painted scene when navigating back to its slide
  document.addEventListener('slides:restore-scene', e => {
    const { slideIdx } = e.detail ?? {};
    if (slideIdx == null) return;
    restoreScene(slideIdx);
    const canon = getCanonicalCamera(slideIdx);
    animateCameraTo(canon.pos, canon.target, 800);
  });

  // Initialise button labels on boot
  _updatePaintHUD();
}

/**
 * Exported so the keyboard handler in main.mjs can call it directly.
 */
export async function triggerGlobalPaint() {
  return _triggerGlobalPaint();
}

/**
 * Exported for use by exploration-pipeline after a graph load to refresh HUD labels.
 */
export function updatePaintHUD() {
  _updatePaintHUD();
}

export function toggleCameraLock() { _toggleCameraLock(); }
export function cycleStrategy()    { _cycleStrategy(); }
