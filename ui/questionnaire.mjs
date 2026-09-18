/**
 * ui/questionnaire.mjs — the typed decision hop, derived from the registry.
 *
 * Two routing modes share one option vocabulary (registry ids):
 *
 *   routeWithQuestionnaire  heuristic decides; a classifier is asked only about
 *                           what the heuristic flagged as ambiguous (legacy / cheap).
 *   routeJevFirst           the FULL questionnaire (every layout, slot, capacity and
 *                           promotion decision) goes to a typed decision model in ONE
 *                           batched call; the heuristic supplies structure and is the
 *                           answer of record for any hop below the confidence gate.
 *
 * Hop kinds: 'layout' | 'slot' | 'capacity' | 'promote'
 *   ask(hop)                    → Promise<optionId | null>
 *   askBatch(hops, descriptor)  → Promise<{ answers: {hopId: optionId}, confidence: {hopId: 0..1} }>
 *
 * Answers outside a hop's option set are rejected, so a hallucinated widget id can
 * never reach the renderer, whichever model answered.
 */

import { REGISTRY, LAYOUTS, getWidget, getLayout, getWidgets, satisfies } from './registry.mjs';
import { routeHeuristic, chooseLayout, slotCandidates, itemsFor } from './router.mjs';

const CAPACITY_LEVELS = [
  { id: '1',   label: 'One item only',   description: 'Show a single representative item; the rest is covered by a summary widget or omitted.' },
  { id: '3',   label: 'Top three',       description: 'Three items, highest severity or earliest first.' },
  { id: '5',   label: 'Top five',        description: 'Five items.' },
  { id: 'all', label: 'Every item',      description: 'One widget per item, up to the slot maximum.' },
];

function widgetOption(id, registry) {
  const w = getWidget(id, registry);
  return { id, label: w?.component ?? id, description: w?.description ?? '' };
}
function layoutOption(id, layouts) {
  const l = getLayout(id, layouts);
  return { id, label: l?.label ?? id, description: l?.description ?? '' };
}

/** Compact, prompt-safe summary of a descriptor (numbers only, no free text). */
export function describeForPrompt(d) {
  if (d.kind === 'text')  return `[text: ${d.text.wordCount} words, ${d.text.paragraphCount} paragraphs, ${d.text.headingCount} headings]`;
  if (d.kind === 'agent') return `[agent: ${d.agent.stepCount} steps, ${d.agent.toolCalls} tool calls, ${d.agent.errors} errors]`;
  return `[brief: ${d.nodes.count} nodes, ${d.edges.count} edges, ${d.story.count} beats, ${d.insights.count} insights (${d.insights.bySeverity.high} high), ${d.clusters.count} clusters, scale ${d.scale}]`;
}

// ── Ambiguity-only questionnaire (legacy path) ────────────────────────────────

export function buildQuestionnaire(descriptor, plan, { registry = REGISTRY, layouts = LAYOUTS } = {}) {
  const hops = [];
  const summary = describeForPrompt(descriptor);

  for (const a of plan.ambiguities) {
    if (a.slot === '*' && a.candidates.length > 1) {
      hops.push({
        id: 'layout', kind: 'layout', required: false,
        question: `Which layout best presents this state? ${summary}`,
        options: a.candidates.map(id => layoutOption(id, layouts)),
        default: a.chosen,
      });
    } else if (a.candidates.length > 1) {
      const slot = getLayout(plan.layout, layouts)?.slots.find(s => s.id === a.slot);
      const options = a.candidates.map(id => widgetOption(id, registry));
      if ((slot?.min ?? 0) === 0) options.push({ id: 'omit', label: 'Omit', description: 'Leave this slot empty.' });
      hops.push({
        id: `slot:${a.slot}`, kind: 'slot', slot: a.slot, layout: plan.layout, required: false,
        question: `Slot "${a.slot}" (${slot?.family ?? '?'}) has more candidates than room. Which widget should fill it? ${summary}`,
        options, default: a.chosen,
      });
    }
  }
  for (const id of plan.proposedReady) hops.push(promoteHop(id, registry));
  return hops;
}

function promoteHop(id, registry) {
  return {
    id: `promote:${id}`, kind: 'promote', widget: id, required: false, advisory: true,
    question: `Proposed widget "${id}" (${getWidget(id, registry)?.description ?? ''}) has its requirements satisfied by this state. Would it improve the presentation?`,
    options: [{ id: 'yes', label: 'Yes', description: 'Record as promotion evidence.' }, { id: 'no', label: 'No', description: 'Not useful here.' }],
    default: 'no',
  };
}

// ── Full questionnaire (Jev-first path) ───────────────────────────────────────

/**
 * Every decision the router would make, as typed hops. Slot hops are keyed by
 * layout so all candidate layouts can be asked in the same call:
 *   layout · slot:<layout>:<slot> · capacity:<layout>:<slot> · promote:<widget>
 */
export function buildFullQuestionnaire(descriptor, { registry = REGISTRY, layouts = LAYOUTS, mode = 'slides' } = {}) {
  const hops = [];
  const summary = describeForPrompt(descriptor);
  let { layout, candidates } = chooseLayout(descriptor, { layouts, mode });
  if (!layout) ({ layout, candidates } = chooseLayout(descriptor, { layouts, mode: null }));
  if (!layout) return hops;

  if (candidates.length > 1) {
    hops.push({
      id: 'layout', kind: 'layout', required: true,
      question: `Which layout best presents this state? ${summary}`,
      options: candidates.map(id => layoutOption(id, layouts)),
      default: layout.id,
    });
  }

  for (const layoutId of candidates) {
    const l = getLayout(layoutId, layouts);
    for (const slot of l.slots) {
      const cands = slotCandidates(descriptor, l, slot, { registry });
      if (!cands.length) continue;
      const optional = (slot.min ?? 0) === 0;
      const options = cands.map(w => widgetOption(w.id, registry));
      if (optional) options.push({ id: 'omit', label: 'Omit', description: 'Leave this slot empty for this state.' });
      if (options.length > 1) {
        hops.push({
          id: `slot:${layoutId}:${slot.id}`, kind: 'slot', layout: layoutId, slot: slot.id, required: !optional,
          question: `In layout "${l.label}", which widget should lead the "${slot.family}" slot (capacity ${slot.max})? ${summary}`,
          options, default: cands[0].id,
        });
      }
      const perItem = cands.find(w => w.cardinality === 'per-item');
      if (perItem) {
        const n = itemsFor(perItem, descriptor).length;
        if (n > 1) {
          hops.push({
            id: `capacity:${layoutId}:${slot.id}`, kind: 'capacity', layout: layoutId, slot: slot.id, required: false,
            question: `How many "${perItem.component}" items should the "${slot.family}" slot show? There are ${n}; the slot allows ${slot.max}. ${summary}`,
            options: CAPACITY_LEVELS.map(o => ({ ...o })),
            default: 'all', // the heuristic fills to slot.max; 'all' reproduces it exactly
            itemCount: n, slotMax: slot.max,
          });
        }
      }
    }
  }

  for (const w of getWidgets(registry, { status: 'proposed' })) {
    if (satisfies(w, descriptor)) hops.push(promoteHop(w.id, registry));
  }
  return hops;
}

// ── Answers ──────────────────────────────────────────────────────────────────

/** Validate an answer against the hop's option set. Returns the accepted id or null. */
export function acceptAnswer(hop, answer) {
  if (answer == null) return null;
  const id = typeof answer === 'string' ? answer.trim() : answer?.id;
  return hop.options.some(o => o.id === id) ? id : null;
}

function capacityFromAnswer(hop, id) {
  if (id === 'all') return hop.slotMax;
  const n = Number(id);
  return Number.isFinite(n) ? Math.min(n, hop.slotMax) : hop.slotMax;
}

/** Turn accepted answers into router `forced` overrides for the chosen layout. */
export function answersToForced(hops, answers) {
  const forced = { layout: null, slots: {}, capacity: {} };
  const promotions = [];
  const byId = Object.fromEntries(hops.map(h => [h.id, h]));
  const layoutId = answers.layout ?? hops.find(h => h.kind === 'layout')?.default ?? null;
  if (layoutId) forced.layout = layoutId;
  for (const [hopId, id] of Object.entries(answers ?? {})) {
    const hop = byId[hopId];
    if (id == null) continue;
    if (hopId.startsWith('promote:')) { if (id === 'yes') promotions.push(hopId.slice(8)); continue; }
    if (!hop) { if (hopId.startsWith('slot:')) forced.slots[hopId.slice(5)] = id; continue; } // legacy slot:<slot>
    if (hop.kind === 'slot' && (!hop.layout || !forced.layout || hop.layout === forced.layout)) forced.slots[hop.slot] = id;
    if (hop.kind === 'capacity' && (!forced.layout || hop.layout === forced.layout)) forced.capacity[hop.slot] = capacityFromAnswer(hop, id);
  }
  return { forced, promotions };
}

/** Apply accepted answers by re-running the deterministic router with forced choices. */
export function applyAnswers(descriptor, answers, opts = {}, hops = []) {
  const { forced, promotions } = answersToForced(hops, answers);
  if (!forced.layout) delete forced.layout;
  const plan = routeHeuristic(descriptor, { ...opts, forced });
  plan.promotions = promotions;
  return plan;
}

// ── Legacy: heuristic first, ask only when unsure ─────────────────────────────

export async function routeWithQuestionnaire(descriptor, {
  ask = null, confidenceGate = 0.85, registry = REGISTRY, layouts = LAYOUTS, mode = 'slides',
} = {}) {
  const opts = { registry, layouts, mode };
  const base = routeHeuristic(descriptor, opts);
  const hops = buildQuestionnaire(descriptor, base, { registry, layouts });
  const answers = {}, rejected = [];

  const needsAsk = ask && (base.confidence < confidenceGate || hops.some(h => h.kind === 'promote'));
  if (needsAsk) {
    for (const hop of hops) {
      let raw = null;
      try { raw = await ask(hop); } catch (err) { rejected.push({ hop: hop.id, raw: String(err), reason: 'ask threw' }); continue; }
      const ok = acceptAnswer(hop, raw);
      if (ok == null && raw != null) rejected.push({ hop: hop.id, raw, reason: 'not in option set' });
      answers[hop.id] = ok ?? hop.default;
    }
  }

  const plan = Object.keys(answers).length ? applyAnswers(descriptor, answers, opts, hops) : base;
  return { plan, hops, answers, rejected, asked: !!needsAsk, baseConfidence: base.confidence };
}

// ── Jev-first: one batched call, heuristic as backup per hop ──────────────────

export async function routeJevFirst(descriptor, {
  askBatch = null, gate = 0.7, registry = REGISTRY, layouts = LAYOUTS, mode = 'slides', provider = null,
} = {}) {
  const opts = { registry, layouts, mode };
  const base = routeHeuristic(descriptor, opts);
  const hops = buildFullQuestionnaire(descriptor, opts);

  const trail = [];
  const answers = {};
  let error = null, usage = null;
  let batch = null;
  if (askBatch && hops.length) {
    try { batch = await askBatch(hops, descriptor); usage = batch?.usage ?? null; }
    catch (err) { error = String(err?.message ?? err); batch = null; }
  }

  for (const hop of hops) {
    const raw  = batch?.answers?.[hop.id];
    const conf = Number(batch?.confidence?.[hop.id] ?? 0);
    const ok   = acceptAnswer(hop, raw);
    const useModel = ok != null && conf >= gate;
    const answer = useModel ? ok : hop.default;
    answers[hop.id] = answer;
    trail.push({
      id: hop.id, kind: hop.kind, layout: hop.layout ?? null, slot: hop.slot ?? null,
      options: hop.options.map(o => o.id), answer, confidence: +conf.toFixed(3),
      source: useModel ? 'model' : 'heuristic',
      rejected: raw != null && ok == null ? String(raw) : undefined,
    });
  }

  const plan = hops.length ? applyAnswers(descriptor, answers, opts, hops) : base;
  const modelCount = trail.filter(t => t.source === 'model').length;
  plan.decisions = {
    provider: batch ? (provider ?? 'model') : 'heuristic', gate, error, usage,
    hops: trail, counts: { total: trail.length, model: modelCount, heuristic: trail.length - modelCount },
  };
  return { plan, hops, answers, base, error };
}
