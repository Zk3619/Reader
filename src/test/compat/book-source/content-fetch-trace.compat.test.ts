import { describe, expect, it, vi } from 'vitest';
import {
  isContentFetchTraceEnabled,
  warnChapterCacheHit,
} from '@/lib/book-source/content-fetch-trace';

describe('content-fetch-trace', () => {
  it('DEV 下启用追踪', () => {
    expect(isContentFetchTraceEnabled()).toBe(true);
  });

  it('warnChapterCacheHit 输出缓存命中警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnChapterCacheHit(
      0,
      '<img src="a.webp"><img src="b.webp">',
      '第1话',
    );
    expect(warn).toHaveBeenCalledWith(
      '[content] 章节缓存命中，未执行 ruleContent /content',
      expect.objectContaining({
        chapterIndex: 0,
        imgCount: 2,
        title: '第1话',
      }),
    );
    warn.mockRestore();
  });
});
