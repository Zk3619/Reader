/**
 * QuickJS WASM 沙箱：规则解析中的 @js: 片段
 * 对应 legado 项目的 Rhino/QuickJS 规则 JS 执行
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import {
  createQuickJSContext,
  evalCodeVoid,
  initQuickJSRuntime,
  isQuickJSFallback,
  setGlobalString,
} from '@/lib/js-engine/core/runtime';
import { javaGetString } from '@/lib/rule-engine/java-get-string';
import { createRuleJavaAnalyzeBridge } from '@/lib/rule-engine/rule-java-analyze-bridge';
import {
  needsLegadoRuleScriptRunner,
  runLegadoRuleScript,
} from '@/lib/js-engine/legado/rule-script-runner';
import {
  resolveJsLibString,
  scriptReferencesJsLibFunctions,
} from '@/lib/js-engine/legado/resolve-js-lib';
import {
  buildRuleScriptFullBody,
} from '@/lib/js-engine/legado/rule-script-patches';
import {
  createLegadoScriptCache,
  buildLegadoScriptSourceFace,
  createSourceVariableHandlers,
  getLegadoSourceKey,
  getSourceArgsKey,
  LEGADO_LEGACY_PACKAGES_SHIM,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  legadoAesBase64DecodeToString,
  legadoJavaGetWebViewUA,
  legadoJavaMd5Encode,
} from '@/lib/js-engine/legado/legado-java-crypto';
import { unwrapLegadoJsSnippet } from '@/lib/rule-engine/legado-source-rule';
import type { BookSource } from '@/types';

export interface JsContext {
  result: unknown;
  baseUrl: string;
  book?: Record<string, unknown>;
  source?: Record<string, unknown>;
  chapter?: Record<string, unknown>;
  /** 规则正文，供 java.getString 子规则解析 */
  ruleContent?: string;
  ruleContentType?: 'html' | 'json' | 'text';
  /** 会话变量（java.put / @get），与 RuleContext.variables 共享 */
  variables?: Record<string, unknown>;
  /** 用于 java.ajax 请求头/Cookie（正文解密等） */
  bookSource?: BookSource;
  /** 脚本 toast 回调（java.toast/toast） */
  onScriptToast?: (msg?: unknown, level?: unknown) => void;
  /** 正文：startBrowserAwait 不挂起脚本 */
  nonBlockingBrowserAwait?: boolean;
}

const fallbackScopedStore = new Map<string, Map<string, unknown>>();

/** Legado @js 中 result 应为对象；列表项常为 JSON 字符串，避免 JSON.stringify 二次编码 */
export function normalizeJsRuleResult(input: unknown): unknown {
  if (typeof input === 'string') {
    const t = input.trim();
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']'))
    ) {
      try {
        return JSON.parse(t);
      } catch {
        return input;
      }
    }
  }
  return input ?? null;
}

export async function initJsSandbox(): Promise<void> {
  await initQuickJSRuntime();
}

export function isJsSandboxFallback(): boolean {
  return isQuickJSFallback();
}

function shouldPrependJsLib(script: string, jsLibRaw: string): boolean {
  if (!jsLibRaw.trim()) return false;
  return scriptReferencesJsLibFunctions(script);
}

export async function evalJs(code: string, context: JsContext): Promise<unknown> {
  if (!code) return null;
  const script = unwrapLegadoJsSnippet(code);
  if (!script) return null;

  if (needsLegadoRuleScriptRunner(script)) {
    try {
      return await runLegadoRuleScript(script, context, context.bookSource);
    } catch (e) {
      console.error('[js-engine] rule-script 执行失败:', e);
      if (context.nonBlockingBrowserAwait) {
        throw e;
      }
      return null;
    }
  }

  const jsLibRaw =
    typeof context.source?.jsLib === 'string' ? (context.source.jsLib as string) : '';
  if (shouldPrependJsLib(script, jsLibRaw)) {
    try {
      return await evalJsWithJsLib(script, context, jsLibRaw);
    } catch (error) {
      console.error('JS执行错误(jsLib):', error, '代码:', script);
      return null;
    }
  }

  const needsRuleJava =
    /\bjava\.getString\b/.test(script) ||
    (/\bjava\.put\b/.test(script) && context.variables != null) ||
    /\bjava\.(?:toast|longToast)\b/.test(script) ||
    /\bjava\.setContent\b/.test(script) ||
    /\bjava\.getElements\b/.test(script) ||
    /\bjava\.getElement\b/.test(script) ||
    /(?:^|[^.\w])(?:toast|longToast)\s*\(/m.test(script);

  try {
    await initQuickJSRuntime();
    if (!needsRuleJava && !isQuickJSFallback()) {
      const out = await evalJsQuickJS(script, context);
      if (out !== null) return out;
    }
    return evalJsFallback(script, context);
  } catch (error) {
    console.error('JS执行错误:', error, '代码:', script);
    return null;
  }
}

async function evalJsWithJsLib(
  code: string,
  context: JsContext,
  jsLibRaw: string,
): Promise<unknown> {
  const resolvedJsLib = await resolveJsLibString(jsLibRaw);
  const legadoCache = createLegadoScriptCache();
  const bookSource = context.bookSource;
  const sourceVars =
    bookSource != null
      ? createSourceVariableHandlers(bookSource, getSourceArgsKey(bookSource))
      : null;
  const sourceFace =
    bookSource != null && sourceVars
      ? buildLegadoScriptSourceFace(bookSource, sourceVars, getLegadoSourceKey(bookSource))
      : { ...(context.source ?? {}) };
  const headerRaw =
    bookSource && typeof bookSource.header === 'string' ? bookSource.header : undefined;
  const scopedKey = String(
    (bookSource ? getLegadoSourceKey(bookSource) : '') ||
      (context.source as Record<string, unknown> | undefined)?.sourceUrl ||
      context.baseUrl ||
      'global',
  );
  let fallbackStore = fallbackScopedStore.get(scopedKey);
  if (!fallbackStore) {
    fallbackStore = new Map<string, unknown>();
    fallbackScopedStore.set(scopedKey, fallbackStore);
  }

  const ruleContent =
    context.ruleContent ??
    (typeof context.result === 'string' ? context.result : '');
  const analyzeBridge = createRuleJavaAnalyzeBridge({
    baseUrl: context.baseUrl,
    initialContent: ruleContent,
  });

  const toStringSafe = (input: unknown): string => {
    if (input == null) return '';
    return typeof input === 'string' ? input : String(input);
  };
  const readVariable = (key: string): string => {
    const k = key.trim();
    if (!k) return '';
    const fromVars = context.variables?.[k];
    if (fromVars != null) return toStringSafe(fromVars);
    const hit = fallbackStore.get(k);
    return hit == null ? '' : toStringSafe(hit);
  };

  const java = {
    log(..._args: unknown[]) {},
    toast(...args: unknown[]) {
      context.onScriptToast?.(args[0], 'info');
    },
    longToast(...args: unknown[]) {
      context.onScriptToast?.(args[0], 'warning');
    },
    put(key: string, val: unknown) {
      const k = String(key);
      fallbackStore.set(k, val);
      if (context.variables) context.variables[k] = val;
      legadoCache.put(k, val);
    },
    get(keyOrUrl: string) {
      const candidate = toStringSafe(keyOrUrl);
      if (/^https?:\/\//i.test(candidate)) return '';
      const fromCache = legadoCache.get(candidate);
      if (fromCache != null && fromCache !== 0) return toStringSafe(fromCache);
      return readVariable(candidate);
    },
    getString(rule: string) {
      return javaGetString(rule, {
        content: ruleContent,
        contentType: context.ruleContentType,
        baseUrl: context.baseUrl,
        variables: context.variables,
        getVariable: readVariable,
      });
    },
    setContent(content: unknown, url?: unknown) {
      return analyzeBridge.setContent(content, url);
    },
    setBaseUrl(url: unknown) {
      return analyzeBridge.setBaseUrl(url);
    },
    getElements(ruleStr: string) {
      return analyzeBridge.getElements(ruleStr);
    },
    getElement(ruleStr: string) {
      const list = analyzeBridge.getElements(ruleStr);
      return list[0] ?? '';
    },
    md5Encode(input: unknown) {
      return legadoJavaMd5Encode(String(input ?? ''));
    },
    aesBase64DecodeToString(data: unknown, key: unknown, transformation: unknown, iv: unknown) {
      return legadoAesBase64DecodeToString(
        String(data ?? ''),
        String(key ?? ''),
        String(transformation ?? ''),
        String(iv ?? ''),
      );
    },
    getWebViewUA() {
      return legadoJavaGetWebViewUA(headerRaw);
    },
    base64Decode(str: unknown) {
      try {
        const s = String(str ?? '');
        return typeof atob !== 'undefined'
          ? decodeURIComponent(escape(atob(s)))
          : s;
      } catch {
        return String(str ?? '');
      }
    },
    base64Encode(str: unknown) {
      try {
        const s = String(str ?? '');
        return typeof btoa !== 'undefined'
          ? btoa(unescape(encodeURIComponent(s)))
          : s;
      } catch {
        return String(str ?? '');
      }
    },
  };

  const scope: Record<string, unknown> = {
    result: normalizeJsRuleResult(context.result),
    baseUrl: context.baseUrl,
    book: context.book ?? {},
    source: sourceFace,
    chapter: context.chapter ?? {},
    cache: legadoCache,
    Packages: LEGADO_LEGACY_PACKAGES_SHIM,
    java,
    JSON,
    toast(msg?: unknown, level?: unknown) {
      context.onScriptToast?.(msg, level ?? 'info');
    },
    longToast(msg?: unknown) {
      context.onScriptToast?.(msg, 'warning');
    },
  };

  const userBody = wrapLegadoJsBodyWithImplicitReturn(code);
  const fullBody = buildRuleScriptFullBody(userBody, resolvedJsLib);
  const fn = new Function('__scope__', `with (__scope__) {\n${fullBody}\n}`);
  const out = fn(scope);
  if (out === undefined || out === null) {
    const bound = scope.result;
    return bound === undefined || bound === null ? null : bound;
  }
  return out;
}

async function evalJsQuickJS(code: string, context: JsContext): Promise<unknown> {
  const vm = createQuickJSContext();
  if (!vm) return null;

  try {
    injectContext(vm, context);
    injectUtils(vm);
    const result = vm.evalCode(code);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`JS执行错误: ${JSON.stringify(error)}`);
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    if (value === null || value === undefined) return null;
    return value;
  } finally {
    vm.dispose();
  }
}

/** Legado 末行表达式脚本：无 return 时自动 return(末行)；去掉末行分号避免 return(expr;); 语法错误 */
export function wrapLegadoJsBodyWithImplicitReturn(code: string): string {
  let body = code.trim();
  if (!body) return body;
  const lines = body.split(/\n/).filter((l) => l.trim());
  const lastLine = (lines[lines.length - 1]?.trim() ?? '').replace(/^;+/, '').trim();
  if (
    !lastLine ||
    /^(var|let|const|if|for|while|function|else|\}|return\b)/.test(lastLine) ||
    /}\s*else\b/.test(lastLine)
  ) {
    return body;
  }

  // Legado 常见：if(result){ ... ;\nurl} — 末行 expr} 闭合 if 并以 expr 为脚本返回值
  const blockCloseMatch = lastLine.match(/^(.+)\}$/);
  if (blockCloseMatch) {
    const expr = blockCloseMatch[1]!.trim();
    if (
      expr &&
      !/^(var|let|const|if|for|while|function|else|return\b)/.test(expr) &&
      !expr.includes('{')
    ) {
      return `${lines.slice(0, -1).join('\n')}\n}\nreturn (${expr});`;
    }
  }

  const expr = lastLine.replace(/;\s*$/, '');
  return `${lines.slice(0, -1).join('\n')}\nreturn (${expr});`;
}

function evalJsFallback(code: string, context: JsContext): unknown {
  const sourceInfo = (context.source ?? {}) as Record<string, unknown>;
  const scopedKey = String(
    sourceInfo.bookSourceUrl ??
      sourceInfo.sourceUrl ??
      context.baseUrl ??
      'global',
  );
  let fallbackStore = fallbackScopedStore.get(scopedKey);
  if (!fallbackStore) {
    fallbackStore = new Map<string, unknown>();
    fallbackScopedStore.set(scopedKey, fallbackStore);
  }
  const toStringSafe = (input: unknown): string => {
    if (input == null) return '';
    return typeof input === 'string' ? input : String(input);
  };
  const parseHeaderObject = (headers: unknown): Record<string, string> => {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      out[String(k)] = toStringSafe(v);
    }
    return out;
  };
  const xhrRequest = (
    method: string,
    url: string,
    payload?: string,
    headers?: Record<string, string>,
  ): { text: string; status: number; responseHeaders: Record<string, string> } => {
    if (typeof XMLHttpRequest === 'undefined') {
      return { text: '', status: 0, responseHeaders: {} };
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, false);
    for (const [k, v] of Object.entries(headers ?? {})) {
      try {
        xhr.setRequestHeader(k, v);
      } catch {
        // ignore invalid header
      }
    }
    try {
      xhr.send(payload ?? null);
    } catch {
      return { text: '', status: 0, responseHeaders: {} };
    }
    const rawHeaders = xhr.getAllResponseHeaders();
    const responseHeaders: Record<string, string> = {};
    for (const line of rawHeaders.split('\n')) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) responseHeaders[k] = v;
    }
    return {
      text: xhr.responseText ?? '',
      status: xhr.status ?? 0,
      responseHeaders,
    };
  };

  const ruleContent =
    context.ruleContent ??
    (typeof context.result === 'string' ? context.result : '');

  const analyzeBridge = createRuleJavaAnalyzeBridge({
    baseUrl: context.baseUrl,
    initialContent: ruleContent,
  });

  const readVariable = (key: string): string => {
    const k = key.trim();
    if (!k) return '';
    const fromVars = context.variables?.[k];
    if (fromVars != null) return toStringSafe(fromVars);
    const hit = fallbackStore.get(k);
    return hit == null ? '' : toStringSafe(hit);
  };

  const java = {
    base64Encode(str: string): string {
      try {
        return typeof btoa !== 'undefined'
          ? btoa(unescape(encodeURIComponent(String(str))))
          : String(str);
      } catch {
        return String(str);
      }
    },
    base64Decode(str: string): string {
      try {
        return typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(str))) : String(str);
      } catch {
        return String(str);
      }
    },
    hexDecodeToString(hex: string): string {
      try {
        const bytes = new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return String(hex);
      }
    },
    log(..._args: unknown[]) {},
    toast(...args: unknown[]) {
      context.onScriptToast?.(args[0], 'info');
    },
    longToast(...args: unknown[]) {
      context.onScriptToast?.(args[0], 'warning');
    },
    put(key: string, val: unknown) {
      const k = String(key);
      fallbackStore.set(k, val);
      if (context.variables) {
        context.variables[k] = val;
      }
    },
    get(keyOrUrl: string, headers?: unknown) {
      const candidate = toStringSafe(keyOrUrl);
      if (/^https?:\/\//i.test(candidate)) {
        return xhrRequest('GET', candidate, undefined, parseHeaderObject(headers)).text;
      }
      return readVariable(candidate);
    },
    getString(rule: string) {
      return javaGetString(rule, {
        content: ruleContent,
        contentType: context.ruleContentType,
        baseUrl: context.baseUrl,
        variables: context.variables,
        getVariable: readVariable,
      });
    },
    ajax(_url: string, _options?: unknown) {
      const url = toStringSafe(_url);
      if (!url) return '';
      const options = (_options && typeof _options === 'object'
        ? (_options as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const method = toStringSafe(options.method || 'GET').toUpperCase();
      const body =
        options.body == null
          ? undefined
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
      const headers = parseHeaderObject(options.headers);
      return xhrRequest(method, url, body, headers).text;
    },
    connect(url: string, headers?: unknown) {
      return xhrRequest('GET', toStringSafe(url), undefined, parseHeaderObject(headers)).status;
    },
    post(url: string, body?: unknown, headers?: unknown) {
      const payload =
        body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
      return xhrRequest('POST', toStringSafe(url), payload, parseHeaderObject(headers)).text;
    },
    head(url: string, headers?: unknown) {
      return JSON.stringify(
        xhrRequest('HEAD', toStringSafe(url), undefined, parseHeaderObject(headers)).responseHeaders,
      );
    },
    getResponse(url: string, headers?: unknown) {
      return xhrRequest('GET', toStringSafe(url), undefined, parseHeaderObject(headers)).text;
    },
    setContent(content: unknown, url?: unknown) {
      return analyzeBridge.setContent(content, url);
    },
    setBaseUrl(url: unknown) {
      return analyzeBridge.setBaseUrl(url);
    },
    getElements(ruleStr: string) {
      return analyzeBridge.getElements(ruleStr);
    },
    getElement(ruleStr: string) {
      const list = analyzeBridge.getElements(ruleStr);
      return list[0] ?? '';
    },
  };

  const parsedResult = normalizeJsRuleResult(context.result);

  const scope = {
    result: parsedResult,
    baseUrl: context.baseUrl,
    book: context.book ?? {},
    source: context.source ?? {},
    chapter: context.chapter ?? {},
    java,
    toast(msg?: unknown, level?: unknown) {
      context.onScriptToast?.(msg, level ?? 'info');
    },
    longToast(msg?: unknown) {
      context.onScriptToast?.(msg, 'warning');
    },
    JSON,
  };
  let body = wrapLegadoJsBodyWithImplicitReturn(code);
  const assignsResult = /\bresult\s*=/.test(code);
  if (assignsResult && !/\breturn\b/.test(body)) {
    body += '\n;return result;';
  }
  try {
    // 对齐 Legado Rhino：非 strict，允许书源脚本对 tag7 等隐式全局赋值
    const fn = new Function(
      'result',
      'baseUrl',
      'book',
      'source',
      'chapter',
      'java',
      'JSON',
      body,
    );
    const out = fn(
      scope.result,
      scope.baseUrl,
      scope.book,
      scope.source,
      scope.chapter,
      scope.java,
      scope.JSON
    );
    if (out === undefined || out === null) return null;
    return out;
  } catch (e) {
    console.warn('[js-sandbox] fallback 执行报错:', e);
    return null;
  }
}

function injectContext(vm: QuickJSContext, context: JsContext): void {
  const resultForJs = normalizeJsRuleResult(context.result);
  const resultHandle = vm.newString(JSON.stringify(resultForJs ?? null));
  vm.setProp(vm.global, '__reader_result_json__', resultHandle);
  resultHandle.dispose();
  evalCodeVoid(
    vm,
    `var result = JSON.parse(globalThis.__reader_result_json__);delete globalThis.__reader_result_json__;`
  );
  setGlobalString(vm, 'baseUrl', context.baseUrl);

  {
    const bookHandle = vm.newObject();
    for (const [key, value] of Object.entries(context.book ?? {})) {
      const valueHandle = vm.newString(String(value));
      vm.setProp(bookHandle, key, valueHandle);
      valueHandle.dispose();
    }
    vm.setProp(vm.global, 'book', bookHandle);
    bookHandle.dispose();
  }

  if (context.source) {
    const sourceHandle = vm.newObject();
    for (const [key, value] of Object.entries(context.source)) {
      const valueHandle = vm.newString(String(value));
      vm.setProp(sourceHandle, key, valueHandle);
      valueHandle.dispose();
    }
    vm.setProp(vm.global, 'source', sourceHandle);
    sourceHandle.dispose();
  }

  if (context.chapter) {
    const chapterHandle = vm.newObject();
    for (const [key, value] of Object.entries(context.chapter)) {
      const valueHandle = vm.newString(String(value));
      vm.setProp(chapterHandle, key, valueHandle);
      valueHandle.dispose();
    }
    vm.setProp(vm.global, 'chapter', chapterHandle);
    chapterHandle.dispose();
  }
}

function injectUtils(vm: QuickJSContext): void {
  evalCodeVoid(vm, `
    var __b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    function __strToUtf8(str) {
      var utf8 = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) utf8.push(c);
        else if (c < 0x800) utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c >= 0xd800 && c <= 0xdbff) {
          var hi = c, lo = str.charCodeAt(++i);
          var cp = ((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
          utf8.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      return utf8;
    }
    function __utf8ToStr(bytes) {
      var out = '', i = 0;
      while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80) out += String.fromCharCode(b);
        else if ((b & 0xe0) === 0xc0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if ((b & 0xf0) === 0xe0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else if ((b & 0xf8) === 0xf0) {
          var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
          cp -= 0x10000;
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
      }
      return out;
    }
    function base64Encode(str) {
      if (typeof str !== 'string') str = String(str);
      var bytes = __strToUtf8(str);
      var out = '', i = 0, len = bytes.length, c1, c2, c3;
      while (i < len) {
        c1 = bytes[i++];
        if (i === len) { out += __b64.charAt(c1 >> 2) + __b64.charAt((c1 & 3) << 4) + '=='; break; }
        c2 = bytes[i++];
        if (i === len) { out += __b64.charAt(c1 >> 2) + __b64.charAt(((c1 & 3) << 4) | (c2 >> 4)) + __b64.charAt((c2 & 15) << 2) + '='; break; }
        c3 = bytes[i++];
        out += __b64.charAt(c1 >> 2) + __b64.charAt(((c1 & 3) << 4) | (c2 >> 4)) + __b64.charAt(((c2 & 15) << 2) | (c3 >> 6)) + __b64.charAt(c3 & 63);
      }
      return out;
    }
    function base64Decode(str) {
      if (typeof str !== 'string') str = String(str);
      var bytes = [], i = 0, len = str.length, a, b, c, d;
      while (i < len) {
        a = __b64.indexOf(str.charAt(i++)); b = __b64.indexOf(str.charAt(i++));
        c = __b64.indexOf(str.charAt(i++)); d = __b64.indexOf(str.charAt(i++));
        bytes.push((a << 2) | (b >> 4));
        if (c < 64) bytes.push(((b & 15) << 4) | (c >> 2));
        if (d < 64) bytes.push(((c & 3) << 6) | d);
      }
      return __utf8ToStr(bytes);
    }
    function hexDecodeToString(hex) {
      if (typeof hex !== 'string') hex = String(hex);
      var bytes = [];
      for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
      return __utf8ToStr(bytes);
    }
    var java = {
      base64Encode: base64Encode,
      base64Decode: base64Decode,
      hexDecodeToString: hexDecodeToString,
      log: function() {},
      toast: function() {},
      longToast: function() {},
      put: function() {},
      get: function(key) { return ''; },
      getString: function(rule) { return ''; },
    };
  `);
}
