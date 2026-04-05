---
description: Encode a markdown document into a kaaroViewer intelligence brief. Produces a complete library JSON (nodes, edges, story, insights, clusters) and registers it in the LIBRARY. Use when given a markdown file path or raw text to visualize.
argument-hint: <path/to/report.md | "inline text">
allowed-tools: Read Write Edit Glob Bash(python3*)
---

# visualize — kaaroViewer Encoding Skill

You are encoding a source document into a **kaaroViewer intelligence brief**. The output is a single JSON file written to `library/` and registered in `pipeline/local-graph.mjs`.

## Step 0 — Load the source

If `$ARGUMENTS` looks like a file path (contains `/` or `\` or ends in `.md`):
- Read the file at that path.

Otherwise treat `$ARGUMENTS` as the raw text to encode.

Also read the SOP reference:
- `${CLAUDE_SKILL_DIR}/sop-reference.md`
- `${CLAUDE_SKILL_DIR}/examples/sample-encoding.md`

---

## Step 1 — Pre-encoding analysis (structured template)

Before writing any JSON, complete this form in full. Do not skip fields — partial answers produce compression artifacts.

```
Subject (one sentence):
Spine entities (1–3, named):
Causal chain (A → B → C → outcome):
Author's central argument or warning:
Datable events (label + year, at least 3 if present):
Named tools / products (every brand name, not category):
Named people (every individual named in the source):
Named laws / rulings / cases (every legal instrument):
Compliance relationships (tool × operator = permitted/banned):
```

If the source text is too thin to populate all rows, state what is missing and proceed with what is available.

---

## Step 1b — Named-entity sweep

After Step 1, complete this checklist. Every item must become a node or be explicitly excluded with a reason. "Not important enough" is not a valid exclusion if the entity is named.

```
Named people:             [ list every person named ]
Named tools / products:   [ every software, platform, hardware ]
Named laws / rulings:     [ every legislation, case, administrative rule ]
Named events (dated):     [ every event with a year attached ]
Named organizations:      [ every company, agency, institution ]
Named datasets / models:  [ every named dataset, trained model, benchmark ]
```

Mark each item: `→ node` or `→ excluded: [reason]`.

---

## Step 2a — Entity pass (nodes only)

Write the complete `nodes[]` array. **Do not write edges, story, or insights yet.**

Rules:
- Every item from the Step 1b checklist marked `→ node` must appear here.
- `type` must be one of the ontology types — never use `"default"`.
- `tier`: `spine` (1–3 central subjects), `primary` (named actors with beats/insights), `secondary` (supporting, mentioned in edges), `anchor` (geographic/temporal grounding — not unimportant, but not active agents).
- `sentiment`: the author's analytical stance — `positive`, `negative`, `contested`, `neutral`. For structural/mechanism types (`algorithm`, `standard`, `dataset`, `metric`, `concept`, `model`, `ruling`, `regulation`) sentiment is optional; omit or use `neutral` if the source has no clear stance.
- `description`: at least one sentence explaining the entity's role in this specific report.
- `wikidata`: for every spine and primary node, make an explicit search attempt. Record `"wikidata": "Qxxxx"` or `"wikidata": null` — the null must be deliberate.
- `metrics`: numeric facts as `{ "Key": "value with units" }`.

After writing `nodes[]`, count them. Check against scale targets:
- Small report (< 1 000 words): 12–20 nodes
- Medium report (1 000–3 000 words): 20–30 nodes
- Large report (> 3 000 words): 28–40 nodes

If below target: go back and add the missing entities. Under-encoding at this stage is the most common quality failure.

---

## Step 2b — Relation pass (edges only)

With nodes fixed, write the complete `edges[]` array. **Do not write story or insights yet.**

Rules:
- `rel` must match an ontology type (see sop-reference.md).
- `weight` 1–5. Most edges are 2–3. Causal/structural edges 4–5 (max 20% of total).
- `"directed": true` for all causal, hierarchical, and temporal-sequence relationships.
- `governs`, `permits`, `prohibits` edges **must** carry a `label` describing the permission scope.

**Cross-cluster sweep** (mandatory):
For every pair of clusters you plan to create, ask: "Is there a relationship between any node in cluster A and any node in cluster B that is not yet encoded?" Encode every answer that is yes. This sweep is where inter-cluster edges are found.

**Edge density gate:**
Compute `edges.length / nodes.length`. If below 2.0, do not proceed to Step 2c.
- Run the cross-cluster sweep again.
- Ask: "What does each primary node do to or with the spine node?" Add those edges.
- Re-compute. Proceed only when ≥ 2.0 (or the source genuinely cannot support more).

**Temporal chain requirement:**
If the Step 1 datable events list contains ≥ 3 items:
- Create a chain of `event` or `milestone` nodes with `precedes` edges before writing story beats.
- The timeline must be visible in the graph layer. Story beats then reference these nodes.

---

## Step 2c — Narrative pass (story, insights, clusters, report_card)

Graph is now structurally complete. Write all narrative layers against this closed system.

**Story beats** — 7–12 beats. Exactly **one** with `"tension": "climax"`.

Tension arc pattern:
```
low (setup) → low → medium → medium → high → high → climax → medium → low (response/open end)
```

Narration requirements:
- 2–4 sentences. Present tense. Name specific entities.
- Include at least one number per `high` or `climax` beat.
- Every `node` and `nodes[]` value must be an ID that exists in `nodes[]`.

**Insights** — 4–7 entries. At least one `warning` and one `finding`.

Before writing each insight title, apply this test: "Could this be published as a headline and understood without reading the body?" If not, rewrite as a declarative claim with: named subject + named mechanism + stated direction.

- Bad: `"GTO Solvers Changed Poker"` (topic label)
- Good: `"GTO solver adoption has permanently bifurcated the player pool into tool-literate and tool-illiterate tiers"` (claim)

`evidence[]` is 2–5 node IDs that directly support the claim.

**Clusters** — 3–6 clusters. Every node in exactly one cluster. Cluster names describe function/role, not membership.

**Report card**:
- `summary`: 2–4 sentences — the whole report's central argument.
- `key_stats`: 5–8 entries with units in the value.
- `spine`: 1–3 node IDs that anchor the graph layout.

---

## Step 3 — Determine output paths

- Derive `id` from `meta.title`: lowercase, hyphens, no special characters. Max 40 chars.
- JSON file: `library/{id}.json`
- Verify no file with that name already exists in `library/`. If it does, append `-2` to the id.

---

## Step 4 — Compose and write the JSON

Produce a single JSON object with this exact top-level shape:

```
{
  "meta":        { id, title, subtitle, source, domain, year, tags[], tone },
  "report_card": { summary, key_stats[], spine[], protagonists[], antagonists[], themes[] },
  "story":       [ { id, title, node, nodes[], narration, tension, focus } … ],
  "insights":    [ { id, title, body, type, evidence[], severity } … ],
  "clusters":    [ { id, label, color, nodes[], description } … ],
  "nodes":       [ { id, label, type, tier, sentiment, description, metrics, wikidata, image } … ],
  "edges":       [ { from, to, rel, label, weight, directed, temporal, notes } … ]
}
```

Formatting requirements:
- 2-space indentation
- Arrays with more than 3 items use one item per line
- No trailing commas
- UTF-8, no BOM

Write to `library/{id}.json`.

---

## Step 5 — Register in LIBRARY

Edit `pipeline/local-graph.mjs`. Find the `export const LIBRARY = [` array and append a new entry:

```js
  {
    id:     '{id}',
    title:  '{meta.title}',
    path:   './library/{id}.json',
    domain: '{meta.domain}',
    year:   '{meta.year}',
  },
```

---

## Step 6 — Validate

Run:
```
python3 .claude/hooks/validate-library-json.py library/{id}.json
```

Fix every **❌ error** (cross-reference failures). Then review every **⚠ warning**:

Required to resolve before proceeding:
- Node count below scale target
- Edge density below 2.0
- Missing `warning` or `finding` insight type
- Unclustered nodes
- No climax beat, or fewer than 7 beats

Acceptable to leave:
- Missing `meta.subtitle` or empty `meta.tags`
- Cosmetic meta warnings

Re-run the validator after every fix. Proceed only when all required warnings are resolved.

---

## Step 7 — Report back

Print a summary in this format:

```
✅  {meta.title}
    library/{id}.json  —  {N} nodes · {N} edges · {N} beats · {N} insights · {N} clusters
    Spine: {spine ids}
    Tone:  {tone}

    Key stats:
    {each stat on one line}

    Story arc:
    {beat number} [{tension}] {beat title}
    ...

    Run F5 LIB in kaaroViewer to load.
```

---

## Step 8 — Mandatory retrospective

After the validator passes, generate `library/{id}-retrospective.md` using this template:

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
| Node coverage | | |
| Edge density | | |
| Story arc quality | | |
| Insight title quality | | |
| Cluster design | | |

## Skill-Level Recommendations
```

Be honest: if tools were compressed into category nodes, say so. If the edge density gate caught a gap, note it. Each retrospective improves the SOP for the next document of the same type.

---

## Domain-specific encoding profiles

### Legal / Regulatory pattern

Use this checklist when the source is about legislation, court decisions, or regulatory frameworks.

- **Mandatory node types**: `ruling` for every named court decision; `regulation` for every administrative rule; `law` for every enacted statute; `person` for every named judge, minister, or official.
- **Mandatory temporal chain**: create `milestone` or `event` nodes with `precedes` edges for the full legislative timeline (bill introduction → enactment → challenge → ruling).
- **Mandatory `supersedes` edges**: where one legal instrument overrides another.
- **Story arc must include**: prior-doctrine → triggering event → enactment → enforcement → judicial response → current state.
- **Compliance matrix**: for every regulated entity, encode `governs`, `permits`, or `prohibits` edges with explicit `label` fields.
- **Retrospective check**: "How many named legal instruments were collapsed into a single concept node?"

### Toolkit / Product comparison pattern

Use this checklist when the source compares tools, platforms, or products.

- **Mandatory**: every named product = its own node. Never create category abstraction nodes like "hud-tools" or "solver-category".
- **Mandatory**: `permits` and `prohibits` edges for every network-tool compliance relationship.
- **Cluster criterion**: clusters must map to user-journey stages or operational layers — not to document sections.
- **Model nodes**: if the source mentions any trained AI model, it gets a `model` node with `implements` edges to its underlying algorithms or standards.
- **Retrospective check**: "How many named tools were compressed into category nodes?" Any non-zero answer is an encoding failure.

### Academic / Research pattern

Use this checklist when the source is a research paper, survey, or benchmark study.

- **Mandatory**: every named dataset = `dataset` node; every named model = `model` node; every named algorithm = `algorithm` node.
- **Mandatory**: `achieves` edges from each model to its benchmark score nodes.
- **Mandatory**: `cites` edges for key precedents that the paper explicitly builds on.
- **Mandatory**: `derives_from` edges where one model or approach is built on another.
- **Cluster criterion**: cluster by methodological family (e.g., "Span-Based Models", "Token-Level Approaches", "Cross-Encoder Pipelines") — not by paper section.
- **Retrospective check**: "How many named benchmarks, models, and algorithms made it into the graph vs. how many were mentioned in the paper?"

---

## Encoding philosophy (read before starting)

The graph layer (nodes + edges) is just the skeleton. The **narrative layers** (story, insights, report_card) are where most of the value lives and where most encoders underinvest.

- **Be expansive with nodes**: if something is named and plays a role, it deserves a node. The entity sweep exists to prevent compression under production pressure.
- **Be precise with story narration**: vague prose ("there were problems") is useless. Name things. Use numbers.
- **Be sharp with insight titles**: apply the headline test before every title.
- **Sentiment is the author's stance, not objective fact**: if the report condemns something, encode it as `negative`. Don't be neutral when the source isn't.
- **Weight encodes importance, not frequency**: an edge that appears once in the source but is causally central should be weight 5. A repeated background relationship should be weight 2.
- **The three-pass structure exists for a reason**: encoding nodes, edges, and narrative simultaneously produces under-connected graphs with compressed entities. Resist the urge to collapse the passes.
