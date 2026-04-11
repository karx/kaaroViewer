# Garden Integration — kaaroViewer

**Context:** The `homepage` project embeds kaaroViewer as the visualization engine for its Garden page — an interactive 3D knowledge graph of personal notes from the `karx.github.io` Obsidian vault. The homepage build pipeline emits `garden-graph.json`; kaaroViewer loads it and renders it.

This document is the living requirement + status record for the integration. It replaces speculative design with what was actually built, and tracks what remains open.

---

## Status legend
`✓ done` · `~ partial` · `○ open` · `✗ superseded`

---

## 1. VaultSource — `pipeline/sources/vault.mjs` ✓

**Implemented.** Extends `ContentSource`. Fetches `garden-graph.json`, caches it, and provides:

- `load()` — fetch and cache the graph JSON
- `loadGraph(graph)` — populate the kaaroViewer `Graph` store with all published notes at once
- `search(query)` — local substring match against id, title, and tags (no network)
- `getDetail(id)` — return node + WikiLink neighbors from cached data
- `clusters` getter — tag → color map from the JSON
- `allNodes` getter — full node list for layout seeding

**Actual node schema in the graph store:**

```js
{
  id:          "kaaro-stream",         // slug — unique within vault
  qid:         "kaaro-stream",         // alias — set equal to id for graph compat
  type:        "vault-note",           // branches rendering and detail panel
  label:       "Kaaro Stream",
  description: "Notes on...",
  tags:        ["streaming", "mqtt"],
  image:       "/assets/garden/images/kaaro-stream.png",
  date:        "2025-11-02",
  noteUrl:     "/notes/kaaro-stream/",
  wikiLinks:   ["webgraph", "mqtt"],   // raw targets (pre-resolved to edges)
  _source:     "vault",
  _state:      "unvisited",
}
```

**Note on `qid` vs `id`:** Vault nodes set `qid = id` at load time as a compatibility shim — the rest of the codebase (nodes.mjs, detail.mjs, breadcrumb.mjs) uses `node.qid` as the canonical identifier. A proper fix is tracked in §7b.

**Edge schema:**

```js
{ from: "kaaro-stream", to: "webgraph", relLabel: "wikilink", directed: true, weight: 1 }
```

---

## 2. Embed mode ✗ superseded → direct embed ✓

**Original plan:** iframe or CSS `contained` mode.

**What was built:** The Jekyll layout (`_layouts/garden.html`) directly contains the full viewer shell HTML. The viewer modules are served as static assets from `/assets/garden/viewer/`. No iframe — the garden page IS the viewer.

**Implication:** `garden.html` (the standalone entry point) still exists for local kaaroViewer development, but it is not used by the homepage.

**`copy-viewer.mjs` build step (homepage side):** Copies the kaaroViewer module tree into `homepage/assets/garden/viewer/` on each build. The modules load via absolute paths from `/assets/garden/viewer/garden-main.mjs`.

**Importmap constraint (critical):** Browsers require `<script type="importmap">` to appear before any `<script type="module">` in the document. The Minimal Mistakes theme injects `model-viewer.js` and `google-chart.js` as module scripts via `head_scripts` in `_config.yml`. The garden layout places the importmap as the very first tag in `<head>`, before `{% include head.html %}`, to win this race.

```html
<head>
  <!-- importmap FIRST — before head.html which emits head_scripts as type="module" -->
  <script type="importmap">{ "imports": { "three": "..." } }</script>
  {% include head.html %}
  ...
</head>
```

Any Jekyll theme using `head_scripts` with `is_module: true` will have this constraint.

---

## 3. Detail panel — vault-note branch ✓

**Implemented** in `canvas/detail.mjs`. Branch condition: `node.type === 'vault-note'` → calls `_showVaultDetail()`.

Vault detail panel shows:
- Note slug as ID code + "garden note" type label + "◈ GARDEN" source badge
- Title (uppercased, terminal style)
- Frontmatter image (if present)
- Description
- Tags as `.dp-tag-pill` pills
- Last updated date
- Connection count
- Linked notes list (click-navigable, same `detail:navigate` event)
- "Read full note ↗" CTA linking to `node.noteUrl`

No secondary fetch — all data comes from the graph JSON.

---

## 4. Tag cluster layout ~ partial

**Implemented in `garden-main.mjs`**, not as a standalone `layout.mjs` function.

`buildClusterCentroids(clusters)` places cluster origins on a circle in the XZ plane (radius scales with cluster count). Before calling `vault.loadGraph()`, each node is seeded to its cluster centroid + random jitter via `setPosition()`. `runForceRelax(200)` then settles the graph within clusters.

**What's missing:** This is a procedural seed, not a force that continuously pulls same-tag nodes together. Nodes with many cross-cluster edges can drift. A proper `applyTagClusterLayout()` in `layout.mjs` with an intra-cluster attraction force would hold clusters tighter as the graph grows.

**Open work:**
- Extract cluster layout into `layout.mjs` as a named mode
- Add intra-cluster spring force (pull same-tag nodes toward centroid)
- Add inter-cluster repulsion (push different-cluster centroids apart)

---

## 5. Search and filter ~ partial

**Implemented:**

- Substring search against id, title, tags via `vault.search(query)`
- Tag isolation: `#tag` or `tag:name` prefix in the command bar → `_isolateTag()` → dims non-matching nodes, frames the cluster
- First search result gets focused + detail panel opened
- Multiple results dim all non-matching nodes

**Not yet implemented:**

- Autocomplete dropdown while typing (show top 5 matching titles)
- Keyboard navigation through search results (↑↓ to cycle, Enter to focus)
- Clear search / reset dim state from keyboard (currently needs F4 from main.mjs — not wired in garden-main.mjs)

---

## 6. Mixed graph support ○ open (future)

Not yet implemented. Architecture is compatible: `Graph.addNode` accepts arbitrary IDs, so vault slugs (`slug:kaaro`) and Wikidata QIDs (`wd:Q17503`) can coexist. The vault build script would need to detect `[[wd:Q...]]` WikiLink patterns and leave them for the Wikidata resolver.

No timeline set. Depends on garden graph density being high enough to warrant enrichment.

---

## 7. Architecture feedback — updated

### 7a. Source abstraction ○ open
`main.mjs` still wires source toggles inline. `garden-main.mjs` avoids this by not using `sourceManager` at all (vault is the only source). When the main viewer gains a vault mode, sourceManager should get a formal `ContentSource` interface enforcement.

### 7b. `qid` vs `id` field ~ worked around
Vault nodes set `qid = id` as a shim. This works but is misleading — `qid` implies a Wikidata QID. The correct fix is to rename the canonical node identifier to `id` in `graph.mjs` and update all call sites. Not done; tracked here for the next refactor pass.

### 7c. `garden.html` / `index.html` maintenance ✗ superseded
Direct embed means `garden.html` is only a standalone dev convenience. It does not need to stay in sync with `index.html`. The homepage layout owns the shell HTML for the garden page.

### 7d. Session versioning ✓
`garden-main.mjs` saves `{ version: 2, sourceType: 'vault', nodes, edges }`. Session restore filters for `sourceType === 'vault'` in the sessions list. Wikidata sessions and vault sessions are separate namespaces in the UI.

---

## 8. Build pipeline (homepage side) ✓

`scripts/build-garden.mjs` is written and working. Actual behaviour:

1. Resolves vault path: `GARDEN_VAULT_PATH` env → `_notes/` submodule → `../karx.github.io` sibling
2. Walks all `.md` files, skipping `node_modules/`, `.git/`, `.obsidian/`, `Abbreviations/` (contains npm deps)
3. Parses frontmatter with `gray-matter`; skips notes without `published: true`
4. Derives slug: folder name for `README.md` files; filename for standalone notes; root `README.md` → `"about"`; double-dashes for nested paths (`Foo/Bar.md` → `foo--bar`)
5. Extracts `[[WikiLink]]` patterns; resolves against published slug set
6. Copies frontmatter `image:` assets to `assets/garden/images/`
7. Emits `assets/garden/garden-graph.json` with `nodes`, `edges`, `clusters`, `index`

`scripts/copy-viewer.mjs` copies kaaroViewer modules to `assets/garden/viewer/`.

Both wired into `package.json`:
```
npm run build:garden   → graph JSON only
npm run build:viewer   → viewer modules only
npm run build:all      → both
```

**Submodule status:** Disk space on dev machine prevented cloning the full vault (476GB disk at 100% capacity — vault includes 3D model textures and image dumps). Dev workflow uses the sibling repo path. Production deploy should use the `_notes/` submodule with a shallow sparse checkout.

---

## 9. Phase plan — updated

| Phase | Work | Status |
|-------|------|--------|
| **0** | `build-garden.mjs` — parse vault, emit graph JSON | ✓ done |
| **0** | `GARDEN_GUIDELINES.md` in vault | ✓ done |
| **0** | `copy-viewer.mjs` — copy viewer modules to homepage assets | ✓ done |
| **1** | `pipeline/sources/vault.mjs` | ✓ done |
| **1** | `garden-main.mjs` — vault-mode orchestrator | ✓ done |
| **1** | `canvas/detail.mjs` — vault-note branch | ✓ done |
| **1** | `_layouts/garden.html` — direct embed (no iframe) | ✓ done |
| **2** | Tag cluster layout as `layout.mjs` named mode | ○ open |
| **2** | Search autocomplete + keyboard navigation | ○ open |
| **2** | Clear/reset dim state from keyboard in garden mode | ○ open |
| **3** | `qid` → `id` rename in `graph.mjs` | ○ open |
| **3** | Formal `ContentSource` interface enforcement | ○ open |
| **3** | Mixed graph: vault note → Wikidata entity WikiLinks | ○ open |
| **4** | Submodule sparse checkout for production deploy | ○ open |

Phase 0–1 shipped. Phase 2 improves the experience. Phase 3–4 are architecture and infra.

---

## 10. Open items — quick reference

| # | Item | Priority |
|---|------|----------|
| O-1 | Autocomplete dropdown in garden command bar | Medium |
| O-2 | Tag cluster layout as proper layout.mjs mode | Medium |
| O-3 | F4 clear-dim wired in garden-main.mjs | Low |
| O-4 | `qid` → `id` rename across codebase | Low |
| O-5 | Sparse checkout for vault submodule (disk space) | Infra |
| O-6 | Mixed vault + Wikidata graph | Future |

---

*Last updated: 2026-04-12*
*Relates to: PRODUCT_ROADMAP.md §2 (Domain Knowledge Graphs), §4 (Content Sources)*
*Homepage side: `scripts/build-garden.mjs`, `scripts/copy-viewer.mjs`, `_layouts/garden.html`*
