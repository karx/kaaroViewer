/**
 * pipeline/completion.test.mjs — Unit tests for Stages 4a, 4b, 4c.
 * Pure functions (scanStoryBeats, attachEnrichment, addEdgeStubs) need no mocking.
 * runCompletion uses document.dispatchEvent — jsdom provides it.
 */

import { describe, it, expect } from 'vitest';
import { scanStoryBeats, attachEnrichment, addEdgeStubs, runCompletion } from './completion.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBrief(overrides = {}) {
  return {
    nodes: [
      { id: 'node-a', label: 'Node A', type: 'concept', tier: 'spine',    sentiment: 'positive', description: 'desc a', metrics: {}, confidence: 0.9 },
      { id: 'node-b', label: 'Node B', type: 'concept', tier: 'primary',  sentiment: 'neutral',  description: '',       metrics: {}, confidence: 0.7 },
    ],
    edges: [
      { from: 'node-a', to: 'node-b', rel: 'causes', weight: 2, directed: true },
    ],
    story: [
      { id: 'beat-1', title: 'Opening', node: 'node-a', nodes: ['node-b'], narration: 'The story begins.', tension: 'low', focus: 'wide' },
    ],
    insights: [
      { id: 'ins-1', title: 'A finding', body: 'Non-obvious.', type: 'finding', severity: 'medium', evidence: ['node-a'] },
    ],
    report_card: { spine: ['node-a'] },
    ...overrides,
  };
}

// ── scanStoryBeats (Stage 4a) ─────────────────────────────────────────────────

describe('scanStoryBeats', () => {
  it('returns empty added list when all referenced nodes exist', () => {
    const brief = makeBrief();
    const { added } = scanStoryBeats(brief);
    expect(added).toHaveLength(0);
    expect(brief.nodes).toHaveLength(2);
  });

  it('adds a stub for a missing beat.node', () => {
    const brief = makeBrief({
      story: [{ id: 'b1', title: 'Beat', node: 'ghost-node', nodes: [], narration: '', tension: 'low', focus: 'wide' }],
    });
    const { added } = scanStoryBeats(brief);
    expect(added).toContain('ghost-node');
    expect(brief.nodes.some(n => n.id === 'ghost-node')).toBe(true);
  });

  it('adds stubs for missing beat.nodes[] entries', () => {
    const brief = makeBrief({
      story: [{ id: 'b1', title: 'Beat', node: 'node-a', nodes: ['missing-1', 'missing-2'], narration: '', tension: 'medium', focus: 'wide' }],
    });
    const { added } = scanStoryBeats(brief);
    expect(added).toContain('missing-1');
    expect(added).toContain('missing-2');
  });

  it('adds stubs for missing insight evidence nodes', () => {
    const brief = makeBrief({
      insights: [{ id: 'ins-1', title: 'I', body: 'b', type: 'finding', severity: 'low', evidence: ['node-a', 'ghost-evidence'] }],
    });
    const { added } = scanStoryBeats(brief);
    expect(added).toContain('ghost-evidence');
  });

  it('does not add duplicate stubs if same id appears in multiple beats', () => {
    const brief = makeBrief({
      story: [
        { id: 'b1', node: 'ghost', nodes: [], narration: '', tension: 'low', focus: 'wide', title: 'B1' },
        { id: 'b2', node: 'ghost', nodes: [], narration: '', tension: 'low', focus: 'wide', title: 'B2' },
      ],
    });
    const { added } = scanStoryBeats(brief);
    const ghostStubs = brief.nodes.filter(n => n.id === 'ghost');
    expect(ghostStubs).toHaveLength(1);
    expect(added.filter(id => id === 'ghost')).toHaveLength(1);
  });

  it('stub nodes have _stub flag and low confidence', () => {
    const brief = makeBrief({
      story: [{ id: 'b1', node: 'stubbed', nodes: [], narration: '', tension: 'low', focus: 'wide', title: 'Beat' }],
    });
    scanStoryBeats(brief);
    const stub = brief.nodes.find(n => n.id === 'stubbed');
    expect(stub._stub).toBe(true);
    expect(stub.confidence).toBeLessThan(0.5);
  });
});

// ── attachEnrichment (Stage 4b) ───────────────────────────────────────────────

describe('attachEnrichment', () => {
  it('returns zeroes when patches is empty', () => {
    const brief = makeBrief();
    const result = attachEnrichment(brief, {});
    expect(result.enriched).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('merges metrics from patch into node', () => {
    const brief = makeBrief();
    const patches = { 'node-a': { metrics: { 'wikidata.inception': '2005' }, sources: ['wikidata'] } };
    attachEnrichment(brief, patches);
    expect(brief.nodes[0].metrics['wikidata.inception']).toBe('2005');
  });

  it('fills short description from patch.summary', () => {
    const brief = makeBrief();
    const patches = { 'node-b': { summary: 'A longer enriched description.', sources: ['wikipedia'], metrics: {} } };
    attachEnrichment(brief, patches);
    expect(brief.nodes[1].description).toBe('A longer enriched description.');
  });

  it('does not overwrite a long existing description', () => {
    const brief = makeBrief({
      nodes: [{ id: 'node-a', label: 'A', type: 'concept', tier: 'spine', sentiment: 'neutral',
                description: 'This is already a long description with more than forty chars.', metrics: {}, confidence: 0.9 }],
    });
    const patches = { 'node-a': { summary: 'Shorter replacement.', sources: ['wikipedia'], metrics: {} } };
    attachEnrichment(brief, patches);
    expect(brief.nodes[0].description).toContain('already a long description');
  });

  it('sets image from thumbnail when node has none', () => {
    const brief = makeBrief();
    const patches = { 'node-b': { thumbnail: 'https://example.com/img.jpg', sources: ['wikidata'], metrics: {} } };
    attachEnrichment(brief, patches);
    expect(brief.nodes[1].image).toBe('https://example.com/img.jpg');
  });

  it('marks enriched nodes with _enriched flag', () => {
    const brief = makeBrief();
    const patches = { 'node-a': { sources: ['wikidata'], metrics: {} } };
    attachEnrichment(brief, patches);
    expect(brief.nodes[0]._enriched).toBe(true);
  });

  it('promotes stub nodes (removes _stub flag)', () => {
    const brief = makeBrief({
      nodes: [{ id: 'stub-node', label: 'Stub', type: 'concept', tier: 'secondary', sentiment: 'neutral',
                description: 'stub', metrics: {}, confidence: 0.3, _stub: true }],
    });
    const patches = { 'stub-node': { summary: 'Real data now.', sources: ['wikipedia'], metrics: {} } };
    attachEnrichment(brief, patches);
    expect(brief.nodes[0]._stub).toBeUndefined();
  });

  it('rebuilds nodeLookup after enrichment', () => {
    const brief = makeBrief();
    const patches = { 'node-a': { sources: ['wikidata'], metrics: { x: 1 } } };
    attachEnrichment(brief, patches);
    expect(brief.nodeLookup['node-a'].metrics.x).toBe(1);
  });
});

// ── addEdgeStubs (Stage 4c) ───────────────────────────────────────────────────

describe('addEdgeStubs', () => {
  it('returns 0 when patches is null', () => {
    const brief = makeBrief();
    expect(addEdgeStubs(brief, null).added).toBe(0);
  });

  it('adds an edge stub when related_id exists in nodes but no edge present', () => {
    const brief = makeBrief();
    const patches = { 'node-a': { related_ids: ['node-b'], sources: ['wikidata'], metrics: {} } };
    const before = brief.edges.length;
    addEdgeStubs(brief, patches);
    // node-a → node-b already exists as causes edge, so no new stub
    expect(brief.edges.length).toBe(before);
  });

  it('adds a new edge stub when relationship is genuinely new', () => {
    const brief = makeBrief({
      nodes: [
        { id: 'node-a', label: 'A', type: 'concept', tier: 'spine',    sentiment: 'neutral', description: '', metrics: {}, confidence: 0.9 },
        { id: 'node-b', label: 'B', type: 'concept', tier: 'primary',  sentiment: 'neutral', description: '', metrics: {}, confidence: 0.7 },
        { id: 'node-c', label: 'C', type: 'concept', tier: 'secondary', sentiment: 'neutral', description: '', metrics: {}, confidence: 0.6 },
      ],
      edges: [],
    });
    const patches = { 'node-a': { related_ids: ['node-c'], sources: ['wikidata'], metrics: {} } };
    const { added } = addEdgeStubs(brief, patches);
    expect(added).toBe(1);
    expect(brief.edges[0]).toMatchObject({ from: 'node-a', to: 'node-c', rel: 'association', _stub: true });
  });

  it('does not add edge when related_id is not in nodes', () => {
    const brief = makeBrief();
    const patches = { 'node-a': { related_ids: ['completely-unknown'], sources: ['wikidata'], metrics: {} } };
    const { added } = addEdgeStubs(brief, patches);
    expect(added).toBe(0);
  });

  it('does not add reverse duplicate', () => {
    const brief = makeBrief({
      edges: [{ from: 'node-b', to: 'node-a', rel: 'association', weight: 1, directed: false }],
    });
    const patches = { 'node-a': { related_ids: ['node-b'], sources: [], metrics: {} } };
    const { added } = addEdgeStubs(brief, patches);
    expect(added).toBe(0);
  });
});

// ── runCompletion (combined) ───────────────────────────────────────────────────

describe('runCompletion', () => {
  it('runs all three stages and returns the mutated brief', async () => {
    const brief = makeBrief({
      story: [{ id: 'b1', node: 'ghost', nodes: [], narration: '', tension: 'low', focus: 'wide', title: 'B' }],
    });
    const patches = {
      'node-b': { summary: 'Enriched.', thumbnail: null, sources: ['wikipedia'], metrics: {}, links: [], related_ids: [] },
    };
    const result = await runCompletion(brief, patches);
    expect(result).toBe(brief); // mutated in-place
    expect(brief.nodes.some(n => n.id === 'ghost')).toBe(true);    // 4a: stub added
    expect(brief.nodes.find(n => n.id === 'node-b').description).toBe('Enriched.'); // 4b: enriched
  });

  it('emits explore:completion-done event', async () => {
    const events = [];
    document.addEventListener('explore:completion-done', e => events.push(e.detail));
    await runCompletion(makeBrief(), {});
    expect(events.length).toBe(1);
    expect(events[0].brief).toBeDefined();
    document.removeEventListener('explore:completion-done', () => {});
  });
});
