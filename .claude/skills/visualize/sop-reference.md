# kaaroViewer SOP Quick Reference

## Entity Types → Geometry

| `type` | Geometry | Colour | Use for |
|---|---|---|---|
| `person` | Sphere | Cyan | Named individuals |
| `player` | Sphere | Cyan | Competitive individuals |
| `organization` | Box | Orange | NGOs, collectives, bodies |
| `company` | Box | Amber | Commercial platforms, corps |
| `government` | Box | Orange | State bodies, ministries |
| `union` | Box | Yellow | Worker organisations |
| `platform` | Torus | Blue | Digital platforms, apps |
| `subreddit` | Torus | Red-orange | Reddit communities |
| `event` | Octahedron | Red-orange | Dated incidents |
| `conflict` | Octahedron | Crimson | Systemic tensions |
| `issue` | Octahedron | Red | Harms, problems, failures |
| `concept` | Tetrahedron | Purple | Abstract forces, ideologies |
| `insight` | Tetrahedron | White | **Auto-generated** — do not add to nodes[] |
| `law` | Icosahedron | Gold | Legislation, regulation |
| `species` | Icosahedron | Green | Biological entities |
| `academic` | Icosahedron | Light blue | Disciplines, institutions |
| `language` | Icosahedron | Mint | Languages |
| `religion` | Icosahedron | Tan | Belief systems |
| `milestone` | Cone | Yellow | Achievements, key dates |
| `award` | Cone | Gold | Prizes, recognition |
| `place` | Flat cylinder | Green | Cities, regions |
| `country` | Flat cylinder | Green | Nation-states |
| `film` | Dodecahedron | Pink | Films, documentaries |
| `book` | Dodecahedron | Yellow | Books, publications |
| `music` | Dodecahedron | Pink | Albums, tracks |
| `artwork` | Dodecahedron | Light pink | Art, creative works |
| `tournament` | Torus knot | Yellow | Competitions with brackets |
| `team` | Sphere | Teal | Sports/esport teams |
| `video` | Flat slab | Red-pink | YouTube videos |
| `channel` | Flat slab | Red | YouTube channels |
| `post` | Flat slab | Orange | Social media posts |
| `software` | Sphere | Cyan | Software products |
| `sport` | Sphere | Yellow | Sports/games |
| `solution` | Sphere | Green | Remedies, interventions |
| `metric` | Sphere (small) | Yellow | Quantitative indicators |
| `civ` | Sphere | Brown | Game civilizations |
| `dlc` | Sphere | Purple | Game DLC content |

---

## Tiers → Visual Scale

| `tier` | Scale | Placement | When to use |
|---|---|---|---|
| `spine` | 1.22× + wireframe | Near origin | 1–3 central subjects of the report |
| `primary` | 1.0× | Orbit spine | Named actors with their own beats/insights |
| `secondary` | 0.88× | Further orbit | Supporting entities, mentioned in edges |
| `context` | 0.72×, semi-transparent | Outer ring | Background anchors, regulatory/geographic context |

---

## Sentiment → Aura Ring

| `sentiment` | Ring colour | Use for |
|---|---|---|
| `positive` | Green | Beneficial, hopeful, protective actors |
| `negative` | Red | Harmful, exploitative, failure entities |
| `contested` | Amber | Dual-role, ambiguous, debated entities |
| `neutral` | (none) | Pure information, metrics, context |

---

## Edge Weight Guide

| `weight` | Line opacity | Effect | When to use |
|---|---|---|---|
| 1 | 0.35 | Faint | Peripheral, mentioned in passing |
| 2 | 0.48 | Dim | Named, moderate importance |
| 3 | 0.61 | Visible | Key relationship, central to story |
| 4 | 0.74 | Bright + glow | Causal/evidenced, high narrative weight |
| 5 | 0.87 | Bright + glow | The defining relationship of the report |

Reserve weight 4–5 for ≤20% of total edges.
`"directed": true` for all causal, hierarchical, and sequence relationships → renders arrowhead.

---

## Rel Types

| `rel` | Direction | Use for |
|---|---|---|
| `causes` | → | A causes B (always directed, weight 4–5) |
| `mitigates` | → | Solution reduces issue |
| `disrupts` | → | Force undermines institution |
| `opposes` | ↔ | Resistance, conflict between actors |
| `enables` | → | A makes B possible |
| `precedes` | → | Temporal sequence, A comes before B |
| `governs` | → | Regulates or controls |
| `membership` | → | Part of, member of, subsidiary |
| `leadership` | → | Leads, heads, directs |
| `employment` | → | Employs, hires |
| `ownership` | → | Owns, controls financially |
| `creation` | → | Author, creator, founder → work |
| `location` | → | Entity located in place |
| `competes` | ↔ | Competitive relationship |
| `association` | ↔ | General thematic link |
| `qualifies` | → | Qualifies for, eligible |
| `features` | → | Includes, showcases |
| `broadcasts` | → | Media coverage |
| `temporal` | → | Time-based link only |

---

## Story Tension → Left Bar Colour

| `tension` | Bar colour | Narrative position |
|---|---|---|
| `low` | Dark green | Setup, world-building, context |
| `medium` | Amber | Tension building, consequences emerging |
| `high` | Orange-red | The harm, the conflict, the crisis |
| `climax` | Crimson | Peak moment — use exactly **once** |

Narrative arc pattern:
```
low → low → medium → medium → high → high → climax → medium → low
```

`focus`:
- `wide` — sector-level, big forces, zoomed out
- `tight` — individual experience, specific incident, zoomed in

---

## Insight Types → Report Icons

| `type` | Icon | `severity` | Use for |
|---|---|---|---|
| `finding` | ◈ | med–high | Empirical observation backed by data |
| `warning` | ⚑ | high | Danger, risk, urgent trend |
| `pattern` | ◎ | low–med | Recurring structure across cases |
| `conclusion` | ◆ | med–high | Central argument or verdict |
| `paradox` | ◉ | med–high | Contradiction that shouldn't exist |
| `opportunity` | ◇ | low–med | Gap, path forward, unmet need |

---

## Cluster Colour Palette

Pick visually distinct hex colours. Avoid plain red/orange (reserved for negative entity auras):

```
#00aaff   bright blue       — technology, systems
#00ff88   mint green        — natural, beneficial, solutions
#ff6600   orange            — economic, platforms (use sparingly)
#ffcc00   amber/yellow      — labour, human
#cc44ff   purple            — analytical, conceptual
#00cccc   cyan              — data, metrics
#ff4488   pink              — creative, cultural
#888866   olive dim         — context, background
#ff2244   red               — harm, conflict (use carefully)
```

---

## Cross-Reference Rules (enforced by validator)

Every ID referenced in these fields **must exist** in `nodes[].id`:
- `story[].node`
- `story[].nodes[]`
- `insights[].evidence[]`
- `clusters[].nodes[]`
- `report_card.spine[]`
- `report_card.protagonists[]`
- `report_card.antagonists[]`
- `edges[].from`
- `edges[].to`

The validator at `.claude/hooks/validate-library-json.py` checks all of these.
