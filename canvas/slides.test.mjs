/**
 * slides.test.mjs — end-to-end wiring: library JSON → registry router → rendered deck.
 *
 * Guards the lockstep between ui/registry.json and canvas/slides.mjs: every
 * widget the router places for a real library entry must render into the DOM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveAnalytics } from '../pipeline/analytics.mjs';
import { initSlides, renderSlides, getActivePlan } from './slides.mjs';
import { REGISTRY } from '../ui/registry.mjs';

function loadDoc(id) {
  const raw = JSON.parse(readFileSync(`library/${id}.json`, 'utf8'));
  const nodeLookup = Object.fromEntries(raw.nodes.map(n => [n.id, n]));
  const analytics = deriveAnalytics(raw.nodes, raw.edges, raw.clusters, raw.insights, raw.story);
  return { ...raw.meta, ...raw, nodeLookup, analytics };
}

// jsdom has no IntersectionObserver and no layout; the deck only needs the DOM.
class FakeIO { constructor() {} observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
globalThis.IntersectionObserver = FakeIO;
Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

beforeEach(() => {
  document.body.innerHTML = '<div class="middle"></div>';
  initSlides();
});

describe('slides deck is built from the registry plan', () => {
  it('large brief → compact-deck with the promoted widgets rendered', () => {
    const doc = loadDoc('kaaro-viewer');
    renderSlides(doc);
    const plan = getActivePlan();
    expect(plan.layout).toBe('compact-deck');

    const rendered = [...document.querySelectorAll('.sl-slide')];
    expect(rendered.length).toBe(plan.slots.length);

    const html = document.querySelector('.sl-track').innerHTML;
    expect(html).toContain('sl-clo-grid');      // cluster-overview
    expect(html).toContain('sl-im-grid');       // insight-matrix
    expect(html).toContain('sl-br-list');       // cluster-bridges
    expect(html).toContain('Tiers');            // tier bar inside analytics
    expect(document.querySelectorAll('.sl-slide-cluster').length).toBe(0); // per-cluster slides collapsed
  });

  it('small brief → slide-deck with one slide per beat, insight and cluster', () => {
    const doc = loadDoc('esp-ecosystem');
    renderSlides(doc);
    const plan = getActivePlan();
    expect(plan.layout).toBe('slide-deck');
    expect(document.querySelectorAll('.sl-slide-beat').length).toBe(doc.story.length);
    expect(document.querySelectorAll('.sl-slide-insight').length).toBe(doc.insights.length);
    expect(document.querySelectorAll('.sl-slide-cluster').length).toBe(doc.clusters.length);
    expect(document.querySelector('.sl-slide-title')).toBeTruthy();
    expect([...document.querySelectorAll('.sl-slide')].at(-1).classList.contains('sl-slide-eval')).toBe(true);
  });

  it('every active slide widget in the registry renders for at least one library entry', () => {
    const slideWidgets = REGISTRY.widgets.filter(w => w.status === 'active' && w.family === 'slide').map(w => w.id);
    const seen = new Set();
    for (const id of ['kaaro-viewer', 'esp-ecosystem', 'poker-tooling-2026', 'gig-worker-projects']) {
      renderSlides(loadDoc(id));
      for (const s of getActivePlan().slots) seen.add(s.widget);
    }
    const missing = slideWidgets.filter(w => !seen.has(w));
    expect(missing).toEqual([]);
  });

  it('insight-matrix cells link to insight slides or carry evidence frames', () => {
    renderSlides(loadDoc('kaaro-viewer'));
    const cells = [...document.querySelectorAll('.sl-im-item')];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.dataset.gotoSlide).toMatch(/^insight-/);
      expect(typeof c.dataset.frame).toBe('string');
    }
  });
});
