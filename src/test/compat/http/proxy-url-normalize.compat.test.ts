import { describe, expect, it, vi } from 'vitest';

describe('normalizeUrl __reader_http', () => {
  it('保留 target 查询参数中的 _5.webp 后缀', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/' },
    });
    const target =
      'https://f40-1-4.g-mh.online/kk/moshirenhuangfanyouqinggeweinturuzuo-ir660596/1/MjFjOGExM2RfMV81_5.webp';
    const { toProxiedImageUrl } = await import('@/lib/http/proxy-image-url');
    const proxied = toProxiedImageUrl(target, {
      legadoImageHeaders: { Referer: 'https://manhuafree.com/' },
    });
    expect(proxied).toBeTruthy();
    const u = new URL(proxied!, 'http://127.0.0.1:5173/');
    expect(u.searchParams.get('target')).toBe(target);
    expect(u.searchParams.get('target')).toContain('_5.webp');
    vi.unstubAllGlobals();
  });
});
