import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BookSource } from '@/types';
import {
  isExploreDrawerButtonSection,
  isExploreDrawerTextSection,
  mapRawExploreItem,
} from '@/lib/book-source/explore-sections';
import { patchExploreScriptForReaderWeb } from '@/lib/js-engine/legado/legado-explore-java-device';
import {
  buildLegadoExploreScriptBundle,
  buildLegadoScriptSourceFace,
  createSourceVariableHandlers,
  getSourceArgsKey,
  getSourceCookiesKey,
  hostsFromJsLib,
  type LegadoScriptSourceFace,
} from '@/lib/js-engine/legado/source-script-shared';
import { createExploreInjector } from '@/lib/js-engine/legado/explore-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { initQuickJSRuntime, isQuickJSFallback } from '@/lib/js-engine/core/runtime';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUANGYU_FIXTURE = join(__dirname, '../../../../../examples/光遇聚合.txt');

function loadGuangyuSource(): BookSource {
  const raw = JSON.parse(readFileSync(GUANGYU_FIXTURE, 'utf8')) as BookSource[];
  const source = raw[0]!;
  return {
    ...source,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName,
  } as BookSource;
}

function extractExploreScript(exploreUrl: string): string {
  return exploreUrl.replace(/^<js>/, '').replace(/<\/js>$/, '').trim();
}

describe('guangyu explore sections', () => {
  it('patchExploreScriptForReaderWeb 在 finalData 前注入搜索行', () => {
    const source = loadGuangyuSource();
    const script = extractExploreScript(String(source.exploreUrl ?? ''));
    const patched = patchExploreScriptForReaderWeb(script);
    expect(patched).toContain('__readerGyksInjectSearchRow');
    expect(patched).toContain("java.openBookSearch(infoMap['搜索书名或作者'])");
  });

  it('patchExploreScriptForReaderWeb discovestyle 使用动态 BaseUrl()', () => {
    const source = loadGuangyuSource();
    const script = extractExploreScript(String(source.exploreUrl ?? ''));
    const patched = patchExploreScriptForReaderWeb(script);
    expect(patched).toContain('var durl = `${BaseUrl()}/discovestyle?');
    expect(patched).toContain("let qtsjurl = BaseUrl() + '/get_book_shelf,");
  });

  it('getCloudSettings guard 不使用 this.getVariable', () => {
    const bundle = buildLegadoExploreScriptBundle(
      'function getCloudSettings(r) { return "ok"; }',
      'var x = getCloudSettings(true); globalThis.result = JSON.stringify(x);',
    );
    expect(bundle).not.toMatch(/this\.getVariable/);
  });

  it('更新配置/书源设置 为 type=button + action', () => {
    for (const title of ['更新配置', '更新书源', '书源设置']) {
      const item = mapRawExploreItem({
        title,
        type: 'button',
        action:
          title === '更新配置'
            ? 'getCloudSettings(true)'
            : title === '更新书源'
              ? 'renderVersionPage()'
              : 'getHtmlSettings()',
      });
      expect(item?.type).toBe('button');
      expect(isExploreDrawerButtonSection(item!)).toBe(true);
      expect(item?.url).toBeUndefined();
    }
  });

  it('text 类型可识别', () => {
    const item = mapRawExploreItem({
      title: '搜索书名或作者',
      type: 'text',
    });
    expect(isExploreDrawerTextSection(item!)).toBe(true);
  });
});

describe('guangyu getToken login shelf gate', () => {
  const ls = new Map<string, string>();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('已登录 qttoken 时应输出晴天书架', async () => {
    await initQuickJSRuntime();
    if (isQuickJSFallback()) return;

    const source = loadGuangyuSource();
    const jsLib = String(source.jsLib ?? '');
    const server = 'https://v1.gyks.cf';
    const argsKey = getSourceArgsKey(source);
    const cookiesKey = getSourceCookiesKey(source);
    const token = 'abc12345678901234567890123456789012';
    ls.set(
      argsKey,
      JSON.stringify({
        线路: server,
        云端配置: { hosts: [server], version: '1' },
        发现页来源: '番茄',
        发现页类型: '小说',
        频道: '男频',
      }),
    );
    ls.set(
      cookiesKey,
      JSON.stringify({
        [server]: `qttoken=${token}; deviceId=d1;`,
      }),
    );

    const probeScript = `
var base_url = BaseUrl();
let qttoken = getToken();
var qtsj = [];
if (qttoken.length > 10) {
  qtsj.push({ title: '晴天书架', url: base_url + '/shelf' });
} else {
  qtsj.push({ title: '登录晴天书源', url: 'login' });
}
globalThis.result = JSON.stringify({ qttokenLen: qttoken.length, titles: qtsj.map(x => x.title) });
`;

    const script = buildLegadoExploreScriptBundle(jsLib, probeScript);
    const sourceVars = createSourceVariableHandlers(source, argsKey);
    const injector = createExploreInjector({
      baseUrl: server,
      sourceUrl: source.sourceUrl,
      host: hostsFromJsLib(jsLib),
      resolveUrl: (b, r) => (r.startsWith('http') ? r : `${b}${r}`),
      getOrCreateDeviceId: () => '715526ded4651ef6',
      getArgToken: () => token,
      cookie: {
        getCookie: (url) => {
          const raw = ls.get(cookiesKey);
          if (!raw) return '';
          const obj = JSON.parse(raw) as Record<string, string>;
          return obj[url] ?? obj[server] ?? '';
        },
        setCookie: () => {},
        removeCookie: () => {},
        getKey: (cookieStr, key) => {
          const s = String(cookieStr);
          const m = s.match(new RegExp(`${key ?? 'qttoken'}=([^;]+)`, 'i'));
          return m?.[1] ?? '';
        },
      },
      source: buildLegadoScriptSourceFace(source, sourceVars, source.sourceUrl),
      request: async () => '',
    });

    const raw = await runLegadoScriptQuickJS({
      script,
      baseUrl: server,
      timeoutMs: 8000,
      mode: 'two-pass',
      inject: injector,
    });
    const parsed = JSON.parse(String(raw)) as { qttokenLen: number; titles: string[] };
    expect(parsed.qttokenLen).toBeGreaterThan(10);
    expect(parsed.titles).toContain('晴天书架');
    expect(parsed.titles).not.toContain('登录晴天书源');
  });
});

describe('guangyu getToken fallback via cookie.getKey', () => {
  it('bundle 注入 getToken 回退可读 cookie.getKey', async () => {
    await initQuickJSRuntime();
    if (isQuickJSFallback()) return;

    const source = loadGuangyuSource();
    const jsLib = String(source.jsLib ?? '');
    const server = 'https://v1.gyks.cf';
    const script = buildLegadoExploreScriptBundle(
      jsLib,
      `globalThis.result = getToken();`,
    );
    const token = 'abc12345678901234567890123456789012';
    const injector = createExploreInjector({
      baseUrl: server,
      sourceUrl: source.sourceUrl,
      host: [server],
      resolveUrl: (_b, r) => r,
      getOrCreateDeviceId: () => 'd1',
      getArgToken: () => token,
      cookie: {
        getCookie: () => '',
        setCookie: () => {},
        removeCookie: () => {},
        getKey: (_u, key) => (key === 'qttoken' ? token : ''),
      },
      source: {
        getVariable: () =>
          JSON.stringify({ 云端配置: { hosts: [server] }, 线路: server }),
        setVariable: () => {},
        getLoginInfoMap: () => ({ get: () => null }),
      } as unknown as LegadoScriptSourceFace,
      request: async () => '',
    });

    const out = await runLegadoScriptQuickJS({
      script,
      baseUrl: server,
      timeoutMs: 8000,
      mode: 'two-pass',
      inject: injector,
    });
    expect(String(out)).toBe(token);
  });
});
