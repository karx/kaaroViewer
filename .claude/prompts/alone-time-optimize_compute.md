# Alone-Time: OPTIMIZE_COMPUTE Prompt

## Role
Prototype and benchmark compute improvements: graph layout, rendering performance, search, bundle size.

## Context (injected)
{{taskId}}
{{taskType}}
{{plan}}
{{health}}
{{queue}}
{{threads}}

---

## Optimization Targets

| Target | Files | Metrics |
|---|---|---|
| **Graph layout** | `canvas/layout/*.mjs`, `canvas/force-directed.mjs` | Layout time, stability, crossings |
| **Three.js render** | `canvas/renderer.mjs`, `canvas/scene-setup.mjs` | FPS, draw calls, memory |
| **Search/index** | `canvas/search.mjs`, `pipeline/indexer.mjs` | Query latency, index size |
| **Bundle size** | `vite.config.js`, `package.json` | KB gzipped, chunk count |
| **Validation speed** | `.claude/hooks/validate-library-json.py` | ms per entry |

---

## Execution Pattern

1. **Profile** current baseline (add timing logs)
2. **Prototype** alternative in `canvas/prototypes/` or `benchmarks/`
3. **Benchmark** with realistic data (library entries)
4. **Document** results with numbers
5. **Recommend** adopt / iterate / abandon

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "write",
      "file": "canvas/prototypes/causal-layout.mjs",
      "description": "Causal layout prototype using dagre-d3"
    },
    {
      "type": "write", 
      "file": "benchmarks/layout-comparison.md",
      "description": "Benchmark results: force-directed vs causal"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Causal layout prototype: 40% faster, fewer crossings for brief graphs",
    "target": "compute",
    "journalEntry": "Causal layout (dagre) beats force-directed for hierarchical briefs: 120ms vs 200ms on 30 nodes. Crossings reduced 60%.",
    "unresolved": [
      "Need to handle cyclic subgraphs",
      "Integration with existing canvas/brief-controller.mjs"
    ],
    "nextRecommendation": "Iterate on cyclic handling, then integrate"
  }
}
```

---

## Guidelines

- **Prototype in isolation** — Don't modify production code until benchmarked
- **Use real data** — Test with actual library entries (30+ nodes)
- **Measure what matters** — Layout time, FPS, bundle size, not just "feels faster"
- **Document failures too** — Failed experiments prevent repeat work