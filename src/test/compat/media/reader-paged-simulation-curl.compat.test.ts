import { describe, expect, it } from 'vitest';
import {
  computeCurlCorner,
  computeSimulationCurl,
  legadoSimulationTouchY,
  lineCross,
  simulationAnimEndTouch,
  simulationAnimStartPoint,
  simulationDragCommitAllowed,
  simulationDragIntentFromOffset,
} from '@/lib/media/text/reader-paged-simulation-curl';

describe('computeCurlCorner', () => {
  it('next: left-half start mirrors x (Legado setDirection)', () => {
    // startX=100 < 200 → calcCornerXY(300, startY)
    expect(computeCurlCorner(100, 120, 400, 600, 'next')).toEqual({ x: 400, y: 0 });
    expect(computeCurlCorner(100, 500, 400, 600, 'next')).toEqual({ x: 400, y: 600 });
  });
  it('next: right-half start uses calcCornerXY(startX, startY)', () => {
    expect(computeCurlCorner(300, 100, 400, 600, 'next')).toEqual({ x: 400, y: 0 });
  });
  it('prev: bottom corner from mirrored or direct startX', () => {
    expect(computeCurlCorner(300, 500, 400, 600, 'prev')).toEqual({ x: 400, y: 600 });
    // startX 在左半：mirror 为 320 → 右下页脚
    expect(computeCurlCorner(80, 500, 400, 600, 'prev')).toEqual({ x: 400, y: 600 });
    // 点击上一页：Legado prevPageByAnim 起点 (0, viewHeight)
    expect(computeCurlCorner(0, 600, 400, 600, 'prev')).toEqual({ x: 400, y: 600 });
  });
});

describe('simulationAnimStartPoint', () => {
  it('matches Legado prevPageByAnim / nextPageByAnim defaults', () => {
    expect(simulationAnimStartPoint('prev', 400, 600)).toEqual({ x: 0, y: 600 });
    expect(simulationAnimStartPoint('next', 400, 600)).toEqual({ x: 360, y: 1 });
  });
});

describe('simulationAnimEndTouch', () => {
  it('prev scrolls touch to the right even when corner is bottom-right', () => {
    const corner = { x: 400, y: 600 };
    expect(simulationAnimEndTouch(corner, 400, 600, 'prev')).toEqual({ x: 600, y: 570 });
  });
  it('next scrolls touch to the left when corner is bottom-right', () => {
    const corner = { x: 400, y: 600 };
    expect(simulationAnimEndTouch(corner, 400, 600, 'next')).toEqual({ x: -200, y: 570 });
  });
});

describe('simulationDragIntentFromOffset', () => {
  it('left half: only prev; right half: only next', () => {
    expect(simulationDragIntentFromOffset(20, 100, 400, 8)).toBe('prev');
    expect(simulationDragIntentFromOffset(-20, 100, 400, 8)).toBe('neutral');
    expect(simulationDragIntentFromOffset(-20, 300, 400, 8)).toBe('next');
    expect(simulationDragIntentFromOffset(20, 300, 400, 8)).toBe('neutral');
  });
});

describe('simulationDragCommitAllowed', () => {
  it('matches half-screen drag direction', () => {
    expect(simulationDragCommitAllowed(50, 80, 400)).toBe(true);
    expect(simulationDragCommitAllowed(-50, 80, 400)).toBe(false);
    expect(simulationDragCommitAllowed(-50, 320, 400)).toBe(true);
    expect(simulationDragCommitAllowed(50, 320, 400)).toBe(false);
  });

  it('respects configurable zone width (25% / 75%)', () => {
    expect(simulationDragCommitAllowed(50, 90, 400, 25)).toBe(true);
    expect(simulationDragCommitAllowed(-50, 90, 400, 25)).toBe(false);
    expect(simulationDragCommitAllowed(-50, 110, 400, 25)).toBe(true);

    expect(simulationDragCommitAllowed(50, 280, 400, 75)).toBe(true);
    expect(simulationDragCommitAllowed(-50, 280, 400, 75)).toBe(false);
    expect(simulationDragCommitAllowed(-50, 320, 400, 75)).toBe(true);
  });
});

describe('simulationDragIntentFromOffset zone', () => {
  it('25% left zone blocks next intent', () => {
    expect(simulationDragIntentFromOffset(-20, 80, 400, 8, 25)).toBe('neutral');
    expect(simulationDragIntentFromOffset(20, 80, 400, 8, 25)).toBe('prev');
    expect(simulationDragIntentFromOffset(-20, 120, 400, 8, 25)).toBe('next');
  });
});

describe('legadoSimulationTouchY', () => {
  it('pins touchY for middle-band horizontal drags', () => {
    expect(legadoSimulationTouchY(300, 250, 600, 'prev')).toBe(600);
    expect(legadoSimulationTouchY(300, 250, 600, 'next')).toBe(600);
    expect(legadoSimulationTouchY(210, 250, 600, 'next')).toBe(1);
    expect(legadoSimulationTouchY(100, 250, 600, 'next')).toBe(250);
  });

  it('follows finger Y for bottom-half / bottom-corner starts', () => {
    expect(legadoSimulationTouchY(450, 200, 600, 'next')).toBe(200);
    expect(legadoSimulationTouchY(520, 180, 600, 'prev')).toBe(180);
  });
});

describe('lineCross', () => {
  it('finds intersection of two lines', () => {
    const p = lineCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(5, 3);
    expect(p.y).toBeCloseTo(5, 3);
  });
  it('handles a vertical line without dividing by zero', () => {
    const p = lineCross({ x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 2 }, { x: 10, y: 2 });
    expect(p.x).toBeCloseTo(5, 3);
    expect(p.y).toBeCloseTo(2, 3);
    expect(Number.isFinite(p.x)).toBe(true);
  });
});

describe('computeSimulationCurl', () => {
  it('keeps Legado control/start invariants for a bottom-right next curl', () => {
    const g = computeSimulationCurl({
      touchX: 200,
      touchY: 500,
      cornerX: 400,
      cornerY: 600,
      width: 400,
      height: 600,
    });
    // control1.y == cornerY, control2.x == cornerX, start1.y == cornerY
    expect(g.control1.y).toBe(600);
    expect(g.control2.x).toBe(400);
    expect(g.start1.y).toBe(600);
    // 所有关键点有限
    for (const p of [g.control1, g.control2, g.start1, g.start2, g.end1, g.end2, g.vertex1, g.vertex2]) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // bottom-right 属于「右上左下」之外 → isRtOrLb=false
    expect(g.isRtOrLb).toBe(false);
  });

  it('emits clip-path strings: evenodd flat region + curl/next/back paths', () => {
    const g = computeSimulationCurl({
      touchX: 220,
      touchY: 480,
      cornerX: 400,
      cornerY: 600,
      width: 400,
      height: 600,
    });
    expect(g.pageMinusCurlPath.startsWith('M0 0 L400 0 L400 600 L0 600 Z')).toBe(true);
    expect(g.curlFootprintPath).toContain('Q');
    expect(g.nextAreaPath.startsWith('M ')).toBe(true);
    expect(g.backAreaPath.startsWith('M ')).toBe(true);
  });

  it('back reflection matrix is symmetric (b == c) like a mirror', () => {
    const g = computeSimulationCurl({
      touchX: 180,
      touchY: 520,
      cornerX: 400,
      cornerY: 600,
      width: 400,
      height: 600,
    });
    const [, b, c] = g.backMatrix;
    expect(b).toBeCloseTo(c, 5);
  });

  it('marks bottom-left (prev) corner as isRtOrLb', () => {
    const g = computeSimulationCurl({
      touchX: 120,
      touchY: 520,
      cornerX: 0,
      cornerY: 600,
      width: 400,
      height: 600,
    });
    expect(g.isRtOrLb).toBe(true);
  });

  it('transitions start1.x smoothly along left-up drag (bottom-right corner)', () => {
    const W = 400;
    const H = 600;
    const base = { cornerX: W, cornerY: H, width: W, height: H };
    const start1xs: number[] = [];
    // 模拟图一附近继续向左上拖：每步小位移
    for (let i = 0; i <= 24; i++) {
      const tx = 220 - i * 7;
      const ty = 380 - i * 12;
      start1xs.push(computeSimulationCurl({ touchX: tx, touchY: ty, ...base }).start1.x);
    }
    let maxDelta = 0;
    for (let i = 1; i < start1xs.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(start1xs[i]! - start1xs[i - 1]!));
    }
    expect(maxDelta).toBeLessThan(120);
    expect(start1xs.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('keeps fold anchor inside viewport when dragging from bottom-right to left edge', () => {
    const W = 400;
    const H = 600;
    const base = { cornerX: W, cornerY: H, width: W, height: H };
    for (const tx of [0, 20, 50, 100, 200]) {
      const g = computeSimulationCurl({ touchX: tx, touchY: H, ...base });
      expect(g.start1.x).toBeGreaterThanOrEqual(0);
      expect(g.start1.x).toBeLessThanOrEqual(W);
      expect(g.touch.x).toBeGreaterThanOrEqual(0);
      expect(g.touch.x).toBeLessThanOrEqual(W);
      expect(g.vertex1.x).toBeGreaterThanOrEqual(-1);
      expect(g.vertex1.x).toBeLessThanOrEqual(W + 1);
    }
  });
});
