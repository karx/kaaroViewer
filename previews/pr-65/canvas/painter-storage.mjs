/**
 * canvas/painter-storage.mjs — IDB + localStorage helpers for the paint pipeline.
 *
 * Extracted from scene-painter.mjs. No behavioral change.
 */

import { log } from '../logger.mjs';
import { loadLLMConfig } from '../pipeline/gateway/index.mjs';

export const IMG_KEY_STORE   = 'kv.kaaro.img';
export const PROJ_IDX_PREFIX = 'kv.kaaro.proj.'; // localStorage: + docId → JSON array

// IndexedDB — image data-URLs keyed by UUID
export const IDB_NAME    = 'kv.kaaro.painter';
export const IDB_VERSION = 1;
export const IDB_STORE   = 'images';

export const MAX_FREE_ROAM_RECORDS = 20;

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

export async function _idbSave(key, value) {
  try {
    const db = await _openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (err) {
    log('SYSTEM', `[ScenePainter] IDB save failed: ${err.message}`);
  }
}

export async function _idbLoad(key) {
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

/**
 * Persist a paint record. Slide records replace the previous record for that slot.
 * Free-roam records accumulate up to MAX_FREE_ROAM_RECORDS (oldest are pruned).
 */
export function _storeProjectionRecord(docId, slideIdx, uuid, pos, target) {
  if (!docId) return;
  try {
    const lsKey   = PROJ_IDX_PREFIX + docId;
    const records = JSON.parse(localStorage.getItem(lsKey) ?? '[]');
    const filtered = slideIdx != null
      ? records.filter(r => r.slideIdx !== slideIdx)  // replace latest for slide
      : records;                                       // free-roam: accumulate (capped below)
    filtered.push({ uuid, slideIdx, pos: pos.toArray(), target: target.toArray() });

    // Preserve all slide records; cap free-roam to the most recent MAX_FREE_ROAM_RECORDS
    const slideRecords = filtered.filter(r => r.slideIdx != null);
    const freeRecords  = filtered.filter(r => r.slideIdx == null).slice(-MAX_FREE_ROAM_RECORDS);
    localStorage.setItem(lsKey, JSON.stringify([...slideRecords, ...freeRecords]));
  } catch { }
}
