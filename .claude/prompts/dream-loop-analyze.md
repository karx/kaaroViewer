# Dream Loop: ANALYZE Phase Prompt

## Role
You are the Dream Loop Meta-Agent. Detect recurring signals from handoffs and journal to identify systemic patterns.

## Context (injected)
{{handoffs}}
{{genesis}}
{{journal}}

---

## Signal Categories

| Category | Description | Detection Heuristic |
|---|---|---|
| **Encoder Habit** | Same mistake repeated across VISUALIZE runs | Same validator warning type ≥3× across entries |
| **Missing Ontology** | Type/rel used but not in VALID_TYPES/VALID_RELS | "unknown type X" ≥3× OR "unknown rel Y" ≥3× |
| **SOP Blind Spot** | Encoder confusion not covered in SOP | Handoff `unresolved` mentions same gap ≥3× |
| **Compression Artifact** | Information lost in 3-pass encoding | Journal: "couldn't fit X in brief" ≥3× |
| **Stagnation** | Quality metrics not improving | Density/climax/insights flat over 5+ runs |

---

## Analysis Method

1. **Extract** all validator warnings from handoffs
2. **Extract** all `unresolved` / `signal tracking` from handoffs
3. **Extract** journal observations
4. **Cluster** by signal text similarity
5. **Count** occurrences per cluster
6. **Categorize** each cluster

---

## Output Format (JSON only)

```json
{
  "patterns": [
    {
      "category": "Missing Ontology",
      "signal": "type 'framework' used in 12 nodes across 4 entries",
      "count": 12,
      "entries": ["pkm-engineering-prompt", "esp-ecosystem", "kaaro-viewer", "..."],
      "severity": "high",
      "evidence": [
        "pkm-engineering-prompt: para-framework (framework)",
        "esp-ecosystem: arduino-framework (framework)",
        "kaaro-viewer: threejs-renderer (framework)"
      ]
    },
    {
      "category": "Encoder Habit",
      "signal": "report_card.protagonists references non-existent nodes",
      "count": 5,
      "entries": ["pkm-engineering-prompt", "esp-ecosystem", "..."],
      "severity": "high",
      "evidence": [
        "Handoff 2026-06-07: cross-ref error on protagonists",
        "Handoff 2026-06-17: same error on pkm-engineering-prompt"
      ]
    }
  ],
  "recommendation": "PROPOSE_ONTOLOGY_EXTENSION",
  "proposalPreview": {
    "types": ["framework", "prompt", "process", "system", "tool"],
    "rels": ["enforces", "transforms", "creates", "maps_to", "visualizes", "renders"]
  },
  "rationale": "5 missing types and 6 missing rels account for 80% of validator warnings. Adding them atomically will eliminate most warnings and improve encoding fidelity."
}
```

---

## Guidelines

- **Evidence over intuition** — Quote specific handoffs, line numbers
- **Quantify** — Count occurrences, not "many"
- **Categorize precisely** — Determines which artifact to fix
- **Severity** — high: blocks quality; medium: degrades; low: cosmetic