import { vi, describe, it, expect, beforeEach } from 'vitest';
import { seedDOM, resetDOM } from './testSetup.mjs';

vi.mock('../pipeline/sessions.mjs', () => ({
  saveSession:   vi.fn().mockResolvedValue({ id: 's1', name: 'Test' }),
  listSessions:  vi.fn().mockResolvedValue([]),
  loadSession:   vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./app-state.mjs', () => ({ getActiveBrief: vi.fn(() => null) }));
vi.mock('../logger.mjs', () => ({ log: vi.fn() }));
vi.mock('./scene.mjs', () => ({
  getCamera:       vi.fn(() => ({ position: { clone: () => ({}), toArray: () => [0,0,0] } })),
  getControls:     vi.fn(() => ({ target: { clone: () => ({}), toArray: () => [0,0,0] }, update: vi.fn() })),
  animateCameraTo: vi.fn(),
}));
vi.mock('../pipeline/graph.mjs', () => ({
  graph: {
    nodes: { values: () => [], size: 0 },
    edges: { values: () => [], size: 0 },
    clear:   vi.fn(),
    addNode: vi.fn(),
    addEdge: vi.fn(),
    getNode: vi.fn(() => null),
  },
}));
vi.mock('./nodes.mjs', () => ({
  clearAllNodes:          vi.fn(),
  addNodeMesh:            vi.fn(),
  setNodeState:           vi.fn(),
  updateNodeDegree:       vi.fn(),
  dimAllExcept:           vi.fn(),
  clearDim:               vi.fn(),
  setNodeColorOverride:   vi.fn(),
  clearNodeColorOverrides: vi.fn(),
}));
vi.mock('./edges.mjs', () => ({
  clearAllEdges:    vi.fn(),
  addEdgeLine:      vi.fn(),
  syncEdgePositions: vi.fn(),
}));
vi.mock('./layout.mjs', () => ({
  placeNode:    vi.fn(() => [0, 0, 0]),
  runForceRelax: vi.fn(),
  getPosition:  vi.fn(),
  setPosition:  vi.fn(),
  clearLayout:  vi.fn(),
}));
vi.mock('./breadcrumb.mjs', () => ({
  clearCrumbs: vi.fn(),
  pushCrumb:   vi.fn(),
  getCrumbs:   vi.fn(() => []),
}));
vi.mock('../ontology.mjs', () => ({ resolveEntityType: vi.fn(t => t) }));

describe('session-manager', () => {
  let initSessionManager, toggleSessionsDrawer;
  let listSessions;

  beforeEach(async () => {
    resetDOM();
    vi.resetModules();

    // Re-mock after resetModules so fresh module state
    vi.mock('../pipeline/sessions.mjs', () => ({
      saveSession:   vi.fn().mockResolvedValue({ id: 's1', name: 'Test' }),
      listSessions:  vi.fn().mockResolvedValue([]),
      loadSession:   vi.fn().mockResolvedValue(null),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    }));

    const mod = await import('./session-manager.mjs');
    initSessionManager    = mod.initSessionManager;
    toggleSessionsDrawer  = mod.toggleSessionsDrawer;

    const sessionsMod = await import('../pipeline/sessions.mjs');
    listSessions = sessionsMod.listSessions;
  });

  it('initSessionManager() attaches click listener to sessions-btn without throwing', () => {
    expect(() => initSessionManager()).not.toThrow();
    // sessions-btn must exist in DOM (seeded by resetDOM)
    const btn = document.getElementById('sessions-btn');
    expect(btn).not.toBeNull();
  });

  it('toggleSessionsDrawer() with no arg opens drawer on first call', async () => {
    initSessionManager();
    await toggleSessionsDrawer();
    const wrap = document.getElementById('sessions-wrap');
    expect(wrap.classList.contains('open')).toBe(true);
  });

  it('toggleSessionsDrawer() second call removes open class (toggles back)', async () => {
    initSessionManager();
    await toggleSessionsDrawer(); // open
    await toggleSessionsDrawer(); // close
    const wrap = document.getElementById('sessions-wrap');
    expect(wrap.classList.contains('open')).toBe(false);
  });

  it('toggleSessionsDrawer(true) forces open', async () => {
    initSessionManager();
    // Start closed, force open
    await toggleSessionsDrawer(true);
    const wrap = document.getElementById('sessions-wrap');
    expect(wrap.classList.contains('open')).toBe(true);
  });

  it('toggleSessionsDrawer(false) forces closed', async () => {
    initSessionManager();
    await toggleSessionsDrawer(true);  // open first
    await toggleSessionsDrawer(false); // force close
    const wrap = document.getElementById('sessions-wrap');
    expect(wrap.classList.contains('open')).toBe(false);
  });

  it('toggleSessionsDrawer(true) calls listSessions()', async () => {
    initSessionManager();
    await toggleSessionsDrawer(true);
    expect(listSessions).toHaveBeenCalled();
  });

  it('when listSessions returns empty array, drawer contains "No saved sessions"', async () => {
    listSessions.mockResolvedValue([]);
    initSessionManager();
    await toggleSessionsDrawer(true);
    const drawer = document.getElementById('sessions-drawer');
    expect(drawer.innerHTML).toContain('No saved sessions');
  });
});
