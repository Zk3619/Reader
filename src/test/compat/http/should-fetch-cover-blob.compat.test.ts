import { describe, expect, it, vi } from 'vitest';

describe('shouldFetchCoverAsBlob', () => {
  it('纯 Web 跨域图须走 blob + __reader_http', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/' },
    });
    const { shouldFetchCoverAsBlob } = await import('@/lib/http/cover-image-loader');
    const url =
      'https://f40-1-4.g-mh.online/kk/moshirenhuangfanyouqinggeweinturuzuo-ir660596/1/MjFjOGExM2RfMV81_5.webp';
    expect(shouldFetchCoverAsBlob(url)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('shouldFetchReaderInlineImageAsBlob', () => {
  it('跨域 Legado 正文图须 blob 拉取', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/' },
    });
    const { shouldFetchReaderInlineImageAsBlob } = await import(
      '@/lib/http/cover-image-loader'
    );
    const url =
      'https://f40-1-4.g-mh.online/kk/moshirenhuangfanyouqinggeweinturuzuo-ir660596/1/MjFjOGExM2RfMV81_5.webp';
    const headers = { Referer: 'https://manhuafree.com/', 'User-Agent': 'LegadoUA' };
    expect(
      shouldFetchReaderInlineImageAsBlob(url, { legadoImageHeaders: headers }),
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});
