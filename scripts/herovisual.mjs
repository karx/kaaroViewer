#!/usr/bin/env node
/**
 * scripts/herovisual.mjs — build a HeroVisual for a library entry.
 *
 *   node scripts/herovisual.mjs <library-id> [--mode slides|reader] [--gate 0.7]
 *                               [--no-jev] [--no-html] [--reset-enrichment] [--json]
 *
 * Pipeline: library JSON → describe → full questionnaire → Jev (TypeSafe) in one call,
 * heuristic per hop as backup → plan → HeroVisual DSL → validate → HTML export.
 *
 * Writes:
 *   library/hero/<id>.hero.json     the document (enrichment fields preserved across re-runs)
 *   library/hero/<id>.hero.html     standalone deck (unless --no-html)
 *   library/hero/<id>.decisions.json  the raw hop trail incl. heuristic baseline diff
 *
 * The library entry and LIBRARY are never modified.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describeBrief } from '../ui/state-descriptor.mjs';
import { routeHeuristic, summarizePlan } from '../ui/router.mjs';
import { routeJevFirst } from '../ui/questionnaire.mjs';
import { typesafeFromEnv } from '../ui/ask/typesafe.mjs';
import { buildHero, validateHero, priorEnrichment, toCanvasDoc } from '../ui/hero.mjs';
import { REGISTRY, LAYOUTS } from '../ui/registry.mjs';
import { exportHeroHTML } from './hero-html.mjs';

const ROOT    = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const LIB_DIR = join(ROOT, 'library');
const OUT_DIR = join(LIB_DIR, 'hero');

function arg(name, dflt = null) { const i = process.argv.indexOf(name); return i > -1 ? (process.argv[i + 1] ?? true) : dflt; }
const has = (name) => process.argv.includes(name);

export async function buildHeroVisual(id, { mode = 'slides', gate = 0.7, jev = true, html = true, resetEnrichment = false, askBatch = null } = {}) {
  const srcPath = join(LIB_DIR, `${id}.json`);
  if (!existsSync(srcPath)) throw new Error(`no library entry: ${srcPath}`);
  const rawText = readFileSync(srcPath, 'utf8');
  const raw = JSON.parse(rawText);
  const sha256 = createHash('sha256').update(rawText).digest('hex');
  mkdirSync(OUT_DIR, { recursive: true });

  const descriptor = describeBrief(raw);
  const ask = askBatch ?? (jev ? typesafeFromEnv({ envFile: join(ROOT, '.env') }) : null);
  const { plan, hops, base, error } = await routeJevFirst(descriptor, { askBatch: ask, gate, mode, provider: ask ? 'typesafe' : null });

  const heroPath = join(OUT_DIR, `${id}.hero.json`);
  const prev = !resetEnrichment && existsSync(heroPath) ? JSON.parse(readFileSync(heroPath, 'utf8')) : null;
  const hero = buildHero({
    doc: raw, plan, mode, source: { path: `./library/${id}.json`, sha256 },
    registry: REGISTRY, layouts: LAYOUTS, enrichment: prev ? priorEnrichment(prev) : {},
  });

  const validation = validateHero(hero, { doc: raw });
  writeFileSync(heroPath, JSON.stringify(hero, null, 2) + '\n');

  // Decision trail + delta against the pure-heuristic plan, for the retrospective.
  const baseSummary = summarizePlan(base), planSummary = summarizePlan(plan);
  const delta = {
    layout: { heuristic: base.layout, hero: plan.layout },
    slots:  { heuristic: base.slots.length, hero: plan.slots.length },
    widgets: Object.fromEntries([...new Set([...Object.keys(baseSummary.byWidget), ...Object.keys(planSummary.byWidget)])]
      .map(w => [w, { heuristic: baseSummary.byWidget[w] ?? 0, hero: planSummary.byWidget[w] ?? 0 }])
      .filter(([, v]) => v.heuristic !== v.hero)),
  };
  writeFileSync(join(OUT_DIR, `${id}.decisions.json`), JSON.stringify({ id, mode, gate, provider: plan.decisions.provider, error, counts: plan.decisions.counts, hops: plan.decisions.hops, delta, usage: plan.decisions.usage }, null, 2) + '\n');

  let htmlPath = null;
  if (html) { htmlPath = join(OUT_DIR, `${id}.hero.html`); await exportHeroHTML({ hero, doc: toCanvasDoc(raw), out: htmlPath }); }

  const enrichmentTodo = hero.pages.flatMap(p => p.content.filter(el => el.enrichment && Object.values(el.enrichment).some(v => !v.trim())).map(el => el.name));
  return { id, heroPath, htmlPath, plan, hero, validation, delta, error, hops: hops.length, enrichmentTodo };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const id = process.argv[2];
  if (!id || id.startsWith('--')) { console.error('usage: node scripts/herovisual.mjs <library-id> [--mode slides|reader] [--gate 0.7] [--no-jev] [--no-html] [--reset-enrichment]'); process.exit(2); }
  const r = await buildHeroVisual(id, {
    mode: arg('--mode', 'slides'), gate: Number(arg('--gate', 0.7)),
    jev: !has('--no-jev'), html: !has('--no-html'), resetEnrichment: has('--reset-enrichment'),
  });
  if (has('--json')) { console.log(JSON.stringify({ ...r, hero: undefined, plan: undefined }, null, 2)); process.exit(r.validation.ok ? 0 : 2); }
  const c = r.plan.decisions.counts;
  console.log(`── /herovisual ${r.id} ───────────────────────────────────────────`);
  console.log(`  provider ${r.plan.decisions.provider}${r.error ? ` (error: ${r.error})` : ''} · gate ${r.plan.decisions.gate} · hops ${c.total}: ${c.model} model / ${c.heuristic} heuristic`);
  console.log(`  layout ${r.delta.layout.heuristic} → ${r.delta.layout.hero} · slots ${r.delta.slots.heuristic} → ${r.delta.slots.hero}`);
  for (const [w, v] of Object.entries(r.delta.widgets)) console.log(`    ${w}: ${v.heuristic} → ${v.hero}`);
  for (const h of r.plan.decisions.hops.filter(h => h.source === 'model')) console.log(`    ✦ ${h.id} = ${h.answer} (${h.confidence})`);
  for (const h of r.plan.decisions.hops.filter(h => h.rejected)) console.log(`    ✕ ${h.id}: rejected "${h.rejected}"`);
  console.log(`  wrote ${r.heroPath}${r.htmlPath ? `\n  wrote ${r.htmlPath}` : ''}`);
  for (const e of r.validation.errors)   console.log(`  ❌ ${e}`);
  for (const w of r.validation.warnings) console.log(`  ⚠  ${w}`);
  if (r.enrichmentTodo.length) console.log(`  ✎ enrichment to author: ${r.enrichmentTodo.join(', ')}`);
  console.log(r.validation.ok ? '✅ hero valid' : '❌ hero invalid');
  process.exit(r.validation.ok ? 0 : 2);
}
