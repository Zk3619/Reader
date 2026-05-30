import { describe, expect, it } from 'vitest';
import {
  extractLegadoImageRawFromFragment,
  normalizeLegadoContentImages,
  parseLegadoUrlWithOptions,
} from '@/lib/js-engine/legado/parse-legado-url-options';

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
});
