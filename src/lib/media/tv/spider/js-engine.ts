/**
 * type 3 .js Spider — QuickJS 优先（req suspend/replay），Function 降级
 * Host 对齐 FongMi Global/Local 子集
 */

import type { QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten';
import CryptoJS from 'crypto-js';
import {
  createQuickJSContext,
  createTvQuickJSRuntimeContext,
  evalCodeVoid,
  initQuickJSRuntime,
  isQuickJSFallback,
} from '@/lib/js-engine/core/runtime';
import {
  attachTvModuleLoader,
  buildDrpyRequest,
  buildSpiderBootstrap,
  buildSpiderInitArg,
  evalModuleVoid,
  isEsModuleSpiderSource,
  prefetchTvModuleTree,
  resolveTvModuleUrl,
} from './tv-js-module';
import { pd, pdfa, pdfh, pdfl } from './tv-js-html-parser';
import { bindVmFunction } from '@/lib/js-engine/legado/host/bind-vm';
import { get } from '@/lib/http';
import {
  preloadChineseConverter,
  convertChineseSync,
} from '@/lib/replace-rules/chinese-converter';
import type { Result, Site } from '../types';
import type {
  CategoryArgs,
  PlayerArgs,
  SearchArgs,
  SpiderEngine,
} from './types';
import { emptyResult, parseResultJson } from './types';
import { resolveProxyBaseUrl } from '../proxy/client';

type SpiderFnMap = {
  /** catvod 可传对象；drpy 多为 string */
  init?: (ext: unknown) => unknown;
  home?: (filter: boolean) => string;
  homeVod?: () => string;
  category?: (
    tid: string,
    pg: string,
    filter: boolean,
    extend: Record<string, string>,
  ) => string;
  detail?: (id: string) => string;
  search?: (key: string, quick: boolean, pg?: string) => string;
  play?: (flag: string, id: string, flags: string[]) => string;
  proxy?: (params: Record<string, string>) => unknown;
  action?: (action: string, value: string) => string;
  __vm?: QuickJSContext;
  __runtime?: QuickJSRuntime;
};

type ReqResult = { code: number; content: string; headers: Record<string, string> };

const TV_REQ_SUSPEND = '__TV_REQ_SUSPEND__';
const cache = new Map<string, SpiderFnMap>();
const localStore = new Map<string, string>();
const reqCache = new Map<string, ReqResult>();
let pendingReqKey = '';
let pendingReqUrl = '';
let pendingReqOpt: { method?: string; headers?: Record<string, string>; body?: string } | undefined;

async function loadScript(api: string, baseUrl: string): Promise<string> {
  let url = api;
  if (!api.startsWith('http://') && !api.startsWith('https://') && baseUrl) {
    try {
      url = new URL(api, baseUrl).toString();
    } catch {
      url = api;
    }
  }
  return get(url, { timeout: 30000 });
}

async function doHttp(
  url: string,
  opt?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<ReqResult> {
  const { tvRequest } = await import('../net/rules');
  const res = await tvRequest(url, {
    method: (opt?.method as 'GET' | 'POST') || 'GET',
    headers: opt?.headers,
    body: opt?.body,
    timeout: 20000,
  });
  const text = await res.text();
  const headers: Record<string, string> = { ...res.headers };
  return { code: res.status, content: text, headers };
}

function buildHost(site: Site, proxyBase: string) {
  return {
    req(url: string, opt?: { method?: string; headers?: Record<string, string>; body?: string }) {
      const key = JSON.stringify([url, opt?.method, opt?.headers, opt?.body]);
      const hit = reqCache.get(key);
      if (hit) return hit;
      pendingReqKey = key;
      pendingReqUrl = url;
      pendingReqOpt = opt;
      throw new Error(TV_REQ_SUSPEND);
    },
    getProxy(dynamic = false) {
      return `${proxyBase}?do=js&siteKey=${encodeURIComponent(site.key)}${dynamic ? '&dynamic=1' : ''}`;
    },
    js2Proxy(dynamic: boolean, siteKey: string, header: Record<string, string>, url: string) {
      const h = encodeURIComponent(JSON.stringify(header ?? {}));
      return `proxy://do=js&siteKey=${encodeURIComponent(siteKey || site.key)}&header=${h}&url=${encodeURIComponent(url)}${dynamic ? '&dynamic=1' : ''}`;
    },
    joinUrl(base: string, path: string) {
      try {
        return new URL(path, base).toString();
      } catch {
        return path;
      }
    },
    md5X(text: string) {
      return CryptoJS.MD5(String(text)).toString();
    },
    aesX(
      mode: string,
      encrypt: boolean,
      input: string,
      inBase64: boolean,
      key: string,
      iv: string,
      outBase64: boolean,
    ) {
      const keyWA = CryptoJS.enc.Utf8.parse(key);
      const ivWA = CryptoJS.enc.Utf8.parse(iv);
      const data = inBase64
        ? CryptoJS.enc.Base64.parse(input)
        : CryptoJS.enc.Utf8.parse(input);
      if (encrypt) {
        const enc = CryptoJS.AES.encrypt(data as unknown as CryptoJS.lib.WordArray, keyWA, {
          iv: ivWA,
          mode: mode?.toUpperCase().includes('CBC')
            ? CryptoJS.mode.CBC
            : CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        });
        return outBase64 ? enc.toString() : enc.ciphertext.toString(CryptoJS.enc.Utf8);
      }
      const dec = CryptoJS.AES.decrypt(
        inBase64 ? input : CryptoJS.enc.Base64.stringify(data),
        keyWA,
        {
          iv: ivWA,
          mode: mode?.toUpperCase().includes('CBC')
            ? CryptoJS.mode.CBC
            : CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        },
      );
      return outBase64
        ? CryptoJS.enc.Base64.stringify(dec)
        : dec.toString(CryptoJS.enc.Utf8);
    },
    rsaX() {
      throw new Error('rsaX not supported; use csp_* JAR if needed');
    },
    s2t(s: string) {
      return convertChineseSync(String(s ?? ''), 2);
    },
    t2s(s: string) {
      return convertChineseSync(String(s ?? ''), 1);
    },
    Local: {
      // drpy: local.get(RKEY, k) / local.set(RKEY, k, v)；FongMi 也有 2 参形式
      get(a: string, b?: string) {
        const key = b == null ? a : `${a}:${b}`;
        return localStore.get(`${site.key}:${key}`) ?? '';
      },
      set(a: string, b: string, c?: string) {
        if (c === undefined) {
          localStore.set(`${site.key}:${a}`, String(b ?? ''));
        } else {
          localStore.set(`${site.key}:${a}:${b}`, String(c ?? ''));
        }
      },
      delete(a: string, b?: string) {
        const key = b == null ? a : `${a}:${b}`;
        localStore.delete(`${site.key}:${key}`);
      },
    },
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
  };
}

async function withReqReplay<T>(run: () => T): Promise<T> {
  for (let i = 0; i < 32; i++) {
    try {
      return run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes(TV_REQ_SUSPEND) || !pendingReqUrl) throw e;
      const result = await doHttp(pendingReqUrl, pendingReqOpt);
      reqCache.set(pendingReqKey, result);
      pendingReqUrl = '';
    }
  }
  throw new Error('tv js req replay exceeded');
}

function extractSpiderFromGlobal(): SpiderFnMap {
  const g = globalThis as unknown as { __TV_SPIDER__?: SpiderFnMap };
  return g.__TV_SPIDER__ ?? {};
}

function wrapSource(source: string): string {
  return `
    var req = globalThis.__tv_req;
    var getProxy = globalThis.__tv_getProxy;
    var js2Proxy = globalThis.__tv_js2Proxy;
    var joinUrl = globalThis.__tv_joinUrl;
    var md5X = globalThis.__tv_md5X;
    var aesX = globalThis.__tv_aesX;
    var rsaX = globalThis.__tv_rsaX;
    var s2t = globalThis.__tv_s2t;
    var t2s = globalThis.__tv_t2s;
    var Local = globalThis.__tv_Local;
    var setTimeout = globalThis.__tv_setTimeout;
    var rule = null;
    ${source}
    if (typeof __jsEvalReturn === 'function') {
      globalThis.__TV_SPIDER__ = __jsEvalReturn();
    } else if (typeof spider === 'object' && spider) {
      globalThis.__TV_SPIDER__ = spider;
    } else if (typeof exportSource === 'function') {
      globalThis.__TV_SPIDER__ = exportSource();
    } else {
      globalThis.__TV_SPIDER__ = {
        init: typeof init === 'function' ? init : undefined,
        home: typeof home === 'function' ? home : undefined,
        homeVod: typeof homeVod === 'function' ? homeVod : undefined,
        category: typeof category === 'function' ? category : undefined,
        detail: typeof detail === 'function' ? detail : undefined,
        search: typeof search === 'function' ? search : undefined,
        play: typeof play === 'function' ? play : undefined,
        proxy: typeof proxy === 'function' ? proxy : undefined,
        action: typeof action === 'function' ? action : undefined,
      };
    }
  `;
}

function wrapSourceForQuickJS(source: string): string {
  return `
    var rule = null;
    ${source}
    if (typeof __jsEvalReturn === 'function') {
      globalThis.__TV_SPIDER__ = __jsEvalReturn();
    } else if (typeof spider === 'object' && spider) {
      globalThis.__TV_SPIDER__ = spider;
    } else if (typeof exportSource === 'function') {
      globalThis.__TV_SPIDER__ = exportSource();
    } else {
      globalThis.__TV_SPIDER__ = {
        init: typeof init === 'function' ? init : undefined,
        home: typeof home === 'function' ? home : undefined,
        homeVod: typeof homeVod === 'function' ? homeVod : undefined,
        category: typeof category === 'function' ? category : undefined,
        detail: typeof detail === 'function' ? detail : undefined,
        search: typeof search === 'function' ? search : undefined,
        play: typeof play === 'function' ? play : undefined,
        proxy: typeof proxy === 'function' ? proxy : undefined,
        action: typeof action === 'function' ? action : undefined,
      };
    }
  `;
}

function installHostGlobals(host: ReturnType<typeof buildHost>): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__tv_req = host.req.bind(host);
  g.__tv_getProxy = host.getProxy.bind(host);
  g.__tv_js2Proxy = host.js2Proxy.bind(host);
  g.__tv_joinUrl = host.joinUrl.bind(host);
  g.__tv_md5X = host.md5X.bind(host);
  g.__tv_aesX = host.aesX.bind(host);
  g.__tv_rsaX = () => {
    throw new Error('rsaX not supported; use csp_* JAR if needed');
  };
  g.__tv_s2t = host.s2t.bind(host);
  g.__tv_t2s = host.t2s.bind(host);
  g.__tv_Local = host.Local;
  g.__tv_setTimeout = host.setTimeout;
  g.pdfh = pdfh;
  g.pdfa = pdfa;
  g.pd = pd;
  g.pdfl = pdfl;
  g.pdfla = pdfl;
  g.print = (...args: unknown[]) => console.log('[tv-js]', ...args);
  g.log = g.print;
  g.console = globalThis.console;
  g.global = globalThis;
  g.window = globalThis;
  g.self = globalThis;
}

function injectQuickJsHost(
  vm: QuickJSContext,
  host: ReturnType<typeof buildHost>,
  siteKey: string,
): void {
  const reqHandle = vm.newFunction('req', (urlH, optH) => {
    const url = vm.getString(urlH);
    let opt: { method?: string; headers?: Record<string, string>; body?: string } | undefined;
    if (optH) {
      try {
        opt = vm.dump(optH) as typeof opt;
      } catch {
        opt = undefined;
      }
    }
    const result = host.req(url, opt);
    const code = `({code:${result.code},content:${JSON.stringify(result.content)},headers:${JSON.stringify(result.headers)}})`;
    const r = vm.evalCode(code);
    if (r.error) {
      r.error.dispose();
      return vm.newString(JSON.stringify(result));
    }
    return r.value;
  });
  vm.setProp(vm.global, 'req', reqHandle);
  reqHandle.dispose();

  bindVmFunction(vm, vm.global, 'getProxy', (d) =>
    vm.newString(host.getProxy(d ? Boolean(vm.dump(d)) : false)),
  );
  bindVmFunction(vm, vm.global, 'md5X', (h) =>
    vm.newString(host.md5X(h ? vm.getString(h) : '')),
  );
  bindVmFunction(vm, vm.global, 'joinUrl', (a, b) =>
    vm.newString(host.joinUrl(a ? vm.getString(a) : '', b ? vm.getString(b) : '')),
  );
  bindVmFunction(vm, vm.global, 'js2Proxy', (dyn, sk, hdr, url) => {
    const dynamic = dyn ? Boolean(vm.dump(dyn)) : false;
    const skStr = sk ? vm.getString(sk) : siteKey;
    const header = (hdr ? (vm.dump(hdr) as Record<string, string>) : {}) ?? {};
    const u = url ? vm.getString(url) : '';
    return vm.newString(host.js2Proxy(dynamic, skStr, header, u));
  });
  bindVmFunction(vm, vm.global, 'aesX', (mode, enc, input, inB64, key, iv, outB64) =>
    vm.newString(
      host.aesX(
        mode ? vm.getString(mode) : 'CBC',
        enc ? Boolean(vm.dump(enc)) : false,
        input ? vm.getString(input) : '',
        inB64 ? Boolean(vm.dump(inB64)) : false,
        key ? vm.getString(key) : '',
        iv ? vm.getString(iv) : '',
        outB64 ? Boolean(vm.dump(outB64)) : false,
      ),
    ),
  );
  bindVmFunction(vm, vm.global, 'rsaX', () => {
    throw new Error('rsaX not supported; use csp_* JAR if needed');
  });
  bindVmFunction(vm, vm.global, 's2t', (h) =>
    vm.newString(host.s2t(h ? vm.getString(h) : '')),
  );
  bindVmFunction(vm, vm.global, 't2s', (h) =>
    vm.newString(host.t2s(h ? vm.getString(h) : '')),
  );
  bindVmFunction(vm, vm.global, 'request', (urlH, optH) => {
    const url = urlH ? vm.getString(urlH) : '';
    let opt: { method?: string; headers?: Record<string, string>; body?: string } | undefined;
    if (optH) {
      try {
        opt = vm.dump(optH) as typeof opt;
      } catch {
        opt = undefined;
      }
    }
    return vm.newString(buildDrpyRequest(host.req.bind(host))(url, opt));
  });

  // FongMi Console + 全局别名（drpy2 init 会 console.log）
  const consoleObj = vm.newObject();
  const emitLog = (...handles: unknown[]) => {
    const parts = handles.map((h) => {
      if (h === undefined || h === null) return '';
      try {
        return vm.dump(h as Parameters<typeof vm.dump>[0]);
      } catch {
        return String(h);
      }
    });
    console.log('[tv-js]', ...parts);
  };
  for (const name of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    bindVmFunction(vm, consoleObj, name, (...args) => {
      emitLog(...args);
    });
  }
  vm.setProp(vm.global, 'console', consoleObj);
  consoleObj.dispose();

  bindVmFunction(vm, vm.global, 'getProxyUrl', () =>
    vm.newString(host.getProxy(false)),
  );
  evalCodeVoid(
    vm,
    `
    globalThis.global = globalThis;
    globalThis.window = globalThis;
    globalThis.self = globalThis;
  `,
  );

  // FongMi/TVBox Global：drpy2 模块求值前必须存在
  bindVmFunction(vm, vm.global, 'pdfh', (h, r) =>
    vm.newString(pdfh(h ? vm.getString(h) : '', r ? vm.getString(r) : '')),
  );
  bindVmFunction(vm, vm.global, 'pdfa', (h, r) => {
    const arr = pdfa(h ? vm.getString(h) : '', r ? vm.getString(r) : '');
    const code = JSON.stringify(arr);
    const er = vm.evalCode(`(${code})`);
    if (er.error) {
      er.error.dispose();
      return vm.newArray();
    }
    return er.value;
  });
  bindVmFunction(vm, vm.global, 'pd', (h, r, u) =>
    vm.newString(
      pd(h ? vm.getString(h) : '', r ? vm.getString(r) : '', u ? vm.getString(u) : ''),
    ),
  );
  bindVmFunction(vm, vm.global, 'pdfl', (h, p1, lt, lu, au) => {
    const arr = pdfl(
      h ? vm.getString(h) : '',
      p1 ? vm.getString(p1) : '',
      lt ? vm.getString(lt) : '',
      lu ? vm.getString(lu) : '',
      au ? vm.getString(au) : '',
    );
    const code = JSON.stringify(arr);
    const er = vm.evalCode(`(${code})`);
    if (er.error) {
      er.error.dispose();
      return vm.newArray();
    }
    return er.value;
  });
  bindVmFunction(vm, vm.global, 'pdfla', (h, p1, lt, lu, au) => {
    const arr = pdfl(
      h ? vm.getString(h) : '',
      p1 ? vm.getString(p1) : '',
      lt ? vm.getString(lt) : '',
      lu ? vm.getString(lu) : '',
      au ? vm.getString(au) : '',
    );
    const code = JSON.stringify(arr);
    const er = vm.evalCode(`(${code})`);
    if (er.error) {
      er.error.dispose();
      return vm.newArray();
    }
    return er.value;
  });
  bindVmFunction(vm, vm.global, 'print', (h) => {
    console.log('[tv-js]', h ? vm.dump(h) : '');
  });
  bindVmFunction(vm, vm.global, 'log', (h) => {
    console.log('[tv-js]', h ? vm.dump(h) : '');
  });

  const localObj = vm.newObject();
  bindVmFunction(vm, localObj, 'get', (a, b) =>
    vm.newString(host.Local.get(a ? vm.getString(a) : '', b ? vm.getString(b) : undefined)),
  );
  bindVmFunction(vm, localObj, 'set', (a, b, c) => {
    host.Local.set(
      a ? vm.getString(a) : '',
      b ? vm.getString(b) : '',
      c ? vm.getString(c) : undefined,
    );
  });
  bindVmFunction(vm, localObj, 'delete', (a, b) => {
    host.Local.delete(a ? vm.getString(a) : '', b ? vm.getString(b) : undefined);
  });
  vm.setProp(vm.global, 'Local', localObj);
  vm.setProp(vm.global, 'local', localObj);
  localObj.dispose();
}

function buildQuickJsSpiderCall(vm: QuickJSContext): Omit<SpiderFnMap, '__vm' | '__runtime'> {
  const call = (name: string, args: unknown[]): string => {
    // 禁止把 JS undefined 拼进 eval（会触发 unexpected token: 'undefined'）
    const argsJson = JSON.stringify(args, (_k, v) => (v === undefined ? null : v));
    const code = `(function(){
      var sp = globalThis.__TV_SPIDER__ || {};
      var fn = sp[${JSON.stringify(name)}];
      if (typeof fn !== 'function') return null;
      var args = ${argsJson};
      var out = fn.apply(sp, args);
      if (out == null) return null;
      return typeof out === 'string' ? out : JSON.stringify(out);
    })()`;
    const r = vm.evalCode(code);
    if (r.error) {
      const err = vm.dump(r.error);
      r.error.dispose();
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
      throw new Error(msg);
    }
    try {
      return String(vm.dump(r.value) ?? '');
    } finally {
      r.value.dispose();
    }
  };

  return {
    init: (ext) => call('init', [ext]),
    home: (filter) => call('home', [filter]),
    homeVod: () => call('homeVod', []),
    category: (tid, pg, filter, extend) => call('category', [tid, pg, filter, extend]),
    detail: (id) => call('detail', [id]),
    search: (key, quick, pg) => call('search', [key, quick, pg == null || pg === '' ? '1' : String(pg)]),
    play: (flag, id, flags) => call('play', [flag, id, flags]),
    proxy: (params) => {
      const raw = call('proxy', [params]);
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    action: (action, value) => call('action', [action, value ?? '']),
  };
}

function loadSpiderViaQuickJS(
  site: Site,
  source: string,
  host: ReturnType<typeof buildHost>,
): SpiderFnMap | null {
  const vm = createQuickJSContext();
  if (!vm) return null;
  try {
    injectQuickJsHost(vm, host, site.key);
    evalCodeVoid(vm, wrapSourceForQuickJS(source));
    return { ...buildQuickJsSpiderCall(vm), __vm: vm };
  } catch (e) {
    try {
      vm.dispose();
    } catch {
      /* */
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(TV_REQ_SUSPEND)) throw e;
    console.warn('[tv-js] QuickJS load failed, fallback Function', e);
    return null;
  }
}

async function loadSpiderViaQuickJSModule(
  site: Site,
  source: string,
  host: ReturnType<typeof buildHost>,
  apiUrl: string,
  configBase: string,
): Promise<SpiderFnMap | null> {
  const pair = createTvQuickJSRuntimeContext();
  if (!pair) return null;
  const { vm, runtime } = pair;
  try {
    const moduleCache = await prefetchTvModuleTree(apiUrl, source, configBase, (url) =>
      loadScript(url, configBase),
    );
    attachTvModuleLoader(runtime, moduleCache, apiUrl, configBase);
    injectQuickJsHost(vm, host, site.key);
    const entry = resolveTvModuleUrl(configBase || apiUrl, apiUrl, configBase) || apiUrl;
    evalModuleVoid(vm, buildSpiderBootstrap(entry), `${entry}?bootstrap=1`);
    return { ...buildQuickJsSpiderCall(vm), __vm: vm, __runtime: runtime };
  } catch (e) {
    try {
      vm.dispose();
    } catch {
      /* */
    }
    try {
      runtime.dispose();
    } catch {
      /* */
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(TV_REQ_SUSPEND)) throw e;
    console.warn('[tv-js] QuickJS ES module load failed', e);
    return null;
  }
}

async function createSpiderFns(site: Site, source: string, configBase: string): Promise<SpiderFnMap> {
  await initQuickJSRuntime();
  await preloadChineseConverter(1);
  await preloadChineseConverter(2);
  const proxyBase = await resolveProxyBaseUrl();
  const host = buildHost(site, proxyBase);
  const apiUrl = site.api;
  const esModule = isEsModuleSpiderSource(source);

  if (!isQuickJSFallback()) {
    for (let i = 0; i < 32; i++) {
      try {
        const last = esModule
          ? await loadSpiderViaQuickJSModule(site, source, host, apiUrl, configBase)
          : loadSpiderViaQuickJS(site, source, host);
        if (last) return last;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes(TV_REQ_SUSPEND) || !pendingReqUrl) {
          console.warn('[tv-js] QuickJS error', e);
          break;
        }
        const result = await doHttp(pendingReqUrl, pendingReqOpt);
        reqCache.set(pendingReqKey, result);
        pendingReqUrl = '';
      }
    }
  }

  if (esModule) {
    throw new Error(
      `${site.key}: drpy2/catvod ES Module 源需 QuickJS 引擎，当前无法降级到 Function 执行`,
    );
  }

  installHostGlobals(host);
  (globalThis as unknown as Record<string, unknown>).__tv_request = buildDrpyRequest(host.req.bind(host));
  const wrapped = wrapSource(source).replace(
    'var setTimeout = globalThis.__tv_setTimeout;',
    'var setTimeout = globalThis.__tv_setTimeout;\n    var request = globalThis.__tv_request;',
  );
  await withReqReplay(() => {
    // eslint-disable-next-line no-new-func
    const fn = new Function(wrapped);
    fn();
  });
  return extractSpiderFromGlobal();
}

async function ensure(site: Site): Promise<SpiderFnMap> {
  const cached = cache.get(site.key);
  if (cached) return cached;
  const { getConfigUrl } = await import('../config/vod-config');
  const configUrl = getConfigUrl();
  const source = await loadScript(site.api, configUrl);
  const fns = await createSpiderFns(site, source, configUrl);
  try {
    await withReqReplay(() => {
      fns.init?.(buildSpiderInitArg(site.key, site.ext ?? '', source, configUrl));
    });
  } catch (e) {
    console.warn('[tv-js] init failed', e);
  }
  cache.set(site.key, fns);
  return fns;
}

function asResult(raw: unknown): Result {
  if (raw == null) return emptyResult();
  if (typeof raw === 'string') return parseResultJson(raw);
  if (typeof raw === 'object') return raw as Result;
  return emptyResult();
}

async function callSp<T>(site: Site, run: (sp: SpiderFnMap) => T): Promise<T> {
  const sp = await ensure(site);
  return withReqReplay(() => run(sp));
}

export const jsEngine: SpiderEngine & {
  proxy?: (site: Site, params: Record<string, string>) => Promise<unknown>;
  action?: (site: Site, action: string, value: string) => Promise<Result>;
} = {
  kind: 'js',
  supports(site) {
    // 勿用 includes('.js')：会误伤 .json；csp_* 走 JAR
    if (site.type !== 3 || site.api.startsWith('csp_')) return false;
    return /\.js(\?|#|$)/i.test(site.api);
  },
  async homeContent(site, filter) {
    return asResult(await callSp(site, (sp) => sp.home?.(filter)));
  },
  async homeVideoContent(site) {
    return asResult(await callSp(site, (sp) => sp.homeVod?.()));
  },
  async categoryContent(site, args: CategoryArgs) {
    return asResult(
      await callSp(site, (sp) =>
        sp.category?.(args.tid, args.pg, args.filter, args.extend),
      ),
    );
  },
  async detailContent(site, ids) {
    return asResult(await callSp(site, (sp) => sp.detail?.(ids[0] ?? '')));
  },
  async searchContent(site, args: SearchArgs) {
    return asResult(
      await callSp(site, (sp) => sp.search?.(args.key, args.quick, args.pg)),
    );
  },
  async playerContent(site, args: PlayerArgs) {
    return asResult(
      await callSp(site, (sp) => sp.play?.(args.flag, args.id, args.vipFlags)),
    );
  },
  async proxy(site, params) {
    return callSp(site, (sp) => sp.proxy?.(params));
  },
  async action(site, action, value = '') {
    return asResult(await callSp(site, (sp) => sp.action?.(action, value)));
  },
  destroy(siteKey) {
    const sp = cache.get(siteKey);
    try {
      sp?.__vm?.dispose();
    } catch {
      /* */
    }
    try {
      sp?.__runtime?.dispose();
    } catch {
      /* */
    }
    cache.delete(siteKey);
  },
};

export function clearJsSpiderCache(): void {
  for (const sp of cache.values()) {
    try {
      sp.__vm?.dispose();
    } catch {
      /* */
    }
    try {
      sp.__runtime?.dispose();
    } catch {
      /* */
    }
  }
  cache.clear();
  reqCache.clear();
}
