import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDOM, resetDOM } from './testSetup.mjs';

// Mock all dependencies identically to existing paint-orchestrator tests
vi.mock('../logger.mjs', () => ({ log: vi.fn() }));
vi.mock('../pipeline/graph.mjs', () => ({ graph: { getNode: vi.fn(() => null), nodes: { size: 0 } } }));
vi.mock('./paint-context.mjs', () => ({
  assemblePaintContext: vi.fn(() => ({
    visibleNodes: [], selectedNode: null, slideCentral: null, cameraAngle: null,
  })),
}));
vi.mock('./paint-strategies.mjs', () => ({
  buildPrompt: vi.fn(() => 'test-prompt'),
  getActiveStrategy: vi.fn(() => 'cinematic'),
  getStrategyConfig: vi.fn(() => ({ compositing: 'replace', opacity: 1.0 })),
  setActiveStrategy: vi.fn(),
  listStrategies: vi.fn(() => ['cinematic', 'abstract']),
}));
vi.mock('./scene-painter.mjs', () => ({
  generateScene: vi.fn(() => Promise.resolve({ cameraPos: {}, cameraTarget: {} })),
  getCanonicalCamera: vi.fn(() => ({ pos: {}, target: {} })),
  restoreScene: vi.fn(),
  getImageKey: vi.fn(() => ''),
}));
vi.mock('./scene.mjs', () => ({
  getCamera: vi.fn(() => ({ position: { clone: vi.fn(() => ({})) } })),
  getControls: vi.fn(() => ({ target: { clone: vi.fn(() => ({})) } })),
  getVisibleNodeQids: vi.fn(() => []),
  animateCameraTo: vi.fn(),
  isCameraLocked: vi.fn(() => false),
  setCameraLock: vi.fn(),
}));
vi.mock('./nodes.mjs', () => ({ getAllMeshes: vi.fn(() => []) }));
vi.mock('./slides.mjs', () => ({
  getActiveSlideIdx: vi.fn(() => 0),
  getActiveSlide: vi.fn(() => null),
  notifySceneResult: vi.fn(),
  isSlidesVisible: vi.fn(() => false),
}));
vi.mock('./detail.mjs', () => ({ getCurrentQid: vi.fn(() => null) }));
vi.mock('./app-state.mjs', () => ({ getLastLoadedDocId: vi.fn(() => null) }));

import { getImageKey, generateScene } from './scene-painter.mjs';
import { notifySceneResult } from './slides.mjs';

describe('paint progress indicator (2a)', () => {
  beforeEach(() => {
    resetDOM();
    vi.clearAllMocks();
  });

  it('shows indicator during generateScene and hides after completion', async () => {
    getImageKey.mockReturnValue('test-key-123');

    // Resolve after a tick so we can observe the indicator in the intermediate state
    let resolveGenerate;
    generateScene.mockImplementation(() => new Promise(r => { resolveGenerate = r; }));

    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    // Trigger a free-roam paint via slides:paint-scene event
    const paintPromise = (async () => {
      document.dispatchEvent(new CustomEvent('slides:paint-scene', {
        detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
      }));
      await new Promise(r => setTimeout(r, 10));
    })();

    await paintPromise;

    // Indicator should be visible while generateScene is in-flight
    const indicator = document.getElementById('paint-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.classList.contains('hidden')).toBe(false);

    const label = document.getElementById('paint-indicator-label');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('generating scene…');

    // Resolve generateScene
    resolveGenerate({ cameraPos: {}, cameraTarget: {} });
    await new Promise(r => setTimeout(r, 10));

    // After completion, indicator should be hidden
    expect(indicator.classList.contains('hidden')).toBe(true);
  });

  it('hides indicator on generateScene error', async () => {
    getImageKey.mockReturnValue('test-key-123');
    generateScene.mockRejectedValue(new Error('paint failed'));

    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:paint-scene', {
      detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
    }));
    await new Promise(r => setTimeout(r, 20));

    const indicator = document.getElementById('paint-indicator');
    expect(indicator.classList.contains('hidden')).toBe(true);

    // notifySceneResult should still have been called with error
    expect(notifySceneResult).toHaveBeenCalledWith(0, 'error', 'paint failed');
  });

  it('does not show indicator when no API key', async () => {
    getImageKey.mockReturnValue('');

    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:paint-scene', {
      detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
    }));
    await new Promise(r => setTimeout(r, 20));

    const indicator = document.getElementById('paint-indicator');
    expect(indicator.classList.contains('hidden')).toBe(true);
    expect(notifySceneResult).toHaveBeenCalledWith(0, 'error', expect.any(String));
  });

  it('paint-indicator element exists in DOM after initPaintOrchestrator', async () => {
    getImageKey.mockReturnValue('test-key-123');
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    const indicator = document.getElementById('paint-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.classList.contains('hidden')).toBe(true); // hidden by default
  });
});
