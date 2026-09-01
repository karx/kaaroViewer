# Image Backdrop Enrichment Pipeline

Each slide in a brief can have a unique AI-generated background image projected onto the environment sphere. This document describes the full pipeline: how it is triggered, how data flows through the system, how the 3D projection works, and what the user experiences.

---

## Architecture overview

```
slides.mjs          main.mjs              scene-painter.mjs          Three.js scene
────────────        ────────────          ─────────────────          ─────────────
PAINT button   →    slides:paint-scene →  generateScene()        →   ShaderMaterial mesh
                                          ├─ IDB cache hit?           (sphere backdrop)
                                          │    yes → reuse texture
                                          │    no  → Gemini API
                                          │           ↓
                                          │         data-URL
                                          │           ↓
                                          │         IndexedDB
                                          │           ↓
                                          └─ _applySlide() → fade in

_setActive()   →    slides:frame        →  frameNodes(dir)        →   camera animation
               →    slides:restore-scene → restoreScene()         →   fade in mesh
                                           animateCameraTo()

_showBrief()   →    rehydrateSlides()   →  IDB → texture → mesh   →   fade in
               →    notifySceneResult()
```

---

## Control flow

### 1 — Triggering a paint

The user clicks the **◆ PAINT** button inside a slide article. Only slides with at least one framed node have a paint button (`hasPaint` check in `slides.mjs:_renderSlide`).

`slides.mjs` dispatches:
```
slides:paint-scene  {slideIdx, centralNodeId, frameNodeIds[]}
```

`main.mjs` handles this event. It:
1. Looks up the `central` node and all `frameNodes` from the live graph.
2. Checks for an image API key (`getImageKey()`). If missing, immediately calls `notifySceneResult(slideIdx, 'error', …)` and bails.
3. Fetches the **canonical camera** for this slide (`getCanonicalCamera(slideIdx)`) and calls `animateCameraTo(canon.pos, canon.target, 700)` — the camera begins flying to the slide's unique viewing angle.
4. Calls `generateScene(central, frameNodes, apiKey, camera, slideIdx, docId)` (async — awaited).
5. On success: calls `notifySceneResult(slideIdx, 'done', …)` then re-calls `animateCameraTo(canon.pos, canon.target, 600)` to bring the camera back to the canonical position after Gemini responds (Gemini takes seconds; the camera may have drifted).
6. On failure: calls `notifySceneResult(slideIdx, 'error', message)`.

### 2 — Image generation (`generateScene`)

Inside `scene-painter.mjs`:

```
cacheKey = hash(central.qid + frameNode.qids sorted)
   ↓
memCache hit?  yes → texture (in-memory, session-local)
   ↓ no
IndexedDB hit? yes → _textureFromDataURL(stored)
   ↓ no
buildPrompt(centralNode, frameNodes)
   ↓
Gemini 2.5 Flash Image API  (POST, responseModalities:['IMAGE'])
   ↓
data-URL (base64 PNG, ~1–3 MB)
   ↓
_idbSave(cKey, dataURL)     ← persisted to IndexedDB
_storeSlideRef(docId, slideIdx, cKey)  ← tiny index to localStorage
   ↓
_textureFromDataURL → THREE.Texture
   ↓
_applySlide(slideIdx, texture, projViewMatrix)
```

`_applySlide` creates or updates a `THREE.Mesh` with a `ShaderMaterial`. New meshes start at `opacity=0` and `fadeDir=+1` so they fade in over ~0.6 seconds via `tickScenePainter()`.

### 3 — Slide navigation

When the active slide changes (`_setActive(n)` in `slides.mjs`), two events fire synchronously:

**`slides:frame`** — `{nodeIds, slideIdx}`
- `main.mjs` calls `frameNodes(meshes, fromDir)` where `fromDir` is the canonical direction for `slideIdx`.
- This animates the camera to `nodeCluster.center + canonicalDir * dist`, placing it in the right quadrant of the sphere to see this slide's backdrop.

**`slides:restore-scene`** — `{slideIdx, sceneData}` *(only if `_paintState` has this slide marked done)*
- `main.mjs` calls `restoreScene(slideIdx)` (sets `fadeDir=+1` on the existing mesh) and `animateCameraTo(canon.pos, canon.target, 800)`.

### 4 — Rehydration (page reload / brief reopen)

`_showBrief(meta)` in `main.mjs` runs `renderSlides` + `showSlides` synchronously, then:

```
rehydrateSlides(docId, camera)
  └─ read localStorage: SLIDE_IDX_PREFIX + docId → {slideIdx: cacheKey, …}
     for each entry:
       IDB load cacheKey → data-URL
       _textureFromDataURL → THREE.Texture
       _canonicalProjView(slideIdx, camera) → projViewMatrix
       _applySlide(slideIdx, texture, projViewMatrix)   ← mesh recreated
     return restored[]
  
for each restored slideIdx:
  notifySceneResult(idx, 'done', undefined, {restored:true})
    └─ repopulates _paintState so SCENE ✓ button shows
       and _setActive will dispatch slides:restore-scene on navigation
```

---

## Data flow

### Storage layers

| Layer | Key | Content | Scope |
|---|---|---|---|
| In-memory `_memCache` | cacheKey string | `THREE.Texture` | Session only |
| IndexedDB `kv.kaaro.painter/images` | cacheKey string | base64 data-URL (~1–3 MB) | Persistent, no size cap |
| localStorage `kv.kaaro.sidx.<docId>` | — | `{slideIdx: cacheKey}` JSON | Persistent, per-doc |
| localStorage `kv.kaaro.img` | — | Gemini API key | Persistent |

### Cache key

```javascript
cacheKey = [central.qid, ...frameNode.qids.sort()].join('|')
```

Keyed by node identity, not slide index. The same set of nodes in different slides reuses the cached image. The `slideIdx → cacheKey` index in localStorage is what ties a specific slide position to its image across sessions.

### Prompt construction (`buildPrompt`)

```
"Cinematic wide establishing shot: {label}, a {type} — {description[:90]}."
"Related entities in scene: {frameNode.labels[:5]}."
"Dark atmospheric oil painting. Dramatic amber-orange and deep black lighting."
"Rich texture and painterly brushwork. Shallow depth of field. Wide lens."
"No text. No labels. No UI elements. Cinematic intelligence brief aesthetic."
```

---

## 3D projection system

### Environment sphere

A single `SphereGeometry(r=180, 64×32)` is shared across all slide meshes. A slightly smaller dark base sphere (`r=179, 32×16`) fills unpainted regions at `renderOrder=-30`. Slide meshes render at `renderOrder=-20` to `-11` (below nodes/edges at 0).

All sphere meshes have `depthTest:false` and `depthWrite:false` — they never occlude the knowledge graph.

### Canonical camera positions

Each slide gets a unique look-from direction derived from two mutually irrational sequences:

```
azimuth   = slideIdx × π(3−√5)     // golden angle  ~137.5°
sinElev   = 2 × frac(slideIdx × φ⁻¹ + 0.5) − 1   // silver ratio
```

Because π(3−√5) and φ⁻¹ are mutually irrational, no two slide indices produce the same (azimuth, elevation) pair — the full 360°×360° sphere is available with no wrapping.

The **canonical camera** sits at `CANONICAL_DIST=65` units from the origin (inside the sphere at r=180), looking toward the origin. The projection fills the far hemisphere visible from that position.

### Projective texture mapping (GLSL)

**Vertex shader** transforms each sphere vertex through the projector's view-projection matrix:
```glsl
vProjCoord = uProjViewMat * (modelMatrix * vec4(position, 1.0));
```

**Fragment shader** discards fragments outside the projector frustum and samples the texture for those inside:
```glsl
float w  = vProjCoord.w;
vec2  uv = vProjCoord.xy / w * 0.5 + 0.5;

float hit = step(0.001, w)                      // behind projector → discard
          * step(0.0, uv.x) * step(uv.x, 1.0)  // outside frustum  → discard
          * step(0.0, uv.y) * step(uv.y, 1.0);
if (hit < 0.5) discard;
```

A soft vignette fades the image at the projection edges:
```glsl
float edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
float vign = 1.0 - smoothstep(0.72, 1.0, edge);
```

The `uProjViewMat` is computed once at paint time from the canonical direction (not the live camera), so the projection is permanently locked to that sphere region regardless of where the user later moves their camera.

### Fade animation

`tickScenePainter()` runs every animation frame. Each slide entry has `{ opacity, fadeDir, lastTick }`. `fadeDir=+1` fades in, `fadeDir=-1` fades out. Rate: `FADE_RATE=1.6 opacity/s` (~0.6 s full sweep). When opacity reaches 0 on a fade-out, the mesh is removed from the scene and disposed.

---

## User experience

### Painting a new scene

1. User opens a brief and navigates to a slide with entity nodes.
2. The **◆ PAINT** button appears in the slide's top-left marker strip.
3. User clicks PAINT. The button immediately changes to **◆ PAINTING…** and disables.
4. The camera smoothly flies to the slide's unique angle in the 360° sphere (~700 ms).
5. After a few seconds (Gemini latency), a cinematic image fades into the background sphere.
6. The camera re-flies to the canonical angle so the image is centered in view (~600 ms).
7. The button changes to **◆ SCENE ✓**.

### Navigating between painted slides

- Navigating away from a painted slide does **not** clear its backdrop — it stays in the scene at its own sphere region. Multiple slides' images coexist simultaneously, each occupying a different part of the sphere.
- Navigating back to a painted slide fires `slides:restore-scene`, which re-fades the mesh in (if it faded) and flies the camera back to that slide's canonical position.

### Persistence

- Painted images survive page reload. On next open, `rehydrateSlides` silently restores all meshes from IndexedDB before the user interacts.
- The SCENE ✓ button state is also restored so re-paint is not required.
- Images are content-addressed by node QID set — painting the same entities on a different slide (or in a different doc) reuses the cached image without calling Gemini.

---

## Key files

| File | Role |
|---|---|
| `canvas/scene-painter.mjs` | Environment sphere, projective shader, Gemini API call, IDB persistence, rehydration |
| `canvas/slides.mjs` | Slide model, PAINT button, `_paintState`, `notifySceneResult`, dispatches `slides:paint-scene` |
| `main.mjs` | Orchestrates events: `slides:paint-scene`, `slides:frame`, `slides:restore-scene`; calls `_showBrief` with rehydration |
| `canvas/scene.mjs` | `frameNodes(meshes, fromDir)` — camera framing with per-slide canonical direction |
