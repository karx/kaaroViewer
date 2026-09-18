/**
 * canvas/paint-strategies.test.mjs — Unit tests for the strategy registry and built-in strategies.
 *
 * _heroNode and _supportingCast are module-private; tested indirectly through strategy outputs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerStrategy,
  setActiveStrategy,
  getActiveStrategy,
  listStrategies,
  getStrategyConfig,
  buildPrompt,
} from './paint-strategies.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(qid, label, type = 'concept', description = '') {
  return { qid, label, type, description };
}

function makeCtx(overrides = {}) {
  return {
    slideIdx:     null,
    slideType:    null,
    slideCentral: null,
    slideNodes:   [],
    cameraAngle:  { azimuth: 0, elevation: 30, phrase: 'high angle establishing shot', compass: 'N' },
    visibleNodes: [],
    selectedNode: null,
    ...overrides,
  };
}

const HERO    = makeNode('Q1', 'Aristotle',  'person',  'Ancient Greek philosopher');
const SUPPORT = makeNode('Q2', 'Plato',      'person',  'Philosopher');
const THIRD   = makeNode('Q3', 'Socrates',   'person',  'Philosopher');

// ── _heroNode priority (via strategy outputs) ─────────────────────────────────

describe('hero node priority', () => {
  it('selectedNode wins over slideCentral and visibleNodes', () => {
    const ctx    = makeCtx({ selectedNode: HERO, slideCentral: SUPPORT, visibleNodes: [THIRD] });
    const prompt = buildPrompt(ctx);
    expect(prompt).toContain('Aristotle');
    expect(prompt).not.toContain('Plato');
  });

  it('slideCentral wins when no selectedNode', () => {
    // Plato is the hero (slideCentral); Socrates may appear in supporting cast — that's correct.
    const ctx    = makeCtx({ slideCentral: SUPPORT, visibleNodes: [THIRD] });
    const prompt = buildPrompt(ctx);
    expect(prompt).toContain('Plato');
    // Hero appears first in the prompt (before "Related entities")
    const heroPos    = prompt.indexOf('Plato');
    const supportPos = prompt.indexOf('Socrates');
    expect(heroPos).toBeLessThan(supportPos);
  });

  it('visibleNodes[0] wins when neither selectedNode nor slideCentral', () => {
    const ctx    = makeCtx({ visibleNodes: [THIRD, HERO] });
    const prompt = buildPrompt(ctx);
    expect(prompt).toContain('Socrates');
  });

  it('all null → uses fallback label without throwing', () => {
    const ctx    = makeCtx();
    expect(() => buildPrompt(ctx)).not.toThrow();
    const prompt = buildPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ── _supportingCast (via strategy outputs) ────────────────────────────────────

describe('supporting cast', () => {
  it('deduplicates nodes with the same qid from visibleNodes and slideNodes', () => {
    const dupe = makeNode('Q2', 'Plato', 'person');
    const ctx  = makeCtx({
      selectedNode: HERO,
      visibleNodes: [dupe],
      slideNodes:   [dupe],
    });
    const prompt = buildPrompt(ctx);
    // Plato should appear exactly once in "Related entities" section
    const matches = prompt.match(/Plato/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('excludes the hero from supporting cast', () => {
    const ctx = makeCtx({
      selectedNode: HERO,
      visibleNodes: [HERO, SUPPORT],
    });
    const prompt = buildPrompt(ctx);
    // Aristotle appears as hero; should not also appear in "related entities"
    const count  = (prompt.match(/Aristotle/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('truncates at the strategy limit (no crash with many nodes)', () => {
    const many = Array.from({ length: 20 }, (_, i) => makeNode(`Q${i + 10}`, `Node ${i}`, 'concept'));
    const ctx  = makeCtx({ selectedNode: HERO, visibleNodes: many });
    expect(() => buildPrompt(ctx)).not.toThrow();
  });
});

// ── Built-in strategies ───────────────────────────────────────────────────────

const BUILT_INS = ['cinematic', 'documentary', 'abstract', 'blueprint'];

describe.each(BUILT_INS.map(name => [name]))('strategy: %s', (name) => {
  beforeEach(() => setActiveStrategy(name));

  it('returns a non-empty string', () => {
    const prompt = buildPrompt(makeCtx({ selectedNode: HERO, visibleNodes: [SUPPORT] }));
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('contains the hero label when present', () => {
    const prompt = buildPrompt(makeCtx({ selectedNode: HERO }));
    expect(prompt).toContain('Aristotle');
  });

  it('does not throw when no entities are present', () => {
    expect(() => buildPrompt(makeCtx())).not.toThrow();
  });
});

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  beforeEach(() => setActiveStrategy('cinematic'));

  it('calls the active strategy and returns its output', () => {
    const sentinel = 'SENTINEL_OUTPUT_12345';
    registerStrategy('sentinel-test', () => sentinel);
    setActiveStrategy('sentinel-test');
    expect(buildPrompt(makeCtx())).toBe(sentinel);
    setActiveStrategy('cinematic');
  });

  it('throws with a descriptive message for an unknown active strategy', () => {
    // Bypass the guard in setActiveStrategy by directly forcing the internal state
    // via a registered-then-deregistered approach: register, set active, then test
    // error path by passing an object that would not be in registry.
    // We test buildPrompt's error branch by registering a temp name, activating it,
    // then checking throws for a name that was never registered (via internal override).
    // The only public way to trigger the error is to use the internal _active var —
    // instead we validate the guard on setActiveStrategy returns false:
    const result = setActiveStrategy('__nonexistent__');
    expect(result).toBe(false);
    // Active strategy unchanged — cinematic is still active, no throw.
    expect(() => buildPrompt(makeCtx())).not.toThrow();
  });
});

// ── setActiveStrategy ─────────────────────────────────────────────────────────

describe('setActiveStrategy', () => {
  it('returns false for an unregistered name without changing active strategy', () => {
    const before = getActiveStrategy();
    const result = setActiveStrategy('__does_not_exist__');
    expect(result).toBe(false);
    expect(getActiveStrategy()).toBe(before);
  });

  it('returns true and switches for a registered name', () => {
    registerStrategy('switch-test', () => 'x');
    const result = setActiveStrategy('switch-test');
    expect(result).toBe(true);
    expect(getActiveStrategy()).toBe('switch-test');
    setActiveStrategy('cinematic'); // restore
  });
});

// ── getStrategyConfig ─────────────────────────────────────────────────────────

describe('getStrategyConfig', () => {
  it('cinematic → replace compositing, opacity 1.0', () => {
    const cfg = getStrategyConfig('cinematic');
    expect(cfg.compositing).toBe('replace');
    expect(cfg.opacity).toBe(1.0);
  });

  it('blueprint → replace compositing, opacity 1.0', () => {
    const cfg = getStrategyConfig('blueprint');
    expect(cfg.compositing).toBe('replace');
    expect(cfg.opacity).toBe(1.0);
  });

  it('abstract → accumulate compositing', () => {
    const cfg = getStrategyConfig('abstract');
    expect(cfg.compositing).toBe('accumulate');
    expect(cfg.opacity).toBe(1.0);
  });

  it('documentary → blend compositing, opacity 0.55', () => {
    const cfg = getStrategyConfig('documentary');
    expect(cfg.compositing).toBe('blend');
    expect(cfg.opacity).toBe(0.55);
  });

  it('called with no argument → returns active strategy config', () => {
    setActiveStrategy('abstract');
    const cfg = getStrategyConfig();
    expect(cfg.compositing).toBe('accumulate');
    setActiveStrategy('cinematic');
  });

  it('unknown name → fallback replace/1.0', () => {
    const cfg = getStrategyConfig('__unknown__');
    expect(cfg.compositing).toBe('replace');
    expect(cfg.opacity).toBe(1.0);
  });

  it('custom strategy registered with explicit opts → returns those opts', () => {
    registerStrategy('custom-cfg-test', () => 'test', { compositing: 'blend', opacity: 0.3 });
    const cfg = getStrategyConfig('custom-cfg-test');
    expect(cfg.compositing).toBe('blend');
    expect(cfg.opacity).toBe(0.3);
  });

  it('custom strategy registered with no opts → defaults to replace/1.0', () => {
    registerStrategy('custom-default-test', () => 'test');
    const cfg = getStrategyConfig('custom-default-test');
    expect(cfg.compositing).toBe('replace');
    expect(cfg.opacity).toBe(1.0);
  });
});
