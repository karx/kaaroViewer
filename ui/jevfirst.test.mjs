import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeBrief } from './state-descriptor.mjs';
import { routeHeuristic } from './router.mjs';
import { buildFullQuestionnaire, routeJevFirst, answersToForced, acceptAnswer } from './questionnaire.mjs';

const kaaro = JSON.parse(readFileSync('library/kaaro-viewer.json', 'utf8'));
const esp   = JSON.parse(readFileSync('library/esp-ecosystem.json', 'utf8'));

describe('buildFullQuestionnaire', () => {
  it('asks every decision, keyed by layout, for a large brief', () => {
    const hops = buildFullQuestionnaire(describeBrief(kaaro), { mode: 'slides' });
    const ids = hops.map(h => h.id);
    expect(ids).toContain('layout');
    expect(ids.some(i => i.startsWith('slot:compact-deck:'))).toBe(true);
    expect(ids.some(i => i.startsWith('slot:slide-deck:'))).toBe(true);
    expect(ids.some(i => i.startsWith('capacity:compact-deck:narrative'))).toBe(true);
    // every hop has >1 option and a default inside its options
    for (const h of hops) {
      expect(h.options.length).toBeGreaterThan(1);
      expect(h.options.map(o => o.id)).toContain(h.default);
    }
  });

  it('a small brief with one candidate layout has no layout hop but still has slot/capacity hops', () => {
    const hops = buildFullQuestionnaire(describeBrief(esp), { mode: 'slides' });
    expect(hops.find(h => h.kind === 'layout')).toBeUndefined();
    expect(hops.some(h => h.kind === 'slot')).toBe(true);
    expect(hops.some(h => h.kind === 'capacity')).toBe(true);
  });

  it('optional slots offer omit; required single-candidate slots are not asked', () => {
    const hops = buildFullQuestionnaire(describeBrief(esp), { mode: 'slides' });
    const opener = hops.find(h => h.id === 'slot:slide-deck:opener');
    expect(opener).toBeUndefined(); // title-slide only, required
    const overview = hops.find(h => h.id === 'slot:slide-deck:overview');
    expect(overview.options.map(o => o.id)).toContain('omit');
  });
});

describe('answersToForced', () => {
  it('applies only the chosen layout\'s slot and capacity answers', () => {
    const d = describeBrief(kaaro);
    const hops = buildFullQuestionnaire(d, { mode: 'slides' });
    const answers = { layout: 'slide-deck', 'slot:compact-deck:grouping': 'omit', 'slot:slide-deck:grouping': 'cluster-slide', 'capacity:slide-deck:narrative': '3', 'promote:timeline': 'yes' };
    const { forced, promotions } = answersToForced(hops, answers);
    expect(forced.layout).toBe('slide-deck');
    expect(forced.slots.grouping).toBe('cluster-slide');
    expect(forced.capacity.narrative).toBe(3);
    expect(promotions).toEqual(['timeline']);
  });
});

describe('routeJevFirst', () => {
  it('without askBatch every hop is heuristic and the plan equals the heuristic plan', async () => {
    const d = describeBrief(kaaro);
    const { plan, base } = await routeJevFirst(d, { mode: 'slides' });
    expect(plan.decisions.provider).toBe('heuristic');
    expect(plan.decisions.counts.model).toBe(0);
    expect(plan.layout).toBe(base.layout);
    expect(plan.slots.map(s => s.widget)).toEqual(base.slots.map(s => s.widget));
  });

  it('model answers above the gate win; below the gate the heuristic default stands', async () => {
    const d = describeBrief(kaaro);
    const askBatch = async (hops) => {
      const answers = {}, confidence = {};
      for (const h of hops) {
        if (h.id === 'layout') { answers[h.id] = 'slide-deck'; confidence[h.id] = 0.95; }
        else if (h.id === 'capacity:slide-deck:narrative') { answers[h.id] = '3'; confidence[h.id] = 0.9; }
        else if (h.id === 'slot:slide-deck:grouping') { answers[h.id] = 'omit'; confidence[h.id] = 0.2; } // below gate
        else { answers[h.id] = h.default; confidence[h.id] = 0.5; }
      }
      return { answers, confidence };
    };
    const { plan } = await routeJevFirst(d, { askBatch, gate: 0.7, mode: 'slides', provider: 'stub' });
    expect(plan.decisions.provider).toBe('stub');
    expect(plan.layout).toBe('slide-deck');
    expect(plan.slots.filter(s => s.widget === 'beat-slide').length).toBe(3);
    expect(plan.slots.some(s => s.family === 'grouping')).toBe(true); // omit rejected by gate
    const trail = Object.fromEntries(plan.decisions.hops.map(h => [h.id, h]));
    expect(trail.layout.source).toBe('model');
    expect(trail['slot:slide-deck:grouping'].source).toBe('heuristic');
    expect(plan.decisions.counts.model).toBe(2);
  });

  it('hallucinated ids are rejected and recorded; a throwing askBatch degrades to heuristic', async () => {
    const d = describeBrief(kaaro);
    const bad = async (hops) => ({ answers: Object.fromEntries(hops.map(h => [h.id, 'mega-widget'])), confidence: Object.fromEntries(hops.map(h => [h.id, 0.99])) });
    const r1 = await routeJevFirst(d, { askBatch: bad, mode: 'slides' });
    expect(r1.plan.decisions.counts.model).toBe(0);
    expect(r1.plan.decisions.hops.every(h => h.rejected === 'mega-widget')).toBe(true);
    const r2 = await routeJevFirst(d, { askBatch: async () => { throw new Error('boom'); }, mode: 'slides' });
    expect(r2.error).toMatch(/boom/);
    expect(r2.plan.decisions.provider).toBe('heuristic');
    expect(r2.plan.layout).toBe(routeHeuristic(d).layout);
  });

  it('acceptAnswer still guards every hop', () => {
    expect(acceptAnswer({ options: [{ id: 'x' }] }, 'x')).toBe('x');
    expect(acceptAnswer({ options: [{ id: 'x' }] }, 'y')).toBeNull();
  });
});
