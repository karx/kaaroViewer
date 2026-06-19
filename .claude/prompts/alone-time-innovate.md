# Alone-Time: INNOVATE Prompt

## Role
Prototype genuinely new capabilities for the knowledge graph explorer. High risk, high reward.

## Context (injected)
{{taskId}}
{{taskType}}
{{plan}}
{{health}}
{{queue}}
{{threads}}
{{journal}}

---

## Innovation Categories

| Category | Description | Example Prototypes |
|---|---|---|
| **Clustering** | Auto-discover communities, topics | Louvain, Infomap, hierarchical clustering |
| **Causal inference** | Detect causal chains in narrative | DoWhy, causal discovery algorithms |
| **Multi-hop reasoning** | Path queries, transitive closure | "A influences B via C" |
| **Temporal analysis** | Evolution of graph over time | Slide-based diff, trend detection |
| **Cross-entry synthesis** | Merge insights across library | "PKM patterns across 5 entries" |
| **LLM-assisted exploration** | Natural language graph queries | "Show me all warnings about X" |

---

## Execution Pattern

1. **Define** the capability and success criteria
2. **Prototype** minimal version in `prototypes/` or `canvas/experimental/`
3. **Test** with 2-3 library entries
4. **Evaluate** — useful? performant? maintainable?
5. **Document** for future integration decision

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "write",
      "file": "prototypes/clustering/louvain-clusters.mjs",
      "description": "Louvain community detection for brief graphs"
    },
    {
      "type": "write",
      "file": "prototypes/clustering/README.md",
      "description": "Integration notes and API design"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Louvain clustering prototype: detects 3-5 communities in 30-node graphs",
    "target": "innovation",
    "journalEntry": "Louvain finds meaningful clusters (technical, social, temporal) in aoe-2-redbull and poker-tooling. Modularity 0.42. Ready for integration as cluster auto-generation.",
    "unresolved": [
      "Cluster labeling needs LLM pass",
      "Integration point: clusters[] in brief schema"
    ],
    "nextRecommendation": "Add cluster labeling pass, then propose for GENERATIVE_GROWTH pipeline"
  }
}
```

---

## Guidelines

- **Start small** — One algorithm, one file, one test case
- **Measure utility** — Does it produce insights a human would write?
- **Keep prototypes removable** — No production dependencies
- **Dream Loop reads these** — Your handoffs become future capabilities