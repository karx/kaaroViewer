import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./app-state.mjs', () => ({ getCurrentDocMeta: vi.fn() }));
vi.mock('../logger.mjs', () => ({ log: vi.fn() }));
// JSZip from importmap won't resolve in vitest — mock it too
vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(() => ({
    file: vi.fn(),
    generateAsync: vi.fn().mockResolvedValue(new Blob()),
  })),
}));
vi.mock('./slides.mjs', () => ({ getSlideCount: vi.fn(() => 0), getSlideIds: vi.fn(() => []) }));
vi.mock('./scene.mjs', () => ({
  getRenderer: vi.fn(),
  getCamera: vi.fn(() => ({ position: { clone: vi.fn(() => ({ copy: vi.fn() })) } })),
  getScene: vi.fn(),
  getControls: vi.fn(() => ({ target: { clone: vi.fn(() => ({ copy: vi.fn() })) } })),
}));
vi.mock('./scene-painter.mjs', () => ({
  getAllBackdrops: vi.fn(() => Promise.resolve([])),
  getCanonicalCamera: vi.fn(),
}));
vi.mock('../pipeline/graph.mjs', () => ({ graph: { nodes: { size: 0 }, edges: { size: 0 } } }));
vi.mock('../pipeline/local-graph.mjs', () => ({ LIBRARY: [] }));

import { getCurrentDocMeta } from './app-state.mjs';
import { log } from '../logger.mjs';
import { getAllBackdrops } from './scene-painter.mjs';
import JSZip from 'jszip';
import { exportCanvasPNG, exportAssets } from './export.mjs';

describe('export.mjs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports exportCanvasPNG and exportAssets as functions (smoke test)', () => {
    expect(typeof exportCanvasPNG).toBe('function');
    expect(typeof exportAssets).toBe('function');
  });

  describe('exportCanvasPNG', () => {
    it('calls log ERROR when no canvas element in DOM', () => {
      // jsdom has no .canvas-wrap canvas by default
      exportCanvasPNG();
      expect(log).toHaveBeenCalledWith('ERROR', 'no canvas found');
    });
  });

  describe('exportAssets', () => {
    it('bails early with log when getCurrentDocMeta() returns null', async () => {
      getCurrentDocMeta.mockReturnValue(null);
      await exportAssets();
      expect(log).toHaveBeenCalledWith('SYSTEM', 'no brief loaded — open a library doc first');
      expect(JSZip).not.toHaveBeenCalled();
    });

    it('calls log with asset export started message when meta is present', async () => {
      getCurrentDocMeta.mockReturnValue({ id: 'test-doc', title: 'Test Doc' });
      // Suppress URL.createObjectURL which doesn't exist in jsdom
      global.URL.createObjectURL = vi.fn(() => 'blob:mock');
      global.URL.revokeObjectURL = vi.fn();
      await exportAssets();
      expect(log).toHaveBeenCalledWith('SYSTEM', 'asset export started for "Test Doc"');
    });

    it('calls getAllBackdrops when meta is present', async () => {
      getCurrentDocMeta.mockReturnValue({ id: 'test-doc', title: 'Test Doc' });
      global.URL.createObjectURL = vi.fn(() => 'blob:mock');
      global.URL.revokeObjectURL = vi.fn();
      await exportAssets();
      expect(getAllBackdrops).toHaveBeenCalledWith('test-doc');
    });
  });
});
