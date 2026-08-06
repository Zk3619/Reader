import { describe, expect, it } from 'vitest';
import {
  GMP_FLOAT_EDGE_THRESHOLD,
  clampGmpFloatPos,
  defaultGmpFloatPos,
  detectGmpFloatEdge,
  gmpFloatEdgeHiddenOffset,
  nearestGmpFloatEdge,
  normalizeMediaPlayerFloat,
  nudgeGmpFloatOffEdge,
  snapGmpFloatToEdge,
} from '@/lib/viewer/global-media-player-float-pos';

describe('global-media-player-float-pos', () => {
  it('clamps inside viewport with margin', () => {
    expect(clampGmpFloatPos(-100, -50, 200, 60)).toEqual({ left: 12, top: 12 });
  });

  it('defaults to bottom-center away from edge threshold', () => {
    const width = 320;
    const height = 72;
    const pos = defaultGmpFloatPos(width, height);
    const vw = typeof window !== 'undefined' ? window.innerWidth : Math.max(width + 24, 1280);
    const vh = typeof window !== 'undefined' ? window.innerHeight : Math.max(height + 24, 800);
    expect(pos.left).toBeCloseTo((vw - width) / 2, 0);
    expect(pos.top).toBeGreaterThan(vh / 2);
    expect(detectGmpFloatEdge(pos.left, pos.top, width, height)).toBe('none');
  });

  it('detects nearest edge within threshold', () => {
    expect(detectGmpFloatEdge(8, 100, 200, 60)).toBe('left');
    expect(detectGmpFloatEdge(100, 4, 200, 60)).toBe('top');
    expect(detectGmpFloatEdge(200, 200, 100, 60)).toBe('none');
    expect(GMP_FLOAT_EDGE_THRESHOLD).toBeGreaterThan(0);
  });

  it('computes peek offsets for edge hide', () => {
    expect(gmpFloatEdgeHiddenOffset('left', 320, 64).x).toBeLessThan(0);
    expect(gmpFloatEdgeHiddenOffset('right', 320, 64).x).toBeGreaterThan(0);
    expect(gmpFloatEdgeHiddenOffset('top', 320, 64).y).toBeLessThan(0);
    expect(gmpFloatEdgeHiddenOffset('none', 320, 64)).toEqual({ x: 0, y: 0 });
  });

  it('snaps to edge inset', () => {
    const snapped = snapGmpFloatToEdge({ left: 40, top: 80 }, 'left', 200, 60);
    expect(snapped.left).toBe(12);
    expect(snapped.top).toBe(80);
  });

  it('nudges position out of edge threshold', () => {
    const nudged = nudgeGmpFloatOffEdge({ left: 12, top: 100 }, 200, 60);
    expect(detectGmpFloatEdge(nudged.left, nudged.top, 200, 60)).toBe('none');
    expect(nudged.left).toBeGreaterThan(GMP_FLOAT_EDGE_THRESHOLD);
  });

  it('picks nearest edge without threshold', () => {
    expect(nearestGmpFloatEdge(8, 400, 200, 60)).toBe('left');
    expect(nearestGmpFloatEdge(400, 4, 200, 60)).toBe('top');
  });

  it('normalizes mediaPlayerFloat snapshot', () => {
    expect(normalizeMediaPlayerFloat(null)).toBeUndefined();
    expect(normalizeMediaPlayerFloat({ left: 10, top: 20, edge: 'right' })).toEqual({
      left: 10,
      top: 20,
      edge: 'right',
    });
    expect(normalizeMediaPlayerFloat({ left: 'x', top: 1 })).toBeUndefined();
  });
});
