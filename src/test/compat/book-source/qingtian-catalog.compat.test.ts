import { describe, expect, it, vi } from 'vitest';
import {
  buildCatalogApiVariable,
  enrichChapterContentPayload,
  extractCatalogChapterRows,
  readBookCustomFromVariable,
} from '@/lib/book-source/chapters';
import {
  buildContentApiPostBody,
  isApiErrorText,
} from '@/lib/book-source/content';
import { normalizeDataUrlPayload } from '@/lib/book-source/utils';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import { isLikelyUnresolvedRuleResult } from '@/lib/book-source/utils';

vi.mock('@/lib/http', () => {
  const detailJson = JSON.stringify({
    code: 0,
    data: {
      toc_url: 'https://example.com/book/123',
      book_name: '测试书',
      source: '全面漫画',
    },
  });
  return {
    get: vi.fn(async () => ''),
    post: vi.fn(async (url: string) => {
      if (String(url).includes('/detail')) return detailJson;
      return '';
    }),
  };
});

describe('Legado catalog API 解析', () => {
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

  it('normalizeCatalogScalarField 将 object 型 item_id 压成 JSON 字符串', async () => {
    const { normalizeCatalogScalarField } = await import('@/lib/book-source/utils');
    expect(normalizeCatalogScalarField({ id: 1, x: 'y' })).toBe('{"id":1,"x":"y"}');
    expect(normalizeCatalogScalarField('already-string')).toBe('already-string');
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

  it('buildCatalogApiVariable 对齐 Legado custom 变量', () => {
    expect(buildCatalogApiVariable()).toBe('{"custom":""}');
    expect(buildCatalogApiVariable('{"custom":"x","book_detail":{}}')).toBe(
      '{"custom":"x"}',
    );
    expect(buildCatalogApiVariable('{"book_detail":{}}')).toBe('{"custom":""}');
  });

  it('readBookCustomFromVariable 从 book.variable JSON 取 custom', () => {
    expect(readBookCustomFromVariable('{"custom":"tone-7","book_detail":{}}')).toBe('tone-7');
    expect(readBookCustomFromVariable('{"book_detail":{}}')).toBe('');
  });

  it('readBookContentSource 从 book.variable JSON 读取 source', async () => {
    const { readBookContentSource } = await import('@/lib/book-source/utils');
    expect(
      readBookContentSource({
        variable: JSON.stringify({ source: 'svip_全面漫画' }),
      }),
    ).toBe('svip_全面漫画');
  });

  it('readBookContentSource 顶层 source 优先于 book_detail 短 source', async () => {
    const { readBookContentSource } = await import('@/lib/book-source/utils');
    expect(
      readBookContentSource({
        variable: JSON.stringify({
          source: 'svip_全面漫画',
          book_detail: { source: '全面漫画' },
        }),
      }),
    ).toBe('svip_全面漫画');
  });

  it('preferDetailContentSource 详情 source 覆盖 catalog 短名', async () => {
    const { preferDetailContentSource } = await import('@/lib/book-source/utils');
    expect(preferDetailContentSource('全面漫画', 'svip_全面漫画')).toBe('svip_全面漫画');
    expect(preferDetailContentSource(undefined, 'svip_全面漫画')).toBe('svip_全面漫画');
  });

  it('normalizeDataUrlPayload 正文沿用 catalog 短 source（不用详情 svip_ 前缀）', () => {
    const payload = normalizeDataUrlPayload({
      sources: '全面漫画',
      source: '全面漫画',
      tab: '漫画',
      item_id: 'token',
      book_id: 'bk',
    });
    expect(payload.sources).toBe('全面漫画');
    expect(payload.source).toBe('全面漫画');
  });

  it('buildContentApiPostBody tone_id 不用整段 book.variable', () => {
    const body = JSON.parse(
      buildContentApiPostBody(
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

  it('resolveContentApiItemId 解码 base64 并补全 url 内空 comic_id', async () => {
    const { resolveContentApiItemId, utf8ToBase64 } = await import('@/lib/book-source/utils');
    const inner = JSON.stringify({
      baseUrl:
        'https://api.example.com/comic/getcomicdata?comic_id=106663&client-type=android',
      url: 'https://api.example.com/comic/getchapterdata?comic_id=&chapter_id=1',
      t: 'search',
    });
    const b64 = utf8ToBase64(inner);
    const resolved = resolveContentApiItemId(b64);
    expect(resolved.startsWith('{')).toBe(true);
    expect(resolved).toContain('comic_id=106663');
    expect(resolved).not.toContain('comic_id=&');
  });

  it('normalizeContentApiPostBody 解码 /content 的 base64 item_id', async () => {
    const { normalizeContentApiPostBody } = await import(
      '@/lib/js-engine/legado/normalize-legado-ajax-body'
    );
    const { utf8ToBase64 } = await import('@/lib/book-source/utils');
    const inner = JSON.stringify({
      baseUrl: 'https://api.example.com?comic_id=99',
      url: 'https://api.example.com/ch?comic_id=&chapter_id=1',
    });
    const b64 = utf8ToBase64(inner);
    const raw = JSON.stringify({
      html: '',
      item_id: b64,
      source: '全面漫画',
      tab: '漫画',
      tone_id: '4',
      variable: '{"custom":""}',
      version: '4.11.5.1',
    });
    const normalized = normalizeContentApiPostBody(
      'https://v1.gyks.cf/content',
      'POST',
      raw,
    );
    const parsed = JSON.parse(normalized ?? '{}') as Record<string, string>;
    expect(parsed.item_id.startsWith('{')).toBe(true);
    expect(parsed.item_id).toContain('comic_id=99');
    expect(parsed.source).toBe('全面漫画');
  });

  it('buildContentApiPostBody 解码 item_id 后 POST', async () => {
    const { utf8ToBase64 } = await import('@/lib/book-source/utils');
    const inner = JSON.stringify({
      baseUrl: 'https://api.example.com?comic_id=7',
      url: '/chapter?comic_id=&id=1',
      t: 'search',
    });
    const b64 = utf8ToBase64(inner);
    const body = JSON.parse(
      buildContentApiPostBody({
        item_id: b64,
        sources: '全面漫画',
        tab: '漫画',
      }),
    ) as Record<string, string>;
    expect(body.item_id).toContain('comic_id=7');
    expect(body.item_id.startsWith('{')).toBe(true);
    expect(body.source).toBe('全面漫画');
  });

  it('isApiErrorText 识别服务端 Go panic 文案', () => {
    expect(
      isApiErrorText('正文处理异常："invalid memory address or nil pointer dereference"'),
    ).toBe(true);
    expect(isApiErrorText('<img src="a.jpg">')).toBe(false);
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

  it('mergeLegadoCookieHeaderStrings 空 qttoken 不覆盖已有 token', async () => {
    const { mergeLegadoCookieHeaderStrings } = await import(
      '@/lib/js-engine/legado/normalize-legado-ajax-body'
    );
    const merged = mergeLegadoCookieHeaderStrings(
      'qttoken=valid;deviceId=d1',
      'qttoken=; deviceId=d2;',
    );
    expect(merged).toContain('qttoken=valid');
    expect(merged).toContain('deviceId=d2');
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

  it('coalesceSourceField 对齐 source/sources 别名', async () => {
    const { coalesceSourceField } = await import('@/lib/book-source/utils');
    expect(coalesceSourceField('', '番茄', '七猫')).toBe('番茄');
    expect(coalesceSourceField(undefined, 'svip_书旗')).toBe('svip_书旗');
  });

  it('enrichChapterContentPayload 仅补 book_id，不改 source', async () => {
    const enriched = await enrichChapterContentPayload(
      {
        bookSourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib: "var host = ['https://v1.gyks.cf'];",
      } as never,
      {
        book_id: 'abc',
        sources: 'svip_全面漫画',
        tab: '漫画',
        item_id: 'item-token',
        title: '第1话',
      },
    );
    expect(enriched.sources).toBe('svip_全面漫画');
    expect(enriched.item_id).toBe('item-token');
  });
});
