import { describe, expect, it } from 'vitest';
import {
  computeCurlCorner,
  computeSimulationCurl,
  legadoSimulationTouchY,
  lineCross,
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
  });
});

describe('legadoSimulationTouchY', () => {
  it('pins touchY for prev and middle-band next drags', () => {
    expect(legadoSimulationTouchY(300, 250, 600, 'prev')).toBe(600);
    expect(legadoSimulationTouchY(300, 250, 600, 'next')).toBe(600);
    expect(legadoSimulationTouchY(210, 250, 600, 'next')).toBe(1);
    expect(legadoSimulationTouchY(100, 250, 600, 'next')).toBe(250);
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
});
