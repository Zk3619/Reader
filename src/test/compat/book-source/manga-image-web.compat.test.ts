import { describe, expect, it, vi } from 'vitest';
import { apiContentsToHtml } from '@/lib/book-source/extract-api-content';
import { flowImageRefs } from '@/lib/media/flow-images';

describe('apiContentsToHtml', () => {
  it('已是 img 标签时不二次包裹', () => {
    const item = `<img src="https://cdn.example/a.webp,{"headers":{"User-Agent":"LegadoUA"}}">`;
    const html = apiContentsToHtml([item]);
    expect(html).toContain('src="https://cdn.example/a.webp"');
    expect(html).not.toContain('src="<img');
    expect(html).toContain('LegadoUA');
  });
});

describe('flowImageRefs', () => {
  it('从标准 Legado img 提取 url 与 headers', () => {
    const html = `<img src="https://cdn.example/a.webp" data-legado-headers="{&quot;User-Agent&quot;:&quot;LegadoUA&quot;}">`;
    const refs = flowImageRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe('https://cdn.example/a.webp');
    expect(refs[0]!.legadoHeaders?.['User-Agent']).toBe('LegadoUA');
  });

  it('flowImageRefs 按文档序输出 img', () => {
    const base =
      'https://cdn.example/kk/book/5';
    const html = [
      `<img src="${base}/MjFjOGExM2RfNV8x_1.webp">`,
      `<img src="${base}/MjFjOGExM2RfNV8z_3.webp">`,
    ].join('\n');
    const refs = flowImageRefs(html);
    expect(refs).toHaveLength(2);
    expect(refs[0]!.url).toContain('_1.webp');
    expect(refs[1]!.url).toContain('_3.webp');
  });
});

describe('toProxiedImageUrl', () => {
  it('Web 漫画图携带 Legado UA 且 omit Referer', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/' },
    });
    const { toProxiedImageUrl } = await import('@/lib/http/proxy-image-url');
    const url = toProxiedImageUrl('https://f40-1-4.g-mh.online/kk/a.webp', {
      legadoImageHeaders: { 'User-Agent': 'LegadoAndroidUA' },
    });
    expect(url).toContain('userAgent=LegadoAndroidUA');
    expect(url).toContain('referer=none');
    vi.unstubAllGlobals();
  });

  it('Legado 跨站 Referer 仍 omit（对齐浏览器直链）', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/' },
    });
    const { toProxiedImageUrl } = await import('@/lib/http/proxy-image-url');
    const url = toProxiedImageUrl('https://f40-1-4.g-mh.online/kk/a.webp', {
      legadoImageHeaders: {
        'User-Agent': 'LegadoAndroidUA',
        Referer: 'https://manhuafree.com/',
      },
    });
    expect(url).toContain('userAgent=LegadoAndroidUA');
    expect(url).toContain('referer=none');
    expect(url).not.toContain('manhuafree');
    vi.unstubAllGlobals();
  });
});
