/**
 * canvas/scene-painter.mjs — Environment sphere with projective texture mapping.
 *
 * Geometry
 * --------
 * One shared SphereGeometry (r=180, 64×32 segments) is the projection surface.
 * Each paint call creates a new THREE.Mesh wrapping the shared geometry with its
 * own ShaderMaterial.  The shader bakes a projection-view matrix (uProjViewMat)
 * so each mesh illuminates only the sphere region visible from the paint angle.
 * Multiple meshes from different angles accumulate cleanly — there is no limit.
 *
 *   renderOrder -30      base dark sphere (constant background)
 *   renderOrder -20…-1   painted meshes   (sequential, newest on top)
 *   renderOrder  0       nodes / edges
 *
 * Canonical camera positions
 * --------------------------
 * Slide-triggered paints use a golden-angle spiral so each slideIdx maps to a
 * unique direction on the full sphere.  When camera lock is active the caller
 * passes canonicalOverride so the texture projects from the live camera position.
 * Free-roam paints also pass canonicalOverride (the live camera at trigger time).
 *
 * Storage — UUID model
 * --------------------
 * Every generateScene() call is always fresh: no content-hash cache, no reuse.
 *
 *   IDB 'images':          uuid  → dataURL
 *   localStorage PROJ_IDX: docId → JSON array of paint records:
 *                          { uuid, slideIdx: number|null, pos: [x,y,z], target: [x,y,z] }
 *
 * pos + target are stored so rehydrateSlides() can reconstruct the exact projection
 * matrix.  slideIdx is null for free-roam paints; non-null for slide-triggered ones.
 * Within-session, uuid → THREE.Texture is held in _texCache to avoid redundant
 * GPU uploads if the same UUID is re-displayed before a page reload.
 *
 * Mesh identity
 * -------------
 * Meshes are keyed internally by UUID, not slideIdx.  This means:
 *   • Free-roam paints accumulate — each produces a new mesh at its own angle.
 *   • Re-painting a slide fades out the previous mesh for that slideIdx and
 *     fades in a new one (crossfade via _slideMap lookup).
 *   • clearSlide(slideIdx) fades the latest mesh for that slide.
 *
 * Public API
 * ----------
 *   initScenePainter(threeScene)
 *   tickScenePainter()
 *   generateScene(central, frameNodes, apiKey, camera, slideIdx, docId, opts?)
 *   rehydrateSlides(docId, camera) → Promise<number[]>
 *   getAllBackdrops(docId) → Promise<{slideIdx, dataURL}[]>
 *   getCanonicalCamera(slideIdx) → { pos: Vector3, target: Vector3 }
 *   restoreScene(slideIdx)
 *   clearSlide(slideIdx)
 *   clearAllSlides()
 *   buildPrompt(centralNode, frameNodes) → string   (legacy fallback)
 *   getImageKey() / setImageKey(key)
 */

import * as THREE from 'three';
import { log } from '../logger.mjs';
import { loadLLMConfig } from '../pipeline/gateway/index.mjs';

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

const IMG_KEY_STORE   = 'kv.kaaro.img';
const PROJ_IDX_PREFIX = 'kv.kaaro.proj.'; // localStorage: + docId → JSON array

// IndexedDB — image data-URLs keyed by UUID
const IDB_NAME    = 'kv.kaaro.painter';
const IDB_VERSION = 1;
const IDB_STORE   = 'images';
let _idb = null;

function _openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function _idbSave(key, value) {
  try {
    const db = await _openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (err) {
    log('SYSTEM', `[ScenePainter] IDB save failed: ${err.message}`);
  }
}

async function _idbLoad(key) {
  try {
    const db = await _openIDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch { return null; }
}

const SPHERE_RADIUS  = 180;
const CANONICAL_DIST = 65;
const FADE_RATE      = 1.6; // opacity/s → ≈0.625 s full fade

// ── Canonical camera positions ────────────────────────────────────────────────

const _GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const _SILVER_FRAC  = 0.6180339887;

function _canonicalDir(slideIdx) {
  const azimuth = slideIdx * _GOLDEN_ANGLE;
  const sinElev = 2 * ((slideIdx * _SILVER_FRAC + 0.5) % 1) - 1;
  const cosElev = Math.sqrt(Math.max(0, 1 - sinElev * sinElev));
  return new THREE.Vector3(
    cosElev * Math.cos(azimuth),
    sinElev,
    cosElev * Math.sin(azimuth),
  );
}

export function getCanonicalCamera(slideIdx) {
  const dir = _canonicalDir(slideIdx);
  return {
    pos:    dir.clone().multiplyScalar(CANONICAL_DIST),
    target: new THREE.Vector3(0, 0, 0),
  };
}

function _projViewFromPos(pos, target, liveCam) {
  const dir = pos.clone().normalize();
  const up  = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
  if (up.lengthSq() < 1e-4) up.set(0, 0, 1);
  else up.normalize();

  const tmp = new THREE.PerspectiveCamera(liveCam.fov, liveCam.aspect, liveCam.near, liveCam.far);
  tmp.position.copy(pos);
  tmp.up.copy(up);
  tmp.lookAt(target.x, target.y, target.z);
  tmp.updateMatrixWorld();
  tmp.updateProjectionMatrix();
  return new THREE.Matrix4().multiplyMatrices(tmp.projectionMatrix, tmp.matrixWorldInverse);
}

// ── GLSL ──────────────────────────────────────────────────────────────────────

const VERT_SRC = /* glsl */`
  uniform mat4 uProjViewMat;
  varying vec4 vProjCoord;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vProjCoord = uProjViewMat * world;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_SRC = /* glsl */`
  uniform sampler2D uTexture;
  uniform float     uOpacity;
  uniform bool      uHasTexture;

  varying vec4 vProjCoord;

  void main() {
    if (uOpacity < 0.001) discard;
    if (!uHasTexture) discard;

    float w  = vProjCoord.w;
    vec2  uv = vProjCoord.xy / w * 0.5 + 0.5;

    float hit = step(0.001, w)
              * step(0.0, uv.x) * step(uv.x, 1.0)
              * step(0.0, uv.y) * step(uv.y, 1.0);
    if (hit < 0.5) discard;

    vec4  texel = texture2D(uTexture, uv);
    vec2  d     = abs(uv - 0.5) * 2.0;
    float edge  = max(d.x, d.y);
    float vign  = 1.0 - smoothstep(0.72, 1.0, edge);

    gl_FragColor = vec4(texel.rgb * vign, uOpacity * vign);
  }
`;

// ── Module state ──────────────────────────────────────────────────────────────

let _scene        = null;
let _geo          = null;            // shared SphereGeometry, never mutated
let _renderOrder  = -20;             // decrements per new mesh (newest on top within range)

const _paints   = new Map(); // uuid     → { mesh, opacity, fadeDir, lastTick }
const _slideMap = new Map(); // slideIdx → uuid   (latest paint per slide, for crossfade + clear)
const _texCache = new Map(); // uuid     → THREE.Texture  (within-session GPU upload cache)
const _loader   = new THREE.TextureLoader();

// ── Init ──────────────────────────────────────────────────────────────────────

export function initScenePainter(scene) {
  if (_scene) return;
  _scene = scene;

  _geo = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);

  const base = new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE_RADIUS - 1, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0x0f0902,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  base.renderOrder = -30;
  base.frustumCulled = false;
  scene.add(base);

  log('SYSTEM', '[ScenePainter] init — smooth sphere, golden-angle spiral');
}

// ── Animation tick ────────────────────────────────────────────────────────────

export function tickScenePainter() {
  if (!_paints.size) return;
  const now = performance.now();
  const toRemove = [];

  for (const [uuid, p] of _paints) {
    if (p.fadeDir === 0) continue;
    const dt = Math.min((now - p.lastTick) / 1000, 0.05);
    p.lastTick = now;
    p.opacity += p.fadeDir * dt * FADE_RATE;

    if (p.opacity >= 1.0) {
      p.opacity = 1.0;
      p.fadeDir = 0;
    } else if (p.opacity <= 0.0) {
      _scene.remove(p.mesh);
      p.mesh.material.dispose();
      toRemove.push(uuid);
      continue;
    }
    p.mesh.material.uniforms.uOpacity.value = p.opacity;
  }

  for (const uuid of toRemove) _paints.delete(uuid);
}

// ── Key management ────────────────────────────────────────────────────────────

export function getImageKey() {
  const stored = localStorage.getItem(IMG_KEY_STORE);
  if (stored) return stored;
  const cfg = loadLLMConfig();
  if (cfg?.provider === 'gemini' && cfg.apiKey) return cfg.apiKey;
  return '';
}

export function setImageKey(key) {
  if (key) localStorage.setItem(IMG_KEY_STORE, key.trim());
  else localStorage.removeItem(IMG_KEY_STORE);
}

// ── Prompt builder (legacy fallback) ─────────────────────────────────────────

export function buildPrompt(centralNode, frameNodes) {
  const name    = centralNode?.label ?? 'an entity';
  const kind    = centralNode?.type  ?? 'concept';
  const excerpt = centralNode?.description
    ? ` — ${centralNode.description.slice(0, 90)}`
    : '';
  const context = (frameNodes ?? [])
    .filter(n => n?.qid !== centralNode?.qid && n?.label)
    .slice(0, 5)
    .map(n => n.label)
    .join(', ');

  return [
    `Cinematic wide establishing shot: ${name}, a ${kind}${excerpt}.`,
    context ? `Related entities in scene: ${context}.` : '',
    'Dark atmospheric oil painting. Dramatic amber-orange and deep black lighting.',
    'Rich texture and painterly brushwork. Shallow depth of field. Wide lens.',
    'No text. No labels. No UI elements. Cinematic intelligence brief aesthetic.',
  ].filter(Boolean).join(' ');
}

// ── Generation ────────────────────────────────────────────────────────────────

/**
 * Generate a fresh scene image and project it onto the sphere.
 * Always calls the Gemini API — no content-hash cache, no deduplication.
 *
 * @param {object}        centralNode
 * @param {object[]}      frameNodes
 * @param {string}        apiKey
 * @param {THREE.Camera}  camera              live camera (FOV/aspect)
 * @param {number|null}   slideIdx            slide slot, or null for free-roam paints
 * @param {string}        [docId]
 * @param {object}        [opts]
 * @param {string}        [opts.prompt]       pre-built prompt string
 * @param {object}        [opts.canonicalOverride]  { pos: Vector3, target: Vector3 }
 *                                            use live camera instead of golden-angle spiral
 */
export async function generateScene(centralNode, frameNodes, apiKey, camera, slideIdx, docId, opts = {}) {
  const { prompt: promptOverride, canonicalOverride = null } = opts;

  const key = apiKey || getImageKey();
  if (!key) throw new Error('No Gemini image key — add one in ⚙ MODEL SETTINGS → Scene Painter');
  if (!_scene) throw new Error('[ScenePainter] call initScenePainter(scene) first');

  // Projection origin: explicit override (camera lock / free-roam) or canonical spiral
  const projPos    = canonicalOverride?.pos    ?? (slideIdx != null ? getCanonicalCamera(slideIdx).pos : camera.position.clone());
  const projTarget = canonicalOverride?.target ?? new THREE.Vector3(0, 0, 0);
  const projViewMatrix = _projViewFromPos(projPos, projTarget, camera);

  const prompt = promptOverride ?? buildPrompt(centralNode, frameNodes);
  log('SYSTEM', '[ScenePainter] requesting image', {
    slide: slideIdx ?? 'free-roam',
    node: centralNode?.label,
  });

  const dataURL = await _fetchDataURL(prompt, key);
  const uuid    = crypto.randomUUID();
  await _idbSave(uuid, dataURL);

  let texture = _texCache.get(uuid);
  if (!texture) {
    texture = await _textureFromDataURL(dataURL);
    _texCache.set(uuid, texture);
  }

  _storeProjectionRecord(docId, slideIdx, uuid, projPos, projTarget);
  _applyPaint(uuid, slideIdx, texture, projViewMatrix);

  return { cameraPos: projPos, cameraTarget: projTarget };
}

// ── Rehydration ───────────────────────────────────────────────────────────────

/**
 * Reload all previously-painted images for a doc and rebuild their meshes.
 * Uses stored pos + target to reconstruct the exact original projection matrix.
 * Returns the slide indices (non-null) that were successfully restored.
 */
export async function rehydrateSlides(docId, camera) {
  if (!docId || !camera || !_scene) return [];
  let records;
  try {
    records = JSON.parse(localStorage.getItem(PROJ_IDX_PREFIX + docId) ?? '[]');
  } catch { return []; }

  const restored = [];
  for (const { uuid, slideIdx, pos, target } of records) {
    const dataURL = await _idbLoad(uuid);
    if (!dataURL) continue;
    try {
      let texture = _texCache.get(uuid);
      if (!texture) {
        texture = await _textureFromDataURL(dataURL);
        _texCache.set(uuid, texture);
      }
      const projPos    = new THREE.Vector3(...pos);
      const projTarget = new THREE.Vector3(...target);
      _applyPaint(uuid, slideIdx, texture, _projViewFromPos(projPos, projTarget, camera));
      if (slideIdx != null) restored.push(slideIdx);
    } catch (err) {
      log('SYSTEM', `[ScenePainter] rehydrate ${uuid} failed: ${err.message}`);
    }
  }

  if (restored.length) log('SYSTEM', `[ScenePainter] rehydrated ${restored.length} slide paints for ${docId}`);
  return restored;
}

/**
 * Return all stored backdrop dataURLs for a doc that are associated with a
 * specific slide (slideIdx != null), sorted by slideIdx.
 * @returns {Promise<Array<{slideIdx:number, dataURL:string}>>}
 */
export async function getAllBackdrops(docId) {
  if (!docId) return [];
  let records;
  try {
    records = JSON.parse(localStorage.getItem(PROJ_IDX_PREFIX + docId) ?? '[]');
  } catch { return []; }

  const result = [];
  for (const { uuid, slideIdx } of records) {
    if (slideIdx == null) continue; // skip free-roam paints
    const dataURL = await _idbLoad(uuid);
    if (dataURL) result.push({ slideIdx, dataURL });
  }
  return result.sort((a, b) => a.slideIdx - b.slideIdx);
}

// ── Restore / clear ───────────────────────────────────────────────────────────

export function restoreScene(slideIdx) {
  const uuid = _slideMap.get(slideIdx);
  if (!uuid) return;
  const p = _paints.get(uuid);
  if (!p) return;
  p.fadeDir  = 1;
  p.lastTick = performance.now();
}

export function clearSlide(slideIdx) {
  const uuid = _slideMap.get(slideIdx);
  if (!uuid) return;
  const p = _paints.get(uuid);
  if (!p) return;
  p.fadeDir  = -1;
  p.lastTick = performance.now();
}

export function clearAllSlides() {
  const now = performance.now();
  for (const [, p] of _paints) { p.fadeDir = -1; p.lastTick = now; }
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Create a new sphere mesh for this paint (keyed by UUID).
 * If slideIdx is non-null and there was a previous mesh for that slide,
 * it is faded out (crossfade).
 */
function _applyPaint(uuid, slideIdx, texture, projViewMatrix) {
  // Fade out the previous mesh for this slide slot (if any)
  if (slideIdx != null) {
    const prevUuid = _slideMap.get(slideIdx);
    if (prevUuid && prevUuid !== uuid) {
      const prev = _paints.get(prevUuid);
      if (prev) { prev.fadeDir = -1; prev.lastTick = performance.now(); }
    }
    _slideMap.set(slideIdx, uuid);
  }

  // Each UUID always gets its own new mesh — accumulation is the default
  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT_SRC,
    fragmentShader: FRAG_SRC,
    side:       THREE.DoubleSide,
    depthTest:  false,
    depthWrite: false,
    transparent: true,
    uniforms: {
      uTexture:     { value: texture },
      uProjViewMat: { value: projViewMatrix.clone() },
      uOpacity:     { value: 0.0 },
      uHasTexture:  { value: true },
    },
  });

  const mesh = new THREE.Mesh(_geo, mat);
  // Newest paint sits on top; clamp to [-29, -1] to stay between base and nodes
  _renderOrder = Math.max(-29, _renderOrder - 1);
  mesh.renderOrder   = _renderOrder;
  mesh.frustumCulled = false;
  _scene.add(mesh);

  _paints.set(uuid, { mesh, opacity: 0.0, fadeDir: 1, lastTick: performance.now() });
}

/**
 * Persist a paint record. Replaces any existing record for the same slideIdx
 * within this doc (keeps only the latest paint per slide slot).
 * Free-roam records (slideIdx = null) are appended without replacement.
 */
function _storeProjectionRecord(docId, slideIdx, uuid, pos, target) {
  if (!docId) return;
  try {
    const lsKey   = PROJ_IDX_PREFIX + docId;
    const records = JSON.parse(localStorage.getItem(lsKey) ?? '[]');
    const updated = slideIdx != null
      ? records.filter(r => r.slideIdx !== slideIdx)  // replace latest for slide
      : records;                                       // free-roam: append
    updated.push({ uuid, slideIdx, pos: pos.toArray(), target: target.toArray() });
    localStorage.setItem(lsKey, JSON.stringify(updated));
  } catch { }
}

async function _fetchDataURL(prompt, key) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  };

  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini image API ${res.status}: ${txt.slice(0, 160)}`);
  }

  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) {
    const reason = data.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`No image part in response (finishReason: ${reason})`);
  }

  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

function _textureFromDataURL(dataURL) {
  return new Promise((resolve, reject) =>
    _loader.load(
      dataURL,
      tex => { tex.colorSpace = THREE.SRGBColorSpace; resolve(tex); },
      undefined,
      err => reject(new Error(`Texture load: ${err?.message ?? err}`)),
    ),
  );
}
