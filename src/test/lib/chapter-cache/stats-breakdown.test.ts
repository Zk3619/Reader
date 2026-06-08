import { describe, expect, it } from 'vitest';

import { sumChapterCacheBreakdownBytes } from '@/lib/chapter-cache/stats';

describe('sumChapterCacheBreakdownBytes', () => {
  it('sums body, manga images, and reserved media playback bytes', () => {
    expect(
      sumChapterCacheBreakdownBytes({
        bodyBytes: 1024,
        mangaImageCount: 3,
        mangaImageBytes: 2048,
        mediaPlaybackBytes: 0,
      }),
    ).toBe(3072);
  });
});
