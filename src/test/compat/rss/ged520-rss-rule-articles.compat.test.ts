import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { scriptReferencesJsLibFunctions } from '@/lib/js-engine/legado/js-lib-script-guard';
import { getSourceLoginKey } from '@/lib/js-engine/legado/source-script-shared';
import { evalJs } from '@/lib/js-engine/quickjs-sandbox';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

vi.mock('@/lib/platform/open-url', () => ({
  openLegadoBrowserInApp: vi.fn(async () => ({
    confirmed: true,
    cookies: 'token=abc123',
    url: 'http://ged520.yeoi.me/miyao.html',
  })),
}));

vi.mock('@/lib/js-engine/legado/rule-script-http', () => ({
  requestLegadoRuleScriptHttpAsync: vi.fn(async () =>
    JSON.stringify({
      data: { status: 'ok', token: 'abc' },
      message: { text: 'ok' },
    }),
  ),
}));

vi.mock('@/lib/js-engine/legado/rule-script-http', () => ({
  requestLegadoRuleScriptHttpAsync: vi.fn(async () =>
    JSON.stringify({
      data: { status: 'ok', token: 'abc' },
      message: { text: 'ok' },
    }),
  ),
}));

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/辞晨.json'), 'utf8'),
)[0] as RssSource;

describe('辞晨 ruleArticles jsLib', () => {
  it('识别 TD/setzt/getUrl 依赖 jsLib', () => {
    expect(scriptReferencesJsLibFunctions('TD()')).toBe(true);
    expect(scriptReferencesJsLibFunctions('setzt()')).toBe(true);
    expect(scriptReferencesJsLibFunctions('getUrl()')).toBe(true);
    expect(scriptReferencesJsLibFunctions('eval(String(source.loginUrl))')).toBe(true);
    expect(scriptReferencesJsLibFunctions('java.setContent(html)')).toBe(false);
  });

  it('evalJs 加载 jsLib 执行 getUrl()', async () => {
    const book = rssAsBookSource(source);
    const out = await evalJs('getUrl()', {
      result: '',
      baseUrl: 'http://ged520.yeoi.me/',
      source: book as unknown as Record<string, unknown>,
      bookSource: book,
      ruleContent: '<html></html>',
      ruleContentType: 'html',
    });
    expect(String(out ?? '').trim()).toBe('ged520');
  }, 30_000);

  it('TD() 可调用 java.get 且 cache.delete 不抛错', async () => {
    const { requestLegadoRuleScriptHttpAsync } = await import(
      '@/lib/js-engine/legado/rule-script-http'
    );
    const httpMock = vi.mocked(requestLegadoRuleScriptHttpAsync);
    httpMock.mockClear();

    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    const book = rssAsBookSource(source);
    const out = await evalJs('TD()', {
      result: '',
      baseUrl: 'http://ged520.yeoi.me/',
      source: book as unknown as Record<string, unknown>,
      bookSource: book,
      ruleContent: '<html></html>',
      ruleContentType: 'html',
    });

    expect(httpMock).toHaveBeenCalled();
    expect(String(out ?? '').length).toBeGreaterThan(0);
  }, 30_000);

  it('TD 失败写入 loginInfo 占位后 setzt() 仍应打开 miyao', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    const openMock = vi.mocked(openLegadoBrowserInApp);
    openMock.mockClear();

    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    const book = rssAsBookSource(source);
    const ctx = {
      result: '',
      baseUrl: 'http://ged520.yeoi.me/',
      source: book as unknown as Record<string, unknown>,
      bookSource: book,
      ruleContent: '<html></html>',
      ruleContentType: 'html' as const,
    };

    // 模拟 {{TD()}} 校验失败时写入的占位 loginInfo（辞晨 jsLib TD catch 分支）
    store[getSourceLoginKey(book)] = JSON.stringify({ '密钥：': '密钥🔐已清' });

    await evalJs('setzt()', ctx);

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(String(openMock.mock.calls[0]?.[0] ?? '')).toContain('miyao.html');
  }, 30_000);

  it('setzt() 无密钥时走 startBrowserAwait 并 putLoginInfo', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    const openMock = vi.mocked(openLegadoBrowserInApp);
    openMock.mockClear();

    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    const book = rssAsBookSource(source);
    await evalJs('setzt()', {
      result: '',
      baseUrl: 'http://ged520.yeoi.me/',
      source: book as unknown as Record<string, unknown>,
      bookSource: book,
      ruleContent: '<html></html>',
      ruleContentType: 'html',
    });

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(String(openMock.mock.calls[0]?.[0] ?? '')).toContain('miyao.html');
    expect(openMock.mock.calls[0]?.[3]).toMatchObject({ awaitClose: true });

    const loginKeys = Object.keys(store).filter((k) => k.includes('login'));
    expect(loginKeys.length).toBeGreaterThan(0);
    const loginRaw = store[loginKeys[0]!] ?? '{}';
    const login = JSON.parse(loginRaw) as Record<string, string>;
    expect(login['密钥：']).toBeTruthy();
  }, 30_000);
});
