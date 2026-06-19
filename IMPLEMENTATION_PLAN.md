# Phase-Wise Implementation Plan: Cleanup → Paint UX → Sessions → Markdown Pipeline

> Decisions locked in via grill session. Each decision documented inline.

---

## Phase 1: Legacy Cleanup

### 1a. Delete Dead Directories & Collateral Files
**Files to delete:**
- `components/` — entire directory (6 A-Frame files)
- `controller/` — entire directory (3 files)
- `pod_modules/` — entire directory (2 files)
- `entity-test.html` — only consumer of components/

**Config cleanup:**
- `vitest.config.mjs` — remove `'pod_modules/**'` from exclude array
- `package.json` — remove `"pod_modules"` from vitest.exclude

**Doc references:**
- `DEVELOPER_GUIDE.md` — note removal in v3 cleanup
- `PRODUCT_ROADMAP.md` — remove MQTT controller references

### 1b. Verification
- `npx vitest run` — all 168 tests pass
- Zero runtime references to deleted directories

---

## Phase 2: Scene Painter UX

### 2a. Inline Paint Progress Indicator
- HTML: small spinner ring + status text in `#paint-hud` area
- CSS: `.paint-indicator` flex row, amber `#ffaa00`, `paint-spin` keyframe
- JS hooks in `paint-orchestrator.mjs`: `_showPaintIndicator(label)`, `_updatePaintIndicator(label)`, `_hidePaintIndicator()`
- Wire into `_executePaint()`: show before `generateScene()`, hide on complete/error

### 2b. Generation Queue

> **Decision:** Queue lives in memory only. Tab close aborts everything. No persistence. Keep it simple.

- `_paintQueue[]` array + `_isPainting` boolean gate
- P press while painting → enqueue; dequeue after each complete
- Indicator text: `"generating (2 queued)…"`
- `beforeunload` kills the queue — on next load, user re-presses P for missing slides

> **Decision:** Queue failure handling — skip failed item, log error + notify user (toast/indicator on failed slide), continue to next queued item. Don't abort the queue.

- Tests: mock `generateScene`, verify sequential ordering, verify queue cleared on unload, verify failed item skipped and remaining queue continues

### 2c. Layer Undo (Soft-Undo with Redo Window)

> **Decision:** Soft undo — undone layer fades out over ~625ms. During the fade window (~1s), user can redo with Ctrl+U. After mesh disposes, redo window closes. Better UX.

- `_paintHistory[]` in `scene-painter.mjs` — ordered array of UUIDs (most recent last)
- `_redoStack[]` — popped UUIDs that are still fading out

**Export `removeLastPaint()`:**
1. Pop UUID from `_paintHistory` → push to `_redoStack`
2. Look up mesh in `_paints` Map
3. Set `fadeDir = -1` (fade out via existing tick system)
4. Remove from `_slideMap` if present
5. Start a 1s timer — when it fires:
   - If the UUID is still in `_redoStack` (not re-done) → remove localStorage record, splice from `_redoStack`
6. Return `true` if layer was removed, `false` if history empty

**Export `redoLastPaint()`:**
1. Pop UUID from `_redoStack`
2. Look up paint entry in `_paints` Map
3. Set `fadeDir = 1` (fade back in, target opacity 1.0)
4. Push UUID back onto `_paintHistory`
5. Re-add to `_slideMap` if applicable
6. Re-add localStorage projection record
7. Return `true` if redo was possible, `false` if `_redoStack` empty

**Keyboard:**
- `Shift+P`: move strategy cycling to `Ctrl+P`
- `U`: `removeLastPaint()`
- `Ctrl+U`: `redoLastPaint()`

**HUD button:**
- `◆ UNDO LAYER` (visible when `_paintHistory.length > 0`)
- `◆ REDO LAYER` (visible when `_redoStack.length > 0`)
- Both update via `_updatePaintHUD()`

**Tests:**
- Undo starts fade, pushes to redo stack
- Redo during fade reverses it, restores to history
- After 1s, mesh disposes, localStorage record removed, redo stack emptied
- Undo with empty history returns false
- Redo with empty redo stack returns false

### 2d. Layer Preview Thumbnails

> **Decision:** Left edge — avoids conflict with detail panel + sessions drawer on right. Collapse toggle with small `◀` arrow.

- `#paint-strip` div in `index.html` — left edge, 80px wide, scrollable vertical strip
- Collapse toggle: small `◀` / `▶` arrow at top of strip
- New `canvas/paint-strip.mjs`:
  - `addLayerPreview(uuid, dataURL)` — draw scaled 64×36 canvas thumbnail, append to strip
  - `removeLayerPreview(uuid)` — on undo, fade out thumbnail then remove
  - `redoLayerPreview(uuid)` — on redo, re-append thumbnail
  - `clearPreviews()` — on doc change or fresh session
  - `toggleStrip()` — collapse/expand

**CSS:**
- `.paint-strip` — 80px wide, bg `#080800` (bg-1), 1px border-right `#1e1e00`
- `.paint-strip.collapsed` — width 12px (just the toggle arrow visible)
- `.paint-thumb` — 64×36 canvas, 1px amber `#ffaa00` border, margin 4px
- `.paint-thumb.active` — 2px orange `#ff6600` border (most recent layer)
- Transition: 200ms ease width on collapse

**Wire into `paint-orchestrator.mjs`:**
- `_executePaint()` after success → `addLayerPreview(uuid, dataURL)`
- `removeLastPaint()` → `removeLayerPreview(uuid)` + `_redoStack` tracking
- `redoLastPaint()` → `redoLayerPreview(uuid)`
- On document load / session clear → `clearPreviews()`

**Rehydrate:** `rehydrateSlides()` already restores paint meshes → also restore thumbnails into strip

**Tests:**
- Thumbnail renders at correct 16:9 aspect ratio
- Strip updates on add/remove/redo
- Collapse toggle works
- Clears on session load

---

## Phase 3: Session Persistence

### 3a. Auto-Save (Periodic Timer)

> **Decision:** Unconditional 60s writes. IndexedDB handles it fine. User can disable via setting toggle. Keep it simple.

**Implementation:**
1. `_initAutoSave()` in `session-manager.mjs`:
   - `setInterval(() => _autoSaveTick(), 60_000)` — 60s interval
   - Check `_autoSaveEnabled` flag before saving (default: `true`)
   - `_autoSaveTick()`:
     - If graph has no nodes → skip
     - Call `_snapshotSession('__auto__')` — writes with `_auto: true`
     - `updateSession('__auto__', doc)` — overwrites same ID each tick
     - No toast, no prompt

2. Auto-save toggle:
   - Button in settings drawer: `AUTO-SAVE: ON/OFF`
   - Stores preference in `localStorage` (`kv.autoSave`)
   - `_autoSaveEnabled` reads from localStorage on init

3. `listSessions()` filters out `id === '__auto__'` — never shown in UI drawer

**Tests:**
- Auto-save fires after 60s, skips empty graph
- Writes to `'__auto__'` ID
- Respects disable toggle
- UI drawer excludes `'__auto__'`

### 3b. Crash Recovery (beforeunload + Draft Detection)

> **Decision:** Delete draft only after successful restore. If restore throws, draft survives and banner re-appears next load. Safe and simple.

**Implementation:**

> **Decision:** `__draft__` and `__auto__` are separate IDs — never conflict. `__draft__` is exclusively the crash signal (beforeunload). `__auto__` is exclusively the timer. The timer never writes to `__draft__`.

1. `window.addEventListener('beforeunload', …)` in `main.mjs`:
   - If graph has nodes → `saveSession({ id: '__draft__', name: '__draft__', nodes, edges, camera, breadcrumb, brief, patches })`
   - Fire-and-forget (no await)
   - Uses fixed ID `'__draft__'`

2. Update `saveSession` in `pipeline/sessions.mjs`:
   - Accept optional `id` param — if provided, use it instead of generating a new UID
   - Enables `updateSession`-style overwrite via put

3. Draft detection in `main.mjs` init flow:
   - On startup: `loadSession('__draft__')`
   - If draft exists and has `nodes.length > 0` → show `#crash-recovery-banner`

4. Banner: amber-tinted bar at top
   ```
   "Unsaved session from [savedAt]. [RESTORE] [DISCARD]"
   ```
   - RESTORE handler:
     ```js
     try {
       // Confirm before wiping if canvas is dirty
       if (graphHasContent()) {
         const ok = confirm('Restoring will replace your current session. Continue?');
         if (!ok) return;
       }
       await _restoreSession('__draft__');
       await deleteSession('__draft__');
     } catch (err) {
       log('ERROR', 'draft restore failed', err);
       // Draft stays in IDB, banner re-appears next load
     }
     ```
   - DISCARD handler: `await deleteSession('__draft__')`, hide banner
   - Banner persists until explicitly dismissed

5. `#crash-recovery-banner` in `index.html`:
   - Position: fixed top, full width, z-index above canvas
   - bg `#101008`, border-bottom `#ffaa00`, text `#ccccaa`

**Tests:**
- `beforeunload` writes draft with `id: '__draft__'` and node data
- Draft detected on init, banner rendered
- RESTORE succeeds → draft deleted, banner hidden
- RESTORE throws → draft survives, error logged
- DISCARD deletes draft and hides banner

### 3c. Full State Recovery

> **Decision:** Move state to `canvas/app-state.mjs` as central store — not exported from main.mjs. Supports plugin extensibility. No circular imports.

**Architecture change:** Migrate `_pinned`, `_overlayMode`, `_expanded`, `_causalLayout` state variables from `main.mjs` closure into `canvas/app-state.mjs`:

```js
// canvas/app-state.mjs — new exports
export function getPinnedQids()      { return [..._pinned]; }
export function addPinnedQid(qid)    { _pinned.add(qid); }
export function removePinnedQid(qid) { _pinned.delete(qid); }
export function isPinned(qid)        { return _pinned.has(qid); }

export function getOverlayMode()       { return _overlayMode; }
export function setOverlayMode(mode)   { _overlayMode = mode; }

export function getExpandedQids()      { return [..._expanded]; }
export function addExpandedQid(qid)    { _expanded.add(qid); }
export function isExpanded(qid)        { return _expanded.has(qid); }

export function isCausalLayout()       { return _causalLayout; }
export function setCausalLayout(v)     { _causalLayout = v; }
```

`main.mjs` imports these instead of using closure variables. `session-manager.mjs` already imports `app-state.mjs` — no new dependency edges.

**Additional persisted fields** in `_snapshotSession()` (`session-manager.mjs`):

```js
// New fields in save object:
nodeStates:   snapshotNodeStates(),           // { qid: stateString }
pinned:       getPinnedQids(),                // string[]
overlayMode:  getOverlayMode(),               // 'sentiment' | 'tier' | null
cameraLocked: isCameraLocked(),               // boolean
causalLayout: isCausalLayout(),               // boolean
expandedQids: getExpandedQids(),              // string[]
```

Expose `snapshotNodeStates()` from `nodes.mjs`:
```js
export function snapshotNodeStates() {
  return Object.fromEntries(_states);
}
```

**Restore in `_restoreSession()` (`session-manager.mjs`):**

```js
// After nodes are added and camera restored:
if (session.nodeStates) {
  for (const [qid, state] of Object.entries(session.nodeStates)) {
    setNodeState(qid, state);
  }
}
if (session.pinned?.length) {
  for (const qid of session.pinned) addPinnedQid(qid);
}
if (session.overlayMode) setOverlayMode(session.overlayMode);
if (session.cameraLocked) setCameraLock(true);
if (session.causalLayout) setCausalLayout(true);
if (session.expandedQids?.length) {
  for (const qid of session.expandedQids) addExpandedQid(qid);
}
```

**Update `pipeline/sessions.mjs`** — all new fields optional (backward-compatible):
```js
saveSession({ name, id, nodes, edges, camera, breadcrumb, pinned, brief, patches,
              nodeStates, overlayMode, cameraLocked, causalLayout, expandedQids })
```

**DO NOT persist:** `_loadingCore`, `_loadingNeighbors` Sets (transient loading gates).

**Tests:**
- `snapshotNodeStates()` captures all state strings
- Focused node restores as focused (white ring)
- Pinned restores as pinned (gold ring)
- Camera lock restores
- Causal layout restores
- Overlay mode restores
- Expanded set prevents re-expand on double-click

---

## Phase 4: Markdown → Library JSON (Subagent Handoff)

**Files to create:**
- `pipeline/visualize-pipeline.mjs` — entry point: `visualizeMarkdown(mdPath)` → valid library JSON
- `pipeline/visualize-schema.mjs` — port VALID_TYPES, VALID_RELS, VALID_TIERS, etc. from Python validator
- `pipeline/visualize-validator.mjs` — pure JS cross-reference validator

**Flow:**
```
visualizeMarkdown(mdPath)
  → Read markdown source
  → Pass 1 (LLM): Entity extraction → nodes[] with type, tier, sentiment, description, metrics
  → Pass 2 (LLM): Relation extraction → edges[] with rel, weight, directed
     → Gate: edge density ≥ 2.0, else retry
  → Pass 3 (LLM): Narrative generation → story[], insights[], clusters[], report_card
  → JS cross-reference validator (matching Python validator checks)
  → Entity resolution (Wikidata QID mapping attempt)
  → Write to library/{id}.json
  → Append to LIBRARY[] in pipeline/local-graph.mjs
  → Python validator gate (optional, via child_process)
```

**Output requirement:** Must produce JSON that passes `validate-library-json.py` with exit code 0.

**Handoff:** Subagent implements prompt engineering, retry logic, edge density computation, entity resolution.
