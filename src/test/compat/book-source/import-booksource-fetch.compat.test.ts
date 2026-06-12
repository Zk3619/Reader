import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/platform/detect', () => ({
  isTauri: vi.fn(() => false),
}));

describe('fetchBookSourceJsonText (纯 Web)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { href: 'http://localhost:1420/', origin: 'http://localhost:1420' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      return {
        ok: true,
        status: 200,
        text: async () => (u.includes('__reader_http') ? '{"proxied":true}' : '{"direct":true}'),
      };
    }));
  });

  it('跨域书源 URL 走 __reader_http 代理', async () => {
    const { fetchBookSourceJsonText } = await import('@/lib/book-source/import-booksource-fetch');
    const text = await fetchBookSourceJsonText(
      'https://www.yckceo.com/d/60fafa7e5d792fdfd04c35757f9c2652',
    );
    expect(text).toBe('{"proxied":true}');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('__reader_http?target='),
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('剥离 #requestWithoutUA 后缀', async () => {
    const { stripRequestWithoutUaSuffix } = await import('@/lib/book-source/import-booksource-fetch');
    const { url, withoutUa } = stripRequestWithoutUaSuffix(
      'https://example.com/a.json#requestWithoutUA',
    );
    expect(url).toBe('https://example.com/a.json');
    expect(withoutUa).toBe(true);
  });
});
