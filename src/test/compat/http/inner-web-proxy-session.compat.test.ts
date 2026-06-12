import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isTauri = vi.fn(() => true);

vi.mock('@/lib/platform/detect', () => ({
  isTauri: () => isTauri(),
  isMobile: vi.fn(() => false),
}));

vi.mock('@/lib/platform/inner-web-mode', () => ({
  resolveInnerWebUsesTauriPanel: vi.fn(() => true),
}));

import {
  fetchHtmlViaInnerWebProxySession,
  needsInnerWebDocumentProxy,
  normalizeInnerWebTargetUrl,
  resolveInnerWebProxyIframeTarget,
  shouldUseInnerWebDocumentProxy,
} from '@/lib/http/inner-web-proxy-session';

describe('shouldUseInnerWebDocumentProxy', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    isTauri.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Tauri panel 默认不走代理', () => {
    expect(shouldUseInnerWebDocumentProxy('https://example.com', 'a=1')).toBe(false);
  });

  it('Tauri iframe 回退无 Cookie 时不走代理', async () => {
    const { resolveInnerWebUsesTauriPanel } = await import('@/lib/platform/inner-web-mode');
    vi.mocked(resolveInnerWebUsesTauriPanel).mockReturnValue(false);
    expect(shouldUseInnerWebDocumentProxy('https://example.com', '')).toBe(false);
    expect(shouldUseInnerWebDocumentProxy('https://example.com', 'a=1')).toBe(true);
  });

  it('纯 Web 跨域 http 无 Cookie 也走代理（去 X-Frame-Options）', () => {
    isTauri.mockReturnValue(false);
    expect(shouldUseInnerWebDocumentProxy('https://www.24ao.cc/', '')).toBe(true);
  });

  it('needsInnerWebDocumentProxy 尊重 useProxyDocument', () => {
    isTauri.mockReturnValue(true);
    expect(
      needsInnerWebDocumentProxy('https://example.com', {
        useProxyDocument: true,
        initialCookies: '',
      }),
    ).toBe(true);
  });

  it('normalizeInnerWebTargetUrl 去 hash 与尾斜杠', () => {
    expect(normalizeInnerWebTargetUrl('http://ged520.yeoi.me/index1.html#')).toBe(
      'http://ged520.yeoi.me/index1.html',
    );
    expect(normalizeInnerWebTargetUrl('http://ged520.yeoi.me/')).toBe('http://ged520.yeoi.me/');
  });

  it('resolveInnerWebProxyIframeTarget 解析 __reader_http target', () => {
    const src =
      '/__reader_http?target=' +
      encodeURIComponent('http://ged520.yeoi.me/index1.html') +
      '&session=iw_test';
    expect(resolveInnerWebProxyIframeTarget(src, 'http://localhost:1420')).toBe(
      'http://ged520.yeoi.me/index1.html',
    );
  });
});

describe('fetchHtmlViaInnerWebProxySession', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('window', { location: { href: 'http://localhost:1420/' } });
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('创建会话后经 __reader_http 拉取 HTML 并删除会话', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'sess_cf' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body>list</body></html>',
      })
      .mockResolvedValueOnce({ ok: true });

    const html = await fetchHtmlViaInnerWebProxySession(
      'https://18comic.vip/albums?o=mr',
      'cf_clearance=abc',
      { Referer: 'https://18comic.vip/' },
      { cloudflareChallenge: true },
    );

    expect(html).toContain('list');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('session=sess_cf');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      encodeURIComponent('https://18comic.vip/albums?o=mr'),
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/session/sess_cf');
  });
});
