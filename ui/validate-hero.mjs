#!/usr/bin/env node
/**
 * ui/validate-hero.mjs — validate a HeroVisual document against the registry and its source brief.
 *
 *   node ui/validate-hero.mjs library/hero/kaaro-viewer.hero.json
 *
 * Exit 0 = valid. Exit 1 = warnings only. Exit 2 = errors (the loader would render wrong widgets).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateHero } from './hero.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export function validateHeroFile(file) {
  const hero = JSON.parse(readFileSync(file, 'utf8'));
  const srcPath = hero.source?.path ? resolve(ROOT, hero.source.path) : join(ROOT, 'library', `${hero.source?.library}.json`);
  let doc = null;
  const errors = [], warnings = [];
  if (!existsSync(srcPath)) errors.push(`source brief not found: ${srcPath}`);
  else {
    const raw = readFileSync(srcPath, 'utf8');
    doc = JSON.parse(raw);
    const sha = createHash('sha256').update(raw).digest('hex');
    if (hero.source?.sha256 && hero.source.sha256 !== sha) warnings.push(`source brief changed since the hero was built (sha mismatch) — regenerate`);
  }
  const r = validateHero(hero, { doc });
  return { errors: [...errors, ...r.errors], warnings: [...warnings, ...r.warnings], hero };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node ui/validate-hero.mjs <hero.json>'); process.exit(2); }
  const { errors, warnings, hero } = validateHeroFile(resolve(file));
  const elements = (hero.pages ?? []).reduce((n, p) => n + (p.content?.length ?? 0), 0);
  const c = hero.decisions?.counts ?? {};
  console.log(`${file} — ${hero.meta?.id} · ${elements} elements · layout ${hero.pages?.[0]?.layout} · decisions ${c.model ?? 0} model / ${c.heuristic ?? 0} heuristic`);
  for (const e of errors)   console.log(`  ❌ ${e}`);
  for (const w of warnings) console.log(`  ⚠  ${w}`);
  const exit = errors.length ? 2 : warnings.length ? 1 : 0;
  console.log(exit === 0 ? '✅ hero valid' : exit === 1 ? '⚠  warnings only' : '❌ errors — fix before loading');
  process.exit(exit);
}
