import { describe, expect, it } from 'vitest';

import { collectPrefetchIndices } from '@/lib/chapter-cache/prefetch';
import type { ChapterCacheSettings } from '@/lib/chapter-cache/settings';

const base: ChapterCacheSettings = {
  forwardPrefetchNum: 0,
  backwardPrefetchNum: 0,
  maxBytesMb: 0,
  retentionDays: 0,
  mangaImageRetainNum: 2,
};

describe('collectPrefetchIndices', () => {
  it('collects forward chapters only', () => {
    expect(
      collectPrefetchIndices(5, 20, { ...base, forwardPrefetchNum: 3 }),
    ).toEqual([6, 7, 8]);
  });

  it('collects backward chapters with Legado cap', () => {
    expect(
      collectPrefetchIndices(10, 20, { ...base, backwardPrefetchNum: 10 }),
    ).toEqual([5, 6, 7, 8]);
  });

  it('backward=1 only caches previous chapter', () => {
    expect(
      collectPrefetchIndices(5, 20, { ...base, backwardPrefetchNum: 1 }),
    ).toEqual([4]);
  });

  it('merges forward and backward without overlap', () => {
    const indices = collectPrefetchIndices(5, 20, {
      ...base,
      forwardPrefetchNum: 2,
      backwardPrefetchNum: 2,
    });
    // 向后 n=2：仅 current-2（Legado 从 current-2 起、回溯 min(5,n)=2 章）
    expect(indices).toEqual([3, 6, 7]);
    expect(new Set(indices).size).toBe(indices.length);
  });
});
