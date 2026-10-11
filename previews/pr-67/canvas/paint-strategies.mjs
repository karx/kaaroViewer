/**
 * canvas/paint-strategies.mjs — swappable prompt-building middleware for scene painting.
 *
 * Each strategy is a pure function:  (PaintContext) → string
 *
 * PaintContext shape (from paint-context.mjs):
 *   slideIdx, slideType, slideCentral, slideNodes  — active slide
 *   cameraAngle: { azimuth, elevation, phrase, compass }
 *   visibleNodes: Node[]   — in camera frustum at paint time
 *   selectedNode: Node | null
 *
 * Priority order for the "hero" entity (used by all built-in strategies):
 *   1. selectedNode  — what the user has explicitly focused
 *   2. slideCentral  — the slide's primary entity
 *   3. visibleNodes[0] — whatever is most prominent on screen
 *
 * Compositing modes (set per strategy via registerStrategy opts):
 *   'replace'    — newest projection covers the overlap region (NormalBlending, opacity 1.0)
 *   'accumulate' — pixels add up; overlaps brighten (AdditiveBlending, opacity 1.0)
 *   'blend'      — all layers remain partially visible (NormalBlending, opacity < 1.0)
 *
 * To add a custom strategy at runtime:
 *   import { registerStrategy } from './canvas/paint-strategies.mjs';
 *   registerStrategy('my-style', ctx => `paint ${ctx.selectedNode?.label} as neon graffiti`,
 *                    { compositing: 'accumulate' });
 *   setActiveStrategy('my-style');
 */

// Registry stores { fn, compositing, opacity } per strategy name
const _registry = new Map();
let   _active   = 'cinematic';

/**
 * @param {string}   name
 * @param {(ctx: object) => string} fn   — pure prompt builder
 * @param {object}   [opts]
 * @param {'replace'|'accumulate'|'blend'} [opts.compositing='replace']
 * @param {number}   [opts.opacity=1.0]  — fade target (only meaningful for 'blend')
 */
export function registerStrategy(name, fn, opts = {}) {
  _registry.set(name, {
    fn,
    compositing: opts.compositing ?? 'replace',
    opacity:     opts.opacity     ?? 1.0,
  });
}

export function setActiveStrategy(name) {
  if (_registry.has(name)) { _active = name; return true; }
  return false;
}
export function getActiveStrategy() { return _active; }
export function listStrategies()    { return [..._registry.keys()]; }

/**
 * Return the compositing config for the named (or currently active) strategy.
 * Falls back to { compositing: 'replace', opacity: 1.0 } for unknown names.
 */
export function getStrategyConfig(name) {
  const entry = _registry.get(name ?? _active);
  if (!entry) return { compositing: 'replace', opacity: 1.0 };
  return { compositing: entry.compositing, opacity: entry.opacity };
}

/**
 * Build a prompt using the currently-active strategy.
 * Throws if the active strategy is not registered.
 */
export function buildPrompt(ctx) {
  const entry = _registry.get(_active);
  if (!entry) throw new Error(`[PaintStrategies] unknown strategy: ${_active}`);
  return entry.fn(ctx);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _heroNode(ctx) {
  return ctx.selectedNode ?? ctx.slideCentral ?? ctx.visibleNodes?.[0] ?? null;
}

/**
 * Collect supporting entities by merging visibleNodes and slideNodes,
 * deduplicating and excluding the hero. Returns up to `limit` nodes.
 */
function _supportingCast(ctx, hero, limit = 5) {
  const seen = new Set(hero?.qid ? [hero.qid] : []);
  return [
    ...(ctx.visibleNodes ?? []),
    ...(ctx.slideNodes   ?? []),
  ]
    .filter(n => n?.label && !seen.has(n.qid) && seen.add(n.qid))
    .slice(0, limit);
}

// ── Built-in strategies ───────────────────────────────────────────────────────

/**
 * cinematic — oil-painting atmospheric style, current default.
 * Uses camera elevation phrase to vary the shot description.
 * Compositing: replace — authoritative image per slide angle.
 */
registerStrategy('cinematic', ctx => {
  const hero    = _heroNode(ctx);
  const support = _supportingCast(ctx, hero);
  const name    = hero?.label ?? 'an entity';
  const kind    = hero?.type  ?? 'concept';
  const excerpt = hero?.description ? ` — ${hero.description.slice(0, 90)}` : '';
  const context = support.map(n => n.label).join(', ');
  const shot    = ctx.cameraAngle?.phrase ?? 'Cinematic wide establishing shot';

  return [
    `${shot}: ${name}, a ${kind}${excerpt}.`,
    context ? `Related entities in scene: ${context}.` : '',
    'Dark atmospheric oil painting. Dramatic amber-orange and deep black lighting.',
    'Rich texture and painterly brushwork. Shallow depth of field. Wide lens.',
    'No text. No labels. No UI elements. Cinematic intelligence brief aesthetic.',
  ].filter(Boolean).join(' ');
}, { compositing: 'replace' });

/**
 * documentary — naturalistic photographic style.
 * More factual language; foregrounds the description.
 * Compositing: blend — layers stack at partial opacity so each angle contributes.
 */
registerStrategy('documentary', ctx => {
  const hero    = _heroNode(ctx);
  const support = _supportingCast(ctx, hero, 4);
  const name    = hero?.label ?? 'the subject';
  const kind    = hero?.type  ?? 'concept';
  const excerpt = hero?.description ? hero.description.slice(0, 120) : '';

  return [
    `Documentary photograph: ${name} (${kind}).`,
    excerpt,
    support.length ? `Context: ${support.map(n => n.label).join(', ')}.` : '',
    'Natural observational light. Muted desaturated palette, high clarity.',
    'Photojournalistic aesthetic. No text, labels, or graphics.',
  ].filter(Boolean).join(' ');
}, { compositing: 'blend', opacity: 0.55 });

/**
 * abstract — non-representational color-field painting.
 * Treats entities as conceptual inputs, not literal subjects.
 * Compositing: accumulate — additive blending creates luminous color buildup.
 */
registerStrategy('abstract', ctx => {
  const hero    = _heroNode(ctx);
  const support = _supportingCast(ctx, hero, 6);
  const nodes   = [hero, ...support].filter(Boolean).map(n => n.label).join(', ');

  return [
    `Abstract color-field painting embodying: ${nodes}.`,
    'Deep saturated hues, gestural mark-making. No recognizable figures or text.',
    'Inspired by Rothko and Kandinsky. Emotional, conceptual, non-representational.',
    'No labels, symbols, or legible marks of any kind.',
  ].join(' ');
}, { compositing: 'accumulate' });

/**
 * blueprint — technical architectural/schematic style.
 * Cool palette, precise lines, diagrammatic.
 * Compositing: replace — each slide gets a clean technical render.
 */
registerStrategy('blueprint', ctx => {
  const hero    = _heroNode(ctx);
  const support = _supportingCast(ctx, hero, 5);
  const name    = hero?.label ?? 'the system';
  const nodes   = support.map(n => n.label).join(', ');

  return [
    `Technical blueprint schematic of ${name}.`,
    nodes ? `Related systems: ${nodes}.` : '',
    'White linework on deep navy blue. Architectural drafting aesthetic.',
    'Grid overlay, precise geometry, hatching patterns.',
    'No color fills. No photographs. Pure technical illustration.',
  ].filter(Boolean).join(' ');
}, { compositing: 'replace' });
