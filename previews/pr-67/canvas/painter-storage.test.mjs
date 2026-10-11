import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Reset IDB and localStorage before each test
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  // Re-import forces the module singleton (_idb) to reset each test
  vi.resetModules();
});

// Helper to dynamically import the module fresh each test (so _idb resets)
async function getStorage() {
  return await import('./painter-storage.mjs?t=' + Math.random());
}

describe('painter-storage — _idbSave / _idbLoad round-trip', () => {
  it('saves a value and loads it back by the same key', async () => {
    const { _idbSave, _idbLoad } = await getStorage();
    const key = 'test-uuid-1';
    const value = 'data:image/png;base64,abc123';
    await _idbSave(key, value);
    const result = await _idbLoad(key);
    expect(result).toBe(value);
  });

  it('returns null for a missing key', async () => {
    const { _idbLoad } = await getStorage();
    const result = await _idbLoad('nonexistent-uuid');
    expect(result).toBeNull();
  });

  it('returns null for a missing key (resilience check)', async () => {
    const { _idbLoad } = await getStorage();
    const result = await _idbLoad('never-stored');
    expect(result).toBeNull();
  });

  it('second call to _openIDB returns cached db (both loads succeed)', async () => {
    const { _idbSave, _idbLoad } = await getStorage();
    const key = 'test-uuid-2';
    const value = 'data:image/webp;base64,xyz';
    await _idbSave(key, value);
    // First load opens IDB
    const r1 = await _idbLoad(key);
    // Second load uses cached singleton
    const r2 = await _idbLoad(key);
    expect(r1).toBe(value);
    expect(r2).toBe(value);
  });
});

describe('painter-storage — getImageKey / setImageKey', () => {
  it('getImageKey returns empty string when localStorage is empty', async () => {
    const { getImageKey } = await getStorage();
    expect(getImageKey()).toBe('');
  });

  it('getImageKey returns stored value when localStorage has IMG_KEY_STORE', async () => {
    const { getImageKey } = await getStorage();
    localStorage.setItem('kv.kaaro.img', 'my-api-key');
    expect(getImageKey()).toBe('my-api-key');
  });

  it('setImageKey writes to localStorage; getImageKey returns it', async () => {
    const { getImageKey, setImageKey } = await getStorage();
    setImageKey('new-key-456');
    expect(getImageKey()).toBe('new-key-456');
  });

  it('setImageKey(null) removes the key; getImageKey returns empty string', async () => {
    const { getImageKey, setImageKey } = await getStorage();
    setImageKey('to-be-removed');
    expect(getImageKey()).toBe('to-be-removed');
    setImageKey(null);
    expect(getImageKey()).toBe('');
  });
});

describe('painter-storage — _storeProjectionRecord', () => {
  const fakeVec = (x, y, z) => ({ toArray: () => [x, y, z] });

  it('with slideIdx=0 replaces previous record for that slide', async () => {
    const { _storeProjectionRecord } = await getStorage();
    const docId = 'doc-abc';
    const lsKey = 'kv.kaaro.proj.' + docId;

    _storeProjectionRecord(docId, 0, 'uuid-1', fakeVec(1, 2, 3), fakeVec(4, 5, 6));
    _storeProjectionRecord(docId, 0, 'uuid-2', fakeVec(7, 8, 9), fakeVec(10, 11, 12));

    const records = JSON.parse(localStorage.getItem(lsKey));
    const slide0 = records.filter(r => r.slideIdx === 0);
    expect(slide0).toHaveLength(1);
    expect(slide0[0].uuid).toBe('uuid-2');
  });

  it('with slideIdx=null accumulates free-roam records', async () => {
    const { _storeProjectionRecord } = await getStorage();
    const docId = 'doc-free';
    const lsKey = 'kv.kaaro.proj.' + docId;

    _storeProjectionRecord(docId, null, 'uuid-a', fakeVec(1, 0, 0), fakeVec(0, 0, 0));
    _storeProjectionRecord(docId, null, 'uuid-b', fakeVec(2, 0, 0), fakeVec(0, 0, 0));
    _storeProjectionRecord(docId, null, 'uuid-c', fakeVec(3, 0, 0), fakeVec(0, 0, 0));

    const records = JSON.parse(localStorage.getItem(lsKey));
    const freeRecords = records.filter(r => r.slideIdx == null);
    expect(freeRecords).toHaveLength(3);
  });

  it('caps free-roam records at 20 (push 22, read back 20)', async () => {
    const { _storeProjectionRecord } = await getStorage();
    const docId = 'doc-cap';
    const lsKey = 'kv.kaaro.proj.' + docId;

    for (let i = 0; i < 22; i++) {
      _storeProjectionRecord(docId, null, `uuid-${i}`, fakeVec(i, 0, 0), fakeVec(0, 0, 0));
    }

    const records = JSON.parse(localStorage.getItem(lsKey));
    const freeRecords = records.filter(r => r.slideIdx == null);
    expect(freeRecords).toHaveLength(20);
  });

  it('preserves all slide records when capping free-roam', async () => {
    const { _storeProjectionRecord } = await getStorage();
    const docId = 'doc-mix';
    const lsKey = 'kv.kaaro.proj.' + docId;

    // Add 3 slide records
    _storeProjectionRecord(docId, 0, 'slide-0', fakeVec(1, 0, 0), fakeVec(0, 0, 0));
    _storeProjectionRecord(docId, 1, 'slide-1', fakeVec(2, 0, 0), fakeVec(0, 0, 0));
    _storeProjectionRecord(docId, 2, 'slide-2', fakeVec(3, 0, 0), fakeVec(0, 0, 0));

    // Push 22 free-roam records (should cap at 20)
    for (let i = 0; i < 22; i++) {
      _storeProjectionRecord(docId, null, `free-${i}`, fakeVec(i, 0, 0), fakeVec(0, 0, 0));
    }

    const records = JSON.parse(localStorage.getItem(lsKey));
    const slideRecords = records.filter(r => r.slideIdx != null);
    const freeRecords  = records.filter(r => r.slideIdx == null);
    expect(slideRecords).toHaveLength(3);
    expect(freeRecords).toHaveLength(20);
  });

  it('with no docId is a no-op (no projection record written)', async () => {
    const { _storeProjectionRecord } = await getStorage();
    _storeProjectionRecord(null, 0, 'uuid-x', fakeVec(1, 2, 3), fakeVec(4, 5, 6));
    _storeProjectionRecord('', 0, 'uuid-y', fakeVec(1, 2, 3), fakeVec(4, 5, 6));
    // No projection key should have been written (PROJ_IDX_PREFIX starts with 'kv.kaaro.proj.')
    const projKeys = Object.keys(localStorage).filter(k => k.startsWith('kv.kaaro.proj.'));
    expect(projKeys).toHaveLength(0);
  });
});
