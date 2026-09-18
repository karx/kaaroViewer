import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeBrief } from './state-descriptor.mjs';
import { routeHeuristic } from './router.mjs';
import { routeJevFirst } from './questionnaire.mjs';
import { buildHero, heroToPlan, validateHero, resolveBinding, priorEnrichment, toCanvasDoc, HERO_API } from './hero.mjs';
import { REGISTRY } from './registry.mjs';

const kaaro = JSON.parse(readFileSync('library/kaaro-viewer.json', 'utf8'));

async function makeHero(enrichment = {}) {
  const d = describeBrief(kaaro);
  const { plan } = await routeJevFirst(d, { mode: 'slides' });
  return buildHero({ doc: kaaro, plan, mode: 'slides', source: { path: './library/kaaro-viewer.json', sha256: 'abc' }, enrichment, generated: '2026-09-17' });
}

describe('buildHero — Toolpad-inspired DSL, not the library shape', () => {
  it('has apiVersion/kind/queries/pages and binds props to the brief by data path', async () => {
    const hero = await makeHero();
    expect(hero.apiVersion).toBe(HERO_API);
    expect(hero.kind).toBe('hero');
    expect(hero.queries.map(q => q.name)).toEqual(['brief', 'analytics']);
    expect(hero.nodes).toBeUndefined();          // never copies the brief
    expect(hero.story).toBeUndefined();
    const page = hero.pages[0];
    expect(page.layout).toBe('compact-deck');
    const beat = page.content.find(el => el.component === 'beat-slide');
    expect(beat.key).toBe(kaaro.story[0].id);
    expect(beat.props.beat.$$bind).toBe(`brief.story[id=${kaaro.story[0].id}]`);
    expect(page.content.every(el => el.name)).toBe(true);
    expect(new Set(page.content.map(el => el.name)).size).toBe(page.content.length);
  });

  it('adds enrichment skeletons only for widgets that declare enrich_schema, preserving prior text', async () => {
    const hero = await makeHero({ 'cluster-overview': { caption: 'kept' } });
    const clo = hero.pages[0].content.find(el => el.component === 'cluster-overview');
    expect(clo.enrichment).toEqual({ caption: 'kept' });
    const title = hero.pages[0].content.find(el => el.component === 'title-slide');
    expect(title.enrichment).toEqual({ tagline: '' });
    const beat = hero.pages[0].content.find(el => el.component === 'beat-slide');
    expect(beat.enrichment).toBeUndefined();
    expect(priorEnrichment(hero)['cluster-overview'].caption).toBe('kept');
  });

  it('records the decision trail with per-hop source', async () => {
    const hero = await makeHero();
    expect(hero.decisions.provider).toBe('heuristic');
    expect(hero.decisions.hops.every(h => h.source === 'heuristic')).toBe(true);
  });
});

describe('heroToPlan round trip', () => {
  it('reproduces the widget sequence, keys, frames and enrichment', async () => {
    const hero = await makeHero({ 'causal-chain': { why: 'because' } });
    const plan = heroToPlan(hero);
    const d = describeBrief(kaaro);
    const direct = routeHeuristic(d, { mode: 'slides' });
    expect(plan.slots.map(s => s.widget)).toEqual(direct.slots.map(s => s.widget));
    expect(plan.slots.filter(s => s.item).map(s => s.item.id)).toEqual(direct.slots.filter(s => s.item).map(s => s.item.id));
    expect(plan.slots.map(s => s.frames)).toEqual(direct.slots.map(s => s.frames));
    expect(plan.slots.find(s => s.widget === 'causal-chain').enrichment.why).toBe('because');
    expect(plan.hero).toBe('kaaro-viewer');
  });
});

describe('resolveBinding', () => {
  it('walks brief sections, id selectors and analytics', () => {
    const doc = toCanvasDoc(kaaro);
    expect(resolveBinding('brief.meta', { doc }).id).toBe('kaaro-viewer');
    expect(resolveBinding(`brief.story[id=${kaaro.story[1].id}]`, { doc }).title).toBe(kaaro.story[1].title);
    expect(resolveBinding('analytics.centrality', { doc, analytics: doc.analytics })).toBeTruthy();
    expect(resolveBinding('brief.story[id=nope]', { doc })).toBeUndefined();
    expect(resolveBinding('window.alert', { doc })).toBeUndefined();
  });
});

describe('validateHero', () => {
  it('the built hero validates against its brief (warnings only for empty enrichment)', async () => {
    const hero = await makeHero();
    const r = validateHero(hero, { doc: kaaro });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some(w => /enrichment "tagline" is empty/.test(w))).toBe(true);
  });

  it('rejects unknown components, bad bindings, foreign frames, and off-schema enrichment', async () => {
    const hero = await makeHero();
    const el = hero.pages[0].content[0];
    hero.pages[0].content.push({ component: 'mega-widget', name: 'x', props: {}, frames: [], layout: { slot: 'nowhere' } });
    hero.pages[0].content.push({ component: 'closer-slide', name: 'x2', props: {}, frames: ['ghost'], layout: { slot: 'nowhere' } });
    el.props.meta = { $$bind: 'brief.story[id=missing]' };
    const clo = hero.pages[0].content.find(e => e.component === 'cluster-overview');
    clo.enrichment.bogus = 'x';
    hero.decisions.hops[0].answer = 'not-an-option';
    const r = validateHero(hero, { doc: kaaro });
    const text = r.errors.join('\n');
    expect(text).toMatch(/not in registry/);
    expect(text).toMatch(/frame "ghost"/);
    expect(text).toMatch(/resolves to nothing/);
    expect(text).toMatch(/slot "nowhere"/);
    expect(text).toMatch(/"bogus" not in enrich_schema/);
    expect(text).toMatch(/not among its options/);
  });

  it('warns when the registry version moved on', async () => {
    const hero = await makeHero();
    hero.registry.version = (REGISTRY.version ?? 0) - 1;
    expect(validateHero(hero, { doc: kaaro }).warnings.join('\n')).toMatch(/regenerate/);
  });
});
