import { describe, it, expect, beforeEach } from 'vitest';
import * as appState from './app-state.mjs';

// Reset singleton state before each test so tests are independent.
beforeEach(() => {
  appState.setActiveBrief(null);
  appState.setActivePatches(null);
  appState.setLastLoadedDocId(null);
  appState.setCurrentDocMeta(null);
  appState.setBriefMode('slides');
});

describe('app-state initial values', () => {
  it('getActiveBrief() returns null initially', () => {
    expect(appState.getActiveBrief()).toBeNull();
  });

  it('getActivePatches() returns null initially', () => {
    expect(appState.getActivePatches()).toBeNull();
  });

  it('getLastLoadedDocId() returns null initially', () => {
    expect(appState.getLastLoadedDocId()).toBeNull();
  });

  it('getCurrentDocMeta() returns null initially', () => {
    expect(appState.getCurrentDocMeta()).toBeNull();
  });

  it('getBriefMode() returns "slides" initially', () => {
    expect(appState.getBriefMode()).toBe('slides');
  });
});

describe('app-state setter/getter round-trips', () => {
  it('setActiveBrief / getActiveBrief round-trips a non-null value', () => {
    const brief = { nodes: [], edges: [] };
    appState.setActiveBrief(brief);
    expect(appState.getActiveBrief()).toBe(brief);
  });

  it('setActivePatches / getActivePatches round-trips a non-null value', () => {
    const patches = { v: 1 };
    appState.setActivePatches(patches);
    expect(appState.getActivePatches()).toBe(patches);
  });

  it('setLastLoadedDocId / getLastLoadedDocId round-trips a non-null value', () => {
    appState.setLastLoadedDocId('doc-42');
    expect(appState.getLastLoadedDocId()).toBe('doc-42');
  });

  it('setCurrentDocMeta / getCurrentDocMeta round-trips a non-null value', () => {
    const meta = { title: 'Test' };
    appState.setCurrentDocMeta(meta);
    expect(appState.getCurrentDocMeta()).toBe(meta);
  });

  it('setBriefMode / getBriefMode round-trips a valid value', () => {
    appState.setBriefMode('reader');
    expect(appState.getBriefMode()).toBe('reader');
  });
});

describe('setBriefMode validation', () => {
  it('setBriefMode("reader") → getBriefMode() returns "reader"', () => {
    appState.setBriefMode('reader');
    expect(appState.getBriefMode()).toBe('reader');
  });

  it('setBriefMode("slides") → getBriefMode() returns "slides"', () => {
    appState.setBriefMode('reader');
    appState.setBriefMode('slides');
    expect(appState.getBriefMode()).toBe('slides');
  });

  it('setBriefMode("invalid") → getBriefMode() returns previous value unchanged', () => {
    appState.setBriefMode('reader');
    appState.setBriefMode('invalid');
    expect(appState.getBriefMode()).toBe('reader');
  });
});

describe('app-state singleton', () => {
  it('two imports share the same state object', async () => {
    const a = await import('./app-state.mjs');
    const b = await import('./app-state.mjs');
    a.setActiveBrief({ id: 'shared' });
    expect(b.getActiveBrief()).toEqual({ id: 'shared' });
  });
});
