/**
 * ui/index.mjs — Agent Web UI SDK entry point.
 *
 * A registry-driven UI generation kit, extracted from kaaroViewer:
 *   describe(input)          → StateDescriptor   (brief | text | agent trace)
 *   route(descriptor)        → WidgetPlan        (deterministic, registry-constrained)
 *   questionnaire(d, plan)   → typed hops for an LLM / human to answer
 *   routeWith(d, { ask })    → heuristic gated → LLM hops → re-route
 *   validate()               → registry + layout schema check
 *   enums                    → ids derived from the registry (never hand-written)
 *
 * kaaroViewer is the first consumer (canvas/slides.mjs builds its deck from a plan).
 */

import { REGISTRY, LAYOUTS, getWidgets, getWidget, getLayout, derivedEnums, validateRegistry, satisfies, evalPredicate } from './registry.mjs';
import { describe, describeBrief, describeText, describeAgentState, scaleOf } from './state-descriptor.mjs';
import { routeHeuristic, chooseLayout, findGaps, framesFor, summarizePlan } from './router.mjs';
import { buildQuestionnaire, routeWithQuestionnaire, applyAnswers, acceptAnswer, describeForPrompt } from './questionnaire.mjs';

export {
  REGISTRY, LAYOUTS, getWidgets, getWidget, getLayout, derivedEnums, validateRegistry, satisfies, evalPredicate,
  describe, describeBrief, describeText, describeAgentState, scaleOf,
  routeHeuristic, chooseLayout, findGaps, framesFor, summarizePlan,
  buildQuestionnaire, routeWithQuestionnaire, applyAnswers, acceptAnswer, describeForPrompt,
};

/** Bind the kit to a specific registry/layouts pair (defaults to kaaroViewer's). */
export function createUIKit({ registry = REGISTRY, layouts = LAYOUTS } = {}) {
  const opts = { registry, layouts };
  return {
    registry, layouts,
    enums: derivedEnums(registry, layouts),
    describe,
    route: (descriptor, o = {}) => routeHeuristic(descriptor, { ...opts, ...o }),
    questionnaire: (descriptor, plan) => buildQuestionnaire(descriptor, plan, opts),
    routeWith: (descriptor, o = {}) => routeWithQuestionnaire(descriptor, { ...opts, ...o }),
    apply: (descriptor, answers, o = {}) => applyAnswers(descriptor, answers, { ...opts, ...o }),
    validate: () => validateRegistry(registry, layouts),
    widgets: (status = 'active') => getWidgets(registry, { status }),
    summarize: summarizePlan,
  };
}
