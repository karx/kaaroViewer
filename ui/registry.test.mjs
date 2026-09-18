import { describe, it, expect } from 'vitest';
import {
  REGISTRY, LAYOUTS, getWidgets, getWidget, getLayout, derivedEnums,
  evalPredicate, checkPredicate, satisfies, validateRegistry,
} from './registry.mjs';

describe('registry data', () => {
  it('loads registry.json and layouts.json', () => {
    expect(REGISTRY.widgets.length).toBeGreaterThanOrEqual(19);
    expect(LAYOUTS.layouts.map(l => l.id)).toContain('slide-deck');
  });

  it('every widget id is unique', () => {
    const ids = REGISTRY.widgets.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getWidgets filters by status', () => {
    const active = getWidgets(REGISTRY);
    expect(active.every(w => w.status === 'active')).toBe(true);
    expect(getWidgets(REGISTRY, { status: '*' }).length).toBe(REGISTRY.widgets.length);
    expect(getWidgets(REGISTRY, { status: ['active', 'proposed'] }).length).toBeGreaterThan(active.length);
  });

  it('getWidget / getLayout return null for unknown ids', () => {
    expect(getWidget('nope')).toBeNull();
    expect(getLayout('nope')).toBeNull();
    expect(getWidget('title-slide').mount.fn).toBe('_renderTitle');
  });

  it('derivedEnums are computed from the registry, not hand-written', () => {
    const e = derivedEnums();
    expect(e.WIDGET_IDS).toEqual(REGISTRY.widgets.map(w => w.id));
    expect(e.ACTIVE_IDS.length).toBe(getWidgets(REGISTRY).length);
    expect(e.MOUNT_FILES).toEqual(expect.arrayContaining(['canvas/slides.mjs', 'canvas/report.mjs']));
    expect(e.LAYOUT_IDS).toContain('reader-report');
  });
});

describe('predicate mini-language', () => {
  const ctx = { story: { count: 3 }, scale: 'large', analytics: { has: { centrality: true, relTypeDist: false } }, report_card: { hasSummary: false, statCount: 0 } };

  it('compares numbers', () => {
    expect(evalPredicate('story.count >= 2', ctx)).toBe(true);
    expect(evalPredicate('story.count > 3', ctx)).toBe(false);
    expect(evalPredicate('story.count == 3', ctx)).toBe(true);
    expect(evalPredicate('story.count != 3', ctx)).toBe(false);
  });

  it('compares strings and booleans', () => {
    expect(evalPredicate("scale == 'large'", ctx)).toBe(true);
    expect(evalPredicate("scale != 'large'", ctx)).toBe(false);
    expect(evalPredicate('analytics.has.centrality', ctx)).toBe(true);
    expect(evalPredicate('analytics.has.relTypeDist', ctx)).toBe(false);
    expect(evalPredicate('analytics.has.centrality == true', ctx)).toBe(true);
  });

  it('&& binds tighter than ||', () => {
    expect(evalPredicate('story.count > 5 || analytics.has.centrality && scale == \'large\'', ctx)).toBe(true);
    expect(evalPredicate('story.count > 5 || analytics.has.relTypeDist && scale == \'large\'', ctx)).toBe(false);
  });

  it('missing paths are falsy / fail comparisons safely', () => {
    expect(evalPredicate('nope.deep.path', ctx)).toBe(false);
    expect(evalPredicate('nope.deep.path >= 1', ctx)).toBe(false);
    expect(evalPredicate('', ctx)).toBe(true);
  });

  it('checkPredicate rejects malformed expressions', () => {
    expect(checkPredicate('story.count >= 2')).toBeNull();
    expect(checkPredicate('(story.count >= 2)')).toMatch(/parentheses/);
    expect(checkPredicate('story.count + 1 > 0')).toMatch(/bad operand/);
    expect(checkPredicate('a || ')).toMatch(/empty term/);
  });

  it('satisfies() evaluates every requires predicate', () => {
    expect(satisfies({ requires: ['story.count >= 2', 'analytics.has.centrality'] }, ctx)).toBe(true);
    expect(satisfies({ requires: ['story.count >= 2', 'analytics.has.relTypeDist'] }, ctx)).toBe(false);
    expect(satisfies({}, ctx)).toBe(true);
  });
});

describe('validateRegistry', () => {
  it('the shipped registry is valid', () => {
    const r = validateRegistry();
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('flags unknown enums, bad predicates and duplicates', () => {
    const bad = {
      ...REGISTRY,
      widgets: [
        { ...REGISTRY.widgets[0] },
        { ...REGISTRY.widgets[0], input: 'bogus', slot: 'nowhere', requires: ['(x)'] },
      ],
    };
    const r = validateRegistry(bad, LAYOUTS);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/duplicate id/);
    expect(r.errors.join('\n')).toMatch(/not in input_shapes/);
    expect(r.errors.join('\n')).toMatch(/not in slot_families/);
    expect(r.errors.join('\n')).toMatch(/parentheses/);
  });

  it('flags per-item widgets without an item input and layouts with min > max', () => {
    const bad = { ...REGISTRY, widgets: [{ ...REGISTRY.widgets[0], cardinality: 'per-item' }] };
    expect(validateRegistry(bad, LAYOUTS).errors.join('\n')).toMatch(/per-item widgets need an item input/);
    const badLayouts = { layouts: [{ id: 'x', mode: 'slides', slots: [{ id: 's', family: 'opener', min: 3, max: 1 }] }] };
    expect(validateRegistry(REGISTRY, badLayouts).errors.join('\n')).toMatch(/min > max/);
  });

  it('warns when an active widget targets a slot family no layout uses', () => {
    const reg = { ...REGISTRY, slot_families: [...REGISTRY.slot_families, 'limbo'],
                  widgets: [{ ...REGISTRY.widgets[0], id: 'lost', slot: 'limbo' }] };
    expect(validateRegistry(reg, LAYOUTS).warnings.join('\n')).toMatch(/unreachable/);
  });
});
