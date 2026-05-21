/**
 * canvas/scene-painter.mjs — Environment sphere with per-slide projective texture mapping.
 *
 * Geometry
 * --------
 * A smooth SphereGeometry (r=180, 64×32 segments) acts as the projection surface.
 * Each painted slide owns its own Mesh (shared geometry, unique ShaderMaterial).
 * Fragments outside the canonical projector frustum are discarded (alpha=0).
 * A permanent dark base sphere fills unpainted regions.
 *
 *   renderOrder -30        base sphere  (constant dark background)
 *   renderOrder -20 + idx  slide meshes (transparent outside their frustum)
 *   renderOrder  0         nodes / edges
 *
 * Canonical camera positions
 * --------------------------
 * Each slide gets a unique look-from direction via a golden-angle spiral on the full
 * sphere.  The golden angle (~137.5°) drives azimuth; the silver ratio (1/φ) drives
 * elevation — both are mutually irrational, so no two slide indices ever collide.
 * No wrapping; the full 360×360 sphere is available for any number of slides.
 *
 * Image persistence
 * -----------------
 * Generated data-URLs are stored in localStorage (IMG_LS_PREFIX + cacheKey).
 * A per-doc slide index (SLIDE_IDX_PREFIX + docId) maps slideIdx → cacheKey so
 * rehydrateSlides() can rebuild every mesh after a page reload or brief reopen.
 *
 * Public API
 * ----------
 *   initScenePainter(threeScene)
 *   tickScenePainter()
 *   generateScene(central, frameNodes, apiKey, camera, slideIdx, docId) → Promise<SceneResult>
 *   rehydrateSlides(docId, camera) → Promise<number[]>   — restored slide indices
 *   getCanonicalCamera(slideIdx) → { pos: Vector3, target: Vector3 }
 *   restoreScene(slideIdx)
 *   clearSlide(slideIdx)
 *   clearAllSlides()
 *   buildPrompt(centralNode, frameNodes) → string
 *   getImageKey() / setImageKey(key)
 */

import * as THREE from 'three';
import { log } from '../logger.mjs';
import { loadLLMConfig } from '../pipeline/gateway/index.mjs';

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

const IMG_KEY_STORE = 'kv.kaaro.img';
const SLIDE_IDX_PREFIX = 'kv.kaaro.sidx.';  // localStorage: + docId → JSON {slideIdx: cacheKey}

// IndexedDB — used for image data-URLs (too large for localStorage)
const IDB_NAME = 'kv.kaaro.painter';
const IDB_VERSION = 1;
const IDB_STORE = 'images';
let _idb = null;

function _openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror = e => reject(e.target.error);
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
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

const SPHERE_RADIUS = 180;
const CANONICAL_DIST = 65;
const FADE_RATE = 1.6;  // opacity/s → ≈0.625 s full fade

// ── Canonical camera positions ────────────────────────────────────────────────

const _GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508° — sunflower azimuth step
const _SILVER_FRAC = 0.6180339887;                  // 1/φ — uncorrelated elevation step

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
    pos: dir.clone().multiplyScalar(CANONICAL_DIST),
    target: new THREE.Vector3(0, 0, 0),
  };
}

function _canonicalProjView(slideIdx, liveCam) {
  const dir = _canonicalDir(slideIdx);
  const pos = dir.clone().multiplyScalar(CANONICAL_DIST);

  // Gram-Schmidt: remove the dir component from world-Y so the camera's
  // y-axis always points "as northward as possible" — eliminates the
  // progressive 90° tilt from equator to poles.
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
  if (up.lengthSq() < 1e-4) up.set(0, 0, 1);
  else up.normalize();

  const tmp = new THREE.PerspectiveCamera(liveCam.fov, liveCam.aspect, liveCam.near, liveCam.far);
  tmp.position.copy(pos);
  tmp.up.copy(up);
  tmp.lookAt(0, 0, 0);
  tmp.updateMatrixWorld();
  tmp.updateProjectionMatrix();

  return new THREE.Matrix4().multiplyMatrices(tmp.projectionMatrix, tmp.matrixWorldInverse);
}

// ── GLSL ─────────────────────────────────────────────────────────────────────

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

    vec2  d    = abs(uv - 0.5) * 2.0;
    float edge = max(d.x, d.y);
    float vign = 1.0 - smoothstep(0.72, 1.0, edge);

    gl_FragColor = vec4(texel.rgb * vign, uOpacity * vign);
  }
`;

// ── Module state ──────────────────────────────────────────────────────────────

let _scene = null;
let _geo = null;   // shared SphereGeometry, never mutated

const _slides = new Map();   // slideIdx → { mesh, opacity, fadeDir, lastTick }
const _memCache = new Map();   // cacheKey → THREE.Texture
const _loader = new THREE.TextureLoader();

// ── Init ──────────────────────────────────────────────────────────────────────

export function initScenePainter(scene) {
  if (_scene) return;
  _scene = scene;

  _geo = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);

  // Permanent dark base sphere — fills unpainted regions
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
  if (!_slides.size) return;
  const now = performance.now();
  const toRemove = [];

  for (const [idx, s] of _slides) {
    if (s.fadeDir === 0) continue;
    const dt = Math.min((now - s.lastTick) / 1000, 0.05);
    s.lastTick = now;

    s.opacity += s.fadeDir * dt * FADE_RATE;

    if (s.opacity >= 1.0) {
      s.opacity = 1.0;
      s.fadeDir = 0;
    } else if (s.opacity <= 0.0) {
      _scene.remove(s.mesh);
      s.mesh.material.dispose();
      toRemove.push(idx);
      continue;
    }
    s.mesh.material.uniforms.uOpacity.value = s.opacity;
  }

  for (const idx of toRemove) _slides.delete(idx);
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

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildPrompt(centralNode, frameNodes) {
  const name = centralNode?.label ?? 'an entity';
  const kind = centralNode?.type ?? 'concept';
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
 * Generate (or restore from cache) a scene image for slideIdx and project it
 * from the slide's canonical camera direction.
 *
 * @param {object}       centralNode
 * @param {object[]}     frameNodes
 * @param {string}       apiKey
 * @param {THREE.Camera} camera      live camera (FOV/aspect only)
 * @param {number}       slideIdx
 * @param {string}       [docId]     stored so rehydrateSlides can restore on reload
 */
export async function generateScene(centralNode, frameNodes, apiKey, camera, slideIdx, docId) {
  const key = apiKey || getImageKey();
  if (!key) throw new Error('No Gemini image key — add one in ⚙ MODEL SETTINGS → Scene Painter');
  if (!_scene) throw new Error('[ScenePainter] call initScenePainter(scene) first');

  const projViewMatrix = _canonicalProjView(slideIdx, camera);
  const { pos: cameraPos, target: cameraTarget } = getCanonicalCamera(slideIdx);

  const cKey = _cacheKey(centralNode, frameNodes);
  let texture = _memCache.get(cKey);

  if (!texture) {
    const stored = await _idbLoad(cKey);
    if (stored) {
      log('SYSTEM', '[ScenePainter] IDB hit', { slide: slideIdx });
      texture = await _textureFromDataURL(stored);
    } else {
      const prompt = buildPrompt(centralNode, frameNodes);

      log('SYSTEM', '[ScenePainter] requesting image', { slide: slideIdx, node: centralNode?.label });
      const dataURL = await _fetchDataURL(prompt, key);
      await _idbSave(cKey, dataURL);
      texture = await _textureFromDataURL(dataURL);
    }
    _memCache.set(cKey, texture);
  } else {
    log('SYSTEM', '[ScenePainter] memory hit', { slide: slideIdx });
  }

  _storeSlideRef(docId, slideIdx, cKey);
  _applySlide(slideIdx, texture, projViewMatrix);
  return { cameraPos, cameraTarget };
}

// ── Rehydration ───────────────────────────────────────────────────────────────

/**
 * Reload all previously-painted slides for a doc from localStorage and rebuild
 * their Three.js meshes.  Returns the slide indices that were successfully restored.
 * Call after renderSlides() + showSlides() so notifySceneResult can update the UI.
 */
export async function rehydrateSlides(docId, camera) {
  if (!docId || !camera || !_scene) return [];
  let index;
  try {
    index = JSON.parse(localStorage.getItem(SLIDE_IDX_PREFIX + docId) ?? '{}');
  } catch { return []; }

  const restored = [];
  for (const [idxStr, cKey] of Object.entries(index)) {
    const slideIdx = parseInt(idxStr, 10);
    const stored = await _idbLoad(cKey);
    if (!stored) continue;
    try {
      let texture = _memCache.get(cKey);
      if (!texture) {
        texture = await _textureFromDataURL(stored);
        _memCache.set(cKey, texture);
      }
      _applySlide(slideIdx, texture, _canonicalProjView(slideIdx, camera));
      restored.push(slideIdx);
    } catch (err) {
      log('SYSTEM', `[ScenePainter] rehydrate slide ${slideIdx} failed: ${err.message}`);
    }
  }

  if (restored.length) log('SYSTEM', `[ScenePainter] rehydrated ${restored.length} slides for ${docId}`);
  return restored;
}

/**
 * Return all stored backdrop dataURLs for a doc, keyed by slideIdx.
 * @returns {Promise<Array<{slideIdx:number, dataURL:string}>>}
 */
export async function getAllBackdrops(docId) {
  if (!docId) return [];
  let index;
  try {
    index = JSON.parse(localStorage.getItem(SLIDE_IDX_PREFIX + docId) ?? '{}');
  } catch { return []; }
  const result = [];
  for (const [idxStr, cKey] of Object.entries(index)) {
    const dataURL = await _idbLoad(cKey);
    if (dataURL) result.push({ slideIdx: parseInt(idxStr, 10), dataURL });
  }
  return result.sort((a, b) => a.slideIdx - b.slideIdx);
}

// ── Restore / clear ───────────────────────────────────────────────────────────

export function restoreScene(slideIdx) {
  const s = _slides.get(slideIdx);
  if (!s) return;
  s.fadeDir = 1;
  s.lastTick = performance.now();
}

export function clearSlide(slideIdx) {
  const s = _slides.get(slideIdx);
  if (!s) return;
  s.fadeDir = -1;
  s.lastTick = performance.now();
}

export function clearAllSlides() {
  const now = performance.now();
  for (const [, s] of _slides) { s.fadeDir = -1; s.lastTick = now; }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _applySlide(slideIdx, texture, projViewMatrix) {
  let s = _slides.get(slideIdx);

  if (!s) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT_SRC,
      fragmentShader: FRAG_SRC,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTexture: { value: texture },
        uProjViewMat: { value: projViewMatrix.clone() },
        uOpacity: { value: 0.0 },
        uHasTexture: { value: true },
      },
    });

    const mesh = new THREE.Mesh(_geo, mat);
    mesh.renderOrder = -20 + (slideIdx % 10);
    mesh.frustumCulled = false;
    _scene.add(mesh);

    s = { mesh, opacity: 0.0, fadeDir: 1, lastTick: performance.now() };
    _slides.set(slideIdx, s);
  } else {
    s.mesh.material.uniforms.uTexture.value = texture;
    s.mesh.material.uniforms.uProjViewMat.value.copy(projViewMatrix);
    s.mesh.material.uniforms.uHasTexture.value = true;
    s.fadeDir = 1;
    s.lastTick = performance.now();
  }
}

function _storeSlideRef(docId, slideIdx, cacheKey) {
  if (!docId) return;
  try {
    const lsKey = SLIDE_IDX_PREFIX + docId;
    const index = JSON.parse(localStorage.getItem(lsKey) ?? '{}');
    index[slideIdx] = cacheKey;
    localStorage.setItem(lsKey, JSON.stringify(index));
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

function _cacheKey(central, nodes) {
  return [
    central?.qid ?? '',
    ...(nodes ?? []).map(n => n?.qid ?? '').sort(),
  ].join('|');
}
