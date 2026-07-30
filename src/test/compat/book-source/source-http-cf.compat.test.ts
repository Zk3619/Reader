import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { BookSource } from '@/types';

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
  HttpError: class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/lib/http/cloudflare-verification', () => ({
  isCloudflareBlockedResponse: vi.fn((status: number, body: string) =>
    status === 200 && body.includes('Just a moment'),
  ),
  resolveCloudflareViaInnerWeb: vi.fn(async () => true),
  shouldOfferCloudflareVerification: vi.fn((e: unknown) =>
    e instanceof Error && 'status' in e && (e as { status: number }).status === 403,
  ),
}));

vi.mock('@/lib/book-source/cf-webview-fetch', () => ({
  shouldUseCfWebViewFetch: vi.fn(() => false),
  fetchPageHtmlViaCfWebView: vi.fn(),
  fetchPostHtmlViaCfWebView: vi.fn(),
  isCfFetchRetryableError: vi.fn(() => false),
}));

vi.mock('@/lib/book-source/source-http', () => ({
  alignUrlToBookSourceRequestOrigin: vi.fn((url: string) => url),
  buildSourceRequestHeaders: vi.fn(() => ({})),
  resolveSourceCookiesForHttp: vi.fn(() => ''),
  shouldUseAggregationServerFailover: vi.fn(
    (_source: BookSource, url: string) => url.includes('gyks.cf'),
  ),
  listAggregationServerCandidates: vi.fn(() => [
    'https://v1.gyks.cf',
    'https://v2.gyks.cf',
  ]),
  replaceHttpUrlOrigin: vi.fn((url: string, server: string) =>
    url.replace(/^https:\/\/v1\.gyks\.cf/, server.replace(/\/+$/, '')),
  ),
  isRetryableGatewayHttpError: vi.fn(
    (e: unknown) =>
      e instanceof Error &&
      'status' in e &&
      (e as { status: number }).status === 502,
  ),
}));

import { get, HttpError } from '@/lib/http';
import { resolveCloudflareViaInnerWeb } from '@/lib/http/cloudflare-verification';
import { getBookSourcePage } from '@/lib/book-source/source-http-cf';

const source = {
  sourceUrl: 'https://book.test/',
  bookSourceUrl: 'https://book.test/',
  sourceName: '测试书源',
} as BookSource;

describe('source-http-cf', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(resolveCloudflareViaInnerWeb).mockClear();
  });

  it('遇到 CF 挑战页时打开内嵌验证并重试', async () => {
    vi.mocked(get)
      .mockResolvedValueOnce('<html>Just a moment...</html>')
      .mockResolvedValueOnce('<html>ok</html>');

    const html = await getBookSourcePage(source, 'https://book.test/list');

    expect(resolveCloudflareViaInnerWeb).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(html).toBe('<html>ok</html>');
  });

  it('聚合书源 502 时自动切换下一条线路', async () => {
    vi.mocked(get)
      .mockRejectedValueOnce(
        new HttpError(502, 'Bad Gateway', 'https://v1.gyks.cf/catalog?book_id=1'),
      )
      .mockResolvedValueOnce('{"code":0,"data":[]}');

    const html = await getBookSourcePage(
      source,
      'https://v1.gyks.cf/catalog?book_id=1',
    );

    expect(get).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(get).mock.calls[1]?.[0])).toContain('v2.gyks.cf');
    expect(html).toBe('{"code":0,"data":[]}');
  });
});
