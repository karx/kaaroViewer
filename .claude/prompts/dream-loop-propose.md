# Dream Loop: PROPOSE Phase Prompt

## Role
Convert analyzed patterns into atomic ontology extension proposals (VALID_TYPES, VALID_RELS, SOP, Renderer).

## Context (injected)
{{handoffs}}
{{genesis}}
{{journal}}
{{analysis}}

---

## Proposal Requirements

### Atomicity (ALL OR NOTHING)
Every proposal must update all 3 artifacts together:
1. **Validator** (`.claude/hooks/validate-library-json.py`) — VALID_TYPES, VALID_RELS
2. **SOP** (`sop-reference.md`) — Encoding guidance, visual specs
3. **Renderer** (`canvas/`) — Geometry, color, interaction per type/rel

### Semantic Criteria
| Addition | Must Have |
|---|---|
| **Type** | Clear definition, parent category, visual geometry, tier mapping, example nodes |
| **Rel** | Clear semantics, directionality, weight default, visual style, inverse rel |
| **SOP update** | Pass-specific guidance, anti-patterns, validation rules |
| **Renderer update** | Node shape/size/color, edge style, interaction behavior |

---

## Output Format (JSON only)

```json
{
  "types": [
    {
      "name": "framework",
      "definition": "A structured methodology or system reused across projects",
      "parent": "software",
      "visual": { "shape": "hexagon", "size": 1.2, "color": "#4ecdc4" },
      "tier": "primary",
      "examples": ["para-framework", "arduino-framework", "react-framework"]
    },
    {
      "name": "prompt",
      "definition": "An LLM prompt or prompt template designed for reuse",
      "parent": "standard",
      "visual": { "shape": "diamond", "size": 1.0, "color": "#ffe66d" },
      "tier": "secondary",
      "examples": ["pkm-prompt", "claude-md-prompt", "visualize-skill-prompt"]
    },
    {
      "name": "process",
      "definition": "A repeatable sequence of steps transforming inputs to outputs",
      "parent": "event",
      "visual": { "shape": "rounded-rect", "size": 1.1, "color": "#ff6b6b" },
      "tier": "primary",
      "examples": ["crystallization", "pipelines", "dual-track"]
    },
    {
      "name": "system",
      "definition": "A cohesive software platform or infrastructure",
      "parent": "platform",
      "visual": { "shape": "cylinder", "size": 1.3, "color": "#95e1d3" },
      "tier": "anchor",
      "examples": ["ebrain-vault", "kaaroViewer", "obsidian"]
    },
    {
      "name": "tool",
      "definition": "A utility or instrument used in a workflow",
      "parent": "software",
      "visual": { "shape": "wrench", "size": 0.9, "color": "#f38181" },
      "tier": "secondary",
      "examples": ["wikilinks", "logseq", "git"]
    }
  ],
  "rels": [
    {
      "name": "enforces",
      "definition": "A mandates compliance with B's rules/constraints",
      "directed": true,
      "weight": 3,
      "visual": { "style": "solid", "color": "#ff6b6b", "arrow": "filled" },
      "inverse": "governed-by"
    },
    {
      "name": "transforms",
      "definition": "A converts B into a different form/representation",
      "directed": true,
      "weight": 3,
      "visual": { "style": "dashed", "color": "#4ecdc4", "arrow": "open" },
      "inverse": "transformed-by"
    },
    {
      "name": "creates",
      "definition": "A brings B into existence",
      "directed": true,
      "weight": 3,
      "visual": { "style": "solid", "color": "#95e1d3", "arrow": "filled" },
      "inverse": "created-by"
    },
    {
      "name": "maps_to",
      "definition": "A corresponds to B in a different domain/space",
      "directed": true,
      "weight": 2,
      "visual": { "style": "dotted", "color": "#ffe66d", "arrow": "open" },
      "inverse": "mapped-from"
    },
    {
      "name": "visualizes",
      "definition": "A renders B as a visual representation",
      "directed": true,
      "weight": 3,
      "visual": { "style": "solid", "color": "#f38181", "arrow": "filled" },
      "inverse": "visualized-by"
    },
    {
      "name": "renders",
      "definition": "A produces B as output (code, text, image)",
      "directed": true,
      "weight": 3,
      "visual": { "style": "dashed", "color": "#95e1d3", "arrow": "filled" },
      "inverse": "rendered-by"
    }
  ],
  "sop": [
    "Add 'framework' encoding: identify reusable methodologies, tag as framework tier primary",
    "Add 'prompt' encoding: distinguish prompt templates from instantiated prompts",
    "Add 'process' encoding: capture transformation pipelines with process tier",
    "Add 'system' encoding: tag cohesive platforms as anchor tier",
    "Add 'tool' encoding: utilities get secondary tier, wrench icon",
    "Add 'enforces' rel: use for constraints, mandates, governance",
    "Add 'transforms' rel: use for pipeline stages, compilation, rendering",
    "Add 'creates' rel: use for generation, instantiation, materialization",
    "Add 'maps_to' rel: use for cross-domain correspondence",
    "Add 'visualizes' rel: use for rendering, display, projection",
    "Add 'renders' rel: use for code generation, output production",
    "Density gate: Pass 2 must verify edge density ≥2.0 before Pass 3",
    "Cross-ref check: Pass 1 must create all report_card nodes before Pass 2"
  ],
  "renderer": [
    "framework: hexagon, teal, size 1.2",
    "prompt: diamond, yellow, size 1.0",
    "process: rounded rect, coral, size 1.1",
    "system: cylinder, mint, size 1.3",
    "tool: wrench icon, light coral, size 0.9",
    "enforces: solid red arrow",
    "transforms: dashed teal arrow",
    "creates: solid mint arrow",
    "maps_to: dotted yellow arrow",
    "visualizes: solid coral arrow",
    "renders: dashed mint arrow"
  ],
  "version": "1.2.0",
  "summary": "Add 5 types + 6 rels for PKM/ESP domains; density gate; cross-ref enforcement",
  "rationale": "These 11 additions cover 80% of validator warnings across 4 critical entries. Atomic update ensures zero regressions.",
  "reencode": ["pkm-engineering-prompt", "esp-ecosystem", "kaaro-viewer"]
}
```

---

## Guidelines

- **Complete specs** — Human ONTOLOGY_REVIEW needs full detail to judge
- **Visual specs required** — Renderer can't implement without them
- **SOP must be actionable** — Encoder reads SOP, not your rationale
- **Version bump** — Minor for ontology, patch for fixes
- **Re-encode list** — Which entries need human VISUALIZE after