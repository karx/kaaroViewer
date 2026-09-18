/**
 * ui/state-descriptor.mjs — adapters that turn a state into a StateDescriptor.
 *
 * The descriptor is the SDK's public input contract. The router and the
 * questionnaire never read a brief, a text blob or an agent trace directly —
 * they read this. A kaaroViewer brief is one adapter among several.
 *
 * Descriptor (kind: 'brief' | 'text' | 'agent'):
 *   scalar stats for predicates (nodes.count, story.count, analytics.has.centrality …)
 *   plus `items` refs (ids only) so a plan can carry canvas frame targets.
 */

import { deriveAnalytics } from '../pipeline/analytics.mjs';

/** CLAUDE.md quality-gate node ranges: small 12–20, medium 20–30, large 28–40. */
export function scaleOf(nodeCount) {
  if (nodeCount < 20) return 'small';
  if (nodeCount < 30) return 'medium';
  return 'large';
}

const count = (o) => Object.keys(o ?? {}).length;
const has   = (o) => count(o) > 0;

/**
 * Accepts a raw library JSON ({ meta, report_card, story, … }) or the enriched
 * doc the canvas loader produces (meta fields flattened to the top, analytics present).
 */
export function describeBrief(doc) {
  if (!doc) throw new Error('describeBrief: doc is required');
  const meta      = doc.meta ?? doc;
  const nodes     = doc.nodes ?? [];
  const edges     = doc.edges ?? [];
  const story     = doc.story ?? [];
  const insights  = doc.insights ?? [];
  const clusters  = doc.clusters ?? [];
  const rc        = doc.report_card ?? {};
  const analytics = doc.analytics ?? deriveAnalytics(nodes, edges, clusters, insights, story);

  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byType     = {};
  for (const i of insights) {
    bySeverity[i.severity ?? 'medium'] = (bySeverity[i.severity ?? 'medium'] ?? 0) + 1;
    byType[i.type ?? 'finding'] = (byType[i.type ?? 'finding'] ?? 0) + 1;
  }

  const types = {};
  for (const n of nodes) types[n.type ?? 'default'] = (types[n.type ?? 'default'] ?? 0) + 1;

  const clustered = new Set(clusters.flatMap(c => c.nodes ?? []));
  const climaxIdx = story.findIndex(b => b.tension === 'climax');
  const chains    = analytics.causalChains ?? [];
  const bridges   = [...(analytics.crossClusterEdges ?? [])].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

  return {
    kind: 'brief',
    id:    meta.id ?? doc.id ?? null,
    title: meta.title ?? doc.title ?? '',
    scale: scaleOf(nodes.length),
    nodes: { count: nodes.length, tiers: analytics.tierDist ?? {}, types, typeCount: count(types) },
    edges: {
      count: edges.length || Object.values(analytics.relTypeDist ?? {}).reduce((s, v) => s + v, 0),
      density: nodes.length ? +((edges.length || 0) / nodes.length).toFixed(2) : 0,
      relTypeCount: count(analytics.relTypeDist),
    },
    story: {
      count: story.length,
      hasClimax: climaxIdx >= 0,
      climaxIdx,
      tensionCurve: analytics.tensionCurve ?? [],
      items: story.map(b => ({ id: b.id, node: b.node, nodes: b.nodes ?? [], tension: b.tension ?? 'low' })),
    },
    insights: {
      count: insights.length,
      bySeverity, byType,
      items: insights.map(i => ({ id: i.id, severity: i.severity ?? 'medium', type: i.type ?? 'finding', evidence: i.evidence ?? [] })),
    },
    clusters: {
      count: clusters.length,
      largest: clusters.reduce((m, c) => Math.max(m, (c.nodes ?? []).length), 0),
      coverage: nodes.length ? +(clustered.size / nodes.length).toFixed(2) : 0,
      items: clusters.map(c => ({ id: c.id, nodes: c.nodes ?? [] })),
    },
    report_card: {
      hasSummary: !!rc.summary,
      statCount: (rc.key_stats ?? []).length,
      spineCount: (rc.spine ?? []).length,
      protagonistCount: (rc.protagonists ?? []).length,
      antagonistCount: (rc.antagonists ?? []).length,
      themeCount: (rc.themes ?? []).length,
      spine: rc.spine ?? [], protagonists: rc.protagonists ?? [], antagonists: rc.antagonists ?? [],
    },
    analytics: {
      has: {
        centrality:        has(analytics.centrality),
        relTypeDist:       has(analytics.relTypeDist),
        sentimentDist:     Object.values(analytics.sentimentDist ?? {}).some(v => v > 0),
        tensionCurve:      (analytics.tensionCurve ?? []).length > 0,
        causalChains:      chains.length > 0,
        crossClusterEdges: bridges.length > 0,
        temporalSequence:  (analytics.temporalSequence ?? []).length > 0,
        tierDist:          has(analytics.tierDist),
      },
      causalChainCount: chains.length,
      maxChainLength:   chains.reduce((m, c) => Math.max(m, c.length), 0),
      crossClusterEdgeCount: bridges.length,
      temporalCount: (analytics.temporalSequence ?? []).length,
      chains:  [...chains].sort((a, b) => b.length - a.length).slice(0, 5),
      bridges: bridges.slice(0, 8).map(e => ({ from: e.from, to: e.to, rel: e.rel, weight: e.weight ?? 1 })),
    },
  };
}

/** Raw long-form text before a brief exists (explore seed, pasted document). */
export function describeText(text) {
  const t = String(text ?? '');
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const paragraphs = t.split(/\n\s*\n/).filter(p => p.trim()).length;
  const headings = (t.match(/^#{1,6}\s/gm) ?? []).length;
  const bullets  = (t.match(/^\s*[-*+]\s/gm) ?? []).length;
  return {
    kind: 'text',
    id: null,
    title: (t.match(/^#\s+(.+)$/m) ?? [])[1] ?? '',
    scale: words < 1000 ? 'small' : words < 3000 ? 'medium' : 'large',
    text: { wordCount: words, paragraphCount: paragraphs, headingCount: headings, bulletCount: bullets, structured: headings > 0 || bullets > 3 },
    nodes: { count: 0 }, edges: { count: 0 }, story: { count: 0 }, insights: { count: 0 }, clusters: { count: 0 },
    report_card: { hasSummary: false, statCount: 0 }, analytics: { has: {} },
  };
}

/**
 * Agent chain-of-thought / tool trace. steps: [{ kind: 'thought'|'tool'|'result'|'error', label?, ref? }]
 * Kept minimal on purpose — the SDK's promise is that any state can be described, not that
 * every field is known up front.
 */
export function describeAgentState(trace) {
  const steps = trace?.steps ?? [];
  const byKind = {};
  for (const s of steps) byKind[s.kind ?? 'thought'] = (byKind[s.kind ?? 'thought'] ?? 0) + 1;
  return {
    kind: 'agent',
    id: trace?.id ?? null,
    title: trace?.title ?? '',
    scale: steps.length < 10 ? 'small' : steps.length < 40 ? 'medium' : 'large',
    agent: {
      stepCount: steps.length, byKind,
      toolCalls: byKind.tool ?? 0, errors: byKind.error ?? 0,
      done: !!trace?.done,
      items: steps.map((s, i) => ({ id: s.id ?? `step-${i}`, kind: s.kind ?? 'thought', ref: s.ref ?? null })),
    },
    nodes: { count: 0 }, edges: { count: 0 }, story: { count: 0 }, insights: { count: 0 }, clusters: { count: 0 },
    report_card: { hasSummary: false, statCount: 0 }, analytics: { has: {} },
  };
}

/** Pick the adapter by sniffing the input. */
export function describe(input) {
  if (typeof input === 'string') return describeText(input);
  if (input && Array.isArray(input.steps)) return describeAgentState(input);
  return describeBrief(input);
}
