/**
 * ui/registry.mjs — the Widget Registry: single source of truth for what UI
 * widgets exist, what each consumes, and where it mounts.
 *
 * registry.json is the canonical data. Everything else (router option sets,
 * questionnaire enums, validator checks) is DERIVED from it here, so adding a
 * widget means: one registry entry + its mount function in the same commit.
 *
 * Predicate mini-language (widget.requires[], layout.when[]):
 *   term     := path [op value]          bare path = truthy check
 *   op       := >= | <= | == | != | > | <
 *   value    := number | 'string' | true | false | path
 *   expr     := term (&& term)* (|| term (&& term)*)*   (&& binds tighter, no parens)
 */

import registryJson from './registry.json' with { type: 'json' };
import layoutsJson  from './layouts.json'  with { type: 'json' };

export const REGISTRY = registryJson;
export const LAYOUTS  = layoutsJson;

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getWidgets(registry = REGISTRY, { status = 'active' } = {}) {
  const list = registry.widgets ?? [];
  if (status === '*' || status == null) return list;
  const set = Array.isArray(status) ? new Set(status) : new Set([status]);
  return list.filter(w => set.has(w.status));
}

export function getWidget(id, registry = REGISTRY) {
  return (registry.widgets ?? []).find(w => w.id === id) ?? null;
}

export function getLayout(id, layouts = LAYOUTS) {
  return (layouts.layouts ?? []).find(l => l.id === id) ?? null;
}

/** Enumerations derived from the registry — never hand-maintained elsewhere. */
export function derivedEnums(registry = REGISTRY, layouts = LAYOUTS) {
  return {
    WIDGET_IDS:    (registry.widgets ?? []).map(w => w.id),
    ACTIVE_IDS:    getWidgets(registry).map(w => w.id),
    SLOT_FAMILIES: [...(registry.slot_families ?? [])],
    INPUT_SHAPES:  [...(registry.input_shapes ?? [])],
    FRAME_MODES:   [...(registry.frame_modes ?? [])],
    LAYOUT_IDS:    (layouts.layouts ?? []).map(l => l.id),
    MOUNT_FILES:   [...new Set((registry.widgets ?? []).map(w => w.mount?.file).filter(Boolean))],
  };
}

// ── Predicates ────────────────────────────────────────────────────────────────

const OP_RE = /^(.*?)\s*(>=|<=|==|!=|>|<)\s*(.*)$/;

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function parseValue(raw, ctx) {
  const s = raw.trim();
  if (s === 'true')  return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const q = s.match(/^'(.*)'$|^"(.*)"$/);
  if (q) return q[1] ?? q[2];
  return getPath(ctx, s);
}

function evalTerm(term, ctx) {
  const t = term.trim();
  if (!t) return true;
  const m = t.match(OP_RE);
  if (!m) return !!getPath(ctx, t);
  const left  = parseValue(m[1], ctx);
  const right = parseValue(m[3], ctx);
  switch (m[2]) {
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>':  return left >  right;
    case '<':  return left <  right;
    case '==': return left == right; // eslint-disable-line eqeqeq
    case '!=': return left != right; // eslint-disable-line eqeqeq
  }
  return false;
}

export function evalPredicate(expr, ctx) {
  if (expr == null || expr === '') return true;
  return String(expr).split('||').some(orPart =>
    orPart.split('&&').every(andPart => evalTerm(andPart, ctx)));
}

/** True when every `requires` predicate of the widget holds for the descriptor. */
export function satisfies(widget, descriptor) {
  return (widget.requires ?? []).every(p => evalPredicate(p, descriptor));
}

/** Syntax check only — does the predicate parse into known shapes? */
export function checkPredicate(expr) {
  if (typeof expr !== 'string') return 'predicate must be a string';
  if (/[()]/.test(expr)) return 'parentheses are not supported';
  for (const term of expr.split('||').flatMap(p => p.split('&&'))) {
    const t = term.trim();
    if (!t) return `empty term in "${expr}"`;
    const m = t.match(OP_RE);
    const parts = m ? [m[1], m[3]] : [t];
    for (const p of parts) {
      const s = p.trim();
      if (!/^([A-Za-z_][\w.]*|-?\d+(\.\d+)?|'[^']*'|"[^"]*"|true|false)$/.test(s)) {
        return `bad operand "${s}" in "${expr}"`;
      }
    }
  }
  return null;
}

// ── Validation (schema + internal consistency; lockstep check lives in validate-registry.mjs) ──

export function validateRegistry(registry = REGISTRY, layouts = LAYOUTS) {
  const errors = [], warnings = [];
  const enums  = derivedEnums(registry, layouts);
  const seen   = new Set();
  const REQUIRED = ['id', 'component', 'family', 'modes', 'mount', 'input', 'cardinality', 'slot', 'size', 'frames', 'status', 'description'];

  for (const w of registry.widgets ?? []) {
    const tag = `widget "${w.id ?? '?'}"`;
    for (const k of REQUIRED) if (w[k] == null) errors.push(`${tag}: missing "${k}"`);
    if (seen.has(w.id)) errors.push(`${tag}: duplicate id`);
    seen.add(w.id);
    if (!['slide', 'section', 'chart', 'atom'].includes(w.family)) errors.push(`${tag}: unknown family "${w.family}"`);
    if (!enums.INPUT_SHAPES.includes(w.input))   errors.push(`${tag}: input "${w.input}" not in input_shapes`);
    if (!enums.SLOT_FAMILIES.includes(w.slot))   errors.push(`${tag}: slot "${w.slot}" not in slot_families`);
    if (!enums.FRAME_MODES.includes(w.frames))   errors.push(`${tag}: frames "${w.frames}" not in frame_modes`);
    if (!(registry.sizes ?? []).includes(w.size))       errors.push(`${tag}: size "${w.size}" not in sizes`);
    if (!(registry.statuses ?? []).includes(w.status))  errors.push(`${tag}: status "${w.status}" not in statuses`);
    if (!['one', 'per-item'].includes(w.cardinality))   errors.push(`${tag}: cardinality must be one | per-item`);
    if (!Array.isArray(w.modes) || !w.modes.length)     errors.push(`${tag}: modes[] required (which layout modes may place it)`);
    for (const m of w.modes ?? []) if (!(registry.modes ?? []).includes(m)) errors.push(`${tag}: mode "${m}" not in registry.modes`);
    for (const c of w.consumes ?? []) if (!enums.INPUT_SHAPES.includes(c)) errors.push(`${tag}: consumes "${c}" not in input_shapes`);
    if (w.cardinality === 'per-item' && !/\.(beat|item)$/.test(w.input)) errors.push(`${tag}: per-item widgets need an item input (story.beat, insights.item, clusters.item)`);
    if (!w.mount?.file || !w.mount?.fn) errors.push(`${tag}: mount needs file + fn`);
    for (const p of w.requires ?? []) { const e = checkPredicate(p); if (e) errors.push(`${tag}: ${e}`); }
    if (w.enrich_schema != null) {
      if (typeof w.enrich_schema !== 'object' || Array.isArray(w.enrich_schema)) errors.push(`${tag}: enrich_schema must be an object of field → description`);
      else for (const [k, v] of Object.entries(w.enrich_schema)) if (typeof v !== 'string' || !/^[a-z][a-z0-9_]*$/.test(k)) errors.push(`${tag}: enrich_schema field "${k}" needs a snake_case key and a string description`);
    }
    if (!w.source) warnings.push(`${tag}: no provenance in "source"`);
    if ((w.description ?? '').length < 20) warnings.push(`${tag}: description is thin`);
  }

  const familiesUsed = new Set();
  for (const l of layouts.layouts ?? []) {
    const tag = `layout "${l.id ?? '?'}"`;
    if (!l.id || !l.mode || !Array.isArray(l.slots)) { errors.push(`${tag}: needs id, mode, slots[]`); continue; }
    if (!(layouts.modes ?? registry.modes ?? []).includes(l.mode)) errors.push(`${tag}: mode "${l.mode}" not in registry.modes`);
    for (const p of l.when ?? []) { const e = checkPredicate(p); if (e) errors.push(`${tag}: ${e}`); }
    const slotIds = new Set();
    for (const s of l.slots) {
      if (slotIds.has(s.id)) errors.push(`${tag}: duplicate slot "${s.id}"`);
      slotIds.add(s.id);
      if (!enums.SLOT_FAMILIES.includes(s.family)) errors.push(`${tag}: slot "${s.id}" family "${s.family}" unknown`);
      familiesUsed.add(s.family);
      if (typeof s.max !== 'number' || s.max < 1) errors.push(`${tag}: slot "${s.id}" needs max >= 1`);
      if ((s.min ?? 0) > s.max) errors.push(`${tag}: slot "${s.id}" min > max`);
    }
  }
  for (const w of getWidgets(registry)) {
    if (w.family === 'chart') continue; // atoms are composed inside sections, never placed directly
    const reachable = (layouts.layouts ?? []).some(l => (w.modes ?? []).includes(l.mode) && l.slots.some(s => s.family === w.slot));
    if (!reachable) warnings.push(`widget "${w.id}": no layout in modes [${(w.modes ?? []).join(',')}] has a "${w.slot}" slot — unreachable`);
  }
  return { errors, warnings, ok: errors.length === 0 };
}
