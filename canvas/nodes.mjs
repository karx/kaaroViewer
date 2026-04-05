/**
 * nodes.mjs — create and manage Three.js node meshes.
 * Each node is a Group: sphere core + glow ring + label sprite + optional image plane.
 */

import * as THREE from 'three';
import { getEntityStyle } from '../ontology.mjs';
import { getScene } from './scene.mjs';

const _meshes  = new Map();            // qid → THREE.Group
const _states  = new Map();            // qid → state string
const _texCache = new Map();           // url → Promise<THREE.Texture>
const _loader  = new THREE.TextureLoader();

// ── Node states ───────────────────────────────────────────────────────────────
// seed | unvisited | visited | expanded | focused | pinned

const STATE_STYLE = {
  seed:      { emissive: 0.35, opacity: 1.0,  scale: 1.2  },
  unvisited: { emissive: 0.06, opacity: 0.45, scale: 1.0  },
  visited:   { emissive: 0.18, opacity: 1.0,  scale: 1.0  },
  expanded:  { emissive: 0.18, opacity: 1.0,  scale: 1.0  },
  focused:   { emissive: 0.55, opacity: 1.0,  scale: 1.15 },
  pinned:    { emissive: 0.35, opacity: 1.0,  scale: 1.1  },
};

export function setNodeState(qid, state) {
  if (!_meshes.has(qid)) return;
  _states.set(qid, state);
  const group  = _meshes.get(qid);
  const s      = STATE_STYLE[state] ?? STATE_STYLE.visited;

  // sphere is first child
  const sphere = group.children[0];
  if (sphere?.material) {
    sphere.material.emissiveIntensity = s.emissive;
    sphere.material.opacity           = s.opacity;
    sphere.material.transparent       = s.opacity < 1;
  }
  group.scale.setScalar(s.scale);

  // focused: add bright outer ring; remove it for other states
  const existingFocusRing = group.getObjectByName('focus-ring');
  if (state === 'focused' && !existingFocusRing) {
    const style = getEntityStyle(group.userData.type ?? 'default');
    const fr = new THREE.Mesh(
      new THREE.RingGeometry(style.radius * 1.5, style.radius * 1.65, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false })
    );
    fr.name = 'focus-ring';
    fr.rotation.x = Math.PI / 2;
    group.add(fr);
  } else if (state !== 'focused' && existingFocusRing) {
    group.remove(existingFocusRing);
  }

  // pinned: gold ring
  const existingPinRing = group.getObjectByName('pin-ring');
  if (state === 'pinned' && !existingPinRing) {
    const style = getEntityStyle(group.userData.type ?? 'default');
    const pr = new THREE.Mesh(
      new THREE.RingGeometry(style.radius * 1.55, style.radius * 1.72, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false })
    );
    pr.name = 'pin-ring';
    pr.rotation.x = Math.PI / 2;
    group.add(pr);
  } else if (state !== 'pinned' && existingPinRing) {
    group.remove(existingPinRing);
  }
}

export function getNodeState(qid) { return _states.get(qid) ?? 'unvisited'; }

export function addNodeMesh(node) {
  if (_meshes.has(node.qid)) return _meshes.get(node.qid);

  const style = getEntityStyle(node.type ?? 'default');
  const group = new THREE.Group();
  group.userData.qid  = node.qid;
  group.userData.type = node.type;

  // ── Core sphere ──────────────────────────────────────────────────────────
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(style.radius, 32, 32),
    new THREE.MeshStandardMaterial({
      color:             style.color,
      roughness:         0.35,
      metalness:         0.4,
      emissive:          style.color,
      emissiveIntensity: 0.18,
    })
  );
  sphere.userData.qid = node.qid;
  group.add(sphere);

  // ── Glow ring ────────────────────────────────────────────────────────────
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(style.radius * 1.18, style.radius * 1.38, 48),
    new THREE.MeshBasicMaterial({
      color: style.color, side: THREE.DoubleSide,
      transparent: true, opacity: 0.2, depthWrite: false,
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // ── Image texture plane (async) ──────────────────────────────────────────
  if (node.image) _attachImagePlane(node.image, style.radius, group);

  // ── Local source ring (square outline ring for local-doc nodes) ───────────
  if (node._source === 'local') {
    const sq = new THREE.Mesh(
      new THREE.RingGeometry(style.radius * 1.42, style.radius * 1.52, 4), // square ring
      new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false })
    );
    sq.name = 'local-ring';
    sq.rotation.z = Math.PI / 4; // rotate square 45°
    group.add(sq);
  }

  // ── Label sprite ─────────────────────────────────────────────────────────
  group.add(_makeLabel(node.label ?? node.qid, node.type, node.qid, style.radius, node._source, node.metrics));

  // ── Position ─────────────────────────────────────────────────────────────
  if (node.position) group.position.set(...node.position);

  getScene().add(group);
  _meshes.set(node.qid, group);
  return group;
}

export function updateNodePosition(qid, pos) {
  const m = _meshes.get(qid);
  if (m) m.position.set(...pos);
}

export function getNodeMesh(qid)  { return _meshes.get(qid) ?? null; }
export function getAllMeshes()     { return _meshes; }

export function removeNodeMesh(qid) {
  const m = _meshes.get(qid);
  if (!m) return;
  getScene().remove(m);
  m.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
  _meshes.delete(qid);
}

export function clearAllNodes() {
  for (const qid of [..._meshes.keys()]) removeNodeMesh(qid);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _attachImagePlane(url, radius, group) {
  if (!_texCache.has(url)) {
    _texCache.set(url, _resolveWikimediaUrl(url).then(resolved => {
      if (!resolved) return null;
      return new Promise(res => _loader.load(resolved, res, undefined, () => res(null)));
    }));
  }
  _texCache.get(url).then(tex => {
    if (!tex || !group.parent) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    const size = radius * 1.9;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    plane.position.z = radius * 1.05;
    group.add(plane);
  });
}

/**
 * Special:FilePath redirects don't carry CORS headers.
 * Resolve to the actual upload.wikimedia.org thumbnail via the Commons API.
 */
async function _resolveWikimediaUrl(url) {
  if (!url.includes('Special:FilePath')) return url;

  const filename = decodeURIComponent(url.split('Special:FilePath/').pop());
  try {
    const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action:    'query',
      titles:    `File:${filename}`,
      prop:      'imageinfo',
      iiprop:    'url',
      iiurlwidth: '400',
      format:    'json',
      origin:    '*',
    });
    const res  = await fetch(api);
    const json = await res.json();
    const page = Object.values(json.query.pages)[0];
    return page?.imageinfo?.[0]?.thumburl ?? null;
  } catch {
    return null;
  }
}

function _makeLabel(text, type, qid, radius, source, metrics) {
  const canvas  = document.createElement('canvas');
  canvas.width  = 512;
  canvas.height = 148;
  const ctx     = canvas.getContext('2d');
  const isLocal = source === 'local';

  const typeLabel = getEntityStyle(type ?? 'default').label;
  const display   = (text ?? qid ?? '').toUpperCase();
  const short     = display.length > 20 ? display.slice(0, 19) + '…' : display;

  // Source badge — LOCAL (green) or WD (dim)
  ctx.font      = 'bold 14px "Courier New", monospace';
  ctx.fillStyle = isLocal ? '#00ff66' : '#222200';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(isLocal ? '◆ LOCAL' : '◇ WD', 256, 20);

  // Type label — orange, full word (e.g. "Person", "Country")
  ctx.font      = 'bold 18px "Courier New", monospace';
  ctx.fillStyle = '#ff6600';
  ctx.fillText(typeLabel.toUpperCase(), 256, 44);

  // Main label
  ctx.font         = 'bold 30px "Courier New", monospace';
  ctx.shadowColor  = '#000';
  ctx.shadowBlur   = 10;
  ctx.fillStyle    = '#e8e0c8';
  ctx.fillText(short, 256, 84);

  // Top metric (first key from metrics, if any)
  ctx.shadowBlur = 0;
  if (metrics) {
    const firstKey = Object.keys(metrics)[0];
    if (firstKey) {
      ctx.font      = '15px "Courier New", monospace';
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`${firstKey}:${metrics[firstKey]}`, 256, 108);
    }
  }

  // ID sub-label
  ctx.font      = '14px "Courier New", monospace';
  ctx.fillStyle = '#334433';
  ctx.fillText(isLocal ? qid : (qid ?? ''), 256, 130);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  sprite.scale.set(4.4, 1.3, 1);
  sprite.position.y = -(radius + 0.75);
  return sprite;
}
