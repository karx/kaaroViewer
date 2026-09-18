import { vi, describe, it, expect, beforeEach } from 'vitest';
import { seedDOM, resetDOM } from './testSetup.mjs';

vi.mock('../logger.mjs', () => ({ log: vi.fn() }));
vi.mock('../pipeline/explore.mjs', () => ({
  explore: vi.fn(),
  rethink: vi.fn(),
}));
vi.mock('../pipeline/enrichment-coordinator.mjs', () => ({
  runEnrichment: vi.fn(() => Promise.resolve({ patches: [] })),
}));
vi.mock('../pipeline/completion.mjs', () => ({
  runCompletion: vi.fn(() => Promise.resolve()),
}));
vi.mock('../embed.mjs', () => ({
  notifyBriefReady: vi.fn(),
  EMBED_MODE: false,
}));
vi.mock('../pipeline/graph.mjs', () => ({
  graph: {
    nodes: { size: 0, values: vi.fn(() => []) },
    edges: { size: 0 },
    clear: vi.fn(),
    addNode: vi.fn(),
    addEdge: vi.fn(),
    hasNode: vi.fn(() => true),
  },
}));
vi.mock('./nodes.mjs', () => ({
  clearAllNodes: vi.fn(), addNodeMesh: vi.fn(), setNodeState: vi.fn(),
  updateNodeDegree: vi.fn(), clearNodeColorOverrides: vi.fn(),
}));
vi.mock('./edges.mjs', () => ({
  clearAllEdges: vi.fn(), addEdgeLine: vi.fn(), syncEdgePositions: vi.fn(),
}));
vi.mock('./layout.mjs', () => ({
  placeNode: vi.fn(() => [0, 0, 0]), runForceRelax: vi.fn(),
  setPosition: vi.fn(), clearLayout: vi.fn(),
}));
vi.mock('./breadcrumb.mjs', () => ({ clearCrumbs: vi.fn() }));
vi.mock('../ontology.mjs', () => ({ resolveEntityType: vi.fn(t => t) }));
vi.mock('./app-state.mjs', () => ({
  getActiveBrief: vi.fn(() => null),
  setActiveBrief: vi.fn(),
  getActivePatches: vi.fn(() => null),
  setActivePatches: vi.fn(),
  setLastLoadedDocId: vi.fn(),
  setCurrentDocMeta: vi.fn(),
}));
vi.mock('./brief-controller.mjs', () => ({ showBrief: vi.fn() }));

const { runExploration, runExpand, runRethink, loadBriefIntoCanvas } =
  await import('./exploration-pipeline.mjs');

const exploreMod     = await import('../pipeline/explore.mjs');
const enrichMod      = await import('../pipeline/enrichment-coordinator.mjs');
const completionMod  = await import('../pipeline/completion.mjs');
const embedMod       = await import('../embed.mjs');
const graphMod       = await import('../pipeline/graph.mjs');
const nodesMod       = await import('./nodes.mjs');
const edgesMod       = await import('./edges.mjs');
const layoutMod      = await import('./layout.mjs');
const appStateMod    = await import('./app-state.mjs');
const briefCtrlMod   = await import('./brief-controller.mjs');
const logMod         = await import('../logger.mjs');

const STUB_BRIEF = {
  meta: { id: 'doc-1', title: 'Test Brief' },
  nodes: [{ id: 'Q1', label: 'Node1', type: 'concept' }],
  edges: [],
  report_card: { spine: ['Q1'] },
};

describe('exploration-pipeline', () => {
  beforeEach(() => {
    resetDOM();
    vi.clearAllMocks();
    // Default: explore returns a stub brief
    exploreMod.explore.mockResolvedValue(STUB_BRIEF);
    exploreMod.rethink.mockResolvedValue(STUB_BRIEF);
    enrichMod.runEnrichment.mockResolvedValue({ patches: [] });
    completionMod.runCompletion.mockResolvedValue();
    appStateMod.getActiveBrief.mockReturnValue(null);
    appStateMod.getActivePatches.mockReturnValue(null);
    graphMod.graph.hasNode.mockReturnValue(true);
  });

  // ── runExploration ──────────────────────────────────────────────────────────

  describe('runExploration(seed)', () => {
    it('calls explore() with the seed string', async () => {
      await runExploration('Marie Curie');
      expect(exploreMod.explore).toHaveBeenCalledWith('Marie Curie');
    });

    it('calls setActiveBrief with the returned brief', async () => {
      await runExploration('Marie Curie');
      expect(appStateMod.setActiveBrief).toHaveBeenCalledWith(STUB_BRIEF);
    });

    it('shows the loader before calling explore (canvas-loader loses hidden class)', async () => {
      let loaderVisibleDuringExplore = false;
      exploreMod.explore.mockImplementation(async () => {
        const el = document.getElementById('canvas-loader');
        loaderVisibleDuringExplore = !el.classList.contains('hidden');
        return STUB_BRIEF;
      });
      await runExploration('test seed');
      expect(loaderVisibleDuringExplore).toBe(true);
    });

    it('hides the loader after pipeline completes', async () => {
      await runExploration('test seed');
      // After hide the element gets hidden class back (async with 380ms timeout)
      // We only check that classList.add('hidden') was scheduled — the element starts with opacity 0
      const el = document.getElementById('canvas-loader');
      // opacity is set to 0 during hide transition
      expect(el.style.opacity).toBe('0');
    });

    it('calls showBrief with the brief after canvas load', async () => {
      await runExploration('test seed');
      expect(briefCtrlMod.showBrief).toHaveBeenCalledWith(STUB_BRIEF);
    });

    it('when explore throws: hides the loader and calls log ERROR', async () => {
      exploreMod.explore.mockRejectedValue(new Error('LLM down'));
      await runExploration('bad seed');
      const el = document.getElementById('canvas-loader');
      expect(el.style.opacity).toBe('0');
      expect(logMod.log).toHaveBeenCalledWith(
        'ERROR',
        expect.stringContaining('LLM down'),
        expect.anything(),
      );
    });
  });

  // ── runExpand ───────────────────────────────────────────────────────────────

  describe('runExpand(deltas)', () => {
    it('when getActiveBrief() returns null: logs "no active brief" and returns without calling runEnrichment', async () => {
      appStateMod.getActiveBrief.mockReturnValue(null);
      await runExpand([]);
      expect(enrichMod.runEnrichment).not.toHaveBeenCalled();
      expect(logMod.log).toHaveBeenCalledWith(
        'SYSTEM',
        expect.stringContaining('no active brief'),
      );
    });

    it('when brief exists: calls runEnrichment', async () => {
      appStateMod.getActiveBrief.mockReturnValue(STUB_BRIEF);
      await runExpand([]);
      expect(enrichMod.runEnrichment).toHaveBeenCalled();
    });
  });

  // ── runRethink ──────────────────────────────────────────────────────────────

  describe('runRethink(deltas)', () => {
    it('when getActiveBrief() returns null: returns early without calling rethink', async () => {
      appStateMod.getActiveBrief.mockReturnValue(null);
      await runRethink([]);
      expect(exploreMod.rethink).not.toHaveBeenCalled();
    });
  });

  // ── loadBriefIntoCanvas ─────────────────────────────────────────────────────

  describe('loadBriefIntoCanvas(brief)', () => {
    it('calls graph.clear(), clearAllNodes(), clearAllEdges()', () => {
      loadBriefIntoCanvas(STUB_BRIEF);
      expect(graphMod.graph.clear).toHaveBeenCalled();
      expect(nodesMod.clearAllNodes).toHaveBeenCalled();
      expect(edgesMod.clearAllEdges).toHaveBeenCalled();
    });
  });
});
