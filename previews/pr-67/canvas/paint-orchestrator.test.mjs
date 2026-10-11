import { vi, describe, it, expect, beforeEach } from 'vitest';
import { seedDOM, resetDOM } from './testSetup.mjs';

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

// Import mocked dependencies so we can configure them per-test
import { getImageKey, generateScene, restoreScene } from './scene-painter.mjs';
import { notifySceneResult, isSlidesVisible } from './slides.mjs';

describe('paint-orchestrator', () => {
  beforeEach(() => {
    resetDOM();
    vi.clearAllMocks();
  });

  it('initPaintOrchestrator() does not throw when called', async () => {
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    expect(() => initPaintOrchestrator()).not.toThrow();
  });

  it('slides:paint-scene with no image key calls notifySceneResult with error', async () => {
    getImageKey.mockReturnValue('');
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:paint-scene', {
      detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
    }));

    // allow async handlers to run
    await new Promise(r => setTimeout(r, 20));

    expect(notifySceneResult).toHaveBeenCalledWith(0, 'error', expect.any(String));
  });

  it('slides:paint-scene with image key calls generateScene', async () => {
    getImageKey.mockReturnValue('test-key-123');
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:paint-scene', {
      detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
    }));

    await new Promise(r => setTimeout(r, 20));

    expect(generateScene).toHaveBeenCalled();
  });

  it('slides:paint-scene calls notifySceneResult with done when generateScene resolves', async () => {
    getImageKey.mockReturnValue('test-key-123');
    generateScene.mockResolvedValue({ cameraPos: { x: 1 }, cameraTarget: { x: 0 } });
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:paint-scene', {
      detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
    }));

    await new Promise(r => setTimeout(r, 20));

    expect(notifySceneResult).toHaveBeenCalledWith(0, 'done', undefined, expect.anything());
  });

  it('slides:paint-scene calls notifySceneResult with error when generateScene rejects', async () => {
    getImageKey.mockReturnValue('test-key-123');
    generateScene.mockRejectedValue(new Error('paint failed'));
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:paint-scene', {
      detail: { slideIdx: 0, centralNodeId: 'Q1', frameNodeIds: [] },
    }));

    await new Promise(r => setTimeout(r, 20));

    expect(notifySceneResult).toHaveBeenCalledWith(0, 'error', 'paint failed');
  });

  it('triggerGlobalPaint reads isSlidesVisible from slides.mjs (not scene.mjs)', async () => {
    getImageKey.mockReturnValue('test-key-123');
    isSlidesVisible.mockReturnValue(true);
    const { initPaintOrchestrator, triggerGlobalPaint } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();
    await triggerGlobalPaint();
    // isSlidesVisible was called — proof the import is from slides.mjs mock
    expect(isSlidesVisible).toHaveBeenCalled();
  });

  it('slides:restore-scene event calls restoreScene with slideIdx', async () => {
    const { initPaintOrchestrator } = await import('./paint-orchestrator.mjs');
    initPaintOrchestrator();

    document.dispatchEvent(new CustomEvent('slides:restore-scene', {
      detail: { slideIdx: 1 },
    }));

    await new Promise(r => setTimeout(r, 10));

    expect(restoreScene).toHaveBeenCalledWith(1);
  });
});
