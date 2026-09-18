#!/usr/bin/env node
/**
 * scripts/ui-plan-all.mjs — run every LIBRARY entry through the UI SDK.
 *
 * For each library JSON: describe → route → write library/ui-plans/{id}.json.
 * Then aggregate: widget usage, unused widgets, gaps, proposed-ready evidence,
 * and confidence — the "recursive improvement" mirror for the widget axis,
 * the way scripts/health-check.mjs is for the library axis.
 *
 *   node scripts/ui-plan-all.mjs              # summary
 *   node scripts/ui-plan-all.mjs --json       # machine output
 *   node scripts/ui-plan-all.mjs --mode reader
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeBrief } from '../ui/state-descriptor.mjs';
import { routeHeuristic, summarizePlan } from '../ui/router.mjs';
import { REGISTRY, LAYOUTS, getWidgets } from '../ui/registry.mjs';

const ROOT    = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const LIB_DIR = join(ROOT, 'library');
const OUT_DIR = join(LIB_DIR, 'ui-plans');

function libraryIds() {
  const src = readFileSync(join(ROOT, 'pipeline', 'local-graph.mjs'), 'utf8');
  const block = src.slice(src.indexOf('export const LIBRARY'));
  return [...block.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
}

export function planAll({ mode = 'slides', write = true, ids = null } = {}) {
  const registered = ids ?? libraryIds();
  const onDisk = readdirSync(LIB_DIR).filter(f => f.endsWith('.json')).map(f => basename(f, '.json'));
  const unregistered = onDisk.filter(id => !registered.includes(id));
  if (write) mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  const usage = {};
  for (const w of getWidgets(REGISTRY)) if (w.family !== 'chart' && (w.modes ?? []).includes(mode)) usage[w.id] = 0;
  const gapCounts = {}, readyCounts = {};

  for (const id of registered) {
    const file = join(LIB_DIR, `${id}.json`);
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf8')); }
    catch (err) { results.push({ id, error: `unreadable: ${err.message}` }); continue; }

    const descriptor = describeBrief(doc);
    const plan = routeHeuristic(descriptor, { mode });
    const summary = summarizePlan(plan);
    for (const [wid, n] of Object.entries(summary.byWidget)) usage[wid] = (usage[wid] ?? 0) + n;
    for (const g of plan.gaps) gapCounts[g.input] = (gapCounts[g.input] ?? 0) + 1;
    for (const p of plan.proposedReady) readyCounts[p] = (readyCounts[p] ?? 0) + 1;

    if (write) {
      writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify({
        id, generated: new Date().toISOString().slice(0, 10), mode,
        descriptor: { scale: descriptor.scale, nodes: descriptor.nodes.count, edges: descriptor.edges.count,
                      beats: descriptor.story.count, insights: descriptor.insights.count, clusters: descriptor.clusters.count },
        plan,
      }, null, 2) + '\n');
    }
    results.push({ id, scale: descriptor.scale, nodes: descriptor.nodes.count, ...summary });
  }

  const unused = Object.entries(usage).filter(([, n]) => n === 0).map(([id]) => id);
  const report = {
    generated: new Date().toISOString().slice(0, 10), mode,
    entries: results, unregistered,
    widgets: { total: REGISTRY.widgets.length, active: getWidgets(REGISTRY).length, usage, unusedAcrossLibrary: unused },
    gaps: gapCounts, proposedReady: readyCounts,
    layouts: results.reduce((acc, r) => { if (r.layout) acc[r.layout] = (acc[r.layout] ?? 0) + 1; return acc; }, {}),
    meanConfidence: +(results.filter(r => r.confidence != null).reduce((s, r) => s + r.confidence, 0) / Math.max(1, results.length)).toFixed(2),
  };
  if (write) writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mi = process.argv.indexOf('--mode');
  const mode = mi > -1 ? process.argv[mi + 1] : 'slides';
  const r = planAll({ mode });
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

  console.log(`── UI plans (${mode}) ─────────────────────────────────────────────`);
  for (const e of r.entries) {
    if (e.error) { console.log(`  ❌ ${e.id.padEnd(34)} ${e.error}`); continue; }
    const flags = [e.ambiguities ? `amb:${e.ambiguities}` : '', e.gaps.length ? `gaps:${e.gaps.length}` : '', e.proposedReady.length ? `ready:${e.proposedReady.length}` : ''].filter(Boolean).join(' ');
    console.log(`  ${(e.confidence >= 0.85 ? '✅' : '🟡')} ${e.id.padEnd(34)} ${e.layout.padEnd(13)} ${String(e.total).padStart(2)} slots  c:${e.confidence.toFixed(2)}  ${e.scale.padEnd(6)} ${flags}`);
  }
  console.log(`\n  layouts: ${JSON.stringify(r.layouts)}   mean confidence: ${r.meanConfidence}`);
  console.log(`  widget usage: ${Object.entries(r.widgets.usage).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (r.widgets.unusedAcrossLibrary.length) console.log(`  ⚠  active but never placed: ${r.widgets.unusedAcrossLibrary.join(', ')}`);
  if (Object.keys(r.gaps).length) console.log(`  ⚠  gaps (input → entries affected): ${JSON.stringify(r.gaps)}`);
  if (Object.keys(r.proposedReady).length) console.log(`  💡 proposed widgets ready (id → entries): ${JSON.stringify(r.proposedReady)}`);
  if (r.unregistered.length) console.log(`  ⚠  library JSON not in LIBRARY: ${r.unregistered.join(', ')}`);
}
