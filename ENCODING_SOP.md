# kaaroViewer — Encoding SOP
### From Markdown Dump to Intelligence Brief

---

## Why This Matters

kaaroViewer encodes knowledge at **four layers simultaneously**:

| Layer | File section | Visual output |
|---|---|---|
| **Factual graph** | `nodes[]` + `edges[]` | 3D canvas — geometry, arcs, rings |
| **Narrative** | `story[]` | Report → Story Arc section |
| **Analytical** | `insights[]` | Report → Insights grid |
| **Structural** | `report_card`, `clusters[]` | Report → Briefing + Clusters |

Most tools only encode Layer 1. The power of kaaroViewer is that all four layers are loaded from a single JSON file and rendered simultaneously as a 3D graph **and** a rich HTML report. Your job as encoder is to extract all four from the source material.

---

## Pre-flight: Read the Source Once, Annotate Twice

Before writing any JSON, read the markdown in full. On the **first read**, annotate:

- **Circle** every named entity (person, organisation, concept, place, event)
- **Box** every causal claim ("X causes Y", "X leads to Z")
- **Underline** every number or statistic
- **Star** every moment of surprise, paradox, or revelation

On the **second read**, answer these four questions:

1. **What is this report fundamentally about?** → `meta.title` + `report_card.summary`
2. **Who are the forces in conflict?** → `report_card.protagonists` + `report_card.antagonists`
3. **What is the timeline / sequence of events?** → `story[]`
4. **What should the reader understand or act on?** → `insights[]`

If you cannot answer all four after the second read, re-read the source.

---

## Phase 1 — Meta & Identity

```json
"meta": {
  "id":       "slug-for-filename",
  "title":    "Evocative title, not a description",
  "subtitle": "One sentence that captures the central tension",
  "source":   "original-file.md",
  "domain":   "Primary Domain / Secondary Domain",
  "year":     "YYYY",
  "tags":     ["3–8 searchable keywords"],
  "tone":     "investigative | analytical | narrative | critical | celebratory"
}
```

**Tone guide:**
- `investigative` — uncovering something hidden or systematic
- `analytical` — breaking down complex data or systems
- `narrative` — following a sequence of events with human protagonists
- `critical` — examining failure, harm, or contradiction
- `celebratory` — marking achievement, milestone, or positive change

---

## Phase 2 — Spine Selection

The **spine** is the 1–3 entities that all other nodes orbit. They are the report's gravitational centre. They are placed first and closest to the scene origin.

**Rules for spine selection:**
- The spine entity is what the report is *about*, not who it affects
- There is almost always 1 primary spine (the subject) and optionally 1 system or antagonist spine
- If you feel you need 4+ spine nodes, you have two separate reports

```json
"report_card": {
  "spine": ["primary-subject-id", "system-id"]
}
```

**Visual effect:** Spine nodes render at 1.22× scale with a wireframe shell overlay. They become the natural anchor in the force layout.

---

## Phase 3 — Entity Inventory (nodes[])

For each circled entity from Phase 0, create a node entry. Then assign:

### 3.1 Type selection

| Type | Use for | Geometry |
|---|---|---|
| `person` | Named individuals | Sphere |
| `organization` | NGOs, bodies, collectives | Box |
| `company` | Commercial platforms, corporations | Box |
| `government` | State bodies, ministries | Box |
| `platform` | Digital platforms, apps, tech systems | Torus |
| `event` | Dated occurrences, incidents | Octahedron |
| `conflict` | Systemic tensions, power clashes | Octahedron |
| `issue` | Problems, harms, failures | Octahedron |
| `concept` | Abstract forces, ideologies, frameworks | Tetrahedron |
| `insight` | Auto-generated from `insights[]` — do not add manually | Tetrahedron |
| `solution` | Remedies, proposals, interventions | Sphere |
| `law` | Legislation, regulation, policy | Icosahedron |
| `milestone` | Significant dates or achievements | Cone |
| `metric` | Quantitative indicators | Sphere (small) |
| `place` | Cities, regions, geographic locations | Flat cylinder |
| `country` | Nation-states | Flat cylinder |
| `union` | Worker organisations, collectives | Box |
| `tournament` | Competitions with bracket structure | Torus knot |
| `player` | Competitive individuals in esport/sport context | Sphere |
| `film` / `book` / `music` | Creative works | Dodecahedron |

**When none fit:** use `concept`. Never use `default` — it signals an incomplete classification.

### 3.2 Tier assignment

Tier controls initial placement and visual scale:

| Tier | Scale | Use for | Visual |
|---|---|---|---|
| `spine` | 1.22× | The 1–3 central subjects | Wireframe shell + large |
| `primary` | 1.0× | Named actors, key forces | Normal |
| `secondary` | 0.88× | Supporting entities, context providers | Slightly smaller |
| `context` | 0.72× | Background entities, reference anchors | Small, semi-transparent |

**Rule of thumb:**
- spine = the subject of the report
- primary = anything with its own story beat or insight evidence role
- secondary = anything mentioned in edges but not starring in a beat
- context = geographic/temporal anchors, regulatory bodies, background companies

### 3.3 Sentiment assignment

Sentiment renders as a coloured aura ring around the node:

| Sentiment | Ring colour | Use for |
|---|---|---|
| `positive` | Green | Beneficial actors, solutions, successes |
| `negative` | Red | Harmful actors, exploitative systems, failures |
| `contested` | Amber | Ambiguous actors, dual-role entities, things under debate |
| `neutral` | (no ring) | Pure information nodes, context, metrics |

**Important:** sentiment is the report author's analytical stance, not objective fact. Be consistent within a document.

### 3.4 Metrics (optional but powerful)

Metrics appear in the label sprite (row 4) and are shown in the entity spotlight cards in the report view.

```json
"metrics": {
  "Market Share": "50%",
  "Valuation":    "$13B",
  "Founded":      "2021"
}
```

**For quantitative-heavy reports:** include `population`, `employees`, or `area` as metric keys — these will feed the **metric arc** (log₁₀ scaled yellow arc at r×1.88) once the visual pipeline reads them.

```json
"metrics": {
  "population": 1400000000,
  "employees":  45000
}
```

### 3.5 Full node template

```json
{
  "id":          "slug-no-spaces",
  "label":       "Human-readable name",
  "type":        "company",
  "tier":        "primary",
  "sentiment":   "negative",
  "description": "1–3 sentences. What is this entity? What is its role in this report?",
  "metrics": {
    "Key Stat":  "value",
    "Founded":   "YYYY"
  },
  "wikidata":    "Q12345",
  "image":       null
}
```

**`wikidata` field:** If the entity has a Wikidata QID, add it. The enrichment pipeline will fetch temporal data (birth/death/founded dates) automatically, creating a **temporal arc** on the node. This is the easiest way to get rich visuals with minimal work.

---

## Phase 4 — Relationship Mapping (edges[])

For each boxed causal claim and every meaningful relationship, create an edge.

### 4.1 Rel type selection

| Rel | `rel` value | Use for |
|---|---|---|
| Entity creates/produces something | `creation` | Author, director, founder → work |
| Located in / occurs at | `location` | Entity in place |
| Part of / member of | `membership` | Sub-org, part of system |
| Led by / governs | `leadership` | Head of state, CEO |
| Causes harm or outcome | `causes` | System → issue |
| Mitigates / solves | `mitigates` | Solution → issue |
| Competing with | `competes` | Platform vs platform |
| Disrupts / undermines | `disrupts` | Force → institution |
| Opposes / resists | `opposes` | Union → platform |
| Enables / facilitates | `enables` | Infrastructure → outcome |
| Precedes / leads to | `precedes` | Temporal sequence |
| Insight reveals / supports | `reveals` | Auto-created by insights[] — don't add manually |

### 4.2 Weight — the most important field you'll set

Weight drives **line opacity** (1→0.35, 5→0.87) and triggers **glow pass** (≥4). It should encode epistemic confidence × narrative importance:

| Weight | When to use |
|---|---|
| `1` | Mentioned in passing, peripheral relationship |
| `2` | Named relationship, moderate importance |
| `3` | Key relationship, central to the story |
| `4` | Causal/evidenced relationship, high narrative weight. Gets a glow line |
| `5` | The defining relationship of the report. Reserve for 1–2 edges maximum |

### 4.3 Directed edges

Set `"directed": true` for:
- Causal claims ("X causes Y", "X enables Y")
- Hierarchical relationships (parent → subsidiary)
- Temporal sequences (A precedes B)
- Power flows (algorithm → worker)

`directed: true` renders an **arrowhead cone** at 72% along the edge, sized with weight.

### 4.4 Temporal edges

Set `"temporal": "YYYY"` for relationships that are time-bound:

```json
{
  "from": "platform-a", "to": "gig-worker",
  "rel": "causes", "label": "earnings erosion",
  "weight": 5, "directed": true, "temporal": "2022"
}
```

### 4.5 Full edge template

```json
{
  "from":     "source-node-id",
  "to":       "target-node-id",
  "rel":      "causes",
  "label":    "Short descriptive label shown on hover",
  "weight":   4,
  "directed": true,
  "temporal": null,
  "notes":    "Optional: context not visible in the label"
}
```

**Edge density guidance:**
- Aim for 1.5–2.5 edges per node
- Every spine node should have ≥ 4 edges
- Every primary node should have ≥ 2 edges
- Secondary/context nodes can have 1

---

## Phase 5 — Report Card

The `report_card` feeds the **Executive Briefing** section of the report view.

```json
"report_card": {
  "summary":      "2–4 sentences. The whole report's argument, compressed.",
  "key_stats":    [
    { "label": "Short label (≤3 words)", "value": "The number" }
  ],
  "spine":        ["id1", "id2"],
  "protagonists": ["id-of-human-force-or-victim"],
  "antagonists":  ["id-of-system-or-harm"],
  "themes":       ["3–6 abstract themes as strings"]
}
```

**key_stats tips:**
- 5–8 stats is ideal
- Mix absolute numbers, percentages, and dates
- The most shocking stat goes first
- Stats without units are useless — always include the unit in `value`

**Protagonists vs Antagonists:**
- protagonists = the entities the reader should care about, root for, or want to protect
- antagonists = the forces causing harm or driving tension
- Both can be non-human systems (an algorithm can be an antagonist)
- Neutral entities (places, metrics, context) don't belong in either list

---

## Phase 6 — Story Arc (story[])

The story arc is the **temporal spine** of the report. It is a sequence of **beats** that carry the reader from context to crisis to response.

### 6.1 Beat structure

Each beat has:
- A **primary node** (`node`) — the entity that owns this moment
- An optional **related nodes list** (`nodes[]`) — supporting cast for this beat
- A **tension level** — encodes where in the dramatic arc this sits
- A **narration** — 2–5 sentences. Present tense. No passive voice. Specifics, not generalities.

```json
{
  "id":        "beat-N-slug",
  "title":     "Short evocative title (3–5 words)",
  "node":      "primary-node-id",
  "nodes":     ["supporting-id-1", "supporting-id-2"],
  "narration": "Present-tense prose. Name specific entities. Include numbers. Build toward the next beat.",
  "tension":   "low | medium | high | climax",
  "focus":     "wide | tight"
}
```

**Tension guide:**

| Tension | Bar colour | Use for |
|---|---|---|
| `low` | Dark green | Setup, context, the world before the crisis |
| `medium` | Amber | Tension building, first consequences appearing |
| `high` | Orange-red | The harm, the conflict, the critical problem |
| `climax` | Crimson | Peak crisis, turning point, or revelation |

**Narrative arc pattern (8–12 beats):**

```
low    → Setup / world-building (1–2 beats)
low    → The system / the actors introduced (1–2 beats)
medium → The first sign of tension (1 beat)
medium → Tension escalating (1 beat)
high   → The harm becomes visible (1–2 beats)
high   → Systemic causes revealed (1 beat)
climax → Peak crisis or revelation (1 beat)
medium → Response / resistance emerging (1 beat)
low    → Current state / open questions (1 beat)
```

**The `focus` field:**
- `wide` — zoomed out, sector-level, large forces
- `tight` — zoomed in, individual experience, specific incident

Alternate focus levels to vary narrative rhythm.

### 6.2 Common mistakes

- **Too abstract:** "Workers face challenges" → Bad. "43% of workers earn below ₹500 per day after the platform cut base rates three times in 18 months" → Good.
- **Too many climax beats:** there should be exactly 1 (or at most 2) climax beats. Reserve it.
- **Missing the turning point:** every good arc has a moment where something changes. Make it explicit.
- **Nodes not in the graph:** every `node` and `nodes[]` reference must exist in `nodes[]`.

---

## Phase 7 — Analytical Insights (insights[])

Insights are the author's analytical layer — the "so what" of the report. They are rendered as pull-quote cards with type icons and severity bars.

Each insight auto-materialises as a **tetrahedron node** in the graph with `reveals` edges to its evidence nodes.

### 7.1 Insight types

| Type | Icon | Use for |
|---|---|---|
| `finding` | ◈ | Empirical observation supported by data |
| `warning` | ⚑ | Risk, danger, or trend that demands attention |
| `pattern` | ◎ | Recurring structure across cases or time |
| `conclusion` | ◆ | The report's central argument or verdict |
| `paradox` | ◉ | Something that shouldn't exist but does; a contradiction |
| `opportunity` | ◇ | A gap, unmet need, or path forward |

### 7.2 Severity

| Severity | Bar | Use for |
|---|---|---|
| `high` | ███ | Urgent, systemic, affects many, requires immediate action |
| `medium` | ██░ | Important but not urgent, or localised |
| `low` | █░░ | Interesting but not critical; background context |

### 7.3 Evidence selection

`evidence[]` is a list of node IDs that support this insight. Choose 2–5 nodes that are most directly evidentially related. These become the `reveals` edges in the graph.

### 7.4 Full insight template

```json
{
  "id":       "ins-slug",
  "title":    "The insight as a declarative statement. Specific. Surprising.",
  "body":     "2–3 sentences of elaboration. Why does this matter? What does it imply?",
  "type":     "finding",
  "severity": "high",
  "evidence": ["node-id-1", "node-id-2", "node-id-3"]
}
```

**Insight count guidance:** 4–7 insights per report. Too few and the analytical layer is thin. Too many and the grid becomes noisy.

**One insight per claim.** Don't bundle two separate findings into one insight card.

---

## Phase 8 — Clusters (clusters[])

Clusters define **thematic groupings** for the Clusters section of the report view. They are visual, not analytical — they help the reader navigate the entity landscape.

```json
{
  "id":          "cluster-slug",
  "label":       "Short cluster name",
  "color":       "#hexcolor",
  "description": "One sentence. What connects these entities?",
  "nodes":       ["id1", "id2", "id3", "id4"]
}
```

**Cluster design rules:**
- 3–6 clusters per report
- Each cluster should have 3–8 nodes
- Every node should belong to exactly one cluster
- Cluster colours should be visually distinct and intentional — don't use colours already dominant in the ontology (avoid plain orange or red which look like default entity colours)
- Cluster names should describe the grouping's *role* or *function* in the report, not just list members

**Good cluster naming:** "Harm Manifold", "Response Coalition", "Control Architecture"
**Bad cluster naming:** "Workers and Unions", "Platform Companies"

---

## Phase 9 — Register in LIBRARY

Add your document to `pipeline/local-graph.mjs`:

```js
export const LIBRARY = [
  // ... existing entries ...
  {
    id:     'your-doc-id',          // must match meta.id
    title:  'Display title',
    path:   './library/your-file.json',
    domain: 'Domain / Subdomain',
    year:   'YYYY',
  },
];
```

---

## Visual Encoding Quick Reference

### What each field produces on the canvas

| Field | Visual output |
|---|---|
| `type` | Geometry shape (sphere/box/octahedron/etc.) |
| `tier: "spine"` | 1.22× scale + wireframe shell |
| `tier: "context"` | 0.72× scale + semi-transparent |
| `sentiment: "positive"` | Green aura ring at r×1.55 |
| `sentiment: "negative"` | Red aura ring at r×1.55 |
| `sentiment: "contested"` | Amber aura ring at r×1.55 |
| `wikidata: "Qxxxx"` | Temporal arc auto-generated from P569/P570/P571 |
| `metrics.population` or `metrics.employees` | Yellow metric arc (log₁₀ scaled) at r×1.88 |
| Edge `weight: 4–5` | Glow pass on edge line |
| Edge `directed: true` | Arrowhead cone at 72% along edge |
| Degree centrality | Glow ring at r×1.2 grows with each edge added |
| `insights[]` entry | Tetrahedron node auto-created with `reveals` edges |

### What each layer produces in the report view

| Section | Populated by |
|---|---|
| Executive Briefing | `report_card.summary`, `key_stats`, `protagonists`, `antagonists`, `themes` |
| Story Arc | `story[]` beats → arc dots + beat cards |
| Analytical Insights | `insights[]` → pull-quote cards with severity bars |
| Entity Spotlight | `report_card.protagonists` + `report_card.antagonists` |
| Entity Clusters | `clusters[]` |

---

## Quality Checklist

Run through this before adding to LIBRARY:

**Schema integrity**
- [ ] All `node` and `nodes[]` references in `story[]` exist in `nodes[]`
- [ ] All `evidence[]` node IDs in `insights[]` exist in `nodes[]`
- [ ] All `report_card.protagonists` / `antagonists` IDs exist in `nodes[]`
- [ ] All `clusters[].nodes[]` IDs exist in `nodes[]`
- [ ] All edge `from` / `to` IDs exist in `nodes[]`
- [ ] `report_card.spine` IDs exist in `nodes[]`

**Content quality**
- [ ] Every node has a non-empty `description`
- [ ] No node uses type `default`
- [ ] At least 1 spine, 3+ primary, 2+ secondary nodes
- [ ] story[] has 7–12 beats; exactly 1 `climax` tension
- [ ] insights[] has 4–7 entries; at least 1 `warning` and 1 `finding`
- [ ] 5–8 `key_stats` entries, all with values and units
- [ ] Edge weight distribution: most edges are 2–3; reserve 4–5 for ≤20% of edges

**Visual richness**
- [ ] At least one node per cluster has `sentiment` set
- [ ] Spine nodes have the most edges (highest degree = largest glow ring)
- [ ] Causal/directed edges use `directed: true`
- [ ] At least one edge per major causal claim uses `weight: 4` or `weight: 5`

---

## Common Report Patterns

### Labour / Social Justice report
- Spine: the platform system + the affected worker collective
- Protagonist: worker organisation, advocacy body
- Antagonist: the algorithmic system, the economic pressure
- Key insight types: `warning` (systemic harm), `finding` (data evidence), `paradox` (valuation vs welfare)
- Story arc: Promise → System → Human cost → Escalation → Response → Open question

### Esport / Competition report
- Spine: the tournament + the game title
- Protagonist: top performers, breakthrough players
- Antagonist: format/seeding issues, visa barriers, upset forces
- Key insight types: `pattern` (meta/strategy), `finding` (performance data), `opportunity` (growth/broadcast)
- Story arc: Buildup → Field → Upset → Climax match → Aftermath

### Technology / Product report
- Spine: the product / platform
- Protagonist: users, builders, adopters
- Antagonist: incumbents, regulatory gaps, technical debt
- Key insight types: `conclusion` (thesis), `opportunity` (unmet needs), `pattern` (adoption curve)
- Story arc: Context → Launch → Adoption → Friction → Current state

### Historical / Biographical report
- Spine: the person or event
- Protagonist: the individual(s), movement
- Antagonist: the opposing force, the context of resistance
- Key insight types: `pattern` (recurring behaviour), `conclusion` (historical verdict), `paradox` (legacy vs impact)
- Story arc: Origins → Rise → Crisis → Turning point → Legacy

---

## Encoding with an LLM

When using an AI assistant to encode a markdown report, use this prompt structure:

```
You are encoding a report for kaaroViewer. The schema is:
[paste the schema section from local-graph.mjs comment block]

The ontology types are: [paste ENTITY_TYPES keys]
The relationship types are: [paste REL_TYPES keys]

Source document:
[paste the markdown]

Encode the full JSON following the kaaroViewer ENCODING_SOP:
1. Extract 15–35 nodes with type, tier, sentiment, description, metrics
2. Extract 20–50 edges with rel, weight, directed
3. Write report_card with summary, 5–8 key_stats, spine, protagonists, antagonists, themes
4. Write 8–12 story beats with escalating tension (exactly 1 climax)
5. Write 4–7 insights with types finding/warning/pattern/conclusion/paradox/opportunity
6. Write 3–6 clusters covering all nodes
7. Be expansive — err on the side of more nodes and richer descriptions

Return only valid JSON. Use the existing documents in library/ as style reference.
```

**Review pass after LLM output:**
- Check every cross-reference (IDs consistent across all sections)
- Verify tension arc has proper escalation (not all high)
- Ensure insight titles are specific claims, not vague summaries
- Confirm at least 2–3 nodes per cluster don't exist in other clusters
