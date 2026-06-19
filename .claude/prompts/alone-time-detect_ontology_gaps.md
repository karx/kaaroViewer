# Alone-Time: DETECT_ONTOLOGY_GAPS Prompt

## Role
Scan handoffs, validator warnings, and library entries to detect recurring missing types/relations. Output a proposal for Dream Loop.

## Context (injected)
{{taskId}}
{{taskType}}
{{plan}}
{{health}}
{{queue}}
{{threads}}
{{lastHandoff}}
{{journal}}

---

## Detection Strategy

### Sources to Scan
1. **Validator warnings** — "unknown type X", "unknown rel Y" across entries
2. **Handoffs (last 10)** — Patterns in `unresolved` and `signal tracking`
3. **Journal** — Gardener observations about recurring gaps
4. **Library entries** — Actual usage of non-standard types/rels

### Signal Thresholds
| Signal | Threshold | Action |
|---|---|---|
| Same missing type | ≥3 entries | Propose for VALID_TYPES |
| Same missing rel | ≥3 entries | Propose for VALID_RELS |
| Same encoder habit | ≥3 handoffs | Propose SOP update |
| Same SOP blind spot | ≥3 entries | Propose SOP clarification |

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "write",
      "file": ".claude/proposals/ontology-gaps-2026-06-17.md",
      "description": "Ontology gap detection report"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Detected 5 missing types, 6 missing rels across 4 entries",
    "target": "ontology",
    "journalEntry": "Gap detection complete — framework, prompt, process, system, tool types missing; enforces, transforms, creates, maps_to, visualizes, renders rels missing",
    "unresolved": [
      "Need human ONTOLOGY_REVIEW for semantic fit",
      "Dream Loop should formalize proposals"
    ],
    "nextRecommendation": "Dream Loop to propose atomic ontology extension"
  }
}
```

---

## Markdown Report Format (write to file)

```markdown
# Ontology Gap Detection — {{date}}

## Missing Types (used ≥3×, not in VALID_TYPES)
| Type | Count | Entries | Example Usage |
|---|---|---|---|
| framework | 12 | pkm-engineering-prompt, esp-ecosystem, ... | para-framework, arduino-framework |
| prompt | 8 | ... | pkm-prompt, claude-md-prompt |
| process | 15 | ... | pipelines, crystallization, dual-track |
| system | 6 | ... | ebrain-vault, kaaroViewer |
| tool | 9 | ... | wikilinks, obsidian, logseq |

## Missing Rels (used ≥3×, not in VALID_RELS)
| Rel | Count | Entries | Example Usage |
|---|---|---|---|
| enforces | 3 | pkm-engineering-prompt | pkm-prompt → frontmatter |
| transforms | 2 | pkm-engineering-prompt | para-framework → skill-surfaces |
| creates | 1 | pkm-engineering-prompt | crystallization → crystallized-archive |
| maps_to | 2 | pkm-engineering-prompt | ebrain-vault → pipelines |
| visualizes | 1 | pkm-engineering-prompt | kaaroViewer → knowledge-surface |
| renders | 1 | pkm-engineering-prompt | kaaroViewer → pkm-prompt |

## Encoder Habits (SOP gaps)
| Habit | Count | SOP Gap |
|---|---|---|
| report_card.protagonists references non-existent nodes | 5 | SOP doesn't specify node creation before reference |
| Missing climax beat | 2 | SOP doesn't enforce climax check |

## Recommendation
Propose atomic ontology extension in next Dream Loop with:
- Types: framework, prompt, process, system, tool
- Rels: enforces, transforms, creates, maps_to, visualizes, renders
- SOP updates for node creation, climax enforcement
- Renderer updates for new type geometries
```

---

## Guidelines

- **Be precise** — Count actual occurrences, don't estimate
- **Include evidence** — Reference specific entries and nodes
- **No opinions** — Just data; Dream Loop + human judge semantic fit