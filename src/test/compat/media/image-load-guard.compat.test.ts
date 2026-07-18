import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllMangaImageLoadFailures,
  isMangaImageLoadBlocked,
  mangaImageLoadBlockedHint,
  rememberMangaImageLoadFailure,
} from '@/lib/media/image/image-load-guard';

describe('image-load-guard', () => {
  beforeEach(() => {
    clearAllMangaImageLoadFailures();
  });

  it('mangaImageLoadBlockedHint 在冷却期内返回提示', () => {
    const url = 'https://example.com/page/1.jpg';
    for (let i = 0; i < 5; i++) {
      rememberMangaImageLoadFailure(url, 'src-a');
    }
    expect(isMangaImageLoadBlocked(url, 'src-a')).toBe(true);
    expect(mangaImageLoadBlockedHint(url, 'src-a')).toContain('后可重试');
  });

  it('未阻断时不返回 hint', () => {
    expect(mangaImageLoadBlockedHint('https://example.com/a.jpg', 'src-a')).toBeNull();
  });
});
