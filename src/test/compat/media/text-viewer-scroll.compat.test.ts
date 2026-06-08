import { describe, expect, it } from 'vitest';
import {
  findVisibleChapterProgress,
  scrollTopForChapterPos,
} from '@/lib/media/text/text-viewer-scroll';

describe('text-viewer-scroll', () => {
  const sections = [
    { index: 0, top: 0, height: 1000 },
    { index: 1, top: 1000, height: 800 },
    { index: 2, top: 1800, height: 600 },
  ];

  it('findVisibleChapterProgress picks chapter by viewport anchor', () => {
    const atFirst = findVisibleChapterProgress(100, 600, sections);
    expect(atFirst).toEqual({ chapterIndex: 0, chapterPos: expect.any(Number) });
    expect(atFirst!.chapterPos).toBeGreaterThan(0);
    expect(atFirst!.chapterPos).toBeLessThan(0.5);

    const atSecond = findVisibleChapterProgress(1100, 600, sections);
    expect(atSecond?.chapterIndex).toBe(1);

    const atEnd = findVisibleChapterProgress(2000, 600, sections);
    expect(atEnd).toEqual({ chapterIndex: 2, chapterPos: 1 });
  });

  it('scrollTopForChapterPos maps chapter ratio to container scroll', () => {
    expect(scrollTopForChapterPos(1000, 800, 600, 0)).toBe(1000);
    expect(scrollTopForChapterPos(1000, 800, 600, 1)).toBe(1200);
    expect(scrollTopForChapterPos(1000, 400, 600, 0.5)).toBe(800);
  });
});
