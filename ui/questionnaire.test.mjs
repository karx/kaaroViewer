import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeBrief } from './state-descriptor.mjs';
import { routeHeuristic } from './router.mjs';
import { buildQuestionnaire, acceptAnswer, applyAnswers, routeWithQuestionnaire, describeForPrompt } from './questionnaire.mjs';
import { createUIKit } from './index.mjs';

const kaaro = JSON.parse(readFileSync('library/kaaro-viewer.json', 'utf8'));

describe('buildQuestionnaire', () => {
  it('turns a layout ambiguity into a layout hop with registry-derived options', () => {
    const d = describeBrief(kaaro);
    const plan = routeHeuristic(d);
    const hops = buildQuestionnaire(d, plan);
    const layoutHop = hops.find(h => h.kind === 'layout');
    expect(layoutHop).toBeTruthy();
    expect(layoutHop.options.map(o => o.id)).toEqual(expect.arrayContaining(['slide-deck', 'compact-deck']));
    expect(layoutHop.default).toBe('compact-deck');
    expect(layoutHop.question).toMatch(/\[brief: \d+ nodes/);
  });

  it('emits advisory promote hops for proposed widgets whose requires hold', () => {
    const withTime = { ...kaaro, edges: kaaro.edges.map((e, i) => i < 4 ? { ...e, temporal: `2024-0${i + 1}` } : e) };
    const d = describeBrief(withTime);
    const hops = buildQuestionnaire(d, routeHeuristic(d));
    const promote = hops.filter(h => h.kind === 'promote');
    expect(promote.length).toBeGreaterThan(0);
    expect(promote.every(h => h.advisory && h.options.map(o => o.id).join() === 'yes,no')).toBe(true);
  });

  it('adds an omit option only for optional slots', () => {
    const d = describeBrief(kaaro);
    const plan = routeHeuristic(d);
    plan.ambiguities.push({ slot: 'grouping', candidates: ['cluster-slide', 'cluster-overview'], chosen: 'cluster-slide', reason: 'test' });
    plan.ambiguities.push({ slot: 'opener', candidates: ['title-slide', 'title-slide'], chosen: 'title-slide', reason: 'test' });
    const hops = buildQuestionnaire(d, plan);
    expect(hops.find(h => h.id === 'slot:grouping').options.some(o => o.id === 'omit')).toBe(true);
    expect(hops.find(h => h.id === 'slot:opener').options.some(o => o.id === 'omit')).toBe(false);
  });
});

describe('acceptAnswer — the typed guard', () => {
  const hop = { options: [{ id: 'slide-deck' }, { id: 'compact-deck' }] };
  it('accepts ids in the option set, as string or object', () => {
    expect(acceptAnswer(hop, 'slide-deck')).toBe('slide-deck');
    expect(acceptAnswer(hop, ' compact-deck ')).toBe('compact-deck');
    expect(acceptAnswer(hop, { id: 'slide-deck' })).toBe('slide-deck');
  });
  it('rejects hallucinated ids and null', () => {
    expect(acceptAnswer(hop, 'mega-deck')).toBeNull();
    expect(acceptAnswer(hop, null)).toBeNull();
    expect(acceptAnswer(hop, 42)).toBeNull();
  });
});

describe('applyAnswers', () => {
  it('re-routes with forced layout and slot choices, collects promotions', () => {
    const d = describeBrief(kaaro);
    const plan = applyAnswers(d, { layout: 'slide-deck', 'slot:grouping': 'omit', 'promote:timeline': 'yes', 'promote:other': 'no' });
    expect(plan.layout).toBe('slide-deck');
    expect(plan.slots.some(s => s.family === 'grouping')).toBe(false);
    expect(plan.promotions).toEqual(['timeline']);
  });
});

describe('routeWithQuestionnaire', () => {
  it('without ask() it is the pure heuristic', async () => {
    const d = describeBrief(kaaro);
    const r = await routeWithQuestionnaire(d);
    expect(r.asked).toBe(false);
    expect(r.plan.layout).toBe('compact-deck');
    expect(r.answers).toEqual({});
  });

  it('consults ask() only below the confidence gate and applies valid answers', async () => {
    const d = describeBrief(kaaro);
    const seen = [];
    const ask = async (hop) => { seen.push(hop.id); return hop.kind === 'layout' ? 'slide-deck' : 'no'; };
    const r = await routeWithQuestionnaire(d, { ask, confidenceGate: 1.01 });
    expect(r.asked).toBe(true);
    expect(seen).toContain('layout');
    expect(r.plan.layout).toBe('slide-deck');
    expect(r.rejected).toEqual([]);
  });

  it('a hallucinated answer is rejected and the heuristic default stands', async () => {
    const d = describeBrief(kaaro);
    const ask = async (hop) => hop.kind === 'layout' ? 'holo-deck' : null;
    const r = await routeWithQuestionnaire(d, { ask, confidenceGate: 1.01 });
    expect(r.rejected.some(x => x.hop === 'layout' && /option set/.test(x.reason))).toBe(true);
    expect(r.plan.layout).toBe('compact-deck');
  });

  it('a throwing ask() is survivable', async () => {
    const d = describeBrief(kaaro);
    const r = await routeWithQuestionnaire(d, { ask: async () => { throw new Error('boom'); }, confidenceGate: 1.01 });
    expect(r.rejected.some(x => /ask threw/.test(x.reason))).toBe(true);
    expect(r.plan.layout).toBe('compact-deck');
  });

  it('does not ask a confident heuristic even when ask() is provided', async () => {
    const d = describeBrief({ meta: {}, story: [{ id: 'b', node: 'x' }] });
    let called = 0;
    const r = await routeWithQuestionnaire(d, { ask: async () => { called++; return null; }, mode: 'reader' });
    expect(called).toBe(0);
    expect(r.asked).toBe(false);
  });
});

describe('createUIKit', () => {
  it('binds registry + layouts and exposes derived enums', () => {
    const kit = createUIKit();
    expect(kit.enums.ACTIVE_IDS).toContain('title-slide');
    expect(kit.validate().ok).toBe(true);
    const d = kit.describe(kaaro);
    const plan = kit.route(d, { mode: 'reader' });
    expect(plan.layout).toBe('reader-report');
    expect(kit.summarize(plan).total).toBe(plan.slots.length);
    expect(kit.widgets('proposed').length).toBeGreaterThan(0);
    expect(describeForPrompt(d)).toMatch(/scale large/);
  });
});
