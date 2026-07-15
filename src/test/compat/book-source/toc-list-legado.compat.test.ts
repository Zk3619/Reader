import { describe, expect, it } from 'vitest';
import { analyzeListElements } from '@/lib/rule-engine';
import { selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';
import { buildRelaxedTocXPathListRule } from '@/lib/book-source/chapters';
import { getChapterList } from '@/lib/book-source/chapters';
import type { BookSource } from '@/types';

const TOC_HTML = `
<body>
<dl>
  <dt>第一部</dt>
  <dd><a href="/read/1.html" title="更新">第01章、测试 (12-02)</a></dd>
  <dd><a href="/read/2.html">第02章、测试二 (12-02)</a></dd>
</dl>
<div class="pagetitle"><a href="/book/6963.html">返回</a></div>
</body>`;

describe('目录列表 Legado getElements', () => {
  const baseUrl = 'https://bachashuku.org/book/6963_1.html';

  it('selectElementsOuterHtml 解析 dl dd,dt', () => {
    const items = selectElementsOuterHtml('dl dd,dt', TOC_HTML);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('analyzeListElements 每项单独 dd/dt 而非整页', async () => {
    const items = await analyzeListElements('dl dd,dt', {
      content: TOC_HTML,
      contentType: 'html',
      baseUrl,
      result: TOC_HTML,
    });
    expect(items.length).toBeGreaterThanOrEqual(3);
    const chapterItem = items.find((i) => i.content.includes('第01章'));
    expect(chapterItem).toBeDefined();
    expect(chapterItem!.content.length).toBeLessThan(TOC_HTML.length / 2);
  });

  it('章节 a@href 在单条 dd 上 isUrl 取首个', async () => {
    const dd = '<dd><a href="/read/1.html">第01章</a></dd>';
    const url = await analyzeString('a@href', {
      content: dd,
      contentType: 'html',
      baseUrl,
      result: dd,
    }, { isUrl: true });
    expect(url).toBe('/read/1.html');
    expect(url).not.toContain('\n');
  });

  it('chapterList XPath 含 [n] 时可生成回退规则', () => {
    const relaxed = buildRelaxedTocXPathListRule(
      '//div[@class="card mt20"][2]//ul[@class="dirlist clearfix"]/li@all',
    );
    expect(relaxed).toBe('//div[@class="card mt20"]//ul[@class="dirlist clearfix"]/li@all');
  });

  it('chapterList 含 <js> 且首轮为空时可直解 tailRule', async () => {
    const source = {
      sourceName: 'terry-test',
      sourceUrl: 'https://m.terry-haass.com',
      bookSourceUrl: 'https://m.terry-haass.com',
      enabledCookieJar: true,
      sourceType: 0,
      ruleToc: {
        chapterList:
          '<js>\nresult = "";\nresult;\n</js>\nclass.zj_list@dd',
        chapterName: 'a@text',
        chapterUrl: 'a@href',
      },
    } as unknown as BookSource;
    const html =
      '<dl class="zj_list"><dd><a href="/721975/1.html">第一章</a></dd></dl>';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    try {
      const chapters = await getChapterList(source, 'https://m.terry-haass.com/721975/');
      expect(chapters.length).toBe(1);
      expect(chapters[0]?.title).toContain('第一章');
      expect(chapters[0]?.url).toContain('/721975/1.html');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('当前目录页无章节时不再请求 nextTocUrl', async () => {
    const source = {
      sourceName: 'empty-toc-test',
      sourceUrl: 'https://example.com',
      bookSourceUrl: 'https://example.com',
      enabledCookieJar: false,
      sourceType: 0,
      ruleToc: {
        chapterList: 'dl@dd',
        chapterName: 'a@text',
        chapterUrl: 'a@href',
        nextTocUrl: '/toc/page-2',
      },
    } as unknown as BookSource;
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response('<html><body><dl></dl></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
    try {
      const chapters = await getChapterList(source, 'https://example.com/toc/page-1');
      expect(chapters).toEqual([]);
      expect(fetchCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
