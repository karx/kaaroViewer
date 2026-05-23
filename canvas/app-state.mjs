/** Mutable brief/doc state singleton — shared across all importers. */

let activeBrief = null;
let activePatches = null;
let lastLoadedDocId = null;
let currentDocMeta = null;
let briefMode = 'slides';

/** @returns {object|null} */
export function getActiveBrief() { return activeBrief; }
/** @param {object|null} b */
export function setActiveBrief(b) { activeBrief = b; }

/** @returns {object|null} */
export function getActivePatches() { return activePatches; }
/** @param {object|null} p */
export function setActivePatches(p) { activePatches = p; }

/** @returns {string|null} */
export function getLastLoadedDocId() { return lastLoadedDocId; }
/** @param {string|null} id */
export function setLastLoadedDocId(id) { lastLoadedDocId = id; }

/** @returns {object|null} */
export function getCurrentDocMeta() { return currentDocMeta; }
/** @param {object|null} m */
export function setCurrentDocMeta(m) { currentDocMeta = m; }

/** @returns {'slides'|'reader'} */
export function getBriefMode() { return briefMode; }
/** @param {'slides'|'reader'} mode — ignores invalid values */
export function setBriefMode(mode) {
  if (mode === 'slides' || mode === 'reader') {
    briefMode = mode;
    try { sessionStorage.setItem('kv.briefMode', mode); } catch {}
  }
}
