import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  cookieHeaderHasCfClearance,
  isCfFetchRetryableError,
  shouldUseCfWebViewFetch,
} from '@/lib/book-source/cf-webview-fetch';
import { setCfActiveRequestOrigin } from '@/lib/book-source/source-http';
import { isLegadoPlaceholderCookieHeader } from '@/lib/js-engine/legado/normalize-legado-ajax-body';

const SOURCE = {
  bookSourceUrl: 'https://banzhu66666.net/',
  sourceUrl: 'https://banzhu66666.net/',
  bookSourceName: 'banzhu',
  bookSourceType: 0,
  loginUrl: '',
} as unknown as BookSource;

describe('CF WebView fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('识别 cf_clearance', () => {
    expect(cookieHeaderHasCfClearance('cf_clearance=abc')).toBe(true);
    expect(cookieHeaderHasCfClearance('a=1')).toBe(false);
  });

  it('仅 __cf_bm（CF bot cookie）不视为需要 WebView', () => {
    expect(cookieHeaderHasCfClearance('__cf_bm=abc')).toBe(false);
    expect(cookieHeaderHasCfClearance('__cf_bm=abc; qttoken=x')).toBe(false);
  });

  it('有活跃域且含 clearance 时用 WebView 拉取', () => {
    setCfActiveRequestOrigin(SOURCE, 'https://www.banzhu77777777.net/');
    expect(shouldUseCfWebViewFetch(SOURCE, 'cf_clearance=x')).toBe(true);
    expect(shouldUseCfWebViewFetch(SOURCE, 'a=1')).toBe(false);
  });

  it('仅 __cf_bm 时不走 WebView（JSON API 域应直连）', () => {
    setCfActiveRequestOrigin(SOURCE, 'https://v1.gyks.cf/');
    expect(shouldUseCfWebViewFetch(SOURCE, '__cf_bm=x; qttoken=t')).toBe(false);
  });

  it('Legado 占位 Cookie 1 不算真实 Cookie', () => {
    expect(isLegadoPlaceholderCookieHeader('1')).toBe(true);
    expect(isLegadoPlaceholderCookieHeader('cf_clearance=x')).toBe(false);
  });

  it('识别 CF WebView 拉取可重试错误', () => {
    expect(isCfFetchRetryableError(new Error('WebJs 执行超时'))).toBe(true);
    expect(isCfFetchRetryableError(new Error('内嵌 panel 未打开'))).toBe(true);
    expect(isCfFetchRetryableError(new Error('普通网络错误'))).toBe(false);
  });
});
