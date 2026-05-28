import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getContent } from '@/lib/book-source/content';
import type { BookSource } from '@/types';
import type { Book, BookChapter } from '@/types';
import { readFixture, readProjectFile } from '@/test/helpers/fixtures';

const CHAPTER_HTML = readFixture('bacha/chapter.html');
const CHAPTER_JS = readFixture('bacha/chapter.js');

vi.mock('@/lib/http', () => ({
  get: vi.fn(async (url: string) => {
    if (String(url).includes('352056.js')) return CHAPTER_JS;
    if (String(url).includes('read/6963/352056.html')) return CHAPTER_HTML;
    return '';
  }),
  post: vi.fn(async () => ''),
}));

vi.mock('@/lib/book-source/fetch-source-page', () => ({
  fetchChapterPageHtml: vi.fn(async () => CHAPTER_HTML),
}));

vi.mock('@/lib/book-source/login-check', () => ({
  assertLoginCheckPassed: vi.fn(async () => {}),
}));

vi.mock('@/lib/book-source/content-processor', () => ({
  processContent: vi.fn(async (c: string) => c),
  processImageStyle: vi.fn((c: string) => c),
}));

describe('八叉正文 ruleContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('从 j.*.js 解密正文（对齐 Legado java.ajax + document.write）', async () => {
    const sources = JSON.parse(readProjectFile('examples/shareBookSource.json')) as BookSource[];
    const source = sources.find((s) =>
      String(s.bookSourceName ?? s.sourceName ?? '').includes('八叉'),
    );
    if (!source) throw new Error('未在 shareBookSource.json 中找到八叉书源');

    const chapter: BookChapter = {
      url: 'https://bachashuku.org/read/6963/352056.html',
      title: '第02章',
      index: 10,
      bookUrl: 'https://bachashuku.org/book/6963.html',
      baseUrl: 'https://bachashuku.org/book/6963.html',
      isVolume: false,
      isVip: false,
      isPay: false,
    };

    const book = {
      bookUrl: chapter.bookUrl,
      name: '测试书',
      author: '作者',
      durChapterIndex: 10,
      origin: source.sourceUrl,
      originName: source.sourceName,
    } as Book;

    const content = await getContent(source, chapter, undefined, book, {
      skipReplaceRules: true,
    });

    expect(content).toBeTruthy();
    expect(content).toContain('图书馆');
    expect(content).not.toContain('内容加载失败');
  });
});
