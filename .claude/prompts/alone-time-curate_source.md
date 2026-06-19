# Alone-Time: CURATE_SOURCE Prompt

## Role
Organize source `.md` files in `library/` — deduplicate, tag, rename. NO encoding.

## Context (injected)
{{taskId}}
{{taskType}}
{{plan}}
{{health}}
{{queue}}
{{threads}}

---

## Curation Tasks

| Task | Action | Output |
|---|---|---|
| **Deduplicate** | Find similar/identical `.md` files | Archive duplicates to `library/archive/` |
| **Tag** | Add frontmatter: `domain`, `year`, `tags` | Consistent metadata |
| **Rename** | Standardize: `kebab-case-domain-year.md` | Predictable naming |
| **Index** | Create `library/SOURCES.md` catalog | Human-readable index |
| **Validate** | Check each `.md` has enough content for encoding | Flag thin sources |

---

## Execution Pattern

1. List all `library/*.md` (exclude retrospectives, handoffs)
2. Analyze for duplicates (diff, content hash)
3. Apply curation actions
4. Update SOURCES.md index

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "write",
      "file": "library/SOURCES.md",
      "description": "Source catalog with domain/tags"
    },
    {
      "type": "bash",
      "cmd": "mkdir -p library/archive && mv library/old-duplicate.md library/archive/"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Curated 12 source files: 3 archived, 9 tagged, index created",
    "target": "sources",
    "journalEntry": "Source curation complete. Found esp-ecosystem source missing (was in kaaroBrain). Created placeholder. 3 duplicates archived. SOURCES.md index ready for human review.",
    "unresolved": [
      "esp-ecosystem source needs retrieval from kaaroBrain",
      "Human should verify tags in SOURCES.md"
    ],
    "nextRecommendation": "Human retrieves esp-ecosystem source, then VISUALIZE"
  }
}
```

---

## Guidelines

- **Never encode** — That's VISUALIZE (HITL)
- **Preserve history** — Archive, don't delete
- **Consistent frontmatter** — `domain`, `year`, `tags`, `sourceUrl`
- **Human review** — Tags and categorization need human judgment