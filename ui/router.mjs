/**
 * ui/router.mjs — deterministic heuristic router: StateDescriptor → WidgetPlan.
 *
 * Pure function. No DOM, no network. Every widget id in the plan exists in the
 * registry by construction — the router only ever selects, never invents.
 *
 * Plan shape:
 *   {
 *     layout, mode, kind,
 *     slots: [{ slot, family, widget, item?: { id, index }, frames: [nodeId] }],
 *     confidence: 0..1,
 *     ambiguities: [{ slot, candidates, chosen, reason }],
 *     unused:      [widgetId]        active + satisfied but not placed
 *     gaps:        [{ input, reason }] data present with no active widget consuming it
 *     proposedReady: [widgetId]      proposed widgets whose requires hold — promotion evidence
 *   }
 *
 * `forced` lets the questionnaire layer override any hop without a second code path:
 *   { layout?: id, slots?: { [slotId]: widgetId | 'omit' } }
 */

import { REGISTRY, LAYOUTS, getWidgets, getLayout, satisfies, evalPredicate } from './registry.mjs';

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
const SIZE_RANK     = { full: 0, lg: 1, md: 2, sm: 3 };

// ── Layout choice ─────────────────────────────────────────────────────────────

export function chooseLayout(descriptor, { layouts = LAYOUTS, mode = null, forced = null } = {}) {
  const all = layouts.layouts ?? [];
  if (forced) {
    const l = getLayout(forced, layouts);
    if (!l) throw new Error(`chooseLayout: forced layout "${forced}" not in registry`);
    return { layout: l, candidates: [l.id] };
  }
  const fit = all.filter(l =>
    (mode == null || l.mode === mode) &&
    (l.when ?? []).every(p => evalPredicate(p, descriptor)));
  if (!fit.length) return { layout: null, candidates: [] };
  // Most specific wins: more satisfied `when` clauses = tighter fit.
  const sorted = [...fit].sort((a, b) => (b.when?.length ?? 0) - (a.when?.length ?? 0));
  return { layout: sorted[0], candidates: sorted.map(l => l.id) };
}

// ── Items + frames ────────────────────────────────────────────────────────────

export function itemsFor(widget, d) {
  switch (widget.input) {
    case 'story.beat':    return d.story?.items ?? [];
    case 'insights.item': return [...(d.insights?.items ?? [])].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 1) - (SEVERITY_RANK[b.severity] ?? 1));
    case 'clusters.item': return d.clusters?.items ?? [];
    default:              return [];
  }
}

export function framesFor(widget, d, item = null) {
  const rc = d.report_card ?? {};
  switch (widget.frames) {
    case 'spine':        return [...(rc.spine ?? [])];
    case 'actors':       return [...(rc.spine ?? []), ...(rc.protagonists ?? []), ...(rc.antagonists ?? [])];
    case 'all-story':    return (d.story?.items ?? []).flatMap(b => [b.node, ...(b.nodes ?? [])]).filter(Boolean);
    case 'beat':         return item ? [item.node, ...(item.nodes ?? [])].filter(Boolean) : [];
    case 'evidence':     return item ? [...(item.evidence ?? [])] : [];
    case 'all-evidence': return [...new Set((d.insights?.items ?? []).flatMap(i => i.evidence ?? []))];
    case 'cluster':      return item ? [...(item.nodes ?? [])] : [];
    case 'all-clusters': return [...new Set((d.clusters?.items ?? []).flatMap(c => c.nodes ?? []))];
    case 'chains':       return [...new Set((d.analytics?.chains ?? []).flat())];
    case 'bridges':      return [...new Set((d.analytics?.bridges ?? []).flatMap(e => [e.from, e.to]))];
    default:             return [];
  }
}

// ── Slot filling ──────────────────────────────────────────────────────────────

function rankCandidates(cands, slot) {
  const prefer = slot.prefer ?? null;
  return [...cands].sort((a, b) => {
    if (prefer === 'one') {
      const ca = a.cardinality === 'one' ? 0 : 1, cb = b.cardinality === 'one' ? 0 : 1;
      if (ca !== cb) return ca - cb;
    }
    if (prefer && SIZE_RANK[prefer] != null) {
      const sa = a.size === prefer ? 0 : 1, sb = b.size === prefer ? 0 : 1;
      if (sa !== sb) return sa - sb;
    }
    return 0; // stable: registry order
  });
}

/** Active widgets that may fill `slot` of `layout` for this descriptor, ranked. Shared with the questionnaire. */
export function slotCandidates(descriptor, layout, slot, { registry = REGISTRY } = {}) {
  const cands = getWidgets(registry, { status: 'active' })
    .filter(w => w.family !== 'chart' && (w.modes ?? []).includes(layout.mode) && w.slot === slot.family && satisfies(w, descriptor));
  return rankCandidates(cands, slot);
}

export function routeHeuristic(descriptor, {
  registry = REGISTRY, layouts = LAYOUTS, mode = 'slides', forced = {},
} = {}) {
  if (!descriptor || !descriptor.kind) throw new Error('routeHeuristic: descriptor with kind is required');

  let { layout, candidates: layoutCandidates } = chooseLayout(descriptor, { layouts, mode, forced: forced.layout ?? null });
  let modeFallback = false;
  if (!layout && mode != null && !forced.layout) {
    // The caller's mode is a preference, not a constraint: a text seed asked for
    // "slides" still deserves the HUD rather than nothing.
    ({ layout, candidates: layoutCandidates } = chooseLayout(descriptor, { layouts, mode: null }));
    modeFallback = !!layout;
  }
  const plan = {
    layout: layout?.id ?? null, mode: layout?.mode ?? mode, kind: descriptor.kind,
    slots: [], confidence: 1, ambiguities: [], unused: [], gaps: [], proposedReady: [],
    layoutCandidates,
  };
  if (!layout) { plan.confidence = 0; plan.ambiguities.push({ slot: '*', candidates: [], chosen: null, reason: 'no layout matches descriptor' }); return plan; }
  if (modeFallback) plan.ambiguities.push({ slot: '*', candidates: layoutCandidates, chosen: layout.id, reason: `no "${mode}" layout fits kind "${descriptor.kind}"; used ${layout.mode}` });

  const active   = getWidgets(registry, { status: 'active' });
  const proposed = getWidgets(registry, { status: 'proposed' });
  const placed   = new Set();
  const satisfied = active.filter(w => w.family !== 'chart' && (w.modes ?? []).includes(layout.mode) && satisfies(w, descriptor));

  if (layoutCandidates.length > 1 && !forced.layout) {
    plan.ambiguities.push({ slot: '*', candidates: layoutCandidates, chosen: layout.id, reason: 'several layouts fit' });
    plan.confidence -= 0.1;
  }

  for (const slot of layout.slots) {
    const forcedId = forced.slots?.[slot.id];
    if (forcedId === 'omit') continue;

    let cands = rankCandidates(satisfied.filter(w => w.slot === slot.family), slot);
    if (forcedId) {
      // A forced widget LEADS the slot; the other candidates still fill any remaining capacity.
      const w = active.find(x => x.id === forcedId);
      if (!w) throw new Error(`routeHeuristic: forced widget "${forcedId}" is not an active registry widget`);
      cands = [w, ...cands.filter(x => x.id !== w.id)];
    }

    const forcedCap = forced.capacity?.[slot.id];
    let capacity = Number.isFinite(forcedCap) ? Math.max(1, Math.min(slot.max, forcedCap)) : slot.max;
    const chosenIds = [];
    let summaryPlaced = false; // a cardinality-one widget already covers this slot's input family
    for (const w of cands) {
      if (capacity <= 0) break;
      if (w.cardinality === 'one') {
        plan.slots.push({ slot: slot.id, family: slot.family, widget: w.id, frames: framesFor(w, descriptor) });
        placed.add(w.id); chosenIds.push(w.id); capacity -= 1; summaryPlaced = true;
      } else {
        const items = itemsFor(w, descriptor);
        const room  = capacity;
        items.slice(0, room).forEach((item, i) => {
          plan.slots.push({ slot: slot.id, family: slot.family, widget: w.id, item: { id: item.id, index: i }, frames: framesFor(w, descriptor, item) });
        });
        if (items.length) { placed.add(w.id); chosenIds.push(w.id); capacity -= Math.min(items.length, room); }
        // Truncation is a design choice when a summary widget (prefer: one) already
        // stands in for the overflow; otherwise it is a real loss worth asking about.
        if (items.length > room && !(slot.prefer === 'one' && summaryPlaced)) {
          plan.ambiguities.push({ slot: slot.id, candidates: [w.id], chosen: w.id, reason: `${items.length} items exceed remaining capacity ${room}; truncated` });
          plan.confidence -= 0.05;
        }
      }
    }

    // Competing single-cardinality candidates that did not all fit = a genuine choice.
    const oneCands = cands.filter(w => w.cardinality === 'one');
    if (!forcedId && oneCands.length > slot.max && !slot.prefer) {
      plan.ambiguities.push({ slot: slot.id, candidates: oneCands.map(w => w.id), chosen: chosenIds[0] ?? null, reason: 'more candidates than capacity, no preference rule' });
      plan.confidence -= 0.15;
    }
    if ((slot.min ?? 0) > 0 && chosenIds.length === 0) {
      plan.ambiguities.push({ slot: slot.id, candidates: [], chosen: null, reason: 'required slot unfilled' });
      plan.confidence -= 0.2;
    }
  }

  plan.unused = satisfied.filter(w => !placed.has(w.id)).map(w => w.id);
  plan.proposedReady = proposed.filter(w => satisfies(w, descriptor)).map(w => w.id);
  plan.gaps = findGaps(descriptor, active);
  plan.confidence = +Math.max(0, Math.min(1, plan.confidence)).toFixed(2);
  return plan;
}

// ── Gap analysis: data the descriptor has, that no active widget consumes ─────

export function findGaps(d, active) {
  const present = {
    'analytics.causalChains':      (d.analytics?.causalChainCount ?? 0) > 0,
    'analytics.crossClusterEdges': (d.analytics?.crossClusterEdgeCount ?? 0) > 0,
    'analytics.temporalSequence':  (d.analytics?.temporalCount ?? 0) > 0,
    'analytics.tierDist':          d.analytics?.has?.tierDist === true,
    'analytics.sentimentDist':     d.analytics?.has?.sentimentDist === true,
    'text':                        d.kind === 'text',
    'agent.steps':                 d.kind === 'agent' && (d.agent?.stepCount ?? 0) > 0,
  };
  const consumed = new Set(active.flatMap(w => [w.input, ...(w.consumes ?? [])]));
  return Object.entries(present)
    .filter(([input, isPresent]) => isPresent && !consumed.has(input))
    .map(([input]) => ({ input, reason: 'present in descriptor, no active widget consumes it' }));
}

/** Convenience: count slots grouped by widget id. */
export function summarizePlan(plan) {
  const byWidget = {};
  for (const s of plan.slots) byWidget[s.widget] = (byWidget[s.widget] ?? 0) + 1;
  return { layout: plan.layout, total: plan.slots.length, byWidget, confidence: plan.confidence,
           ambiguities: plan.ambiguities.length, gaps: plan.gaps.map(g => g.input), proposedReady: plan.proposedReady };
}
