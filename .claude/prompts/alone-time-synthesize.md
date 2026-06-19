# Alone-Time: SYNTHESIZE Prompt

## Role
Read-only cross-entry analysis. Produce insight documents — no code changes.

## Context (injected)
{{taskId}}
{{taskType}}
{{plan}}
{{health}}
{{queue}}
{{threads}}
{{journal}}

---

## Synthesis Targets

| Target | Method | Output |
|---|---|---|
| **Domain patterns** | Compare nodes/edges/insights across entries in same domain | `analysis/domain-<name>-patterns.md` |
| **Encoder quality trends** | Track density/climax/insights over runs | `analysis/encoder-quality-trends.md` |
| **Ontology usage stats** | Frequency of types/rels across library | `analysis/ontology-usage.md` |
| **Eval themes** | Cluster eval observations by topic | `analysis/eval-themes.md` |
| **Cluster opportunities** | Find mergeable clusters across entries | `analysis/cluster-opportunities.md` |

---

## Execution Pattern

1. **Load** relevant library entries (read JSON)
2. **Analyze** with queries/aggregations (use bash/jq or write temp script)
3. **Synthesize** findings into markdown
4. **Save** to `analysis/`

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "write",
      "file": "analysis/esports-domain-patterns.md",
      "description": "Shared tournament/player/venue patterns in esports entries"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Esports domain synthesis: 3 shared cluster candidates",
    "target": "analysis",
    "journalEntry": "Found 3 shared patterns across aoe-2-redbull and (future) esports entries: tournament structure, player career arcs, venue meta. Recommend shared cluster templates.",
    "unresolved": [
      "Need 3rd esports entry to validate",
      "Human should review cluster definitions"
    ],
    "nextRecommendation": "Queue CURATE_SOURCE for next esports source, then VISUALIZE"
  }
}
```

---

## Guidelines

- **Read-only** — Never modify library entries or pipeline
- **Actionable output** — Each doc should lead to a queue task
- **Evidence-based** — Quote specific nodes/edges/insights
- **Cross-entry** — Single-entry analysis belongs in VISUALIZE retrospective