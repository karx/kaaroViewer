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
- `rel` must be one of the validator's allow-list values **verbatim**. Do not paraphrase, do not rely on memory from other skills (e.g., the older `visualize` prompt used `creates` — the validator rejects it and demands `creation`).

The canonical enum lives in `.claude/hooks/validate-library-json.py` as `VALID_RELS`. Copied here so you do not guess:

```
causes · mitigates · disrupts · opposes · enables · precedes ·
governs · membership · leadership · employment · ownership ·
creation · location · competes · association · qualifies ·
features · broadcasts · temporal · reveals · default ·
implements · supersedes · permits · prohibits ·
derives_from · achieves · cites · contradicts
```

If the relationship you want to encode is not in this list, do **not** invent a new rel. Either pick the closest match (most abstract-to-concrete fallbacks: `enables` for facilitation, `association` for thematic link) or extend the ontology (see the **Extending the ontology** section below).

Other rules:
- `weight` 1–5. Most edges are 2–3. Causal/structural edges 4–5 (max 20% of total).
- `"directed": true` for all causal, hierarchical, and temporal-sequence relationships.
- `governs`, `permits`, `prohibits` edges **must** carry a `label` describing the permission scope.
- `reveals` is auto-generated by the loader — never write it into `edges[]`.

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
| Entity visual-model opportunity | | How many entities could carry a real 2D/3D model (product logo, portrait, 3D asset, diagram) vs. how many will render as geometric primitives? Note specific candidates. |
| Slide / narrative surface | | Does the story/insights sequence map naturally to a horizontal slide deck embedded in the canvas? Flag any beat whose argument needs a companion diagram to land. |

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

### Reflective / Essay / Opinion pattern

Use this checklist when the source is a LinkedIn post, blog essay, or reflective op-ed — a piece whose argument is made by reasoning, metaphor, and worked examples rather than by citing named laws, datasets, or dated events.

- **Do not force** the Step 1 datable-events chain, legal-instrument sweep, or compliance matrix — mark them "N/A" and move on. Reflective sources rarely populate these.
- **Mandatory node sweep** (substitutes the Legal/Academic sweeps):
  - Every named concept or coined term the essay introduces → `concept` node.
  - Every named tool, platform, or product mentioned (even in passing) → its own node — never compress into `pkm-tools` or `agent-tools` style category nodes.
  - Every named product the author has built or is promoting → node with `creation` edge from the author (if named).
  - Every named metaphor or worked example (e.g., Langton's Ant, Chesterton's Fence) → `concept` node with a Wikidata lookup.
- **Story beat pattern**: opening framework/thesis → each named section or "teaching" as its own beat → climactic metaphor or worked example → closer (self-promotion, call-to-action, or open question).
- **Key_stats pattern** (essays have few raw numbers):
  - Count named sections / teachings / arguments.
  - Count named tools, products, or people referenced.
  - Extract any numeric references that do appear (syllable counts, step counts, year ranges).
  - Encode the core argument as a "before → after" shift stat (e.g., "Craft shift: authoring → architecting").
- **Insight type mix**: lean on `pattern`, `paradox`, `opportunity`, `finding`. Still include at least one `warning` — reflective pieces usually contain an implicit warning ("don't treat X as feature").
- **Cluster criterion**: cluster by functional/argumentative role (framework, infrastructure layer, craft shift, discipline, metaphor, closer) — not by heading order.
- **Diagram opportunity**: if the essay's thesis is a shape (triangle, axis shift, emergence curve), flag in the retrospective that a companion Excalidraw diagram in `library/diagrams/{id}/` would carry the argument better than the graph alone.
- **Retrospective check**: "How many named concepts, tools, metaphors, and author-built products made it into the graph vs. how many appeared in the prose?"

---

## Extending the ontology

The graph vocabulary — node `type`, edge `rel`, `tier`, `sentiment`, `tension`, insight `type`, `tone` — is an **authoritative, single-source** enum. It lives in one place and is mirrored elsewhere. The validator (`.claude/hooks/validate-library-json.py`) holds the canonical sets; `sop-reference.md` holds the visual/semantic explanation. These must stay in lock-step.

**Before inventing a new value**, check whether an existing one fits. Most "new" relationships collapse into `enables`, `association`, `derives_from`, or `causes`. Only extend when the missing value represents a genuinely distinct structural relationship the renderer needs to treat differently.

**To add a new value**, update all three in the same commit:

1. **Validator** — add the value to the corresponding `VALID_*` set in `.claude/hooks/validate-library-json.py`. The enum is the source of truth; nothing else is.
2. **SOP reference** — add a row to the matching table in `sop-reference.md` so future encodings (and the kaaroViewer renderer) know how to display it. For edge rels, specify direction and weight convention. For node types, specify geometry + colour so the three.js layer has somewhere to hang behaviour.
3. **Renderer** (only if adding a node `type` or edge `rel` with novel visual semantics) — wire the new type/rel into the canvas geometry/style switch. Without this step, the validator accepts it but it renders as `default`.

**Never** add a value silently. A rel that validates but has no SOP row or no renderer branch is a latent bug — the next encoder will use it and produce inconsistent visuals.

**Design principle**: the ontology grows by accretion from real encodings. When a retrospective flags "I had to stretch `association` to mean X", that is the signal to consider a new rel — *after* three documents of the same domain have surfaced the same gap. One-off needs should be expressed with `label` on an existing rel, not with a new rel.

**Reusability note**: domain profiles in this skill (Legal, Toolkit, Academic, Reflective) are a second extension point. When a fourth profile becomes necessary (e.g., Incident/Post-mortem, Product Launch, Biographical), it is added as a new section under "Domain-specific encoding profiles" rather than by overloading existing profiles. Each profile specifies which Step 1 rows matter, which node sweep substitutions to make, and what the retrospective should ask.

---

## Authoring context: Claude skill, not autonomous LLM

This SOP is designed to be executed by **Claude via the `visualize` skill** — a deliberative, multi-step agent with access to Read/Write/Edit/Bash and the ability to pause for the edge-density gate, the cross-cluster sweep, and the mandatory retrospective.

It is **not** designed to be executed autonomously by the Gemini pipeline stages in `pipeline/explore.mjs`. Gemini's model cascade is best-effort and the API is unreliable under rate limits; it produces a first-pass brief for the canvas but does not satisfy the quality gates in Steps 2a–2c. When a brief authored by the explore pipeline needs to become a permanent library entry, re-run it through this skill for the full three-pass encoding.

The split:
- **`pipeline/explore.mjs` (Gemini)** — fast, exploratory, transient. Seeds the canvas.
- **`.claude/skills/visualize` (Claude)** — deliberate, validated, permanent. Produces library entries.

If the explore pipeline starts producing library-grade output, revisit this split. Until then, treat Gemini output as a draft and this skill as the authoring path.

---

## Encoding philosophy (read before starting)

The graph layer (nodes + edges) is just the skeleton. The **narrative layers** (story, insights, report_card) are where most of the value lives and where most encoders underinvest.

- **Be expansive with nodes**: if something is named and plays a role, it deserves a node. The entity sweep exists to prevent compression under production pressure.
- **Be precise with story narration**: vague prose ("there were problems") is useless. Name things. Use numbers.
- **Be sharp with insight titles**: apply the headline test before every title.
- **Sentiment is the author's stance, not objective fact**: if the report condemns something, encode it as `negative`. Don't be neutral when the source isn't.
- **Weight encodes importance, not frequency**: an edge that appears once in the source but is causally central should be weight 5. A repeated background relationship should be weight 2.
- **The three-pass structure exists for a reason**: encoding nodes, edges, and narrative simultaneously produces under-connected graphs with compressed entities. Resist the urge to collapse the passes.
