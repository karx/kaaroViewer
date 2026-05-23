/**
 * canvas/paint-context.test.mjs — Unit tests for describeCameraAngle and assemblePaintContext.
 */

import { describe, it, expect } from 'vitest';
import { describeCameraAngle, assemblePaintContext } from './paint-context.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakeCamera(x, y, z) {
  return { position: { x, y, z } };
}

// ── describeCameraAngle ───────────────────────────────────────────────────────

describe('describeCameraAngle', () => {
  it('overhead position → aerial overhead view, elevation > 55', () => {
    const result = describeCameraAngle(fakeCamera(0, 100, 0));
    expect(result.phrase).toBe('aerial overhead view');
    expect(result.elevation).toBeGreaterThan(55);
  });

  it('high angle position → high angle establishing shot', () => {
    const result = describeCameraAngle(fakeCamera(0, 40, 30));
    expect(result.phrase).toBe('high angle establishing shot');
  });

  it('eye-level position → eye-level cinematic shot', () => {
    const result = describeCameraAngle(fakeCamera(0, 5, 30));
    expect(result.phrase).toBe('eye-level cinematic shot');
  });

  it('low angle position → low angle, looking upward', () => {
    const result = describeCameraAngle(fakeCamera(0, -20, 10));
    expect(result.phrase).toBe('low angle, looking upward');
  });

  it('position (10, 0, 0) → azimuth ~90° → compass E', () => {
    const result = describeCameraAngle(fakeCamera(10, 0, 0));
    expect(result.compass).toBe('E');
  });

  it('position (0, 0, 10) → azimuth ~0° → compass N', () => {
    const result = describeCameraAngle(fakeCamera(0, 0, 10));
    expect(result.compass).toBe('N');
  });

  it('position (-10, 0, 0) → azimuth ~-90° → compass W', () => {
    const result = describeCameraAngle(fakeCamera(-10, 0, 0));
    expect(result.compass).toBe('W');
  });

  it('position (0, 0, -10) → azimuth ~180° → compass S', () => {
    const result = describeCameraAngle(fakeCamera(0, 0, -10));
    expect(result.compass).toBe('S');
  });

  it('returns numeric azimuth and elevation fields', () => {
    const result = describeCameraAngle(fakeCamera(5, 5, 5));
    expect(typeof result.azimuth).toBe('number');
    expect(typeof result.elevation).toBe('number');
  });
});

// ── assemblePaintContext ──────────────────────────────────────────────────────

describe('assemblePaintContext', () => {
  it('empty opts → safe defaults for all fields', () => {
    const ctx = assemblePaintContext();
    expect(ctx.slideIdx).toBeNull();
    expect(ctx.slideType).toBeNull();
    expect(ctx.slideCentral).toBeNull();
    expect(ctx.slideNodes).toEqual([]);
    expect(ctx.cameraAngle).toBeNull();
    expect(ctx.visibleNodes).toEqual([]);
    expect(ctx.selectedNode).toBeNull();
  });

  it('with camera → cameraAngle is populated', () => {
    const ctx = assemblePaintContext({ camera: fakeCamera(0, 100, 0) });
    expect(ctx.cameraAngle).not.toBeNull();
    expect(ctx.cameraAngle.phrase).toBe('aerial overhead view');
  });

  it('without camera → cameraAngle is null', () => {
    const ctx = assemblePaintContext({ slideIdx: 1 });
    expect(ctx.cameraAngle).toBeNull();
  });

  it('partial opts pass through correctly', () => {
    const node  = { qid: 'Q1', label: 'Alpha', type: 'concept' };
    const nodes = [node, { qid: 'Q2', label: 'Beta', type: 'event' }];
    const ctx   = assemblePaintContext({
      slideIdx:     2,
      slideType:    'beat',
      slideCentral: node,
      slideNodes:   nodes,
      visibleNodes: [node],
      selectedNode: node,
    });
    expect(ctx.slideIdx).toBe(2);
    expect(ctx.slideType).toBe('beat');
    expect(ctx.slideCentral).toBe(node);
    expect(ctx.slideNodes).toBe(nodes);
    expect(ctx.visibleNodes).toEqual([node]);
    expect(ctx.selectedNode).toBe(node);
  });
});
