import { describe, expect, it, vi } from 'vitest';
import {
  cookieHeaderLooksCfCleared,
  isCloudflareBlockedResponse,
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

  it('403 HttpError 可触发内嵌验证', () => {
    expect(shouldOfferCloudflareVerification(new HttpError(403, 'Forbidden', 'https://x.test/'))).toBe(
      typeof window !== 'undefined',
    );
  });

  it('非 CF 错误不触发', () => {
    expect(shouldOfferCloudflareVerification(new HttpError(404, 'Not Found', 'https://x.test/'))).toBe(
      false,
    );
  });

  it('CF 验证页优先使用当前请求 origin', () => {
    expect(
      resolveCloudflareVerificationUrl(
        'https://banzhu66666.net/shuku/0-lastupdate-0-1.html',
        { sourceUrl: 'https://banzhu66666.net/' } as never,
      ),
    ).toBe('https://banzhu66666.net');
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
