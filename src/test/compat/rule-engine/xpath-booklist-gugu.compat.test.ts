import { describe, expect, it } from 'vitest';
import { analyzeElements, analyzeListElements, analyzeRule, analyzeString } from '@/lib/rule-engine';
import { parseCss, selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';
import { legadoListRuleNeedsAllSuffix } from '@/lib/rule-engine/legado-source-rule';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';

const SEARCH_HTML = `<html lang="zh-CN"><head><meta charset="utf-8"><title>搜索</title></head><body>
<div class="row-right">
  <div class="item">
    <a class="public-list-exp" href="/vod/1.html">
      <div class="cover" style="background-image:url('https://img.example/1.jpg')"></div>
      <div class="thumb-txt cor4 hide">Book One</div>
      <span class="cor5 thumb-blurb hide2">Intro one</span>
      <span class="public-list-prb hide ft2">连载中</span>
      <div class="thumb-else cor5 hide"><span><a>标签A</a></span></div>
    </a>
  </div>
  <div class="item">
    <a class="public-list-exp" href="/vod/2.html">
      <div class="thumb-txt cor4 hide">Book Two</div>
    </a>
  </div>
</div>
</body></html>`;

const BOOK_LIST_RULE = '//div[@class="row-right"]/div';
const COVER_RULE =
  '//div[@class="cover"]/@style\n@js: result.match(/url\\(["\']?([^"\')]+)["\']?\\)/)[1];';

describe('咕咕番 xpath bookList', () => {
  it('legadoListRuleNeedsAllSuffix 不因 [@class] 误判', () => {
    expect(legadoListRuleNeedsAllSuffix(BOOK_LIST_RULE)).toBe(true);
    expect(legadoListRuleNeedsAllSuffix(`${BOOK_LIST_RULE}@all`)).toBe(false);
  });

  it('selectElementsOuterHtml 不把 xpath 当 CSS', () => {
    const items = selectElementsOuterHtml(`${BOOK_LIST_RULE}@all`, SEARCH_HTML);
    expect(items.length).toBe(0);
  });

  it('parseCss / parseXPath 列表各返回 2 项', () => {
    expect(parseCss('div.row-right > div@all', SEARCH_HTML).length).toBe(2);
    expect(parseXPath(`${BOOK_LIST_RULE}@all`, SEARCH_HTML).length).toBe(2);
  });

  it('analyzeRule xpath@all 返回 2 项', async () => {
    const ctx = {
      content: SEARCH_HTML,
      contentType: 'html' as const,
      baseUrl: 'https://www.gugu3.com/',
      result: SEARCH_HTML,
    };
    expect((await analyzeRule(`${BOOK_LIST_RULE}@all`, ctx)).length).toBe(2);
  });

  it('analyzeElements xpath 列表返回 2 项', async () => {
    const ctx = {
      content: SEARCH_HTML,
      contentType: 'html' as const,
      baseUrl: 'https://www.gugu3.com/',
      result: SEARCH_HTML,
    };
    const items = await analyzeElements(BOOK_LIST_RULE, ctx);
    expect(items.length).toBe(2);
  });

  it('analyzeListElements 每项为独立书籍块', async () => {
    const items = await analyzeListElements(BOOK_LIST_RULE, {
      content: SEARCH_HTML,
      contentType: 'html',
      baseUrl: 'https://www.gugu3.com/',
      result: SEARCH_HTML,
    });
    expect(items.length).toBe(2);
    expect(items[0]!.content).toContain('Book One');
    expect(items[0]!.content).not.toContain('<html');
    expect(items[1]!.content).toContain('Book Two');
  });

  it('封面 @js 在无 style 时不抛错', async () => {
    const itemHtml = '<div><div class="cover"></div></div>';
    const cover = await analyzeString(COVER_RULE, {
      content: itemHtml,
      contentType: 'html',
      baseUrl: 'https://www.gugu3.com/',
      result: itemHtml,
    });
    expect(cover).toBe('');
  });

  it('kind 规则合并全部标签（对齐 Legado joinToString）', async () => {
    const { analyzeKindField } = await import('@/lib/book-source/search');
    const itemHtml = `<div>
      <div class="thumb-txt cor4 hide">Book One</div>
      <div class="thumb-else cor5 hide"><span><a>2026</a><a>日本</a><a>奇幻</a><a>战斗</a></span></div>
    </div>`;
    const kind = await analyzeKindField(
      '//div[@class="thumb-else cor5 hide"]/span/a/text()',
      {
        content: itemHtml,
        contentType: 'html',
        baseUrl: 'https://www.gugu3.com/',
        result: itemHtml,
      },
      { bookName: 'Book One' },
    );
    expect(kind).toMatch(/2026/);
    expect(kind).toMatch(/奇幻/);
    expect(kind).toMatch(/战斗/);
  });
});
