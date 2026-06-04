import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getContent } from '@/lib/book-source/content';
import sourceList from '../../../../examples/1780106748.json';
import type { Book, BookChapter, BookSource } from '@/types';

const CHAPTER_HTML = `<!DOCTYPE html><html><body><script>var player={"url":"abc123-vid","from":"gugu"};</script></body></html>`;

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/platform/open-url', () => ({
  openLegadoBrowserInApp: vi.fn(async () => undefined),
}));

vi.mock('@/lib/book-source/fetch-source-page', () => ({
  fetchChapterPageHtml: vi.fn(async () => CHAPTER_HTML),
}));

import { post } from '@/lib/http';
import { openLegadoBrowserInApp } from '@/lib/platform/open-url';

describe('咕咕番 getContent', () => {
  const source = (sourceList as unknown as BookSource[])[0];
  const chapter: BookChapter = {
    title: '第01集',
    url: '/index.php/vod/play/id/4973/sid/1/nid/1.html',
    index: 0,
    baseUrl: 'https://www.gugu3.com/',
    bookUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
    isVolume: false,
    isVip: false,
    isPay: false,
  };
  const book = {
    name: '测试番剧',
    bookUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
    origin: source.sourceUrl,
  } as Book;

  beforeEach(() => {
    vi.mocked(post).mockReset();
    vi.mocked(post).mockResolvedValue(JSON.stringify({ url: 'https://vod.example/play.m3u8' }));
    vi.mocked(openLegadoBrowserInApp).mockClear();
  });

  it('应返回占位正文并尝试打开内嵌播放页', async () => {
    const content = await getContent(source, chapter, undefined, book);
    expect(content).toContain('请刷新尝试播放');
    expect(vi.mocked(openLegadoBrowserInApp).mock.calls.length).toBeGreaterThan(0);
    expect(
      String(vi.mocked(openLegadoBrowserInApp).mock.calls[0]?.[0] ?? ''),
    ).toMatch(/artplayer\.php/i);
  });
});
