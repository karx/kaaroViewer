# Alone-Time Briefing — 2026-06-17
## Task: T-001 REPAIR pkm-engineering-prompt

**Priority:** 1 (Critical — validator exit 2)
**Thread:** Θ-001 Library Critical Repair Sprint, Step 1
**Source:** `library/pkm-engineering-seed.md`
**Target:** `library/pkm-engineering-prompt.json` (overwrite)

---

## Gap Targets (from health.json + validator)

### 🔴 Cross-Reference Errors (5) — MUST FIX (exit 2 → exit 0)
| Field | References Unknown Node | Fix Strategy |
|---|---|---|
| `report_card.protagonists[0]` | "Agent (human + AI)" | Add node `agent-human-ai` (type: `concept` / `actor`) or rename to existing `agent-field` |
| `report_card.protagonists[1]` | "CLAUDE.md prompt" | Add node `claude-md-prompt` (type: `prompt` / `standard`) or use existing `pkm-prompt` |
| `report_card.antagonists[0]` | "Isolated notes" | Add node `isolated-notes` (type: `concept` / `anti-pattern`) |
| `report_card.antagonists[1]` | "Uncrystallized pipelines" | Add node `uncrystallized-pipelines` (type: `concept` / `anti-pattern`) |
| `report_card.antagonists[2]` | "Zero-link nodes" | Add node `zero-link-nodes` (type: `concept` / `anti-pattern`) |

### 🟡 Unknown Node Types (12) — Map to VALID_TYPES
**VALID_TYPES available:** `person`, `player`, `place`, `country`, `organization`, `company`, `government`, `platform`, `issue`, `solution`, `union`, `metric`, `video`, `channel`, `post`, `subreddit`, `team`, `tournament`, `civ`, `dlc`, `insight`, `milestone`, `conflict`, `event`, `concept`, `species`, `software`, `sport`, `artwork`, `award`, `law`, `academic`, `religion`, `language`, `film`, `book`, `music`, `ruling`, `regulation`, `algorithm`, `standard`, `dataset`, `model`

| Node ID | Current Type | In VALID_TYPES? | Mapping Strategy |
|---|---|---|---|
| `para-framework` | `framework` | ❌ | Use `software` or `standard` (Dream Loop could add `framework`) |
| `pkm-prompt` | `prompt` | ❌ | Use `standard` (Dream Loop could add `prompt`) |
| `pipelines` | `process` | ❌ | Use `event` or `concept` (Dream Loop could add `process`) |
| `wikilinks` | `process` | ❌ | Use `standard` or `concept` |
| `crystallization` | `process` | ❌ | Use `event` or `concept` |
| `ebrain-vault` | `system` | ❌ | Use `platform` or `organization` (Dream Loop could add `system`) |
| `dual-track` | `process` | ❌ | Use `concept` or `event` |
| `kaaroViewer` | `tool` | ❌ | Use `software` (Dream Loop could add `tool`) |
| `agent-field` | `concept` | ✅ | Keep `concept` |
| `computeTheory` | `concept` | ✅ | Keep `concept` |
| `ego-Field` | `concept` | ✅ | Keep `concept` |
| `GARDEN_GUIDELINES` | `standard` | ✅ | Keep `standard` |

**Decision:** For this repair run, map to nearest existing type to pass validator. Flag missing types (`framework`, `prompt`, `process`, `system`, `tool`) for Dream Loop ontology extension.

### 🟡 Unknown Rel Types (19) — Map to VALID_RELS
**VALID_RELS available:** `causes`, `mitigates`, `disrupts`, `opposes`, `enables`, `precedes`, `governs`, `membership`, `leadership`, `employment`, `ownership`, `creation`, `location`, `competes`, `association`, `qualifies`, `features`, `broadcasts`, `temporal`, `reveals`, `default`, `implements`, `supersedes`, `permits`, `prohibits`, `derives_from`, `achieves`, `cites`, `contradicts`

| Edge | Current Rel | In VALID_RELS? | Mapping Strategy |
|---|---|---|---|
| `pkm-prompt → frontmatter` | `enforces` | ❌ | Use `governs` |
| `pkm-prompt → wikilinks` | `enforces` | ❌ | Use `governs` |
| `pkm-prompt → crystallization` | `enforces` | ❌ | Use `governs` |
| `para-framework → skill-surfaces` | `transforms` | ❌ | Use `governs` |
| `para-framework → crystallized-archive` | `transforms` | ❌ | Use `governs` |
| `crystallization → crystallized-archive` | `creates` | ❌ | Use `creation` |
| `crystallization → areas` | `updates` | ❌ | Use `supersedes` or `cites` |
| `wikilinks → knowledge-surface` | `builds` | ❌ | Use `creation` |
| `dual-track → knowledge-surface` | `expands` | ❌ | Use `enables` |
| `knowledge-surface → pkm-prompt` | `improves` | ❌ | Use `enables` |
| `ebrain-vault → para-framework` | `contains` | ✅ | Keep `contains` |
| `ebrain-vault → pipelines` | `maps_to` | ❌ | Use `location` or `association` |
| `ebrain-vault → skill-surfaces` | `maps_to` | ❌ | Use `location` or `association` |
| `kaaroViewer → knowledge-surface` | `visualizes` | ❌ | Use `features` |
| `kaaroViewer → pkm-prompt` | `renders` | ❌ | Use `features` |
| `agent-field → pkm-prompt` | `underpins` | ❌ | Use `enables` |
| `computeTheory → para-framework` | `informs` | ✅ | Keep `informs` |
| `ego-Field → knowledge-surface` | `describes` | ❌ | Use `cites` |
| `GARDEN_GUIDELINES → wikilinks` | `governs` | ✅ | Keep `governs` (add label) |

**Decision:** Map to nearest existing rel to pass validator. Flag missing rels (`enforces`, `transforms`, `creates`, `updates`, `builds`, `expands`, `improves`, `maps_to`, `visualizes`, `renders`, `underpins`, `describes`, `simplifies`, `supports`) for Dream Loop ontology extension.

### 🟡 Meta Issues
- **meta.tone**: `"instructional"` → change to `"analytical"` or `"narrative"` (valid: `analytical`, `celebratory`, `critical`, `investigative`, `narrative`)
- **Edge density**: 1.5x (25 edges / 17 nodes) → need ≥2.0 → **add ~9 cross-cluster edges**
- **Insight-3 title**: "Crystallization prevents knowledge evaporation" → rewrite as declarative claim (e.g., "Crystallization prevents knowledge evaporation by converting transient pipeline context into permanent, invocable assets")

### 🟢 Already Good (No Action Needed)
- Story beats: 8 (range 7–12) ✓
- Climax beats: 1 (beat-7) ✓
- Insights: 5 (range 4–7) ✓ with `warning` + `finding` ✓
- Clusters: 4 ✓
- Nodes: 17 (above min 12) ✓

---

## Re-Encoding Strategy

### Pass 1: Nodes — Fix Types + Add Missing Protagonist/Antagonist Nodes
1. Change `meta.tone` to `"analytical"`
2. Map all 10 unknown types to VALID_TYPES (check validator list first)
3. Add 5 missing nodes for report_card cross-refs:
   - `agent-human-ai` (type: `actor` or `concept`)
   - `claude-md-prompt` (type: `standard` or `prompt`)
   - `isolated-notes` (type: `anti-pattern` → use `concept`)
   - `uncrystallized-pipelines` (type: `anti-pattern` → use `concept`)
   - `zero-link-nodes` (type: `anti-pattern` → use `concept`)
4. Update `report_card.protagonists` and `antagonists` to reference new node IDs

### Pass 2: Edges — Fix Rel Types + Cross-Cluster Sweep
1. Map all 19 unknown rels to VALID_RELS using table above
2. Add cross-cluster edges to reach density ≥2.0 (target: ~34 edges = 17 nodes × 2.0)
   - Cluster-framework ↔ Cluster-workflow (PARA → dual-track, frontmatter → pipelines)
   - Cluster-workflow ↔ Cluster-leverage (crystallization → knowledge-surface, dual-track → ebrain-vault)
   - Cluster-leverage ↔ Cluster-ecosystem (knowledge-surface → GARDEN_GUIDELINES, ebrain-vault → kaaroViewer)
3. Add label to `GARDEN_GUIDELINES → wikilinks` edge: "governs linking permissions and scope"

### Pass 3: Narrative — Verify + Polish
- Ensure exactly 1 climax beat (beat-7 currently) ✓
- Rewrite insight-3 title as declarative claim
- Verify all story beat `node` and `nodes[]` references exist

---

## Gate Checklist (Must Pass Before Commit)

- [ ] `python3 .claude/hooks/validate-library-json.py library/pkm-engineering-prompt.json` → exit 0
- [ ] `pnpm test` → 168 passing
- [ ] Cross-ref errors: 0
- [ ] Edge density: ≥ 2.0
- [ ] All node types valid
- [ ] All rel types valid
- [ ] meta.tone valid
- [ ] Exactly 1 climax beat
- [ ] Insights: 4–7 with ≥1 warning + ≥1 finding

---

## Commit Message (if gate passes)
```
alone-time: re-encode pkm-engineering-prompt — fix cross-refs, ontology gaps, density 1.47→2.0+
```

---

## Next in Thread Θ-001
After T-001 completes: **T-002 REPAIR esp-ecosystem** (source needed — original was `2 Resources/Hardware/ESP/README.md` from kaaroBrain)