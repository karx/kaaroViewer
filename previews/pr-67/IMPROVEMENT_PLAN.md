# kaaroViewer — Improvement Plan

**Prepared**: 2026-04-06
**Derived from**: `named-entity-detection-improvement.md` analysis + `library/poker-tooling-2026-retrospective.md` postmortem
**Status**: Active implementation  
**Last updated**: 2026-04-06  
**Completed**: O-01–O-16, C-01–C-03, C-06–C-07, C-10–C-13, C-15, IA-01–IA-02, IA-05–IA-07, S-01–S-09, S-08, C-12, C-14

This document captures four categories of planned improvements: UI/Canvas, Information Architecture, Ontology/Grammar, and Skill Workflow. Items within each category are ordered by effort-to-impact ratio. Implementation sequencing is in the Priority Matrix at the end.

---

## Category 1 — UI: Canvas and Web View

### Canvas

#### C-01 · Tooltip upgrade
**Current**: `tooltip.mjs` shows only `label + type` on hover.
**Target**: Show `label`, `type`, `tier`, `sentiment`, description (first 80 chars), first metric key-value.
**Why**: Everything needed is already on the node object — the `showTooltip` call signature just doesn't pass it through. This is the difference between hovering to read vs clicking to read on every node.
**Effort**: Low. **Impact**: High.

---

#### C-02 · Ego-graph / focus mode
**Current**: Clicking a node opens `detail.mjs`. All other nodes remain fully lit.
**Target**: A second action (`Tab` or `F` while detail is open) dims all non-adjacent nodes to ~15% opacity. Click background to exit.
**Why**: On 40-node graphs the scene is visually flat — no way to read a node's immediate neighborhood without the rest competing for attention.
**Effort**: Low. **Impact**: High.

---

#### C-03 · Cluster isolation filter
**Current**: No canvas-level cluster filtering exists.
**Target**: A row of cluster pills (colored squares with labels) in the toolbar or canvas overlay. Click a cluster → non-member nodes dim to 10% opacity. Click again to release.
**Why**: The poker retrospective explicitly flagged that the India regulatory sub-graph (10 nodes) was visually diluted by the full 40-node render. The cluster `color` and `nodes[]` arrays are already in every library JSON.
**Effort**: Medium. **Impact**: High.

---

#### C-04 · Edge label rendering toggle
**Current**: Edge `label` fields ("employs via app", "banned – dynamic HUD") exist in the schema but nothing renders them on canvas.
**Target**: A keyboard toggle (suggest `F6 EL`) that materializes edge labels as floating text sprites at edge midpoints. Off by default.
**Why**: The compliance dimension of toolkit documents (tool × network = permitted/banned) is currently invisible in the graph layer because the label is the only carrier of that meaning.
**Effort**: Low. **Impact**: Medium.

---

#### C-05 · Rel-type filter
**Current**: No edge filtering exists.
**Target**: A filter bar to show only edges of a specific `rel` type: `causes`, `governs`, `precedes`, etc. Other edges dim to near-invisible.
**Why**: Isolating causal chains vs membership structure vs temporal sequence requires looking at rel subsets. Currently impossible without ego-graph mode.
**Effort**: Medium. **Impact**: Medium.

---

#### C-06 · Sentiment and tier overlay toggles
**Current**: Node color is always entity-type color.
**Target**: Two toolbar toggle buttons:
- **Sentiment view**: temporarily override node color to sentiment color (green/red/amber/grey).
- **Tier view**: override node size to make spine/primary/secondary/anchor differences visually stark.
**Why**: These are two of the most important encoded dimensions — they should be surfaceable without clicking every node.
**Effort**: Low. **Impact**: Medium.

---

#### C-07 · Beat → canvas camera sync (implement handler)
**Current**: `report:beat-frame` event is dispatched from the report panel and wired in `main.mjs` but the canvas handler implementation is unclear.
**Target**: When a story beat is selected, the camera smoothly flies to the beat's `node` entry, and all `nodes[]` entries glow. Non-beat nodes dim to 30%.
**Why**: This is the bridge between the narrative layer and the graph layer. Without it, the story panel and the canvas are independent views of the same data.
**Effort**: Medium. **Impact**: High.

---

#### C-08 · Timeline layout mode
**Current**: All nodes use physics-based layout regardless of type.
**Target**: A layout mode toggle (`F8 TML`) that snaps `event`/`milestone` nodes linked by `precedes` edges to a horizontal axis (time left→right), while physics runs for remaining nodes. Spine nodes anchor to y=0.
**Why**: The temporal chain of a legal narrative (5 PROGA milestones) or product history (2015–2026 GTO arc) requires a linear axis to be readable as sequence, not topology.
**Effort**: High. **Impact**: Medium.

---

#### C-09 · Minimap
**Current**: No navigation aid for large graphs.
**Target**: A 120×90px corner minimap showing a 2D projection of all nodes with a draggable viewport rectangle.
**Why**: 40+ node graphs lose spatial orientation during zoom/pan.
**Effort**: Medium. **Impact**: Low-Medium.

---

#### C-10 · Screenshot export
**Current**: No export mechanism.
**Target**: A button that calls `renderer.domElement.toDataURL('image/png')` and triggers a download.
**Effort**: Low. **Impact**: Low (but frequently requested).

---

### Web View / Report Panel

#### C-11 · Beat progress strip
**Current**: Story beats render as a scrollable list with no arc orientation.
**Target**: A compact strip at the top of the story section showing all beats as colored tension-blocks (crimson for climax, orange-red for high, amber for medium, dark green for low), with the active beat highlighted.
**Why**: The reader has no sense of arc position — "is this beat the climax or setup?" — without reading the narration.
**Effort**: Low. **Impact**: Medium.

---

#### C-12 · Key stats as persistent canvas strip
**Current**: `report_card.key_stats` are inside the scrollable report panel.
**Target**: A persistent horizontal data bar at the bottom of the canvas area (Bloomberg data strip style) showing the 5–8 key stats. Visible at all times, including when the report panel is closed.
**Effort**: Medium. **Impact**: Medium.

---

#### C-13 · Insight type filter tabs
**Current**: Insights render sequentially in encoding order.
**Target**: Filter pills above the insights section: `ALL / WARNINGS / FINDINGS / PARADOXES / PATTERNS / CONCLUSIONS / OPPORTUNITIES`. Click to filter. Active tab highlighted.
**Why**: Risk-focused reading needs warnings first. Summary-focused reading needs conclusions first. Sequential order serves neither.
**Effort**: Low. **Impact**: Medium.

---

#### C-14 · Library browser upgrades
**Current**: F5 LIB modal shows a flat document list.
**Target**: Each document entry shows node count, edge count, beat count, spine entity names. Add: filter by domain, filter by year, full-text search by title. Tags from `meta.tags[]` shown as pills.
**Effort**: Medium. **Impact**: Medium.

---

#### C-15 · Report card as document preview
**Current**: Report card content is buried inside the scrollable report view after graph load.
**Target**: When a document is selected from the library browser, show a preview card (`report_card.summary` + key_stats + protagonists/antagonists) before the graph loads. Gives user orientation before the 3D view appears.
**Effort**: Low. **Impact**: Medium.

---

#### C-16 · Protagonist / antagonist visual badges
**Current**: Protagonists and antagonists are stored in `report_card` but have no visual distinction from other nodes in the report panel.
**Target**: `▲` badge for protagonists, `▼` badge for antagonists in the entity spotlight section and wherever those nodes appear in connection lists.
**Effort**: Low. **Impact**: Low.

---

## Category 2 — Information Architecture

### Cross-document

#### IA-01 · Wikidata QID as canonical cross-document identity
**Current**: The same entity appears as isolated nodes across library documents with no linkage.
**Target**: At library load time, build a Map of `wikidata QID → [docId, docId, ...]`. When a node is selected, the detail panel shows "Appears in N documents" with navigation links.
**Why**: `india-proga` in the poker document and `india-proga` in any future India regulation document are the same entity. The Wikidata QID is already on nodes — the linking logic just doesn't exist yet.
**Effort**: Medium. **Impact**: High (compounds with every new library document).

---

#### IA-02 · Tag-based library navigation
**Current**: `meta.tags[]` exists on every document but is invisible in navigation.
**Target**: A tag cloud in the F5 LIB modal. Click a tag to filter the document list to those that include it.
**Why**: As the library grows, browsing by domain alone is insufficient. "Show me all regulation documents" or "all gig economy documents" should be one click.
**Effort**: Low. **Impact**: Medium (grows with library).

---

#### IA-03 · `meta.timespan` field
**Current**: `meta.year` is a single integer. A 30-year narrative (PROGA: 1996–2026) has no representation.
**Target**: Add optional `meta.timespan: { start: 1996, end: 2026 }` to the schema and the validator. Library browser uses it to position documents on a timeline axis.
**Schema change**: Additive (backward-compatible). Validator: warn if `meta.year` is absent and `timespan` is also absent.
**Effort**: Low. **Impact**: Medium.

---

#### IA-04 · Document relationships
**Current**: No way to express that one document is a retrospective of, or related to, another.
**Target**: Add optional `meta.related: [{ id: "poker-tooling-2026", rel: "retrospective_of" }]` field. Report panel footer shows "See also:" with clickable document links.
**Effort**: Low. **Impact**: Low-Medium (grows with library).

---

### Within-document

#### IA-05 · Insight → canvas sync (full highlight set)
**Current**: Clicking an insight in the report panel fires `report:navigate` with a single `qid`. The insight's `evidence[]` nodes are not highlighted.
**Target**: Event payload becomes `{ qid, highlightSet: [...evidence] }`. Camera flies to insight tetrahedron, all evidence nodes pulse simultaneously.
**Effort**: Low. **Impact**: High. This is the core cross-layer navigation that makes the analytical layer useful.

---

#### IA-06 · Cluster as first-class navigation target (three-way sync)
**Current**: Clusters exist in the report panel only. No canvas interaction.
**Target**: Clicking a cluster label in (a) the report panel cluster section, (b) the canvas cluster pills overlay, or (c) a keyboard shortcut (1–6) all do the same thing: isolate the cluster in the canvas AND scroll the report panel to that cluster's section.
**Effort**: Medium. **Impact**: High.

---

#### IA-07 · Spine nodes as persistent anchors
**Current**: Spine nodes get a wireframe overlay from `node-factory.mjs`. Labels disappear at distance like all other nodes.
**Target**: Spine nodes always show their label regardless of camera distance. An additional outer halo ring (distinct from the sentiment aura) marks them as structural anchors.
**Why**: Spine nodes are the navigation roots of any document. They should always be findable.
**Effort**: Low. **Impact**: Medium.

---

#### IA-08 · Draggable canvas/report splitter
**Current**: Canvas shrinks to fixed 280px when report panel is visible.
**Target**: A draggable divider between canvas and report panel. Position persists per session.
**Why**: Narrative-heavy documents (policy, legal) benefit from a wider report panel. Graph-heavy documents (network analysis) benefit from a wider canvas.
**Effort**: Medium. **Impact**: Low-Medium.

---

## Category 3 — Grammar and Ontology

### New node types

The following types need to be added to `ontology.mjs` (ENTITY_TYPES + QID_TO_TYPE), the validator (`VALID_TYPES`), the SOP reference (`sop-reference.md`), and the skill SKILL.md.

#### O-01 · `ruling` — court judgments
- **Geometry**: Octahedron (conflict-adjacent cluster)
- **Color**: `#cc9900` (gold, law-family)
- **Code**: `RLLG`
- **Use for**: K.R. Lakshmanan v. State of Tamil Nadu, Karnataka HC stay refusal, Supreme Court transfer orders
- **Problem solved**: Currently forced into `event` or `law`. A ruling has a court, a judge, a legal doctrine — distinct from enacted legislation.

---

#### O-02 · `regulation` — administrative rules
- **Geometry**: Icosahedron (law-family)
- **Color**: `#cc7700` (amber-gold, distinct from `law` gold)
- **Code**: `REGL`
- **Use for**: MEITY notifications, RBI circulars, agency-issued rules. Distinguished from `law` (parliamentary enactment).

---

#### O-03 · `algorithm` — named algorithms
- **Geometry**: Tetrahedron (abstract/conceptual cluster)
- **Color**: `#bb88ff` (lavender, abstract-adjacent)
- **Code**: `ALGO`
- **Use for**: CFR minimization, Leiden community detection, PageRank, Nash equilibrium. Currently absorbed into `concept` or `software`.

---

#### O-04 · `standard` — formal protocols and specifications
- **Geometry**: Icosahedron (knowledge cluster)
- **Color**: `#88aacc` (steel blue, academic-adjacent)
- **Code**: `STND`
- **Use for**: STIX 2.1, TAXII, OWL, SPARQL, openCypher. Distinct from software that implements them.

---

#### O-05 · `dataset` — named datasets and benchmarks
- **Geometry**: Flat slab (data cluster, joins `video`/`channel`/`post`)
- **Color**: `#00cccc` (cyan, data-family)
- **Code**: `DATA`
- **Use for**: AIDA, TACRED, BC2GM, NERdME, ACE2004. Critical for academic and ML documents.

---

#### O-06 · `model` — trained ML/AI models
- **Geometry**: Sphere (software-adjacent, but distinct)
- **Color**: `#44ddcc` (teal-cyan)
- **Code**: `MODL`
- **Use for**: GoLLIE, ExtEnD, REL, PioSOLVER solution trees. Distinct from `software` (the application that runs the model).

---

### New rel types

The following need to be added to `ontology.mjs` (REL_TYPES), the validator (`VALID_RELS`), and `sop-reference.md`.

#### O-07 · `implements`
- **Direction**: → (A implements B)
- **Color**: `#00ccee` (cyan)
- **Code**: `IMPL`
- **Use for**: Software implements an algorithm or standard. Fills the structural gap between `software`/`model` and `algorithm`/`standard` nodes.

---

#### O-08 · `supersedes`
- **Direction**: → (A supersedes B)
- **Color**: `#cc9900` fading (gold → grey)
- **Code**: `SPSD`
- **Use for**: PROGA supersedes the K.R. Lakshmanan doctrine. New law supersedes old law. One of the most important legal relationship types — currently unrepresentable.

---

#### O-09 · `permits` and `prohibits`
- **Direction**: → (regulator → entity)
- **Colors**: `permits` = `#00ff66` (green), `prohibits` = `#ff2244` (red)
- **Codes**: `PRMT` / `PRBT`
- **Use for**: Network/platform permits or bans a specific tool. Currently `governs` + text label carries both meanings. Two distinct rels enable canvas filtering ("show only banned relationships") and form the compliance matrix structure.

---

#### O-10 · `derives_from`
- **Direction**: → (A derives from B)
- **Color**: `#aa88ff` (purple, conceptual)
- **Code**: `DRFM`
- **Use for**: ExtEnD derives from Longformer. GTO Wizard cloud paradigm derives from PioSOLVER.

---

#### O-11 · `achieves`
- **Direction**: → (entity → metric/dataset node)
- **Color**: `#ffee00` (yellow)
- **Code**: `ACHV`
- **Use for**: Model achieves an F1 score on a dataset. Platform achieves a market share metric. Makes performance numbers part of the graph topology rather than tooltip-only data.

---

#### O-12 · `cites`
- **Direction**: → (A cites B)
- **Color**: `#888866` (dim)
- **Code**: `CITE`
- **Use for**: Academic citation, legal case citing precedent. Weight 1–2.

---

#### O-13 · `contradicts`
- **Direction**: ↔ (undirected)
- **Color**: `#ff2244` (crimson)
- **Code**: `CNTR`
- **Use for**: Epistemological opposition between claims, laws, interpretations. Distinct from `opposes` (actor conflict) — this is propositional opposition.

---

### Schema refinements

#### O-14 · `reveals` — mark as auto-generated
**Current**: `reveals` is in `VALID_RELS` and can appear in `edges[]`.
**Target**: Mark in the SOP and SKILL.md as "auto-generated by the loader when insight nodes are materialized — do not encode manually." Add validator warning if `reveals` appears in a raw `edges[]` array.

---

#### O-15 · Sentiment optional for non-actor types
**Current**: Validator warns on missing sentiment for all nodes.
**Target**: Exempt structural/mechanism types from the sentiment requirement: `algorithm`, `standard`, `dataset`, `metric`, `concept`, `model`, `ruling`, `regulation`. These are not actors with an analytical stance — forcing a sentiment produces noise.
**Validator change**: Skip sentiment warning for nodes whose `type` is in the exempt set.

---

#### O-16 · Rename `context` tier → `anchor`
**Current**: `context` tier = "background anchors, regulatory/geographic context."
**Target**: Rename to `anchor`. Update in `ontology.mjs` (ENTITY_TYPES tier descriptions), validator (`VALID_TIERS`), `sop-reference.md` tier table, and `SKILL.md` encoding rules.
**Why**: "Context" implies low importance, creating pressure to undertier regulatory bodies (MEITY, MeitY) that are actually background anchors — not unimportant, but not active agents in the report's conflict. "Anchor" describes the function without implying the importance ranking.
**Schema change**: Breaking — all existing library JSONs use `context`; a migration script or backward-compatible alias is needed.

---

#### O-17 · Separate `tension` from `arc_position` in story beats
**Current**: `tension: low | medium | high | climax` mixes intensity with narrative position. "Climax" is a position, not an intensity.
**Target**:
- `tension: low | medium | high` (intensity, can repeat, no arc constraint)
- `arc_position: setup | rising | peak | falling | resolution` (position, validator enforces exactly one `peak`)
**Why**: A quiet resolution beat can be climactic. A high-tension beat isn't necessarily the structural peak. The current model can't represent either.
**Schema change**: Breaking for `tension` field. `arc_position` is additive.

---

#### O-18 · Specify `temporal` field format on edges
**Current**: The `temporal` edge field is in the schema but has no defined format or validator check.
**Target**: Define as ISO-8601 year or partial date: `"temporal": "2025"` or `"temporal": "2025-08"`. Validator accepts this format and warns on values that don't match the pattern.
**Use**: `{ from: "india-proga", to: "pokerbaazi", rel: "governs", temporal: "2025-08" }` = "this relationship became active August 2025."

---

#### O-19 · `label` field validation on `governs` edges
**Current**: Edge `label` field is not validated.
**Target**: Warn if a `governs`, `permits`, or `prohibits` edge has an empty or missing `label`. These rels carry their specific meaning (permitted/banned/conditional) in the label — an unlabeled governs edge is semantically incomplete.

---

## Category 4 — SKILL: Workflow and Encoding

### Process structure

#### S-01 · Three-pass encoding (2a / 2b / 2c)
**Current**: Step 2 encodes nodes, edges, story, and insights simultaneously.
**Target**: Break Step 2 into three explicit sequential sub-steps:

**2a — Entity pass** (nodes only)
Complete the full node list. No edges written yet. Compression pressure is highest at this stage — keeping it isolated prevents tools from being folded into category concepts.

**2b — Relation pass** (edges only)
All nodes are now defined. For each cluster pair, ask: "what connects these two groups?" This cross-cluster sweep is the step that catches inter-cluster edges. After encoding, verify edges/nodes ≥ 2.0. If below, continue the sweep.

**2c — Narrative pass** (story + insights + clusters + report_card)
Graph is structurally complete. Narrative layers are now written against a closed system — beats reference defined nodes, insights reference defined evidence nodes.

---

#### S-02 · Structured named-entity sweep (before 2a)
**Current**: Step 1 asks four freeform questions. "Every named entity becomes a node" is stated but not enforced by structure.
**Target**: After Step 1 analysis, complete a fill-in-the-blank checklist before writing any JSON:

```
Named people:             [every person named in the source]
Named tools / products:   [every software, hardware, platform by brand name]
Named laws / rulings:     [every legislation, case, administrative rule]
Named events (dated):     [every event with a year attached]
Named organizations:      [every company, agency, institution, platform]
Named datasets / models:  [every named dataset, trained model, benchmark]
```

Each item must become a node or be explicitly excluded with a stated reason. Exclusion must be deliberate, not a compression artifact.

---

#### S-03 · Temporal milestone chain requirement
**Current**: Datable events from the source typically end up as narration text in story beats. The graph layer has no representation of the timeline.
**Target**: If the named-entity sweep (S-02) yields ≥3 datable events, require before writing any story beats: create a chain of `event` or `milestone` nodes with `precedes` edges. The timeline must be visible in the graph layer before it appears in narration. Story beats then reference these nodes via `node:` rather than burying dates in text.

---

#### S-04 · Edge density gate
**Current**: No minimum edge density check before proceeding to narrative pass.
**Target**: After 2b, compute `edges.length / nodes.length`. If < 2.0, do not proceed to 2c. Perform one additional cross-cluster sweep:

For each pair of clusters (C1, C2), ask: "Is there a relationship between any node in C1 and any node in C2 that is not yet encoded?" The poker document had 6 clusters and left ~10 obvious inter-cluster edges on the floor.

---

#### S-05 · Pre-encoding analysis template (replaces freeform Step 1)
**Current**: Step 1 asks four freeform questions.
**Target**: Replace with a structured form that must be completed in full before any JSON is written:

```
Subject (one sentence):
Spine entities (1–3):
Causal chain (A → B → C):
Author's central argument:
Datable events (label + year):
Named tools / products:
Named people:
Named laws / rulings / cases:
Compliance relationships (tool × operator):
```

The named-entity lists in this template become the checklist for S-02.

---

#### S-06 · Validation loop includes quality warnings
**Current**: Step 6 says "fix cross-reference errors (❌)." Warnings (exit 1) are acknowledged but not required to resolve.
**Target**: After fixing all errors, review all warnings. Warnings relating to the following must be resolved before proceeding:
- Node count below scale target for document size
- Edge density below minimum
- Missing insight type diversity (no `warning` or no `finding`)
- Unclustered nodes
- Story arc quality (no climax, fewer than 7 beats)

Cosmetic meta warnings (missing `meta.year`, empty `meta.subtitle`) are acceptable to leave.

---

#### S-07 · Mandatory retrospective (Step 8)
**Current**: No retrospective step exists in the skill.
**Target**: After the validator passes, generate `library/{id}-retrospective.md` using this template:

```markdown
# Encoding Retrospective: {meta.title}

**Source**: `library/{source-file}`
**Output**: `library/{id}.json`
**Encoded**: {date}

## What Went Well

## What the Skill Could Have Done Better

## How This Topic Could Have Been Better Visualized

## Summary Table

| Dimension | Grade | Notes |
|---|---|---|

## Skill-Level Recommendations
```

**Why**: The `poker-tooling-2026-retrospective.md` is the best feedback artifact produced so far. Making it mandatory creates a compounding feedback loop — each retrospective improves the SOP for the next document of the same type.

---

### Validator extensions

#### S-08 · Add quality warnings to `validate-library-json.py`

Extend beyond cross-reference checks to warn on encoding quality:

| Warning condition | Message |
|---|---|
| `len(edges) / len(nodes) < 1.5` | Edge density {ratio:.1f}x — aim for ≥2.0; run cross-cluster sweep |
| ≥3 beats with 4-digit years in narration, zero `event`/`milestone` nodes | Dateable narrative detected with no temporal chain — add milestone nodes |
| Beats contain "founded by" / "justice" / "minister" / "judge", zero `person` nodes | Named individuals in narration with no person nodes |
| Any insight title word count < 6 | Insight title "{title}" may be a topic label rather than a declarative claim |
| Any edge with `rel: "reveals"` in `edges[]` | `reveals` is auto-generated — remove from edges[] |
| Any `governs`/`permits`/`prohibits` edge with empty `label` | Governs/permits/prohibits edge missing label — add permission status |

---

### SOP extensions

#### S-09 · Domain-specific encoding profiles (add two patterns)

**Legal / Regulatory pattern**
- Mandatory: `ruling` and `regulation` node types for all named legal instruments
- Mandatory: temporal chain of `milestone`/`event` nodes with `precedes` edges for the full legislative timeline
- Mandatory: `supersedes` edges between legal instruments where one overrides another
- Story arc must include: prior-doctrine → triggering event → enactment → enforcement → judicial response
- Judicial actors (judges, ministers named in decisions) must be `person` nodes, not mention-only

**Toolkit / Product comparison pattern**
- Mandatory: every named product = a separate node, never a category abstraction (e.g., `pokertracker-4` not `hud-tools`)
- Mandatory: `permits` and `prohibits` edges for each network-tool compliance relationship
- Cluster design criterion: clusters should map to user persona journeys or operational layers, not document sections
- Retrospective must evaluate: "how many named tools were collapsed into category nodes?"

---

#### S-10 · Wikidata QID pass (make active, not passive)
**Current**: SKILL.md says "if the entity has a Wikidata equivalent, add `wikidata: Qxxxx`" — too passive.
**Target**: For each spine and primary node, make an explicit search attempt. In the entity pass (2a), after writing each spine/primary node, record `"wikidata": "Qxxxx"` or `"wikidata": null` with a comment "not found." The null must be deliberate — not an omission. Without QIDs, the enrichment pipeline cannot generate temporal arcs.

---

#### S-11 · Insight title test (enforce before writing)
**Current**: Insight titles tend to drift toward topic labels ("GTO Solvers Changed Poker") under production pressure.
**Target**: Before writing any insight, apply this test internally: "Could this title be published as a headline and be understood without reading the body?" If not, rewrite as a declarative claim with a named subject, named mechanism, and stated direction.

Bad: "GTO Solvers Changed Poker"
Good: "GTO solver adoption has permanently bifurcated the player pool into tool-literate and tool-illiterate tiers"

This is already demonstrated in `sample-encoding.md` — the test should be explicitly listed as a pre-write check in SKILL.md.

---

## Priority Matrix

### Tier 1 — Highest impact, low effort: do first

| ID | Item | Category |
|---|---|---|
| S-01 | Three-pass encoding (2a/2b/2c) | Skill |
| S-02 | Named-entity sweep checklist | Skill |
| S-03 | Temporal milestone chain requirement | Skill |
| S-07 | Mandatory retrospective (Step 8) | Skill |
| S-08 | Validator quality warnings | Skill |
| O-01 | Add `ruling` node type | Ontology |
| O-02 | Add `regulation` node type | Ontology |
| O-03 | Add `algorithm` node type | Ontology |
| O-07 | Add `implements` rel type | Ontology |
| O-08 | Add `supersedes` rel type | Ontology |
| O-09 | Add `permits` / `prohibits` rel types | Ontology |
| O-15 | Sentiment optional for non-actor types | Ontology |
| C-01 | Tooltip upgrade | Canvas |
| IA-05 | Insight → canvas sync (evidence highlight) | IA |

### Tier 2 — High impact, medium effort

| ID | Item | Category |
|---|---|---|
| S-04 | Edge density gate | Skill |
| S-05 | Pre-encoding analysis template | Skill |
| S-09 | Domain-specific profiles (Legal + Toolkit) | Skill |
| O-04 | Add `standard` node type | Ontology |
| O-05 | Add `dataset` node type | Ontology |
| O-06 | Add `model` node type | Ontology |
| O-10 | Add `derives_from` rel type | Ontology |
| O-11 | Add `achieves` rel type | Ontology |
| O-17 | Separate `tension` / `arc_position` | Ontology |
| O-18 | Specify `temporal` edge field format | Ontology |
| C-02 | Ego-graph / focus mode | Canvas |
| C-03 | Cluster isolation filter | Canvas |
| C-07 | Beat → canvas camera sync | Canvas |
| C-11 | Beat progress strip | Canvas |
| C-13 | Insight type filter tabs | Canvas |
| C-15 | Report card as document preview | Canvas |
| IA-01 | Wikidata cross-document linking | IA |
| IA-06 | Cluster as first-class navigation target | IA |

### Tier 3 — Medium impact or high effort: schedule later

| ID | Item | Category |
|---|---|---|
| S-06 | Validation loop quality gate | Skill |
| S-10 | Wikidata QID pass (active search) | Skill |
| S-11 | Insight title pre-write test | Skill |
| O-12 | Add `cites` rel type | Ontology |
| O-13 | Add `contradicts` rel type | Ontology |
| O-14 | Mark `reveals` as auto-generated | Ontology |
| O-16 | Rename `context` → `anchor` (+ migration) | Ontology |
| O-19 | `label` validation on governs edges | Ontology |
| C-04 | Edge label rendering toggle | Canvas |
| C-05 | Rel-type filter | Canvas |
| C-06 | Sentiment / tier overlay toggles | Canvas |
| C-08 | Timeline layout mode | Canvas |
| C-12 | Key stats persistent strip | Canvas |
| C-14 | Library browser upgrades | Canvas |
| IA-02 | Tag-based library navigation | IA |
| IA-03 | `meta.timespan` field | IA |
| IA-07 | Spine nodes as persistent anchors | IA |

### Tier 4 — Useful but not urgent

| ID | Item | Category |
|---|---|---|
| C-09 | Minimap | Canvas |
| C-10 | Screenshot export | Canvas |
| C-16 | Protagonist/antagonist badges | Canvas |
| IA-04 | Document relationships (`meta.related`) | IA |
| IA-08 | Draggable canvas/report splitter | IA |

---

## Implementation notes

**Breaking changes**: O-16 (`context` → `anchor`) is done — migration complete, no alias needed. O-17 (tension model split) affects all existing library JSONs and remains pending.

**Schema changes that are additive** (safe to add without migration): O-03, O-04, O-05, O-06, O-07, O-08, O-09, O-10, O-11, O-12, O-13, IA-03, IA-04.

**Skill changes take effect immediately** (S-01 through S-11 affect only future encoding runs).

**Validator changes** (S-08) can be deployed as warnings (exit 1) without breaking anything — existing valid documents remain valid.
