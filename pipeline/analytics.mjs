/**
 * analytics.mjs — pure derivation of brief analytics (no DOM, no Three.js).
 *
 * Shared by the canvas loader (pipeline/local-graph.mjs) and the UI SDK
 * (ui/state-descriptor.mjs) so both see the same numbers.
 *
 * Output keys: centrality, causalChains, crossClusterEdges, coOccurrence,
 *              sentimentDist, tierDist, relTypeDist, tensionCurve, temporalSequence
 */

export function deriveAnalytics(nodes, edges, clusters, insights, story) {
  const a = {};

  // ── Degree centrality ────────────────────────────────────────────────────
  const degree = {};
  for (const n of nodes) degree[n.id] = 0;
  for (const e of edges) {
    degree[e.from] = (degree[e.from] ?? 0) + 1;
    degree[e.to]   = (degree[e.to]   ?? 0) + 1;
  }
  const maxDeg = Math.max(1, ...Object.values(degree));
  a.centrality = {};
  for (const [id, d] of Object.entries(degree)) a.centrality[id] = +(d / maxDeg).toFixed(3);

  // ── Causal chains (walk directed 'causes' edges) ─────────────────────────
  const causalAdj = {};
  for (const e of edges) {
    if (e.rel === 'causes' && e.directed) {
      (causalAdj[e.from] ??= []).push(e.to);
    }
  }
  const roots = Object.keys(causalAdj).filter(id => !edges.some(e => e.rel === 'causes' && e.directed && e.to === id));
  a.causalChains = [];
  for (const root of roots) {
    const chain = [];
    const walk = (id) => {
      chain.push(id);
      const children = causalAdj[id] ?? [];
      if (!children.length) { a.causalChains.push([...chain]); }
      else { for (const c of children) { walk(c); } }
      chain.pop();
    };
    walk(root);
  }

  // ── Cross-cluster edges ──────────────────────────────────────────────────
  const nodeToCluster = {};
  for (const cl of clusters) {
    for (const nid of (cl.nodes ?? [])) nodeToCluster[nid] = cl.id;
  }
  a.crossClusterEdges = [];
  for (const e of edges) {
    const fc = nodeToCluster[e.from], tc = nodeToCluster[e.to];
    if (fc && tc && fc !== tc) {
      a.crossClusterEdges.push({ from: e.from, to: e.to, fromCluster: fc, toCluster: tc, rel: e.rel, weight: e.weight ?? 1 });
    }
  }

  // ── Co-occurrence (entity × section matrix) ──────────────────────────────
  a.coOccurrence = {};
  for (const n of nodes) a.coOccurrence[n.id] = { story: [], insights: [], clusters: [] };
  for (let i = 0; i < story.length; i++) {
    const beat = story[i];
    if (beat.node && a.coOccurrence[beat.node]) a.coOccurrence[beat.node].story.push(i);
    for (const nid of (beat.nodes ?? [])) {
      if (a.coOccurrence[nid]) a.coOccurrence[nid].story.push(i);
    }
  }
  for (let i = 0; i < insights.length; i++) {
    for (const eid of (insights[i].evidence ?? [])) {
      if (a.coOccurrence[eid]) a.coOccurrence[eid].insights.push(i);
    }
  }
  for (let i = 0; i < clusters.length; i++) {
    for (const nid of (clusters[i].nodes ?? [])) {
      if (a.coOccurrence[nid]) a.coOccurrence[nid].clusters.push(i);
    }
  }

  // ── Sentiment distribution ───────────────────────────────────────────────
  a.sentimentDist = { positive: 0, negative: 0, neutral: 0, contested: 0 };
  for (const n of nodes) a.sentimentDist[n.sentiment ?? 'neutral'] = (a.sentimentDist[n.sentiment ?? 'neutral'] ?? 0) + 1;

  // ── Tier distribution ────────────────────────────────────────────────────
  a.tierDist = { spine: 0, primary: 0, secondary: 0, context: 0 };
  for (const n of nodes) a.tierDist[n.tier ?? 'primary'] = (a.tierDist[n.tier ?? 'primary'] ?? 0) + 1;

  // ── Relationship type distribution ───────────────────────────────────────
  a.relTypeDist = {};
  for (const e of edges) a.relTypeDist[e.rel ?? 'default'] = (a.relTypeDist[e.rel ?? 'default'] ?? 0) + 1;

  // ── Tension curve ────────────────────────────────────────────────────────
  const TENSION_VAL = { low: 1, medium: 2, high: 3, climax: 4 };
  a.tensionCurve = story.map(b => TENSION_VAL[b.tension] ?? 1);

  // ── Temporal sequence ────────────────────────────────────────────────────
  a.temporalSequence = edges
    .filter(e => e.temporal)
    .map(e => ({ edge: e, date: e.temporal }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return a;
}
