import { describe, expect, it } from 'vitest';
import type { BookSource } from '@/types';
import {
  resolveExploreAuthor,
  resolveExploreParseRule,
  exploreBook,
} from '@/lib/book-source/explore';
import { analyzeListElements, analyzeString, analyzeRule } from '@/lib/rule-engine';

const BANZHU_HTML = `
<ul>
  <li class="column-2 ">
    <div class="right">
      <a class="name" href="/53/53386/">我的邪恶app</a>
      <p class="update">最新章节：<a href="/53/53386/10375.html">章节名</a></p>
      <p class="info">作者：<a href="/author/LL什么的" class="author">LL什么的</a>
      <span class="words">字数：259339</span></p>
    </div>
  </li>
</ul>`;

const SOURCE = {
  bookSourceUrl: 'https://banzhu66666.net/',
  sourceUrl: 'https://www.banzhu77777777.net/',
  bookSourceName: 'banzhu',
  bookSourceType: 0,
  loginUrl: '',
  ruleExplore: {},
  ruleSearch: {
    author: '##作者：(.*?)\\<##$1###',
    bookList: '.column-2',
    bookUrl: 'a.0@href',
    lastChapter: 'a.1@text',
    name: 'a.0@text',
    wordCount: '.words@text##字数：',
  },
} as unknown as BookSource;

describe('explore ruleExplore → ruleSearch fallback', () => {
  it('空 ruleExplore 时回退 ruleSearch', () => {
    const rule = resolveExploreParseRule(SOURCE);
    expect(rule?.bookList).toBe('.column-2');
    expect(rule?.name).toBe('a.0@text');
  });

  it('banzhu 列表 HTML 可按 ruleSearch 解析书名', async () => {
    const rule = resolveExploreParseRule(SOURCE)!;
    const baseUrl = 'https://www.banzhu77777777.net/shuku/0-lastupdate-0-1.html';
    const context = {
      content: BANZHU_HTML,
      contentType: 'html' as const,
      baseUrl,
    };
    const items = await analyzeListElements(`${rule.bookList}@all`, context);
    expect(items.length).toBe(1);
    const name = await analyzeString(rule.name!, {
      ...context,
      content: items[0].content,
    });
    expect(name).toContain('我的邪恶app');
  });

  it('banzhu author ##…## 与 wordCount .words@text##字数：', async () => {
    const rule = resolveExploreParseRule(SOURCE)!;
    const baseUrl = 'https://www.banzhu77777777.net/shuku/0-lastupdate-0-1.html';
    const items = await analyzeListElements(`${rule.bookList}@all`, {
      content: BANZHU_HTML,
      contentType: 'html',
      baseUrl,
    });
    const ctx = { content: items[0].content, contentType: 'html' as const, baseUrl };
    const author = await resolveExploreAuthor(rule.author, ctx);
    const wordCount = await analyzeString(rule.wordCount!, ctx);
    expect(author).toBe('LL什么的');
    expect(wordCount).toContain('259339');
  });

  it('replaceFirst ### 使用 $1 反向引用（OnlyOne 仅返回首处替换结果）', async () => {
    const results = await analyzeRule('##foo(\\d+)##$1###', {
      content: 'foo123bar',
      contentType: 'html',
      baseUrl: 'https://example.com/',
    });
    expect(results[0]).toBe('123');
  });

  it('@text/@href 规则在 dd 行上可回退提取 a 文本与 href', async () => {
    const source = {
      ...SOURCE,
      ruleExplore: {
        bookList: 'dd',
        name: '@text',
        bookUrl: '@href',
      },
      sourceUrl: 'https://example.com',
      exploreUrl: 'https://example.com/x.html',
    } as unknown as BookSource;
    const html = '<dl><dd><a href="/book/1.html">测试书名</a></dd></dl>';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    try {
      const list = await exploreBook(source, 1, source.exploreUrl);
      expect(list.length).toBe(1);
      expect(list[0]?.name).toBe('测试书名');
      expect(list[0]?.bookUrl).toContain('/book/1.html');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
