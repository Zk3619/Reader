import { describe, expect, it } from 'vitest';
import {
  legadoInnerWebCookieSyncUrls,
  mergeLegadoCookieHeaderStrings,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  extractLegadoImageRawFromFragment,
  normalizeLegadoContentImages,
  parseLegadoUrlWithOptions,
} from '@/lib/js-engine/legado/parse-legado-url-options';

describe('legadoInnerWebCookieSyncUrls', () => {
  it('包含页 URL、去末段路径与 origin', () => {
    const urls = legadoInnerWebCookieSyncUrls('https://v1.gyks.cf/control');
    expect(urls).toContain('https://v1.gyks.cf/control');
    expect(urls.filter((u) => u === 'https://v1.gyks.cf').length).toBeGreaterThanOrEqual(1);
  });
});

describe('mergeLegadoCookieHeaderStrings (inner-web √)', () => {
  it('第二段（WebView 读出）同名键覆盖 localStorage 旧值', () => {
    const store = 'fqpara=on; info=on; tab=novel';
    const web = 'fqpara=off; info=off; tab=小说';
    const merged = mergeLegadoCookieHeaderStrings(store, web);
    expect(merged).toMatch(/fqpara=off/);
    expect(merged).toMatch(/info=off/);
    expect(merged).toMatch(/tab=小说/);
    expect(merged).not.toMatch(/fqpara=on/);
  });

  it('含 qttoken 与其它键时合并保留非登录键', () => {
    const store = 'qttoken=abc; deviceId=d1; foo=on; bar=on';
    const web = 'qttoken=abc; deviceId=d1; foo=off; bar=off; extra=baz';
    const merged = mergeLegadoCookieHeaderStrings(store, web);
    expect(merged).toMatch(/foo=off/);
    expect(merged).toMatch(/bar=off/);
    expect(merged).toMatch(/extra=baz/);
    expect(merged).toMatch(/qttoken=abc/);
    expect(merged).not.toMatch(/foo=on/);
  });
});

describe('parseLegadoUrlWithOptions', () => {
  it('拆分 url 与 headers 后缀', () => {
    const raw =
      'https://cdn.example/a.webp,{"headers":{"User-Agent":"LegadoUA","Referer":"https://m.example/"}}';
    const parsed = parseLegadoUrlWithOptions(raw);
    expect(parsed.url).toBe('https://cdn.example/a.webp');
    expect(parsed.headers?.['User-Agent']).toBe('LegadoUA');
    expect(parsed.headers?.Referer).toBe('https://m.example/');
  });

  it('normalizeLegadoContentImages 替换 img 内嵌 Legado src', () => {
    const html = `<img src="https://cdn.example/a.webp,{"headers":{"User-Agent":"UA"}}">`;
    const out = normalizeLegadoContentImages(html);
    expect(out).toBe(
      `<img src="https://cdn.example/a.webp" data-legado-headers="{&quot;User-Agent&quot;:&quot;UA&quot;}">`,
    );
    expect(out).not.toContain('src="<img');
  });

  it('normalizeLegadoContentImages 修复破损的 src 引号', () => {
    const broken = `<img src="https://cdn.example/a.webp"headers":{"User-Agent":"LegadoUA"}}">`;
    const out = normalizeLegadoContentImages(broken);
    expect(out).toContain('src="https://cdn.example/a.webp"');
    expect(out).toContain('data-legado-headers=');
    expect(out).toContain('LegadoUA');
  });

  it('extractLegadoImageRawFromFragment 从破损标签提取', () => {
    const raw = extractLegadoImageRawFromFragment(
      'src="https://cdn.example/a.webp"headers":{"User-Agent":"UA"}}',
    );
    expect(raw).toContain('https://cdn.example/a.webp');
    expect(parseLegadoUrlWithOptions(raw!).headers?.['User-Agent']).toBe('UA');
  });

  it('剥离 data:image Legado 段评 JSON 后缀', () => {
    const svgB64 = 'PHN2ZyB3aWR0aD0iMTAwIj48L3N2Zz4=';
    const raw =
      `data:image/svg+xml;base64,${svgB64},` +
      `{"click":"showCmt('https://cmt.example/p1', '番茄', 1)","style":"text"}`;
    const parsed = parseLegadoUrlWithOptions(raw);
    expect(parsed.url).toBe(`data:image/svg+xml;base64,${svgB64}`);
    expect(parsed.click).toContain('showCmt');
    expect(parsed.legadoStyle).toBe('text');
    expect(parsed.headers).toBeUndefined();
  });
});
