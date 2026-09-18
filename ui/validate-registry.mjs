#!/usr/bin/env node
/**
 * ui/validate-registry.mjs — registry validator + lockstep check.
 *
 * Mirrors .claude/hooks/validate-library-json.py for the widget axis:
 *   1. schema / enum consistency (ui/registry.mjs → validateRegistry)
 *   2. LOCKSTEP: every `active` widget's mount fn must exist in its mount file;
 *      every `_render*` / section fn in a mount file must be registered (else: orphan)
 *   3. proposed widgets must NOT have a mount fn yet (or they should be active)
 *
 * Exit 0 = valid. Exit 1 = warnings only. Exit 2 = errors (breaks the router).
 *
 *   node ui/validate-registry.mjs            # human output
 *   node ui/validate-registry.mjs --json     # machine output
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY, LAYOUTS, validateRegistry, getWidgets } from './registry.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Which functions in a mount file count as widget mount points (renderers). */
const MOUNT_FN_RE = {
  'canvas/slides.mjs': /^function\s+(_render[A-Z]\w*)\s*\(/gm,
  'canvas/report.mjs': /^function\s+(_(?:header|kpiStrip|briefing|storyArc|svgTensionArc|analyticsPanel|centralityBars|relTypeBars|sentimentBars|insights|entitySpotlight|clusters|footer))\s*\(/gm,
};

export function lockstepCheck(registry = REGISTRY, root = ROOT) {
  const errors = [], warnings = [];
  const fnsByFile = {};

  for (const [file, re] of Object.entries(MOUNT_FN_RE)) {
    const abs = resolve(root, file);
    if (!existsSync(abs)) { errors.push(`mount file missing: ${file}`); continue; }
    const src = readFileSync(abs, 'utf8');
    fnsByFile[file] = new Set([...src.matchAll(re)].map(m => m[1]));
  }

  const registeredFns = new Map(); // "file::fn" → widget
  for (const w of registry.widgets ?? []) {
    const key = `${w.mount?.file}::${w.mount?.fn}`;
    if (registeredFns.has(key)) errors.push(`widget "${w.id}": mount ${key} already claimed by "${registeredFns.get(key).id}"`);
    registeredFns.set(key, w);

    const fns = fnsByFile[w.mount?.file];
    if (!fns) { errors.push(`widget "${w.id}": mount file "${w.mount?.file}" is not a known mount file (add it to MOUNT_FN_RE)`); continue; }
    const exists = fns.has(w.mount.fn);
    if (w.status === 'active' && !exists)      errors.push(`widget "${w.id}" is active but ${w.mount.file} has no function ${w.mount.fn} — LOCKSTEP BROKEN`);
    if (w.status === 'proposed' && exists)     warnings.push(`widget "${w.id}" is proposed but ${w.mount.fn} already exists in ${w.mount.file} — promote it to active`);
    if (w.status === 'deprecated' && !exists)  warnings.push(`widget "${w.id}" is deprecated and its mount is gone — mark orphan or delete the entry`);
  }

  for (const [file, fns] of Object.entries(fnsByFile)) {
    const ignore = new Set(registry.mount_ignore?.[file] ?? []);
    for (const fn of fns) {
      if (ignore.has(fn)) continue;
      if (!registeredFns.has(`${file}::${fn}`)) errors.push(`${file}: ${fn}() renders UI but has no registry entry — ORPHAN (register it or rename it)`);
    }
  }
  return { errors, warnings };
}

export function runAll(registry = REGISTRY, layouts = LAYOUTS) {
  const schema = validateRegistry(registry, layouts);
  const lock   = lockstepCheck(registry);
  const errors = [...schema.errors, ...lock.errors];
  const warnings = [...schema.warnings, ...lock.warnings];
  const active = getWidgets(registry).length, proposed = getWidgets(registry, { status: 'proposed' }).length;
  return { errors, warnings, counts: { widgets: registry.widgets.length, active, proposed, layouts: layouts.layouts.length },
           exit: errors.length ? 2 : warnings.length ? 1 : 0 };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = runAll();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const c = r.counts;
    console.log(`ui/registry.json — ${c.widgets} widgets (${c.active} active, ${c.proposed} proposed), ${c.layouts} layouts`);
    for (const e of r.errors)   console.log(`  ❌ ${e}`);
    for (const w of r.warnings) console.log(`  ⚠  ${w}`);
    console.log(r.exit === 0 ? '✅ registry valid, lockstep intact' : r.exit === 1 ? '⚠  warnings only' : '❌ errors — fix before shipping');
  }
  process.exit(r.exit);
}
