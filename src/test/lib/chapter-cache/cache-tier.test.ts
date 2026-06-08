import { describe, expect, it } from 'vitest';

import {
  CHAPTER_CACHE_TIER_AUTO,
  CHAPTER_CACHE_TIER_MANUAL,
  mergeChapterCacheTier,
  normalizeChapterCacheTier,
} from '@/lib/chapter-cache/cache-tier';

describe('chapter cache tier', () => {
  it('normalizes unknown values to auto', () => {
    expect(normalizeChapterCacheTier(undefined)).toBe(CHAPTER_CACHE_TIER_AUTO);
    expect(normalizeChapterCacheTier('manual')).toBe(CHAPTER_CACHE_TIER_MANUAL);
    expect(normalizeChapterCacheTier('other')).toBe(CHAPTER_CACHE_TIER_AUTO);
  });

  it('manual wins over auto and is sticky', () => {
    expect(mergeChapterCacheTier(undefined, CHAPTER_CACHE_TIER_AUTO)).toBe(
      CHAPTER_CACHE_TIER_AUTO,
    );
    expect(mergeChapterCacheTier(CHAPTER_CACHE_TIER_AUTO, CHAPTER_CACHE_TIER_MANUAL)).toBe(
      CHAPTER_CACHE_TIER_MANUAL,
    );
    expect(mergeChapterCacheTier(CHAPTER_CACHE_TIER_MANUAL, CHAPTER_CACHE_TIER_AUTO)).toBe(
      CHAPTER_CACHE_TIER_MANUAL,
    );
  });
});
