/**
 * canvas/scene.mjs — Three.js scene, camera, renderer, OrbitControls, raycasting.
 *
 * Camera system
 * ─────────────
 * One PerspectiveCamera (55° FOV, near=0.1, far=600) initialized at (0, 4, 22).
 * OrbitControls handles all user-driven rotation, pan, and zoom.
 *
 * Programmatic movement is funnelled through three exported functions, all of
 * which write to `_camAnim` and let the render loop lerp via easeInOutQuad:
 *
 *   animateCameraTo(pos, target, duration)
 *     Direct fly-to.  Used by:
 *       • paint pipeline — fly to canonical before/after image generation
 *       • restore-scene  — fly to canonical when a previously-painted slide is revisited
 *
 *   frameNodes(meshes, fromDir?)
 *     Bounding-box fit of a mesh set.  Used by:
 *       • slides:frame   — every slide navigation reframes its node set
 *       • cluster focus  — digit keys 1–6, report cluster pills
 *       • insight/beat focus — report card navigation
 *       • ego-graph (F)  — frames a node's neighbors
 *
 *   focusOn(position, distance?)
 *     Single-node close-up.  Used by:
 *       • focusEntity    — node click, breadcrumb navigation, narrative tour steps
 *
 * Camera lock
 * ───────────
 * When `_cameraLocked` is true, all three functions become no-ops.
 * User-driven OrbitControls interaction is NEVER affected by the lock —
 * the user can always orbit, pan, and zoom freely.
 *
 * Two non-animation camera mutations intentionally bypass the lock:
 *   • Session restore  — cam.position.fromArray(...)  (deliberate user action)
 *   • F11 export loop  — cam.position.copy(...)       (headless render, camera restored after)
 *
 * Toggle: setCameraLock(bool) / isCameraLocked()
 * Shortcut: C key (main.mjs) / ◎ CAM toolbar button
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let _renderer, _camera, _scene, _controls, _raycaster, _pointer;
let _container;

// ── Smooth camera animation state ─────────────────────────────────────────────
let _camAnim = null;      // { fromPos, toPos, fromTarget, toTarget, t0, duration }
let _cameraLocked = false; // when true: all programmatic movement is suppressed

function _easeInOutQuad(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

function _animateCameraTo(toPos, toTarget, duration = 550) {
  _camAnim = {
    fromPos:    _camera.position.clone(),
    toPos,
    fromTarget: _controls.target.clone(),
    toTarget,
    t0:         performance.now(),
    duration,
  };
}

const _clickHandlers    = [];
const _dblClickHandlers = [];
const _hoverHandlers    = [];

export function initScene(container) {
  _container = container;
  const W = container.clientWidth  || window.innerWidth;
  const H = container.clientHeight || window.innerHeight;

  // Renderer
  _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  _renderer.setSize(W, H);
  _renderer.setClearColor(0x000000, 1);
  _renderer.shadowMap.enabled = true;
  container.appendChild(_renderer.domElement);

  // Scene
  _scene = new THREE.Scene();

  // Camera — 55° FOV, starts at (0, 4, 22) looking at origin
  _camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 600);
  _camera.position.set(0, 4, 22);

  // Lights
  _scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(8, 14, 8);
  _scene.add(key);
  const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
  fill.position.set(-8, -4, -8);
  _scene.add(fill);

  // Controls — damping 0.07, distance [1.5, 200]
  _controls = new OrbitControls(_camera, _renderer.domElement);
  _controls.enableDamping      = true;
  _controls.dampingFactor      = 0.07;
  _controls.minDistance        = 1.5;
  _controls.maxDistance        = 200;
  _controls.screenSpacePanning = true;

  // Raycasting
  _raycaster = new THREE.Raycaster();
  _pointer   = new THREE.Vector2(-9999, -9999);

  _renderer.domElement.addEventListener('pointermove', _onPointerMove);
  _renderer.domElement.addEventListener('click',       _onClick);
  _renderer.domElement.addEventListener('dblclick',    _onDblClick);
  // User grabbing the camera cancels any in-flight programmatic animation
  _renderer.domElement.addEventListener('pointerdown', () => { _camAnim = null; });

  // Double-tap → expand node (iOS/Android don't fire dblclick reliably)
  let _lastTapAt = 0;
  _renderer.domElement.addEventListener('touchend', e => {
    const now = Date.now();
    const touch = e.changedTouches[0];
    const rect = _renderer.domElement.getBoundingClientRect();
    _pointer.x =  ((touch.clientX - rect.left) / rect.width)  * 2 - 1;
    _pointer.y = -((touch.clientY - rect.top)  / rect.height) * 2 + 1;
    if (now - _lastTapAt < 300) {
      const qid = _hitQid();
      if (qid) { _dblClickHandlers.forEach(fn => fn(qid)); e.preventDefault(); }
    }
    _lastTapAt = now;
  }, { passive: false });

  // Responsive resize
  new ResizeObserver(() => {
    const W = container.clientWidth, H = container.clientHeight;
    _camera.aspect = W / H;
    _camera.updateProjectionMatrix();
    _renderer.setSize(W, H);
  }).observe(container);

  // Render loop
  _renderer.setAnimationLoop(_animate);

  return { scene: _scene, camera: _camera, renderer: _renderer, controls: _controls };
}

// ── Getters ───────────────────────────────────────────────────────────────────

export function getScene()    { return _scene; }
export function getCamera()   { return _camera; }
export function getRenderer() { return _renderer; }
export function getControls() { return _controls; }

// ── Camera lock ───────────────────────────────────────────────────────────────

/** Lock/unlock all programmatic camera movement. OrbitControls (user input) is unaffected. */
export function setCameraLock(locked) { _cameraLocked = !!locked; }
export function isCameraLocked()      { return _cameraLocked; }

// ── Frustum query ─────────────────────────────────────────────────────────────

/**
 * Return QIDs of all node meshes whose world position falls inside the
 * current camera frustum.
 * @param {Map<string, THREE.Object3D>} meshMap — from getAllMeshes() in nodes.mjs
 */
export function getVisibleNodeQids(meshMap) {
  if (!_camera || !meshMap) return [];
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(_camera.projectionMatrix, _camera.matrixWorldInverse),
  );
  const out = [];
  for (const [qid, mesh] of meshMap) {
    if (frustum.containsPoint(mesh.position)) out.push(qid);
  }
  return out;
}

// ── Programmatic camera movement (all respect the lock) ───────────────────────

/**
 * Smoothly fly camera to an absolute world position + look-at target.
 * No-op when camera is locked.
 */
export function animateCameraTo(toPos, toTarget, duration = 600) {
  if (_cameraLocked) return;
  _animateCameraTo(toPos, toTarget, duration);
}

/**
 * Smoothly frame a set of meshes by computing their bounding box and
 * positioning the camera at an appropriate distance along `fromDir`.
 * No-op when camera is locked or when meshes is empty.
 *
 * @param {THREE.Object3D[]} meshes
 * @param {THREE.Vector3}    [fromDir]  camera offset direction (default: (0, 0.25, 1))
 */
export function frameNodes(meshes, fromDir = null) {
  if (_cameraLocked || !meshes.length) return;
  const box    = new THREE.Box3();
  meshes.forEach(m => box.expandByPoint(m.position));
  const center = box.getCenter(new THREE.Vector3());
  const size   = box.getSize(new THREE.Vector3());
  const dist   = Math.max(size.x, size.y, size.z) * 0.8 + 6;
  const dir    = fromDir ? fromDir.clone().normalize() : new THREE.Vector3(0, 0.25, 1).normalize();
  const toPos  = center.clone().addScaledVector(dir, dist);
  _animateCameraTo(toPos, center, 650);
}

/**
 * Smoothly move camera to look at a single world position from a set distance.
 * No-op when camera is locked.
 *
 * @param {number[]} position  [x, y, z]
 * @param {number}   distance  camera pull-back distance (default 14)
 */
export function focusOn(position, distance = 14) {
  if (_cameraLocked) return;
  const target = new THREE.Vector3(...position);
  const toPos  = target.clone().add(new THREE.Vector3(0, distance * 0.3, distance));
  _animateCameraTo(toPos, target, 520);
}

// ── Event handlers ────────────────────────────────────────────────────────────

export function onNodeClick(fn)    { _clickHandlers.push(fn); }
export function onNodeDblClick(fn) { _dblClickHandlers.push(fn); }
export function onNodeHover(fn)    { _hoverHandlers.push(fn); }

const _tickFns = [];
export function addTick(fn) { _tickFns.push(fn); }

function _animate() {
  if (_camAnim) {
    const raw = (performance.now() - _camAnim.t0) / _camAnim.duration;
    const t   = _easeInOutQuad(Math.min(raw, 1));
    _camera.position.lerpVectors(_camAnim.fromPos, _camAnim.toPos, t);
    _controls.target.lerpVectors(_camAnim.fromTarget, _camAnim.toTarget, t);
    if (raw >= 1) _camAnim = null;
  }
  _controls.update();
  _tickFns.forEach(fn => fn());
  _renderer.render(_scene, _camera);
}

function _onPointerMove(e) {
  const rect = _renderer.domElement.getBoundingClientRect();
  _pointer.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
}

function _hitQid() {
  _raycaster.setFromCamera(_pointer, _camera);
  const hits = _raycaster.intersectObjects(_scene.children, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !obj.userData.qid) obj = obj.parent;
  return obj?.userData?.qid ?? null;
}

function _onClick()    { const qid = _hitQid(); if (qid) _clickHandlers.forEach(fn => fn(qid)); }
function _onDblClick() { const qid = _hitQid(); if (qid) _dblClickHandlers.forEach(fn => fn(qid)); }

// Hover — called each frame from the render loop via addTick
export function tickHover() {
  _raycaster.setFromCamera(_pointer, _camera);
  const hits = _raycaster.intersectObjects(_scene.children, true);
  if (!hits.length) { _hoverHandlers.forEach(fn => fn(null)); return; }
  let obj = hits[0].object;
  while (obj && !obj.userData.qid) obj = obj.parent;
  _hoverHandlers.forEach(fn => fn(obj?.userData?.qid ?? null));
}
