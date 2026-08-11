import { describe, expect, it, vi } from 'vitest';
import {
  cookieHeaderLooksCfCleared,
  isCloudflareBlockedResponse,
  resolveCfBlockedOrigin,
  resolveCloudflareVerificationUrl,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import { HttpError } from '@/lib/http';

vi.mock('@/lib/platform/detect', () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock('@/lib/platform/inner-web', () => ({
  openInnerWebAwait: vi.fn(async () => ({ confirmed: false, cookies: '', url: '' })),
  getActiveWebProxySessionId: vi.fn(() => null),
}));

vi.mock('@/lib/book-source/source-http', () => ({
  buildSourceRequestHeaders: vi.fn(() => ({})),
  getCfActiveRequestOrigin: vi.fn(() => ''),
  resolveBookSourceCatalogOrigin: vi.fn(() => 'https://banzhu66666.net'),
  resolveBookSourceRequestOrigin: vi.fn(() => 'https://banzhu66666.net'),
  resolveSourceCookiesForHttp: vi.fn(() => ''),
  getCfActiveUserAgent: vi.fn(() => ''),
  setCfActiveRequestOrigin: vi.fn(),
  setCfActiveUserAgent: vi.fn(),
}));

vi.mock('@/lib/book-source/source-cookie-pool', () => ({
  syncSourceCookiesAfterInnerWeb: vi.fn(async () => ''),
}));

describe('cloudflare-verification', () => {
  it('识别挑战页 HTML', () => {
    expect(
      isCloudflareBlockedResponse(
        200,
        '<html><title>Just a moment...</title><script>cf-chl</script></html>',
      ),
    ).toBe(true);
  });

  it('识别代理标记头', () => {
    expect(
      isCloudflareBlockedResponse(200, '', { 'X-Reader-Cf-Challenge': '1' }),
    ).toBe(true);
  });

  it('无正文的 403 不触发内嵌验证（避免 YouTube 等反爬误开 WebView）', () => {
    expect(shouldOfferCloudflareVerification(new HttpError(403, 'Forbidden', 'https://x.test/'))).toBe(
      false,
    );
  });

  it('非 CF 错误不触发', () => {
    expect(shouldOfferCloudflareVerification(new HttpError(404, 'Not Found', 'https://x.test/'))).toBe(
      false,
    );
  });

  it('业务 403 错误页（非 CF 挑战）不触发验证', () => {
    const bizPage =
      '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>域名未授权</title></head><body>域名未授权</body></html>';
    expect(
      shouldOfferCloudflareVerification(
        new HttpError(403, 'Forbidden', 'https://v1.gyks.cf/discovestyle', 'HTTP 403', bizPage),
      ),
    ).toBe(false);
  });

  it('真实 CF 挑战页 403 仍触发验证', () => {
    const cfPage = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
    expect(
      shouldOfferCloudflareVerification(
        new HttpError(403, 'Forbidden', 'https://x.test/', 'HTTP 403', cfPage),
      ),
    ).toBe(typeof window !== 'undefined');
  });

  it('CF 验证页优先使用当前请求 origin', () => {
    expect(
      resolveCloudflareVerificationUrl(
        'https://banzhu66666.net/shuku/0-lastupdate-0-1.html',
        { sourceUrl: 'https://banzhu66666.net/' } as never,
      ),
    ).toBe('https://banzhu66666.net');
  });

  it('重定向到不同域被 CF 拦截时，在响应域过验证', () => {
    expect(
      resolveCfBlockedOrigin(
        'https://jm18c-uoi.net/albums?o=mr',
        'https://18comic.vip/albums?o=mr',
      ),
    ).toBe('https://18comic.vip');
    expect(
      resolveCloudflareVerificationUrl(
        'https://jm18c-uoi.net/albums?o=mr',
        { sourceUrl: 'https://jm18c-uoi.net/' } as never,
        'https://18comic.vip/albums?o=mr',
      ),
    ).toBe('https://18comic.vip');
  });

  it('请求非 http 时回退书源 sourceUrl', () => {
    expect(
      resolveCloudflareVerificationUrl('/shuku/1.html', {
        sourceUrl: 'https://banzhu66666.net/',
      } as never),
    ).toBe('https://banzhu66666.net');
  });

  it('识别 cf_clearance', () => {
    expect(cookieHeaderLooksCfCleared('a=1; cf_clearance=abc')).toBe(true);
    expect(cookieHeaderLooksCfCleared('Cookie=1')).toBe(false);
  });

  it('纯 Web CF 验证走 __reader_http 代理文档', async () => {
    const { openInnerWebAwait } = await import('@/lib/platform/inner-web');
    const { resolveCloudflareViaInnerWeb } = await import(
      '@/lib/http/cloudflare-verification'
    );
    await resolveCloudflareViaInnerWeb({
      url: 'https://banzhu66666.net/shuku/0-lastupdate-0-1.html',
      source: { sourceName: 'test', sourceUrl: 'https://banzhu66666.net/' } as never,
    });
    expect(openInnerWebAwait).toHaveBeenCalledWith(
      expect.objectContaining({
        useProxyDocument: true,
        cloudflareVerification: true,
        url: 'https://banzhu66666.net',
      }),
    );
  });
});
