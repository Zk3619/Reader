import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BookSource } from '@/types';
import { isExploreDrawerSelectSection, mapRawExploreItem } from '@/lib/book-source/explore-sections';
import {
  createLegadoExploreJavaDeviceHandlers,
  detectLegadoExploreDeviceTypeAndroidFirst,
  LEGADO_EXPLORE_DEVICE_JAVA_SHIM,
  patchExploreScriptForReaderWeb,
} from '@/lib/js-engine/legado/legado-explore-java-device';
import {
  buildLegadoExploreScriptBundle,
  createLegadoGetArguments,
  createLegadoScriptCache,
  createSourceVariableHandlers,
  getSourceArgsKey,
  hostsFromJsLib,
} from '@/lib/js-engine/legado/source-script-shared';
import { createExploreInjector } from '@/lib/js-engine/legado/explore-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { initQuickJSRuntime, isQuickJSFallback } from '@/lib/js-engine/core/runtime';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QINGTIAN_FIXTURE = join(__dirname, '../../../../../examples/晴天聚合.json');

function loadQingtianSource(): BookSource {
  const raw = JSON.parse(readFileSync(QINGTIAN_FIXTURE, 'utf8')) as BookSource[];
  const source = raw[0]!;
  return {
    ...source,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName,
  } as BookSource;
}

describe('qingtian explore script device gate', () => {
  it('qread 失败、deviceID 不可用时应识别为安卓（非苹果）', () => {
    const java = createLegadoExploreJavaDeviceHandlers();
    expect(detectLegadoExploreDeviceTypeAndroidFirst(java)).toBe('安卓');
  });

  it('deviceID 宿主静默返回时 androidId 优先探测为安卓', () => {
    const java = {
      qread: () => {
        throw new Error('qread unavailable');
      },
      deviceID: () => {
        /* QuickJS 宿主吞 throw 时静默返回 */
      },
      androidId: () => 'android-id',
    };
    const globalThis = { java };
    // eslint-disable-next-line no-new-func
    new Function('globalThis', LEGADO_EXPLORE_DEVICE_JAVA_SHIM)(globalThis);
    expect(detectLegadoExploreDeviceTypeAndroidFirst(java)).toBe('安卓');
  });

  it('deviceID 误返回字符串会把非 iOS 识别为苹果并阻断 createFilter 门禁', () => {
    const brokenJava = {
      qread: () => {
        throw new Error('qread unavailable');
      },
      deviceID: () => 'fake-ios-id',
      androidId: () => '',
    };
    expect(detectLegadoExploreDeviceTypeAndroidFirst(brokenJava)).toBe('苹果');
    const islyc = true;
    const device_type = detectLegadoExploreDeviceTypeAndroidFirst(brokenJava);
    const gate = (islyc && device_type !== '苹果') || device_type === '轻阅读';
    expect(gate).toBe(false);
  });

  it('buildLegadoExploreScriptBundle 在书源脚本前注入 device java shim', () => {
    const bundle = buildLegadoExploreScriptBundle('', 'result = 1;');
    expect(bundle).toContain('__readerExploreDeviceJavaShim');
    expect(bundle.indexOf('__readerExploreDeviceJavaShim')).toBeLessThan(
      bundle.indexOf('result = 1'),
    );
  });

  it('patchExploreScriptForReaderWeb 替换 device 探测并注入 qtsj 门禁 prelude', () => {
    const source = loadQingtianSource();
    const script = String(source.exploreUrl ?? '')
      .replace(/^<js>/, '')
      .replace(/<\/js>$/, '');
    const patched = patchExploreScriptForReaderWeb(script);
    expect(patched).toContain('__readerExploreDeviceTypeProbe');
    expect(patched).toContain('__readerEnsureQtsjGateEnv');
    expect(patched).not.toMatch(/catch\s*\{\s*java\.deviceID\(\)/);
  });

  it('createFilter 的 show() action 可解析 paramKey', () => {
    const item = mapRawExploreItem({
      title: '模式',
      type: 'select',
      chars: ['小说', '听书'],
      default: '小说',
      action: "show(infoMap['模式'],'find_tab')",
      style: { layout_flexBasisPercent: 0.33 },
    });
    expect(item?.paramKey).toBe('find_tab');
    expect(isExploreDrawerSelectSection(item!)).toBe(true);
  });
});

describe('qingtian explore QuickJS device gate', () => {
  it('嵌套 try/catch 下 qread→deviceID 抛错后 device_type 应为安卓', async () => {
    await initQuickJSRuntime();
    if (isQuickJSFallback()) return;

    const source = loadQingtianSource();
    const argsKey = getSourceArgsKey(source);
    const ls = new Map<string, string>();
    ls.set(argsKey, JSON.stringify({ server: 'https://v1.gyks.cf' }));
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const script = `
let device_type = '安卓';
try {
  try {
    java.qread();
    device_type = '轻阅读';
  } catch {
    java.deviceID();
    device_type = '苹果';
  }
} catch (e) {
  try {
    java.androidId();
    device_type = '安卓';
  } catch (e2) {
    device_type = '安卓';
  }
}
globalThis.result = device_type;
`;

    const injector = createExploreInjector({
      baseUrl: 'https://v1.gyks.cf',
      sourceUrl: source.sourceUrl,
      host: ['https://v1.gyks.cf'],
      resolveUrl: (b, r) => r.startsWith('http') ? r : `${b}${r}`,
      getOrCreateDeviceId: () => '715526ded4651ef6',
      cookie: {
        getCookie: () => '',
        setCookie: () => {},
        removeCookie: () => {},
        getKey: () => '',
      },
      source: {
        getVariable: () => ls.get(argsKey) ?? '',
        setVariable: (v) => { if (v) ls.set(argsKey, v); },
        getLoginInfoMap: () => ({}),
      },
      request: async () => '',
    });

    const out = await runLegadoScriptQuickJS({
      script,
      baseUrl: 'https://v1.gyks.cf',
      timeoutMs: 5000,
      mode: 'two-pass',
      inject: injector,
    });

    expect(out).toBe('安卓');
    vi.unstubAllGlobals();
  });

  it('checkEnv + 门禁：改包环境应通过 createFilter 分支', async () => {
    await initQuickJSRuntime();
    if (isQuickJSFallback()) return;

    const source = loadQingtianSource();
    const jsLib = String(source.jsLib ?? '');
    const argsKey = getSourceArgsKey(source);
    const ls = new Map<string, string>();
    ls.set(
      argsKey,
      JSON.stringify({
        server: 'https://v1.gyks.cf',
        tab: '小说',
        find_tab: '小说',
        sources: '番茄',
        find_source: '番茄',
        source_type: '男频',
      }),
    );
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const probeScript = `
function checkEnv() {
  let isModified = false;
  try {
    new Packages.io.legato.kazusa.utils.TimeoutCancellationException('');
    isModified = true;
  } catch (e) {
    isModified = typeof source.loginUi == 'function' ? false : true;
  }
  return isModified;
}
var islyc = checkEnv();
var open_argument = source.getVariable();
var base_url = getArguments(open_argument, 'server') || host[0];
var fxyjr = getArguments(open_argument, 'fxyjr');
var qtsj = [];
let device_type = '安卓';
try {
  try { java.qread(); device_type = '轻阅读'; } catch {
    java.deviceID(); device_type = '苹果';
  }
} catch (e) {
  try { java.androidId(); device_type = '安卓'; } catch { device_type = '安卓'; }
}
var gate = ((islyc && device_type != '苹果') || device_type == '轻阅读') && fxyjr != 'on';
if (gate) {
  qtsj.push(createFilter('线路', host, base_url, 'server', 1));
}
globalThis.result = JSON.stringify({ islyc, device_type, gate, qtsjLen: qtsj.length });
`;

    const script = buildLegadoExploreScriptBundle(jsLib, probeScript);
    const injector = createExploreInjector({
      baseUrl: 'https://v1.gyks.cf',
      sourceUrl: source.sourceUrl,
      host: ['https://v1.gyks.cf'],
      resolveUrl: (b, r) => (r.startsWith('http') ? r : `${b}${r}`),
      getOrCreateDeviceId: () => '715526ded4651ef6',
      cookie: {
        getCookie: () => '',
        setCookie: () => {},
        removeCookie: () => {},
        getKey: () => '',
      },
      source: {
        getVariable: () => ls.get(argsKey) ?? '',
        setVariable: (v) => { if (v) ls.set(argsKey, v); },
        getLoginInfoMap: () => ({}),
      },
      request: async () => '',
    });

    const raw = await runLegadoScriptQuickJS({
      script,
      baseUrl: 'https://v1.gyks.cf',
      timeoutMs: 8000,
      mode: 'two-pass',
      inject: injector,
    });
    const parsed = JSON.parse(String(raw)) as {
      islyc: boolean;
      device_type: string;
      gate: boolean;
      qtsjLen: number;
    };
    expect(parsed.device_type).toBe('安卓');
    expect(parsed.islyc).toBe(true);
    expect(parsed.gate).toBe(true);
    expect(parsed.qtsjLen).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe('qingtian explore qtsj createFilter path', () => {
  const ls = new Map<string, string>();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => {
        ls.set(k, v);
      },
      removeItem: (k: string) => {
        ls.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('device 桩修正后 createFilter 可写入 qtsj', () => {
    const source = loadQingtianSource();
    const jsLib = String(source.jsLib ?? '');
    const server = 'https://v1.gyks.cf';
    const argsKey = getSourceArgsKey(source);
    ls.set(
      argsKey,
      JSON.stringify({
        server,
        tab: '小说',
        find_tab: '小说',
        sources: '番茄',
        find_source: '番茄',
        source_type: '男频',
      }),
    );

    const hosts = hostsFromJsLib(jsLib);
    const deviceHandlers = createLegadoExploreJavaDeviceHandlers(source);
    const sourceVars = createSourceVariableHandlers(source, argsKey);
    const device_type = detectLegadoExploreDeviceTypeAndroidFirst({
      qread: () => deviceHandlers.qread(),
      deviceID: () => deviceHandlers.deviceID(),
      androidId: () => deviceHandlers.androidId(),
    });

    const probeScript = `
var open_argument = source.getVariable();
var base_url = getArguments(open_argument, 'server') || host[0];
var islyc = true;
var fxyjr = getArguments(open_argument, 'fxyjr');
var qtsj = [];
if (((islyc && device_type != '苹果') || device_type == '轻阅读') && fxyjr != "on") {
  try {
    qtsj.push(createFilter("线路", host, base_url, "server", 1));
    qtsj.push(createFilter("模式", ["小说", "听书"], "小说", "find_tab", 0.33));
  } catch (e) {
    result = "ERR:" + e;
  }
}
if (typeof result === "undefined") {
  result = JSON.stringify(qtsj);
}
`;

    const script = buildLegadoExploreScriptBundle(
      jsLib,
      `var device_type = ${JSON.stringify(device_type)};\n${probeScript}`,
    );

    const scopeObj: Record<string, unknown> = {
      result: undefined,
      baseUrl: server,
      host: hosts,
      cache: createLegadoScriptCache(),
      getArguments: createLegadoGetArguments(server),
      source: {
        getVariable: (key?: string) => sourceVars.getVariable(key),
        setVariable: (val?: string) => sourceVars.setVariable(val),
        getLoginInfoMap: () => ({}),
      },
      java: {
        toast() {},
        longToast() {},
        log() {},
        androidId: () => deviceHandlers.androidId(),
        deviceID: () => deviceHandlers.deviceID(),
        qread: () => deviceHandlers.qread(),
        ajax: () => '',
      },
      cookie: {
        getCookie: () => '',
        setCookie: () => {},
        removeCookie: () => {},
        getKey: () => '',
      },
    };

    const run = new Function(
      '__scope__',
      'scriptText',
      'try { with(__scope__) { eval(scriptText); } } catch (e) { __scope__.result = "ERR:" + e; }',
    );
    run(scopeObj, script);

    expect(String(scopeObj.result)).not.toMatch(/^ERR:/);
    const qtsj = JSON.parse(String(scopeObj.result)) as Array<{ title: string; type: string }>;
    expect(qtsj.map((x) => x.title)).toEqual(['线路', '模式']);
    expect(qtsj.every((x) => x.type === 'select')).toBe(true);
  });
});
