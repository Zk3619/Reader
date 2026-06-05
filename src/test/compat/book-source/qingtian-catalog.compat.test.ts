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
import {
  extractApiErrorMessage,
  readAggregationApiFailure,
} from '@/lib/book-source/extract-api-content';
import {
  buildCatalogBookIdCandidates,
  buildQingtian2TocDataUrl,
  composeLegadoSourceChapterTitle,
  dedupeLegadoSourceChapterTitle,
  normalizeDataUrlPayload,
  decodeDataUrl,
  stripLegadoChapterSourcePrefixForToc,
} from '@/lib/book-source/utils';
import { formatTocChapterDisplayTitle } from '@/lib/catalog/chapter-list-layout';
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
  it('readAggregationApiFailure 识别 catalog code=400', () => {
    expect(readAggregationApiFailure({ code: 400, msg: 'bad book' })).toEqual({
      code: 400,
      msg: 'bad book',
    });
    expect(readAggregationApiFailure({ code: 0, data: [] })).toBeNull();
  });

  it('extractApiErrorMessage 成功但无正文时有提示', () => {
    expect(extractApiErrorMessage({ code: 0, data: null })).toBe(
      '响应成功但无 content/contents',
    );
  });

  it('buildCatalogBookIdCandidates 仅保留原始 book_id', () => {
    const url = 'https://manhuafree.com/manga/example';
    const b64 = Buffer.from(url, 'utf8').toString('base64');
    expect(buildCatalogBookIdCandidates(b64)).toEqual([b64]);
  });

  it('buildQingtian2TocDataUrl 生成带 toc_url 的目录载荷', () => {
    const url = 'https://manhuafree.com/manga/x';
    const book_id = Buffer.from(url, 'utf8').toString('base64');
    const toc = buildQingtian2TocDataUrl({
      book_id,
      source: 'G社漫画',
      tab: '漫画',
      toc_url: 'https://manhuafree.com/manga/x/catalog',
    });
    expect(toc).toContain('qingtian2');
    const payload = decodeDataUrl(toc!);
    expect(payload?.sources).toBe('G社漫画');
    expect(payload?.url).toBe('https://manhuafree.com/manga/x/catalog');
    expect(payload?.book_id).toBe(book_id);
  });

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

  it('extractCatalogChapterRows 在 last_chapter 与 chapters 并存时取较长列表', () => {
    const rows = extractCatalogChapterRows({
      code: 0,
      data: {
        last_chapter: { item_id: '9', title: '最新章' },
        chapters: [
          { item_id: '1', title: '第一章' },
          { item_id: '2', title: '第二章' },
        ],
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows?.[0]?.title).toBe('第一章');
  });

  it('mergeDataUrlPayloadFromBookUrls 从 bookUrl 补全 toc 缺 tab', async () => {
    const { mergeDataUrlPayloadFromBookUrls, decodeDataUrl, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const bookUrl = `data:;base64,${utf8ToBase64(
      JSON.stringify({
        book_id: 'aHR0cHM6Ly9t',
        sources: 'G社漫画',
        tab: '漫画',
      }),
    )}`;
    const tocUrl = `data:;base64,${utf8ToBase64(
      JSON.stringify({
        book_id: 'aHR0cHM6Ly9t',
        sources: 'G社漫画',
        tab: '',
        url: '',
      }),
    )}`;
    const tocPayload = decodeDataUrl(tocUrl)!;
    const merged = mergeDataUrlPayloadFromBookUrls(tocPayload, [bookUrl]);
    expect(merged.tab).toBe('漫画');
  });

  it('shelfCachedChapterListLooksStale 单章且缺 item_id 视为过期', async () => {
    const { shelfCachedChapterListLooksStale } = await import('@/lib/book-source/chapters');
    const stale = shelfCachedChapterListLooksStale(
      [
        {
          url: 'data:;base64,eyJib29rX2lkIjoiTmciLCJzb3VyY2VzIjoiIiwidXJsIjoiIn0=,{"type":"qingtian3"}',
          title: 'G社漫画:序章',
          isVolume: false,
          baseUrl: '',
          bookUrl: 'bk',
          index: 0,
          isVip: false,
          isPay: false,
        },
      ],
      { totalChapterNum: 209 },
    );
    expect(stale).toBe(true);
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

  it('章节标题工具：去重来源前缀、目录展示去前缀、拼接不重复', () => {
    expect(dedupeLegadoSourceChapterTitle('番茄:番茄:第一章 开端')).toBe('番茄:第一章 开端');
    expect(composeLegadoSourceChapterTitle('番茄', '番茄:第一章')).toBe('番茄:第一章');
    expect(composeLegadoSourceChapterTitle('番茄', '第一章')).toBe('番茄:第一章');
    expect(stripLegadoChapterSourcePrefixForToc('番茄:第一章 开端')).toBe('第一章 开端');
    expect(stripLegadoChapterSourcePrefixForToc('第一章 开端')).toBe('第一章 开端');
    expect(formatTocChapterDisplayTitle('番茄:第2章 相遇', 1)).toBe('第2章 相遇');
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

  it('injectMissingComicId 为无 comic_id 参数的章节 url 注入', async () => {
    const {
      injectMissingComicIdInAggregationItemIdInner,
      resolveContentApiItemId,
      utf8FromBase64,
      utf8ToBase64,
    } = await import('@/lib/book-source/utils');
    const chapterInner = JSON.stringify({
      baseUrl: 'https://api-cdn.kaimanhua.com/comic-api/v2/comic/getchapterdata',
      url: 'https://api-cdn.kaimanhua.com/comic-api/v2/comic/getchapterdata?chapter_id=99',
      t: 'search',
    });
    const injected = injectMissingComicIdInAggregationItemIdInner(chapterInner, '106663');
    expect(injected).toContain('comic_id=106663');
    const b64 = utf8ToBase64(chapterInner);
    const resolved = resolveContentApiItemId(b64, '106663');
    expect(resolved).not.toBe(b64);
    expect(utf8FromBase64(resolved)).toContain('comic_id=106663');
  });

  it('resolveContentApiItemId 用 book_id 提示补全章节 item_id 空 comic_id', async () => {
    const {
      resolveContentApiItemId,
      extractComicIdFromAggregationBookId,
      utf8FromBase64,
      utf8ToBase64,
    } = await import('@/lib/book-source/utils');
    const bookInner = JSON.stringify({
      url: 'https://api.example.com/comic/getcomicdata?comic_id=106663',
      t: 'search',
    });
    const bookId = utf8ToBase64(bookInner);
    const chapterInner = JSON.stringify({
      baseUrl: 'https://api.example.com/v2/chapter',
      url: 'https://api.example.com/chapter?comic_id=&chapter_id=1',
    });
    const itemB64 = utf8ToBase64(chapterInner);
    expect(extractComicIdFromAggregationBookId(bookId)).toBe('106663');
    const resolved = resolveContentApiItemId(
      itemB64,
      extractComicIdFromAggregationBookId(bookId),
    );
    expect(utf8FromBase64(resolved)).toContain('comic_id=106663');
    expect(utf8FromBase64(resolved)).not.toContain('comic_id=&');
  });

  it('resolveContentApiItemId 保持 base64 并补全内层空 comic_id', async () => {
    const { resolveContentApiItemId, utf8FromBase64, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const inner = JSON.stringify({
      baseUrl:
        'https://api.example.com/comic/getcomicdata?comic_id=106663&client-type=android',
      url: 'https://api.example.com/comic/getchapterdata?comic_id=&chapter_id=1',
      t: 'search',
    });
    const b64 = utf8ToBase64(inner);
    const resolved = resolveContentApiItemId(b64);
    expect(resolved.startsWith('eyJ')).toBe(true);
    const decoded = utf8FromBase64(resolved);
    expect(decoded).toContain('comic_id=106663');
    expect(decoded).not.toContain('comic_id=&');
  });

  it('resolveContentApiItemId 无需修复时语义不变', async () => {
    const { resolveContentApiItemId, utf8FromBase64, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const inner = JSON.stringify({ baseUrl: 'https://api.example.com?comic_id=1', url: '' });
    const b64 = utf8ToBase64(inner);
    const resolved = resolveContentApiItemId(b64);
    expect(resolved).toBe(b64);
    expect(JSON.parse(utf8FromBase64(resolved))).toEqual(JSON.parse(inner));
  });

  it('buildContentApiItemIdCandidates baseUrl 有 comic_id 但章节 url 为空时追加修复候选', async () => {
    const { buildContentApiItemIdCandidates, utf8FromBase64, utf8ToBase64 } =
      await import('@/lib/book-source/utils');
    const inner = JSON.stringify({
      baseUrl: 'https://api.example.com?comic_id=106663',
      url: 'https://api.example.com/ch?comic_id=&chapter_id=1',
    });
    const b64 = utf8ToBase64(inner);
    const candidates = buildContentApiItemIdCandidates(b64, '106663');
    expect(candidates[0]).toBe(b64);
    expect(candidates.length).toBeGreaterThan(1);
    expect(utf8FromBase64(candidates[1]!)).toContain('comic_id=106663');
    expect(candidates[1]).not.toContain('comic_id=&');
  });

  it('needsContentApiItemIdRepair 内层无 comic_id 时为 true', async () => {
    const { needsContentApiItemIdRepair, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const b64 = utf8ToBase64(
      JSON.stringify({
        url: 'https://api.example.com/ch?comic_id=&chapter_id=1',
      }),
    );
    expect(needsContentApiItemIdRepair(b64)).toBe(true);
  });

  it('normalizeContentApiPostBody 已含 comic_id 的 item_id 保持原样', async () => {
    const { normalizeContentApiPostBody } = await import(
      '@/lib/js-engine/legado/normalize-legado-ajax-body'
    );
    const { utf8ToBase64 } = await import('@/lib/book-source/utils');
    const b64 = utf8ToBase64(
      JSON.stringify({
        url: 'https://api.example.com/ch?comic_id=106663&chapter_id=1',
      }),
    );
    const raw = JSON.stringify({ item_id: b64, source: '全面漫画', tab: '漫画' });
    const out = normalizeContentApiPostBody('https://v1.gyks.cf/content', 'POST', raw, {
      comicIdHint: '106663',
      repairItemId: true,
    });
    const parsed = JSON.parse(out ?? '{}') as Record<string, string>;
    expect(parsed.item_id).toBe(b64);
    expect(parsed.source).toBe('全面漫画');
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
      { comicIdHint: '99', repairItemId: true },
    );
    const parsed = JSON.parse(normalized ?? '{}') as Record<string, string>;
    expect(parsed.item_id.startsWith('eyJ')).toBe(true);
    const { utf8FromBase64 } = await import('@/lib/book-source/utils');
    expect(utf8FromBase64(parsed.item_id)).toContain('comic_id=99');
    expect(parsed.source).toBe('全面漫画');
  });

  it('buildContentApiPostBody 保持 catalog 原始 item_id（对齐 Legado）', async () => {
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
    expect(body.item_id).toBe(b64);
    expect(body.source).toBe('全面漫画');
    expect(body.sources).toBeUndefined();
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

  it('漫画多作者 API 字符串括号内逗号不应拆成第四段作者', () => {
    const author = 'DUBU（REDICE STUDIO) ,  Chugong ,  h-goon';
    const masked = author.replace(
      /[（(][^）)]*[）)]/g,
      (m) => m.replace(/[,，]/g, '\u0000'),
    );
    const parts = masked
      .split(/[,，]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    expect(parts.length).toBe(3);
    expect(parts.length).toBeLessThan(4);
  });

  it('mergeDataUrlPayloadFromBookUrls 替换占位 book_id 并补 sources', async () => {
    const { mergeDataUrlPayloadFromBookUrls, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const bookUrl = `data:;base64,${utf8ToBase64(
      JSON.stringify({
        book_id: 'aHR0cHM6Ly9tYW5odWEx',
        sources: 'G社漫画',
        tab: '漫画',
      }),
    )}`;
    const merged = mergeDataUrlPayloadFromBookUrls(
      { book_id: 'Ng', sources: '', tab: '', item_id: '' },
      [bookUrl],
    );
    expect(merged.book_id).toBe('aHR0cHM6Ly9tYW5odWEx');
    expect(merged.sources).toBe('G社漫画');
    expect(merged.tab).toBe('漫画');
  });

  it('mergeChapterDataUrlFromRow 从 catalog 行补 item_id', async () => {
    const { mergeChapterDataUrlFromRow, decodeDataUrl, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const stubUrl = `data:;base64,${utf8ToBase64(
      JSON.stringify({ book_id: 'Ng', sources: '', url: '' }),
    )},{"type":"qingtian3"}`;
    const patched = mergeChapterDataUrlFromRow(stubUrl, {
      item_id: 'Nl8xNzY2MTc2',
      source: 'G社漫画',
      tab: '漫画',
    });
    const payload = decodeDataUrl(patched);
    expect(payload?.item_id).toBe('Nl8xNzY2MTc2');
    expect(payload?.sources).toBe('G社漫画');
    expect(payload?.tab).toBe('漫画');
  });

  it('buildQingtian2TocDataUrl 详情短 book_id 时回退 bookUrl', async () => {
    const { buildQingtian2TocDataUrl, decodeDataUrl, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const bookUrl = `data:;base64,${utf8ToBase64(
      JSON.stringify({
        book_id: 'aHR0cHM6Ly9tYW5odWEx',
        sources: 'G社漫画',
        tab: '漫画',
      }),
    )}`;
    const toc = buildQingtian2TocDataUrl(
      { book_id: 'Ng', source: 'G社漫画', tab: '漫画' },
      bookUrl,
    );
    const payload = decodeDataUrl(toc!);
    expect(payload?.book_id).toBe('aHR0cHM6Ly9tYW5odWEx');
    expect(payload?.sources).toBe('G社漫画');
  });

  it('enrichChapterContentPayload 仅补 book_id，不改 catalog source', async () => {
    const enriched = await enrichChapterContentPayload(
      {
        bookSourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib: "var host = ['https://v1.gyks.cf'];",
      } as never,
      {
        book_id: 'abc',
        sources: '全面漫画',
        tab: '漫画',
        item_id: 'item-token',
        title: '第1话',
      },
      undefined,
      JSON.stringify({ source: 'svip_全面漫画' }),
    );
    expect(enriched.sources).toBe('全面漫画');
    expect(enriched.item_id).toBe('item-token');
  });

  it('buildContentApiPostBody 正文 POST 用 catalog 短名（不用 svip_）', () => {
    const body = JSON.parse(
      buildContentApiPostBody(
        {
          item_id: 'ch1',
          sources: '全面漫画',
          tab: '漫画',
          book_id: 'bk-1',
        },
        JSON.stringify({ source: 'svip_全面漫画' }),
      ),
    ) as Record<string, string>;
    expect(body.source).toBe('全面漫画');
    expect(body.sources).toBeUndefined();
    expect(body.book_id).toBeUndefined();
  });

  it('buildContentApiItemIdCandidates 先试 catalog 原始 item_id', async () => {
    const { buildContentApiItemIdCandidates, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const raw = utf8ToBase64(
      JSON.stringify({
        url: 'https://api.example.com/chapter?comic_id=&chapter_id=1',
      }),
    );
    const candidates = buildContentApiItemIdCandidates(raw, '106663');
    expect(candidates[0]).toBe(raw);
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('buildLegadoContentApiRequestHeaders 仅 cookie 与 Content-Type', async () => {
    const { buildLegadoContentApiRequestHeaders } = await import(
      '@/lib/book-source/source-http'
    );
    const headers = buildLegadoContentApiRequestHeaders(
      undefined,
      'https://v1.gyks.cf/content',
      { cookie: 'qttoken=abc; deviceId=dev123;' },
    );
    expect(headers['content-type']).toBe('application/json');
    expect(headers.cookie).toBe('qttoken=abc; deviceId=dev123;');
    expect(headers.Cookie).toBeUndefined();
    expect(headers.Referer).toBeUndefined();
    expect(headers['User-Agent']).toBeUndefined();
    expect(headers.Accept).toBeUndefined();
  });

  it('buildLegadoContentApiRequestHeaders 用书源变量 deviceId 规范化脚本 cookie', async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    const { buildLegadoContentApiRequestHeaders } = await import(
      '@/lib/book-source/source-http'
    );
    const { getSourceArgsKey } = await import(
      '@/lib/js-engine/legado/source-script-shared'
    );
    const source = { bookSourceUrl: 'test-qingtian-headers' } as import('@/types').BookSource;
    localStorage.setItem(
      getSourceArgsKey(source),
      JSON.stringify({ deviceId: '715526ded4651ef6' }),
    );
    const headers = buildLegadoContentApiRequestHeaders(
      source,
      'https://v1.gyks.cf/content',
      { cookie: 'qttoken=abc; deviceId=wrong000000000000;' },
    );
    expect(headers.cookie).toBe('qttoken=abc; deviceId=715526ded4651ef6;');
  });

  it('buildLegadoContentApiRequestHeaders 脚本 cookie 空 qttoken 时回落书源登录 token', async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    const { buildLegadoContentApiRequestHeaders } = await import(
      '@/lib/book-source/source-http'
    );
    const { getSourceArgsKey } = await import(
      '@/lib/js-engine/legado/source-script-shared'
    );
    const source = { bookSourceUrl: 'test-qingtian-empty-token' } as import('@/types').BookSource;
    const argsKey = getSourceArgsKey(source);
    localStorage.setItem(argsKey, JSON.stringify({ qttoken: 'stored-token-xyz' }));
    const headers = buildLegadoContentApiRequestHeaders(
      source,
      'https://v1.gyks.cf/content',
      { cookie: 'qttoken=;deviceId=862770e338544ffb;' },
    );
    expect(headers.cookie).toContain('qttoken=stored-token-xyz');
    expect(headers.cookie).not.toMatch(/qttoken=;/);
  });

  it('buildContentApiPostBody 默认保持 catalog 原始 item_id（不自动修复）', async () => {
    const { utf8ToBase64 } = await import('@/lib/book-source/utils');
    const bookId = utf8ToBase64(
      JSON.stringify({
        url: 'https://api.example.com/comic/getcomicdata?comic_id=106663',
        t: 'search',
      }),
    );
    const chapterInner = JSON.stringify({
      baseUrl: 'https://api.example.com/chapter',
      url: 'https://api.example.com/chapter?comic_id=&chapter_id=1',
    });
    const itemB64 = utf8ToBase64(chapterInner);
    const body = JSON.parse(
      buildContentApiPostBody({
        book_id: bookId,
        item_id: itemB64,
        sources: '全面漫画',
        tab: '漫画',
      }),
    ) as Record<string, string>;
    expect(body.item_id).toBe(itemB64);
    expect(body.sources).toBeUndefined();
  });

  it('needsContentApiItemIdRepair 仅在空 comic_id 时为 true', async () => {
    const { needsContentApiItemIdRepair, utf8ToBase64 } = await import(
      '@/lib/book-source/utils'
    );
    const broken = utf8ToBase64(
      JSON.stringify({
        url: 'https://api.example.com/ch?comic_id=&id=1',
      }),
    );
    const fixed = utf8ToBase64(
      JSON.stringify({
        url: 'https://api.example.com/ch?comic_id=106663&id=1',
      }),
    );
    expect(needsContentApiItemIdRepair(broken)).toBe(true);
    expect(needsContentApiItemIdRepair(fixed)).toBe(false);
  });

  it('extractApiContent 支持 data.data.images 漫画列表', async () => {
    const { extractApiContent } = await import('@/lib/book-source/extract-api-content');
    const html = extractApiContent(
      JSON.stringify({
        code: 0,
        data: { images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'] },
      }),
    );
    expect(html).toContain('<img src="https://cdn.example/a.jpg">');
    expect(html).toContain('<img src="https://cdn.example/b.jpg">');
  });
});
