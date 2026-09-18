import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeBrief, describeText, describeAgentState, describe as describeAny, scaleOf } from './state-descriptor.mjs';

const kaaroViewer = JSON.parse(readFileSync('library/kaaro-viewer.json', 'utf8'));

describe('scaleOf', () => {
  it('follows the CLAUDE.md node-count gates', () => {
    expect(scaleOf(12)).toBe('small');
    expect(scaleOf(19)).toBe('small');
    expect(scaleOf(20)).toBe('medium');
    expect(scaleOf(29)).toBe('medium');
    expect(scaleOf(30)).toBe('large');
  });
});

describe('describeBrief', () => {
  it('summarises a raw library JSON', () => {
    const d = describeBrief(kaaroViewer);
    expect(d.kind).toBe('brief');
    expect(d.id).toBe('kaaro-viewer');
    expect(d.nodes.count).toBe(kaaroViewer.nodes.length);
    expect(d.edges.count).toBe(kaaroViewer.edges.length);
    expect(d.edges.density).toBeCloseTo(kaaroViewer.edges.length / kaaroViewer.nodes.length, 1);
    expect(d.story.count).toBe(kaaroViewer.story.length);
    expect(d.story.hasClimax).toBe(true);
    expect(d.insights.count).toBe(kaaroViewer.insights.length);
    expect(d.clusters.count).toBe(kaaroViewer.clusters.length);
    expect(d.scale).toBe('large');
  });

  it('carries item refs for frames but no free text', () => {
    const d = describeBrief(kaaroViewer);
    expect(d.story.items[0]).toHaveProperty('node');
    expect(d.story.items[0]).not.toHaveProperty('narration');
    expect(d.insights.items[0]).toHaveProperty('evidence');
    expect(d.insights.items[0]).not.toHaveProperty('body');
    expect(d.clusters.items[0].nodes.length).toBeGreaterThan(0);
  });

  it('derives analytics when absent and reuses them when present', () => {
    const d1 = describeBrief(kaaroViewer);
    expect(d1.analytics.has.centrality).toBe(true);
    expect(d1.analytics.has.relTypeDist).toBe(true);
    const enriched = { ...kaaroViewer, ...kaaroViewer.meta, analytics: { centrality: { a: 1 }, relTypeDist: {}, tensionCurve: [1, 4], causalChains: [], crossClusterEdges: [], sentimentDist: {}, tierDist: {}, temporalSequence: [] } };
    const d2 = describeBrief(enriched);
    expect(d2.analytics.has.centrality).toBe(true);
    expect(d2.analytics.has.relTypeDist).toBe(false);
    expect(d2.story.tensionCurve).toEqual([1, 4]);
  });

  it('handles an empty brief without throwing', () => {
    const d = describeBrief({ meta: { id: 'x' } });
    expect(d.nodes.count).toBe(0);
    expect(d.story.hasClimax).toBe(false);
    expect(d.clusters.coverage).toBe(0);
    expect(d.report_card.hasSummary).toBe(false);
  });

  it('counts insights by severity and type', () => {
    const d = describeBrief({ meta: {}, insights: [
      { id: 'a', severity: 'high', type: 'warning' }, { id: 'b', severity: 'high', type: 'finding' }, { id: 'c' },
    ] });
    expect(d.insights.bySeverity).toEqual({ high: 2, medium: 1, low: 0 });
    expect(d.insights.byType).toEqual({ warning: 1, finding: 2 });
  });
});

describe('describeText', () => {
  it('measures words, paragraphs, headings, bullets', () => {
    const d = describeText('# Title\n\nOne two three.\n\n- a\n- b\n- c\n- d\n');
    expect(d.kind).toBe('text');
    expect(d.title).toBe('Title');
    expect(d.text.paragraphCount).toBe(3);
    expect(d.text.headingCount).toBe(1);
    expect(d.text.bulletCount).toBe(4);
    expect(d.text.structured).toBe(true);
    expect(d.scale).toBe('small');
  });
  it('is safe on empty input', () => {
    expect(describeText('').text.wordCount).toBe(0);
    expect(describeText(null).text.wordCount).toBe(0);
  });
});

describe('describeAgentState', () => {
  it('counts steps by kind', () => {
    const d = describeAgentState({ id: 't1', steps: [{ kind: 'thought' }, { kind: 'tool' }, { kind: 'error' }, {}] });
    expect(d.kind).toBe('agent');
    expect(d.agent.stepCount).toBe(4);
    expect(d.agent.toolCalls).toBe(1);
    expect(d.agent.errors).toBe(1);
    expect(d.agent.byKind.thought).toBe(2);
  });
});

describe('describe() sniffing', () => {
  it('routes strings, traces and briefs to the right adapter', () => {
    expect(describeAny('hello world').kind).toBe('text');
    expect(describeAny({ steps: [] }).kind).toBe('agent');
    expect(describeAny(kaaroViewer).kind).toBe('brief');
  });
});
