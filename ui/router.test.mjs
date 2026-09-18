import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeBrief, describeText, describeAgentState } from './state-descriptor.mjs';
import { routeHeuristic, chooseLayout, framesFor, findGaps, summarizePlan } from './router.mjs';
import { REGISTRY, LAYOUTS, getWidgets } from './registry.mjs';

const load = (id) => JSON.parse(readFileSync(`library/${id}.json`, 'utf8'));
const kaaro = load('kaaro-viewer');          // large: 31N 64E
const agents = load('what-are-agents-teaching-us'); // 25N 50E

describe('chooseLayout', () => {
  it('picks the most specific matching layout', () => {
    const d = describeBrief(kaaro);
    const { layout, candidates } = chooseLayout(d, { mode: 'slides' });
    expect(candidates).toEqual(expect.arrayContaining(['slide-deck', 'compact-deck']));
    expect(layout.id).toBe('compact-deck'); // large → 2 when-clauses beat 1
  });

  it('respects mode and forced layout', () => {
    const d = describeBrief(kaaro);
    expect(chooseLayout(d, { mode: 'reader' }).layout.id).toBe('reader-report');
    expect(chooseLayout(d, { forced: 'slide-deck' }).layout.id).toBe('slide-deck');
    expect(() => chooseLayout(d, { forced: 'nope' })).toThrow(/not in registry/);
  });

  it('non-brief descriptors get the HUD', () => {
    expect(chooseLayout(describeText('some words'), {}).layout.id).toBe('hud-overlay');
    expect(chooseLayout(describeAgentState({ steps: [] }), {}).layout.id).toBe('hud-overlay');
  });
});

describe('routeHeuristic — slide-deck reproduces the legacy _buildSlides order', () => {
  it('title, briefing, arc, beats, insights, clusters, analytics, closer, eval', () => {
    const d = describeBrief(agents);
    const plan = routeHeuristic(d, { forced: { layout: 'slide-deck' } });
    const seq = plan.slots.map(s => s.widget);
    expect(seq[0]).toBe('title-slide');
    expect(seq[1]).toBe('briefing-slide');
    expect(seq[2]).toBe('arc-slide');
    const beats = seq.filter(w => w === 'beat-slide').length;
    expect(beats).toBe(agents.story.length);
    expect(seq.filter(w => w === 'insight-slide').length).toBe(agents.insights.length);
    expect(seq.filter(w => w === 'cluster-slide').length).toBe(agents.clusters.length);
    // metrics slot: analytics first, then the promoted causal-chain / cluster-bridges when data allows
    expect(seq.indexOf('analytics-slide')).toBeGreaterThan(seq.lastIndexOf('cluster-slide'));
    expect(plan.slots.filter(s => s.family === 'metrics')[0].widget).toBe('analytics-slide');
    expect(seq.at(-2)).toBe('closer-slide');
    expect(seq.at(-1)).toBe('eval-slide');
    // ordering: all beats before all insights before all clusters
    expect(seq.lastIndexOf('beat-slide')).toBeLessThan(seq.indexOf('insight-slide'));
    expect(seq.lastIndexOf('insight-slide')).toBeLessThan(seq.indexOf('cluster-slide'));
  });

  it('every widget id in the plan exists in the registry', () => {
    const ids = new Set(REGISTRY.widgets.map(w => w.id));
    for (const id of ['kaaro-viewer', 'what-are-agents-teaching-us', 'gig-worker-projects']) {
      const plan = routeHeuristic(describeBrief(load(id)));
      expect(plan.slots.every(s => ids.has(s.widget))).toBe(true);
    }
  });

  it('per-item slots carry item ids and frames', () => {
    const d = describeBrief(agents);
    const plan = routeHeuristic(d, { forced: { layout: 'slide-deck' } });
    const beat0 = plan.slots.find(s => s.widget === 'beat-slide');
    expect(beat0.item.id).toBe(agents.story[0].id);
    expect(beat0.frames).toEqual([agents.story[0].node, ...(agents.story[0].nodes ?? [])].filter(Boolean));
    const cl0 = plan.slots.find(s => s.widget === 'cluster-slide');
    expect(cl0.frames).toEqual(agents.clusters[0].nodes);
  });

  it('insights are ordered high severity first', () => {
    const d = describeBrief({ meta: {}, insights: [
      { id: 'lo', severity: 'low' }, { id: 'hi', severity: 'high' }, { id: 'md', severity: 'medium' },
    ] });
    const plan = routeHeuristic(d, { forced: { layout: 'slide-deck' } });
    expect(plan.slots.filter(s => s.widget === 'insight-slide').map(s => s.item.id)).toEqual(['hi', 'md', 'lo']);
  });

  it('omits briefing and arc when the brief has no summary/stats or fewer than 2 beats', () => {
    const plan = routeHeuristic(describeBrief({ meta: {}, story: [{ id: 'b0', node: 'x' }] }), { forced: { layout: 'slide-deck' } });
    const seq = plan.slots.map(s => s.widget);
    expect(seq).not.toContain('briefing-slide');
    expect(seq).not.toContain('arc-slide');
    expect(seq).toContain('beat-slide');
    expect(seq).not.toContain('analytics-slide'); // no edges → no centrality; no sentiment counts
  });
});

describe('routeHeuristic — compact-deck and capacity', () => {
  it('large briefs choose compact-deck and truncate clusters to slot max', () => {
    const d = describeBrief(kaaro);
    const plan = routeHeuristic(d);
    expect(plan.layout).toBe('compact-deck');
    expect(plan.slots.filter(s => s.family === 'grouping').length).toBeLessThanOrEqual(1);
    expect(plan.slots.filter(s => s.family === 'analysis').length).toBeLessThanOrEqual(4);
    // the only remaining ambiguity is the layout choice itself
    expect(plan.ambiguities.filter(a => a.slot !== '*')).toEqual([]);
    expect(plan.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('proposed widgets are never placed but are reported as ready', () => {
    const d = describeBrief(kaaro);
    const plan = routeHeuristic(d);
    const proposed = getWidgets(REGISTRY, { status: 'proposed' }).map(w => w.id);
    expect(plan.slots.some(s => proposed.includes(s.widget))).toBe(false);
    expect(plan.proposedReady.every(id => proposed.includes(id))).toBe(true);
    // compact-deck now places the promoted widgets
    expect(plan.slots.map(s => s.widget)).toEqual(expect.arrayContaining(['cluster-overview', 'insight-matrix', 'cluster-bridges']));
  });

  it('forced slot choice overrides, "omit" empties, unknown id throws', () => {
    const d = describeBrief(kaaro);
    const omitted = routeHeuristic(d, { forced: { layout: 'slide-deck', slots: { grouping: 'omit' } } });
    expect(omitted.slots.some(s => s.family === 'grouping')).toBe(false);
    expect(() => routeHeuristic(d, { forced: { slots: { grouping: 'not-a-widget' } } })).toThrow(/not an active registry widget/);
  });
});

describe('routeHeuristic — reader-report', () => {
  it('mirrors report.mjs section order with kpi + briefing in overview', () => {
    const plan = routeHeuristic(describeBrief(kaaro), { mode: 'reader' });
    const seq = plan.slots.map(s => s.widget);
    expect(seq[0]).toBe('report-header');
    expect(seq.slice(1, 3)).toEqual(['kpi-strip', 'briefing-section']);
    expect(seq).toContain('story-arc-section');
    expect(seq).toContain('analytics-panel');
    expect(seq).not.toContain('centrality-bars'); // chart atoms are composed, never placed
    expect(seq.at(-1)).toBe('report-footer');
  });
});

describe('gaps, frames, summary', () => {
  it('findGaps reports derived data with no active consumer', () => {
    const d = describeBrief(kaaro);
    const gaps = findGaps(d, getWidgets(REGISTRY)).map(g => g.input);
    expect(gaps).not.toContain('analytics.causalChains'); // consumed by causal-chain since promotion
    expect(gaps).not.toContain('analytics.sentimentDist');
    const withTime = { ...kaaro, edges: [...kaaro.edges.slice(0, 3).map(e => ({ ...e, temporal: '2024-01' })), ...kaaro.edges.slice(3)] };
    expect(findGaps(describeBrief(withTime), getWidgets(REGISTRY)).map(g => g.input)).toContain('analytics.temporalSequence');
  });

  it('framesFor covers every frame mode without throwing', () => {
    const d = describeBrief(kaaro);
    for (const mode of REGISTRY.frame_modes) {
      const frames = framesFor({ frames: mode }, d, d.story.items[0]);
      expect(Array.isArray(frames)).toBe(true);
    }
    expect(framesFor({ frames: 'spine' }, d)).toEqual(kaaro.report_card.spine);
  });

  it('summarizePlan counts slots per widget', () => {
    const plan = routeHeuristic(describeBrief(agents), { forced: { layout: 'slide-deck' } });
    const s = summarizePlan(plan);
    expect(s.byWidget['beat-slide']).toBe(agents.story.length);
    expect(s.total).toBe(plan.slots.length);
  });

  it('text and agent descriptors route to an empty HUD without throwing', () => {
    const p1 = routeHeuristic(describeText('just words'), {});
    expect(p1.layout).toBe('hud-overlay');
    expect(p1.gaps.map(g => g.input)).toContain('text');
    const p2 = routeHeuristic(describeAgentState({ steps: [{ kind: 'tool' }] }), {});
    expect(p2.gaps.map(g => g.input)).toContain('agent.steps');
  });

  it('throws on a descriptor without kind', () => {
    expect(() => routeHeuristic({})).toThrow(/kind/);
  });
});
