/**
 * edges.mjs — relationship lines between node meshes.
 */

import * as THREE from 'three';
import { resolveRelType, getRelStyle } from '../ontology.mjs';
import { getScene } from './scene.mjs';
import { getNodeMesh } from './nodes.mjs';

const _lines = new Map(); // edgeKey → THREE.Line

export function addEdgeLine(edge) {
  const key = `${edge.from}→${edge.to}→${edge.pid}`;
  if (_lines.has(key)) return;

  const fromMesh = getNodeMesh(edge.from);
  const toMesh   = getNodeMesh(edge.to);
  if (!fromMesh || !toMesh) return;

  const relType = resolveRelType(edge.pid);
  const style   = getRelStyle(relType);

  const geo = new THREE.BufferGeometry().setFromPoints([
    fromMesh.position.clone(),
    toMesh.position.clone(),
  ]);

  const mat = new THREE.LineBasicMaterial({
    color:       style.color,
    transparent: true,
    opacity:     0.65,
    depthWrite:  false,
  });

  const line       = new THREE.Line(geo, mat);
  line.renderOrder = 0;
  line.userData.edgeKey = key;
  line.userData.from    = edge.from;
  line.userData.to      = edge.to;

  getScene().add(line);
  _lines.set(key, line);
}

/** Sync edge endpoint positions after nodes have moved. */
export function syncEdgePositions() {
  for (const [, line] of _lines) {
    const from = getNodeMesh(line.userData.from);
    const to   = getNodeMesh(line.userData.to);
    if (!from || !to) continue;
    const pos = line.geometry.attributes.position;
    from.position.toArray(pos.array, 0);
    to.position.toArray(pos.array, 3);
    pos.needsUpdate = true;
  }
}

export function clearEdgesFor(qid) {
  for (const [key, line] of _lines) {
    if (line.userData.from === qid || line.userData.to === qid) {
      getScene().remove(line);
      line.geometry.dispose();
      line.material.dispose();
      _lines.delete(key);
    }
  }
}

export function clearAllEdges() {
  for (const [key, line] of _lines) {
    getScene().remove(line);
    line.geometry.dispose();
    line.material.dispose();
    _lines.delete(key);
  }
}
