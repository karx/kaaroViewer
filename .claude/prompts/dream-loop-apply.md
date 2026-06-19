# Dream Loop: APPLY Phase Prompt

## Role
Atomically apply approved ontology proposals to all 3 artifacts:
1. `.claude/hooks/validate-library-json.py` — VALID_TYPES, VALID_RELS
2. `sop-reference.md` — Encoding guidance
3. `canvas/` — Renderer updates

## Context (injected)
{{proposals}}

---

## Application Checklist

### 1. Validator (`.claude/hooks/validate-library-json.py`)
- [ ] Add each type to `VALID_TYPES` set (alphabetical)
- [ ] Add each rel to `VALID_RELS` set (alphabetical)
- [ ] Verify no duplicates
- [ ] Run validator on all 11 entries — must all pass exit 0

### 2. SOP (`sop-reference.md`)
- [ ] Add type encoding guidance to "Node Types" section
- [ ] Add rel encoding guidance to "Relationship Types" section
- [ ] Add visual specs to "Visual Encoding" section
- [ ] Update "Density Gate" and "Cross-ref Check" if specified

### 3. Renderer (`canvas/`)
- [ ] `canvas/node-renderer.mjs` — Add geometry/color for each type
- [ ] `canvas/edge-renderer.mjs` — Add style for each rel
- [ ] `canvas/legend.mjs` — Add legend entries
- [ ] `canvas/brief-controller.mjs` — Ensure tier mapping works

---

## Execution Pattern

1. **Read** each target file
2. **Edit** with surgical precision (alphabetical insertion)
3. **Test** after each artifact (validator on all entries)
4. **Verify** renderer imports work
5. **Output** changes summary

---

## Output Format (JSON only)

```json
{
  "changes": [
    {
      "type": "edit",
      "file": ".claude/hooks/validate-library-json.py",
      "description": "Added 5 types to VALID_TYPES, 6 rels to VALID_RELS"
    },
    {
      "type": "edit",
      "file": "sop-reference.md",
      "description": "Added encoding guidance for 5 types + 6 rels"
    },
    {
      "type": "edit",
      "file": "canvas/node-renderer.mjs",
      "description": "Added geometry/color for framework, prompt, process, system, tool"
    },
    {
      "type": "edit",
      "file": "canvas/edge-renderer.mjs",
      "description": "Added styles for enforces, transforms, creates, maps_to, visualizes, renders"
    }
  ],
  "gateResults": {},
  "handoffNotes": {
    "summary": "Atomic ontology extension v1.2.0 applied to validator, SOP, renderer",
    "target": "ontology",
    "journalEntry": "Applied Dream Loop proposals: 11 ontology additions across 3 artifacts. All 11 library entries pass validator. Ready for generational gate.",
    "unresolved": [
      "pkm-engineering-prompt and esp-ecosystem need human VISUALIZE to use new types/rels",
      "Other entries may benefit from re-encoding"
    ],
    "nextRecommendation": "Generational gate (all entries + tests), then version tag"
  }
}
```

---

## Guidelines

- **Atomic or bust** — If one artifact fails, revert all
- **Test continuously** — Run validator after each edit
- **Alphabetical** — Keep sets sorted for diffs
- **No new errors** — Generational gate will catch regressions