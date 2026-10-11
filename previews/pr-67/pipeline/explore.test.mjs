/**
 * pipeline/explore.test.mjs — Unit tests for Stage 1 brief generation.
 * Tests validateBrief, _extractJSON, and explore() with a mocked LLM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateBrief, _extractJSON, explore, registerLLM } from './explore.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MINIMAL_BRIEF = {
  meta:        { id: 'test-brief', title: 'Test Brief' },
  nodes:       [{ id: 'node-a', label: 'Node A', tier: 'spine', sentiment: 'neutral', type: 'concept', metrics: {}, confidence: 0.9 }],
  edges:       [],
  story:       [],
  report_card: { spine: ['node-a'] },
};

const VALID_BRIEF = {
  meta: { id: 'git-flow', title: 'Git Workflows', subtitle: '', domain: 'Software', year: '2026', tags: ['git'], tone: 'analytical' },
  report_card: { summary: 'A brief about git.', key_stats: [], spine: ['trunk-based'], protagonists: [], antagonists: [], themes: [] },
  story: [
    { id: 'beat-1', title: 'Introduction', node: 'trunk-based', nodes: ['git-flow-wf'], narration: 'x'.repeat(80), tension: 'low', focus: 'wide' },
    { id: 'beat-2', title: 'Climax', node: 'trunk-based', nodes: [], narration: 'x'.repeat(80), tension: 'climax', focus: 'tight' },
  ],
  insights: [{ id: 'ins-1', title: 'Insight', body: 'Non-obvious.', type: 'finding', severity: 'medium', evidence: ['trunk-based'] }],
  clusters: [{ id: 'cl-1', label: 'Workflows', color: '#ff6600', nodes: ['trunk-based', 'git-flow-wf'], description: '' }],
  nodes: [
    { id: 'trunk-based', label: 'Trunk-Based Dev', type: 'concept', tier: 'spine',    sentiment: 'positive', description: 'Continuous integration model.', confidence: 0.95, metrics: {} },
    { id: 'git-flow-wf', label: 'GitFlow',         type: 'concept', tier: 'primary',  sentiment: 'neutral',  description: 'Feature branch model.',        confidence: 0.9,  metrics: {} },
  ],
  edges: [
    { from: 'trunk-based', to: 'git-flow-wf', rel: 'opposes', weight: 3, directed: true },
  ],
  enrichment_targets: [
    { node_id: 'trunk-based', priority: 'high' },
    { node_id: 'git-flow-wf', priority: 'medium' },
  ],
  layout_hints: [],
};

// ── validateBrief ─────────────────────────────────────────────────────────────

describe('validateBrief', () => {
  it('accepts a valid brief', () => {
    const { valid } = validateBrief(VALID_BRIEF);
    expect(valid).toBe(true);
  });

  it('rejects null input', () => {
    const { valid, errors } = validateBrief(null);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects brief with no nodes', () => {
    const { valid, errors } = validateBrief({ meta: { id: 'x', title: 'x' }, nodes: [], edges: [] });
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('no nodes'))).toBe(true);
  });

  it('rejects brief with dangling edge endpoint', () => {
    const brief = {
      ...MINIMAL_BRIEF,
      edges: [{ from: 'node-a', to: 'ghost-node', rel: 'causes' }],
    };
    const { valid, errors } = validateBrief(brief);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('ghost-node'))).toBe(true);
  });

  it('rejects brief when spine node is missing from nodes[]', () => {
    const brief = { ...MINIMAL_BRIEF, report_card: { spine: ['missing-spine'] } };
    const { valid, errors } = validateBrief(brief);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('missing-spine'))).toBe(true);
  });

  it('rejects brief with story beat referencing unknown node', () => {
    const brief = {
      ...MINIMAL_BRIEF,
      story: [{ id: 'b1', title: 'Beat', node: 'nonexistent', nodes: [], narration: '', tension: 'low', focus: 'wide' }],
    };
    const { valid, errors } = validateBrief(brief);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('nonexistent'))).toBe(true);
  });

  it('accepts brief with no edges (edge validation is a no-op)', () => {
    const { valid } = validateBrief({ ...MINIMAL_BRIEF, edges: [] });
    expect(valid).toBe(true);
  });
});

// ── _extractJSON ──────────────────────────────────────────────────────────────

describe('_extractJSON', () => {
  it('parses clean JSON', () => {
    const result = _extractJSON('{"key":"value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"key":"value"}\n```';
    expect(_extractJSON(raw)).toEqual({ key: 'value' });
  });

  it('strips ``` fences without language tag', () => {
    const raw = '```\n{"key":"value"}\n```';
    expect(_extractJSON(raw)).toEqual({ key: 'value' });
  });

  it('extracts JSON from surrounding prose', () => {
    const raw = 'Here is your brief:\n{"meta":{"id":"x"}}\nEnd.';
    const result = _extractJSON(raw);
    expect(result.meta.id).toBe('x');
  });

  it('throws on non-JSON string', () => {
    expect(() => _extractJSON('this is not JSON at all')).toThrow();
  });

  it('handles deeply nested JSON', () => {
    const obj = { a: { b: { c: [1, 2, 3] } } };
    expect(_extractJSON(JSON.stringify(obj))).toEqual(obj);
  });
});

// ── explore() with mocked LLM ─────────────────────────────────────────────────

describe('explore()', () => {
  beforeEach(() => {
    // Inject a mock LLM that returns a valid brief JSON
    registerLLM(async (_prompt) => JSON.stringify(VALID_BRIEF));
  });

  afterEach(() => {
    // Clear the mock
    if (typeof window !== 'undefined') delete window.kaaro_llm;
  });

  it('returns a normalised brief for a valid LLM response', async () => {
    const brief = await explore('Trunk-Based Development');
    expect(brief.meta.id).toBe('git-flow');
    expect(brief.nodes.length).toBeGreaterThan(0);
  });

  it('adds enrichment_targets when missing from LLM output', async () => {
    const noTargets = { ...VALID_BRIEF, enrichment_targets: [] };
    registerLLM(async () => JSON.stringify(noTargets));
    const brief = await explore('test seed');
    expect(brief.enrichment_targets.length).toBeGreaterThan(0);
  });

  it('builds nodeLookup for canvas consumption', async () => {
    const brief = await explore('test seed');
    expect(brief.nodeLookup).toBeDefined();
    expect(brief.nodeLookup['trunk-based']).toBeDefined();
  });

  it('emits explore:brief-ready CustomEvent', async () => {
    const events = [];
    document.addEventListener('explore:brief-ready', e => events.push(e.detail));
    await explore('test seed');
    expect(events.length).toBe(1);
    expect(events[0].seed).toBe('test seed');
    document.removeEventListener('explore:brief-ready', () => {});
  });

  it('retries on parse failure and succeeds on retry', async () => {
    let calls = 0;
    registerLLM(async () => {
      calls++;
      if (calls === 1) return 'not valid json at all !!!';
      return JSON.stringify(VALID_BRIEF);
    });
    const brief = await explore('retry test', { retries: 2 });
    expect(brief.meta.id).toBe('git-flow');
    expect(calls).toBe(2);
  });

  it('throws after all retries are exhausted', async () => {
    registerLLM(async () => 'invalid json every time');
    await expect(explore('fail', { retries: 1 })).rejects.toThrow();
  });

  it('throws when no LLM is configured', async () => {
    if (typeof window !== 'undefined') delete window.kaaro_llm;
    // Clear gateway config too
    try { localStorage.removeItem('kv.llm'); localStorage.removeItem('gemini_api_key'); } catch {}
    await expect(explore('no llm')).rejects.toThrow(/No LLM provider/);
  });
});
