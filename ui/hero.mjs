/**
 * ui/hero.mjs — the HeroVisual document: a Toolpad-inspired page DSL for a routed,
 * enriched, replayable presentation of a library brief.
 *
 * It does NOT copy or extend the library brief's shape. It references the brief as a
 * query and binds widget props to it, the way a Toolpad page binds element props to
 * queries. The brief stays untouched; the hero can be regenerated per registry version.
 *
 *   { apiVersion: 'kaaro.hero/v1', kind: 'hero',
 *     meta:      { id, title, generated, mode },
 *     source:    { library, path, sha256 },
 *     registry:  { version, layouts },
 *     queries:   [ { name: 'brief', kind: 'library', id }, { name: 'analytics', kind: 'derive', from: 'brief' } ],
 *     decisions: { provider, gate, hops: [...], counts },
 *     pages:     [ { name: 'deck', title, display, layout, content: [Element] } ],
 *     events:    [ AG-UI style events, optional ] }
 *
 *   Element = { component, name, key?, props: { <input>: { $$bind: path } }, frames, layout: { slot, family, size }, enrichment?, decision? }
 *
 * Bindings are data paths, never code: `brief.story[id=beat-1]`, `analytics.centrality`.
 */

import { REGISTRY, LAYOUTS, getWidget, getLayout } from './registry.mjs';
import { deriveAnalytics } from '../pipeline/analytics.mjs';

export const HERO_API = 'kaaro.hero/v1';

// ── Doc helpers ───────────────────────────────────────────────────────────────

/** Raw library JSON → the enriched shape the canvas renderers expect. */
export function toCanvasDoc(raw) {
  const nodeLookup = Object.fromEntries((raw.nodes ?? []).map(n => [n.id, n]));
  const analytics  = raw.analytics ?? deriveAnalytics(raw.nodes ?? [], raw.edges ?? [], raw.clusters ?? [], raw.insights ?? [], raw.story ?? []);
  return { ...(raw.meta ?? {}), ...raw, nodeLookup, analytics };
}

// ── Bindings ──────────────────────────────────────────────────────────────────

const BIND_RE = /^(brief|analytics)((?:\.[A-Za-z_]\w*|\[id=[^\]]+\])*)$/;

/** Resolve `brief.story[id=x]` / `analytics.centrality` against { doc, analytics }. */
export function resolveBinding(path, { doc, analytics }) {
  const m = String(path).match(BIND_RE);
  if (!m) return undefined;
  let cur = m[1] === 'brief' ? doc : (analytics ?? doc?.analytics);
  const steps = m[2].match(/\.[A-Za-z_]\w*|\[id=[^\]]+\]/g) ?? [];
  for (const s of steps) {
    if (cur == null) return undefined;
    if (s.startsWith('[id=')) { const id = s.slice(4, -1); cur = Array.isArray(cur) ? cur.find(x => x?.id === id) : undefined; }
    else cur = cur[s.slice(1)];
  }
  return cur;
}

function propsFor(widget, item) {
  const key = item?.id;
  switch (widget.input) {
    case 'meta':          return { meta: { $$bind: 'brief.meta' } };
    case 'report_card':   return { report_card: { $$bind: 'brief.report_card' } };
    case 'story':         return { story: { $$bind: 'brief.story' } };
    case 'story.beat':    return { beat: { $$bind: `brief.story[id=${key}]` } };
    case 'insights':      return { insights: { $$bind: 'brief.insights' } };
    case 'insights.item': return { insight: { $$bind: `brief.insights[id=${key}]` } };
    case 'clusters':      return { clusters: { $$bind: 'brief.clusters' } };
    case 'clusters.item': return { cluster: { $$bind: `brief.clusters[id=${key}]` } };
    case 'none':          return {};
    default:
      if (widget.input.startsWith('analytics.')) return { [widget.input.slice(10)]: { $$bind: widget.input } };
      return {};
  }
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function elementName(widgetId, key) { return key ? `${widgetId}.${key}` : widgetId; }

export function buildHero({ doc, plan, mode = 'slides', source = {}, registry = REGISTRY, layouts = LAYOUTS, enrichment = {}, events = [], generated = null } = {}) {
  if (!doc || !plan) throw new Error('buildHero: doc and plan are required');
  const meta = doc.meta ?? doc;
  const id = meta.id ?? doc.id;
  const content = plan.slots.map(s => {
    const w = getWidget(s.widget, registry) ?? { input: 'none' };
    const name = elementName(s.widget, s.item?.id);
    const el = {
      component: s.widget, name,
      ...(s.item?.id ? { key: s.item.id } : {}),
      props: propsFor(w, s.item),
      frames: [...(s.frames ?? [])],
      layout: { slot: s.slot, family: s.family, size: w.size ?? 'full' },
    };
    if (w.enrich_schema) {
      const prior = enrichment[name] ?? {};
      el.enrichment = Object.fromEntries(Object.keys(w.enrich_schema).map(k => [k, typeof prior[k] === 'string' ? prior[k] : '']));
    }
    return el;
  });

  // Attach the deciding hop (if any) to each element for provenance.
  const hopFor = (slotId) => (plan.decisions?.hops ?? []).find(h => h.kind === 'slot' && h.slot === slotId && (!h.layout || h.layout === plan.layout));
  for (const el of content) {
    const h = hopFor(el.layout.slot);
    if (h) el.decision = { source: h.source, confidence: h.confidence };
  }

  return {
    apiVersion: HERO_API, kind: 'hero',
    meta: { id, title: meta.title ?? '', generated: generated ?? new Date().toISOString().slice(0, 10), mode },
    source: { library: id, path: source.path ?? `./library/${id}.json`, sha256: source.sha256 ?? null },
    registry: { version: registry.version ?? null, layouts: layouts.version ?? null },
    queries: [
      { name: 'brief', kind: 'library', id },
      { name: 'analytics', kind: 'derive', from: 'brief' },
    ],
    decisions: plan.decisions ?? { provider: 'heuristic', gate: null, hops: [], counts: { total: 0, model: 0, heuristic: 0 } },
    pages: [{
      name: 'deck', title: meta.title ?? '', display: mode, layout: plan.layout,
      content,
    }],
    events,
  };
}

/** Carry authored enrichment from a previous hero onto a rebuilt one (by element name). */
export function priorEnrichment(prevHero) {
  const out = {};
  for (const page of prevHero?.pages ?? []) for (const el of page.content ?? []) if (el.enrichment) out[el.name] = { ...el.enrichment };
  return out;
}

// ── Hero → plan (what the canvas hydrates) ────────────────────────────────────

export function heroToPlan(hero, pageName = null) {
  const page = (hero.pages ?? []).find(p => !pageName || p.name === pageName) ?? hero.pages?.[0];
  if (!page) throw new Error('heroToPlan: hero has no pages');
  return {
    layout: page.layout, mode: page.display, kind: 'brief', hero: hero.meta?.id ?? null,
    slots: (page.content ?? []).map((el, i) => ({
      slot: el.layout?.slot, family: el.layout?.family, widget: el.component,
      ...(el.key ? { item: { id: el.key, index: i } } : {}),
      frames: [...(el.frames ?? [])],
      ...(el.enrichment ? { enrichment: el.enrichment } : {}),
    })),
    confidence: null, ambiguities: [], unused: [], gaps: [], proposedReady: [],
    decisions: hero.decisions ?? null,
  };
}

// ── Validate ──────────────────────────────────────────────────────────────────

export function validateHero(hero, { registry = REGISTRY, layouts = LAYOUTS, doc = null } = {}) {
  const errors = [], warnings = [];
  if (hero?.apiVersion !== HERO_API) errors.push(`apiVersion must be "${HERO_API}"`);
  if (hero?.kind !== 'hero') errors.push('kind must be "hero"');
  if (!hero?.meta?.id) errors.push('meta.id required');
  if (!hero?.source?.library) errors.push('source.library required');
  if (!Array.isArray(hero?.pages) || !hero.pages.length) { errors.push('pages[] required'); return { errors, warnings, ok: false }; }
  if (!(hero.queries ?? []).some(q => q.name === 'brief')) errors.push('queries must include the "brief" query');
  if (hero.registry?.version != null && registry.version != null && hero.registry.version !== registry.version)
    warnings.push(`hero built against registry v${hero.registry.version}, current is v${registry.version} — regenerate`);

  const nodeIds = new Set((doc?.nodes ?? []).map(n => n.id));
  const ctx = doc ? { doc, analytics: doc.analytics ?? deriveAnalytics(doc.nodes ?? [], doc.edges ?? [], doc.clusters ?? [], doc.insights ?? [], doc.story ?? []) } : null;
  const names = new Set();

  for (const page of hero.pages) {
    const tag = `page "${page.name}"`;
    const layout = getLayout(page.layout, layouts);
    if (!layout) errors.push(`${tag}: layout "${page.layout}" not in layouts.json`);
    if (!Array.isArray(page.content)) { errors.push(`${tag}: content[] required`); continue; }
    for (const el of page.content) {
      const et = `${tag} element "${el.name ?? el.component}"`;
      const w = getWidget(el.component, registry);
      if (!w) { errors.push(`${et}: component "${el.component}" not in registry`); continue; }
      if (w.status !== 'active') errors.push(`${et}: component "${el.component}" is ${w.status}, not active`);
      if (!el.name) errors.push(`${et}: name required`);
      if (names.has(el.name)) errors.push(`${et}: duplicate element name`);
      names.add(el.name);
      if (layout && !layout.slots.some(s => s.id === el.layout?.slot)) errors.push(`${et}: slot "${el.layout?.slot}" not in layout "${page.layout}"`);
      if (w.cardinality === 'per-item' && !el.key) errors.push(`${et}: per-item component needs a key`);
      for (const [prop, v] of Object.entries(el.props ?? {})) {
        const path = v?.$$bind;
        if (!path) { errors.push(`${et}: prop "${prop}" must be a { $$bind } binding`); continue; }
        if (!BIND_RE.test(path)) errors.push(`${et}: prop "${prop}" binding "${path}" is not a data path`);
        else if (ctx && resolveBinding(path, ctx) === undefined) errors.push(`${et}: prop "${prop}" binding "${path}" resolves to nothing in the brief`);
      }
      if (doc) for (const f of el.frames ?? []) if (!nodeIds.has(f)) errors.push(`${et}: frame "${f}" is not a node in the brief`);
      if (el.enrichment) {
        if (!w.enrich_schema) warnings.push(`${et}: enrichment present but component declares no enrich_schema`);
        for (const [k, v] of Object.entries(el.enrichment)) {
          if (w.enrich_schema && !(k in w.enrich_schema)) errors.push(`${et}: enrichment field "${k}" not in enrich_schema`);
          if (typeof v !== 'string') errors.push(`${et}: enrichment "${k}" must be a string`);
          else if (!v.trim()) warnings.push(`${et}: enrichment "${k}" is empty — author it or the widget renders without it`);
          else if (v.length > 280) errors.push(`${et}: enrichment "${k}" exceeds 280 chars`);
        }
      }
    }
  }
  for (const h of hero.decisions?.hops ?? []) {
    if (!['model', 'heuristic'].includes(h.source)) errors.push(`decision "${h.id}": source must be model | heuristic`);
    if (h.options && !h.options.includes(h.answer)) errors.push(`decision "${h.id}": answer "${h.answer}" not among its options`);
  }
  return { errors, warnings, ok: errors.length === 0 };
}
