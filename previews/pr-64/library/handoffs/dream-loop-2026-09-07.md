## Dream Loop Run — 2026-09-07

### Trigger
- Signal: missing entity types/rels for technical-systems documents (framework, tool, process,
  system, hardware, prompt entities; enforces/transforms/contains/etc. relationships)
- Handoffs with this signal: 2026-07-13 gardening pass (memory) named `grok-harness`,
  `pkm-engineering-prompt`, `esp-ecosystem` as three entries sharing the same gap
- Consecutive count: 3+/3 — trigger condition met per LIFE.md §Phase 4
- Escalation: on this pass, `pkm-engineering-prompt` and `esp-ecosystem` were found at validator
  **exit 2** (cross-reference errors — loader-breaking), not just exit 1 warnings. The ontology gap
  had compounded with a separate encoding defect (report_card protagonists/antagonists referencing
  display-name strings instead of node IDs) into an actual broken state.

### Pattern Identified
- Class: **Ontology gap** (missing domain) + **encoder habit** (report_card lists using free-text
  labels instead of node IDs)
- Root cause 1: `VALID_TYPES`/`VALID_RELS` covered narrative/institutional/legal domains well but
  had no vocabulary for engineering/PKM/hardware documents — encoders correctly identified the
  need for `framework`, `tool`, `process`, `system`, `hardware`, `prompt` types and a cluster of
  process-relationship rels, but had nothing valid to reach for.
- Root cause 2: when a report_card antagonist is a *pattern* rather than a concrete entity (e.g.
  "isolated notes", "framework lock-in"), the encoder wrote it as prose instead of first adding it
  as a real `issue`-type node. The SOP's cross-reference rule was correct; nothing enforced it at
  encode time before the validator caught it as an error.

### Changes Made
- **Validator** (`validate-library-json.py`): added `framework`, `tool`, `process`, `system`,
  `hardware`, `prompt` to `VALID_TYPES`; added `transforms`, `updates`, `contains`, `visualizes`,
  `underpins`, `simplifies` to `VALID_RELS`.
- **Ontology** (`ontology.mjs`): added `ENTITY_TYPES` entries (color/radius/label/code) and
  `REL_TYPES` entries (color/label/code) for all 12 new values.
- **Renderer** (`canvas/node-factory.mjs`): mapped the 6 new types onto existing `TYPE_GEOMETRY`
  buckets by nearest analogue — no new THREE.js geometry code, minimizing render-path risk.
- **SOP** (`sop-reference.md`): added rows to the Entity Types → Geometry table and the Rel Types
  table with semantic + visual explanation for all 12 new values.
- **Library entries re-encoded:**
  - `pkm-engineering-prompt.json` — protagonists/antagonists now reference real node IDs; added
    `isolated-notes` and `uncrystallized-pipelines` as first-class `issue` nodes with `mitigates`
    edges back to the practices that prevent them; remapped 16 edge rels (`enforces`→`governs`
    +label, `creates`/`builds`→`creation`, `maps_to`/`informs`/`describes`→`association`,
    `expands`→`enables`, `improves`→`transforms`, `renders`→`visualizes`); fixed `meta.tone`
    (`instructional`→`analytical`, not a valid tone); rewrote insight-3's title to a declarative
    claim.
  - `esp-ecosystem.json` — protagonists/antagonists now reference real node IDs; added
    `physical-access-constraint` and `framework-lock-in` as first-class `issue` nodes with `causes`
    edges from the entities that produce them; remapped `supports`→`enables`; promoted the OTA beat
    to `climax` (the arc previously had zero climax beats); fixed `meta.tone`
    (`reference`→`analytical`).

### Gate Result
- `pkm-engineering-prompt.json`: validator exit **2 → 1** (loader-breaking errors cleared; 1
  density warning remains)
- `esp-ecosystem.json`: validator exit **2 → 0** (clean)
- All other library entries: unaffected, still pass (verified via `health-check.mjs`)
- Tests: **PASS** — 168/168, no regressions
- health-check.mjs counts: **critical 2 → 0**, degraded 3 → 2 (both remaining degraded signals are
  edge-density only, not structural)

### What Could Not Be Resolved
- `pkm-engineering-prompt` edge density is 1.4x (27/19) — below the 2.0 target. Fixing this needs a
  real cross-cluster sweep (an Alone-Time content pass), not a schema change — out of scope for a
  Dream Loop run.
- `esp-ecosystem` edge density is 1.5x (24/16) per `health-check.mjs`'s stricter 1.7 threshold,
  though it now passes the validator's own 1.5 threshold cleanly. Same follow-up as above.

### Dream Loop Signal
- Technical-systems ontology signal: **resolved** (schema now supports the domain)
- New signal to watch: report_card protagonists/antagonists written as free-text labels instead of
  node IDs. This surfaced independently in *both* entries fixed this run — if it recurs in a future
  Alone-Time encode, consider adding a validator warning (not just the existing hard error) that
  fires earlier, or adding an explicit SOP callout: "every antagonist/protagonist must first exist
  as a node — if the risk/actor doesn't have a node yet, add one before listing it here."

### Next Run Suggestions
- Alone-Time: re-encode `pkm-engineering-prompt` for edge density (cross-cluster sweep between
  `cluster-leverage`/`cluster-ecosystem` and the PARA core cluster — several nodes like
  `agent-field`, `computeTheory`, `ego-Field` are single-edge leaves).
- Alone-Time: re-encode `esp-ecosystem` for edge density (similar leaf-node sweep — `bootloader`,
  `mongoose-os`, `pyboard-pixljs` each carry only 1 edge).
- Confirm `grok-harness-story` (named in the 2026-07-13 memory as the third entry sharing this gap)
  — it does not appear in the current `LIBRARY` array, so either it was already re-encoded/renamed
  or never registered. Worth a manual check next session.
