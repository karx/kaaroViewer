# kaaroViewer — Generational Ledger

Schema-level changes to the ontology (`VALID_TYPES` / `VALID_RELS`), made atomically across
validator + `ontology.mjs` + `canvas/node-factory.mjs` + `sop-reference.md` per the Dream Loop
protocol in `LIFE.md` §4. See `library/handoffs/dream-loop-*.md` for the reasoning behind each entry.

---

## Generation 1.2 — 2026-09-07

**Trigger:** Dream Loop — the "technical-systems ontology gap" signal recurred across 3+ library
entries over two months (`grok-harness`, `pkm-engineering-prompt`, `esp-ecosystem`; first flagged
in the 2026-07-13 gardening pass). Two entries (`pkm-engineering-prompt`, `esp-ecosystem`) had
reached validator exit 2 — loader-breaking cross-reference errors — making this a blocking issue,
not just a quality warning.

**Schema changes:**
- `VALID_TYPES` +6: `framework`, `tool`, `process`, `system`, `hardware`, `prompt`
- `VALID_RELS` +6: `transforms`, `updates`, `contains`, `visualizes`, `underpins`, `simplifies`

**Renderer:** New types reuse existing geometry buckets by nearest semantic analogue (no new
THREE.js primitives introduced):
- `framework` → icosahedron (violet) — grouped with `standard`/`law`, complex rule systems
- `tool` → box (teal-green) — grouped with `software`, concrete instruments
- `process` → octahedron (amber) — grouped with `event`, active/in-motion
- `system` → torus (blue) — grouped with `platform`, networked/containing
- `hardware` → box (slate blue) — grouped with `software`, physical/technical
- `prompt` → tetrahedron (magenta) — grouped with `insight`/`algorithm`, directive/generative

**Re-encoded under new schema:**
- `pkm-engineering-prompt` — fixed 5 cross-reference errors (report_card protagonists/antagonists
  referenced display names, not node IDs); added 2 real nodes (`isolated-notes`,
  `uncrystallized-pipelines`) for antagonists that previously had no graph representation; remapped
  16 non-canonical edge rels to the new/existing vocabulary. Validator: exit 2 → exit 1 (density
  warning only, no longer loader-breaking).
- `esp-ecosystem` — fixed 5 cross-reference errors (same protagonists/antagonists pattern); added 2
  real nodes (`physical-access-constraint`, `framework-lock-in`); remapped 3 non-canonical edge
  rels; promoted the OTA beat to the arc's climax (previously zero climax beats). Validator: exit 2
  → exit 0 (clean).

**Frozen commit:** `573da3f7` (pre-generation baseline; this generation's commit follows)
