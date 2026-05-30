import { describe, expect, it, vi } from 'vitest';
import {
  buildQingtianCatalogVariable,
  enrichQingtianTocPayloadFromDetail,
  extractCatalogChapterRows,
  readBookCustomFromVariable,
} from '@/lib/book-source/chapters';
import {
  buildAggregationContentPostBody,
  isAggregationApiErrorText,
} from '@/lib/book-source/content';
import { normalizeDataUrlPayload } from '@/lib/book-source/utils';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import { isLikelyUnresolvedRuleResult } from '@/lib/book-source/utils';

vi.mock('@/lib/http', () => ({
  get: vi.fn(async (url: string) => {
    if (String(url).includes('/detail')) {
      return JSON.stringify({
        code: 0,
        data: { toc_url: 'https://example.com/book/123', book_name: '测试书' },
      });
    }
    return '';
  }),
  post: vi.fn(async () => ''),
}));

describe('晴天 catalog 解析', () => {
  it('extractCatalogChapterRows 接受 code=0 且 data 为数组', () => {
    const rows = extractCatalogChapterRows({
      code: 0,
      data: [{ item_id: '1', title: '第一章' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.title).toBe('第一章');
  });

  it('extractCatalogChapterRows 支持嵌套 data.data', () => {
    const rows = extractCatalogChapterRows({
      code: 0,
      data: { data: [{ item_id: '2', title: '第二章' }] },
    });
    expect(rows?.[0]?.title).toBe('第二章');
  });

  it('parseAjaxArgs 解析 Legado catalog POST 格式', () => {
    const parsed = parseAjaxArgs(
      'https://v1.gyks.cf/catalog?book_id=abc&source=番茄&tab=小说&variable=%7B%7D,{"method":"POST","body":{"html":""}}',
    );
    expect(parsed?.method).toBe('POST');
    expect(parsed?.urlStr).toContain('/catalog?book_id=abc');
    expect(JSON.parse(parsed?.body ?? '{}')).toEqual({ html: '' });
  });

  it('规则字面量封面不应被当作可请求 URL', () => {
    expect(isLikelyUnresolvedRuleResult('.cover_m@img@src')).toBe(true);
    expect(isLikelyUnresolvedRuleResult('https://cdn.example/a.jpg')).toBe(false);
  });

  it('normalizeDataUrlPayload 统一 sources/source/tab/url', () => {
    const payload = normalizeDataUrlPayload({
      book_id: 'abc',
      source: '番茄',
      tab: '',
      toc_url: 'https://example.com/toc',
    });
    expect(payload.sources).toBe('番茄');
    expect(payload.source).toBe('番茄');
    expect(payload.tab).toBe('小说');
    expect(payload.url).toBe('https://example.com/toc');
  });

  it('buildQingtianCatalogVariable 对齐 Legado custom 变量', () => {
    expect(buildQingtianCatalogVariable()).toBe('{"custom":""}');
    expect(buildQingtianCatalogVariable('{"custom":"x","book_detail":{}}')).toBe(
      '{"custom":"x"}',
    );
    expect(buildQingtianCatalogVariable('{"book_detail":{}}')).toBe('{"custom":""}');
  });

  it('readBookCustomFromVariable 从 book.variable JSON 取 custom', () => {
    expect(readBookCustomFromVariable('{"custom":"tone-7","book_detail":{}}')).toBe('tone-7');
    expect(readBookCustomFromVariable('{"book_detail":{}}')).toBe('');
  });

  it('buildAggregationContentPostBody tone_id 不用整段 book.variable', () => {
    const body = JSON.parse(
      buildAggregationContentPostBody(
        {
          book_id: 'bk1',
          item_id: 'ch-payload',
          sources: '全面漫画',
          tab: '漫画',
        },
        '{"custom":"","book_detail":{"id":1}}',
      ),
    ) as Record<string, string>;
    expect(body.tone_id).toBe('4');
    expect(body.variable).toBe('{"custom":""}');
    expect(body.item_id).toBe('ch-payload');
    expect(body.book_id).toBeUndefined();
  });

  it('isAggregationApiErrorText 识别服务端 Go panic 文案', () => {
    expect(
      isAggregationApiErrorText('正文处理异常："invalid memory address or nil pointer dereference"'),
    ).toBe(true);
    expect(isAggregationApiErrorText('<img src="a.jpg">')).toBe(false);
  });

  it('extractLegadoCookieValue 对齐 Legado cookie.getKey', async () => {
    const { extractLegadoCookieValue } = await import(
      '@/lib/js-engine/legado/normalize-legado-ajax-body'
    );
    const ck = 'qttoken=abc123;deviceId=dev456';
    expect(extractLegadoCookieValue(ck, 'qttoken')).toBe('abc123');
    expect(extractLegadoCookieValue(ck, 'device')).toBe('dev456');
    expect(extractLegadoCookieValue('rawtokenonly', 'qttoken')).toBe('rawtokenonly');
  });

  it('mergeAjaxCookieHeaders 合并 Cookie 与 cookie 头', async () => {
    const { mergeAjaxCookieHeaders } = await import(
      '@/lib/js-engine/legado/normalize-legado-ajax-body'
    );
    const merged = mergeAjaxCookieHeaders(
      {
        Cookie: 'qttoken=old;deviceId=d1',
        cookie: 'qttoken=new; deviceId=d2;',
        'Content-Type': 'application/json',
      },
      '',
    );
    expect(merged.Cookie).toContain('qttoken=new');
    expect(merged.Cookie).toContain('deviceId=d2');
    expect(merged.cookie).toBeUndefined();
  });

  it('enrichQingtianTocPayloadFromDetail 从 detail 补全 url', async () => {
    const enriched = await enrichQingtianTocPayloadFromDetail(
      {
        bookSourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib: "var host = ['https://v1.gyks.cf'];",
      } as never,
      { book_id: 'abc', sources: '搜书神器', tab: '小说', url: '' },
    );
    expect(enriched.url).toBe('https://example.com/book/123');
  });
});
