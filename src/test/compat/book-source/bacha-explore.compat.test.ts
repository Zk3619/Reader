import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exploreBook } from '@/lib/book-source/explore';
import { formatWordCountLikeLegado } from '@/lib/book-source/search-format';
import { analyzeListElements, analyzeString, parseCss, type RuleContext } from '@/lib/rule-engine';
import type { BookSource } from '@/types';

const __dir = dirname(fileURLToPath(import.meta.url));
const exploreHtml = readFileSync(join(__dir, '../../../../tmp-explore.html'), 'utf8');

const BACHA_SOURCE: BookSource = {
  bookSourceName: '八叉测试',
  sourceName: '八叉测试',
  bookSourceUrl: 'https://bachashuku.org/',
  sourceUrl: 'https://bachashuku.org/',
  exploreUrl: '[]',
  enableExplore: true,
  lastUpdateTime: 0,
  respondTime: 0,
  weight: 0,
  eventListener: false,
  customButton: false,
  nextPageLazyLoad: false,
  ruleExplore: {
    author: 'td.1@a@span@text##.*\\/',
    bookList:
      '#jieqi_page_contents@tr\n<js>\nif (result.length===0){\n\tjava.toast("\\n🔍 该分类没有书籍");\n\tresult;\n\t}\nresult\t\n</js>',
    bookUrl: 'a@href',
    coverUrl:
      ".db@href\n@js:\nvar href = result;\nvar bookId = href.match(/book\\/(\\d+)/)?.[1] || '0';\nvar prefix;\nif (bookId.length <= 3) {\n\tprefix = '0';\n} else {\n\tprefix = bookId.slice(0, bookId.length - 3);\n}\n'https://image.8xsk.org/' + prefix + '/' + bookId + '/' + bookId + 's.jpg';",
    kind: '{{@@td.-1@text}}\n{{@@td.0@text}}',
    name: 'td.1@a@text##\\/.*',
    wordCount:
      "@js:\nvar a = java.getString('td.-2@text');\nif (/^\\d+$/.test(a)) {\nvar number = parseInt(a);\nvar w;\nif (number >= 10000) {\nw = (number / 10000).toFixed(2) + '万';\n} else if (number >= 1000) {\nw = (number / 1000).toFixed(2) + '千';\n} else {\nw = number;\n}    \nif (baseUrl.match(/weekvisit/)) {\nresult = '周点击:' + w;\n} else if (baseUrl.match(/monthvisit/)) {\nresult = '月点击:' + w;\n} else if (baseUrl.match(/allvisit/)) {\nresult = '总点击:' + w;\n} else if (baseUrl.match(/weekvote/)) {\nresult = '周推荐:' + w;\n} else if (baseUrl.match(/monthvote/)) {\nresult = '月推荐:' + w;\n} else if (baseUrl.match(/allvote/)) {\nresult = '总推荐:' + w;\n} else if (baseUrl.match(/weekflower/)) {\nresult = '周鲜花:' + w;\n} else if (baseUrl.match(/monthflower/)) {\nresult = '月鲜花:' + w;\n} else if (baseUrl.match(/allflower/)) {\nresult = '总鲜花:' + w;\n} else if (baseUrl.match(/allvipvote/)) {\nresult = '总月票:' + w;\n} else if (baseUrl.match(/goodnum/)) {\nresult = '收藏数:' + w;\n} else {\nresult = w + '字';\n}\n} else {\nresult = a;\n}",
  },
  enabled: true,
  enabledCookieJar: true,
  customOrder: 0,
  sourceType: 0,
};

const exploreUrl =
  'https://bachashuku.org/modules/article/articlefilter.php?order=lastupdate&page=1&sortid=1';

function rowContext(html: string): RuleContext {
  return {
    content: html,
    contentType: 'html',
    baseUrl: exploreUrl,
    source: BACHA_SOURCE as unknown as Record<string, unknown>,
    result: html,
  };
}

describe('八叉 explore 规则（本地 HTML）', () => {
  it('parseCss 应解析 tbody 内多行 tr', () => {
    const rows = parseCss('#jieqi_page_contents@tr', exploreHtml);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.some((r) => r.includes('谋臣'))).toBe(true);
  });

  it('bookList 应解析出多行 tr（含表头则至少 2 条）', async () => {
    const items = await analyzeListElements(BACHA_SOURCE.ruleExplore!.bookList!, {
      content: exploreHtml,
      contentType: 'html',
      baseUrl: exploreUrl,
      source: BACHA_SOURCE as unknown as Record<string, unknown>,
    });
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((i) => i.content.includes('谋臣'))).toBe(true);
  });

  it('单行应解析书名、作者、封面、字数', async () => {
    const tr = exploreHtml.match(/<tr>[\s\S]*?谋臣[\s\S]*?<\/tr>/)?.[0];
    expect(tr).toBeTruthy();
    const ctx = rowContext(tr!);
    const rule = BACHA_SOURCE.ruleExplore!;

    expect(parseCss('a@href', tr!)).toEqual([
      'https://bachashuku.org/book/25650.html',
    ]);
    const name = await analyzeString(rule.name!, ctx);
    const author = await analyzeString(rule.author!, ctx);
    const bookUrl = await analyzeString(rule.bookUrl!, ctx, { isUrl: true });
    const coverUrl = await analyzeString(rule.coverUrl!, ctx, { isUrl: true });
    const wordCount = formatWordCountLikeLegado(
      await analyzeString(rule.wordCount!, ctx),
    );

    expect(name.trim()).toBe('谋臣');
    expect(author.trim()).toContain('一只二花花啊');
    expect(bookUrl).toContain('/book/25650.html');
    expect(coverUrl).toBe('https://image.8xsk.org/25/25650/25650s.jpg');
    expect(wordCount).toMatch(/万|字/);
  });

  it('exploreBook 离线解析应返回多本书且首本有封面', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(exploreHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
    try {
      const list = await exploreBook(BACHA_SOURCE, 1, exploreUrl);
      expect(list.length).toBeGreaterThan(5);
      const first = list.find((b) => b.name.includes('谋臣'));
      expect(first?.coverUrl).toBe('https://image.8xsk.org/25/25650/25650s.jpg');
      expect(first?.author).toContain('一只二花花啊');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
