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

## Step 1 — Analyse before encoding

Before writing any JSON, answer these four questions from the source text:

1. **Subject** — What is this report fundamentally about? → becomes `meta.title`
2. **Forces** — Who drives the conflict? Who experiences it? → `protagonists`, `antagonists`
3. **Sequence** — What is the timeline or chain of causation? → `story[]`
4. **Argument** — What is the author claiming or warning? → `insights[]`

If the source text is too thin to answer all four, state what is missing and proceed with what is available.

---

## Step 2 — Compose the JSON

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

### Encoding rules (non-negotiable)

**Nodes**
- Every named entity, system, and force in the source becomes a node.
- `type` must be one of the ontology types — never use `"default"`.
- `tier` must be set: `spine` (1–3 central subjects), `primary` (named actors), `secondary` (supporting), `context` (background anchors).
- `sentiment` encodes the author's analytical stance: `positive`, `negative`, `contested`, `neutral`.
- `description` must be non-empty — at least one sentence explaining the entity's role in this report.
- If the entity has a Wikidata equivalent, add `"wikidata": "Qxxxx"` — the enrichment pipeline will generate a temporal arc automatically.
- Numeric facts go in `metrics` as `{ "Key": "value" }` — include units in the value.

**Edges**
- `weight` 1–5. Most edges are 2–3. Causal/structural edges are 4–5 (max 20% of total).
- `"directed": true` for all causal, hierarchical, and temporal-sequence relationships.
- `rel` must match an ontology type: `causes`, `mitigates`, `disrupts`, `opposes`, `enables`, `precedes`, `membership`, `leadership`, `creation`, `location`, `competes`, `reveals`, `qualifies`, `features`, `broadcasts`, `governs`, `employment`, `ownership`, `association`, `temporal`.

**Story**
- 7–12 beats. Exactly **one** beat with `"tension": "climax"`.
- Tension arc pattern: low (setup) → medium → high (harm/conflict) → climax → medium/low (response/open end).
- Narration: 2–4 sentences. Present tense. Name specific entities. Include at least one number per high/climax beat.
- Every `node` and `nodes[]` value must exist in `nodes[]`.

**Insights**
- 4–7 entries. At least one `warning` and one `finding`.
- `title` is a declarative claim, not a topic label.
- `evidence[]` is 2–5 node IDs that directly support the claim.
- Insight nodes are auto-materialised by the loader — do not add them to `nodes[]`.

**Clusters**
- 3–6 clusters. Every node in exactly one cluster.
- Names describe function/role, not membership (e.g., "Harm Manifold", not "Workers and Issues").

**Report card**
- `summary`: 2–4 sentences. The whole report's central argument.
- `key_stats`: 5–8 entries with units in the value.
- `spine`: 1–3 node IDs that anchor the graph layout.

**Scale targets**
- Small report (< 1 000 words): 12–20 nodes, 15–25 edges, 7–8 beats, 4–5 insights
- Medium report (1 000–3 000 words): 20–30 nodes, 25–45 edges, 8–10 beats, 5–6 insights
- Large report (> 3 000 words): 28–40 nodes, 40–60 edges, 10–12 beats, 6–7 insights

---

## Step 3 — Determine output paths

- Derive `id` from `meta.title`: lowercase, hyphens, no special characters. Max 40 chars.
- JSON file: `library/{id}.json`
- Verify no file with that name already exists in `library/`. If it does, append `-2` to the id.

---

## Step 4 — Write the JSON file

Write the complete JSON to `library/{id}.json`.

Formatting requirements:
- 2-space indentation
- Arrays with more than 3 items use one item per line
- No trailing commas
- UTF-8, no BOM

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

If the validator reports cross-reference errors:
- Fix every flagged ID mismatch.
- Re-write the JSON file.
- Re-run the validator until it prints ✅.

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

## Encoding philosophy (read before starting)

The graph layer (nodes + edges) is just the skeleton. The **narrative layers** (story, insights, report_card) are where most of the value lives and where most encoders underinvest.

- **Be expansive with nodes**: if something is named and plays a role, it deserves a node.
- **Be precise with story narration**: vague prose ("there were problems") is useless. Name things. Use numbers.
- **Be sharp with insight titles**: "Workers face algorithmic exploitation" is a topic. "The 10-minute delivery promise structurally requires workers to break traffic law to survive" is an insight.
- **Sentiment is the author's stance, not objective fact**: if the report condemns something, encode it as `negative`. Don't be neutral when the source isn't.
- **Weight encodes importance, not frequency**: an edge that appears once in the source but is causally central should be weight 5. A repeated background relationship should be weight 2.
