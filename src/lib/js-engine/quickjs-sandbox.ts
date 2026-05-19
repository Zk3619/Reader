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
} from './core/runtime';

export interface JsContext {
  result: string;
  baseUrl: string;
  book?: Record<string, unknown>;
  source?: Record<string, unknown>;
  chapter?: Record<string, unknown>;
}

export async function initJsSandbox(): Promise<void> {
  await initQuickJSRuntime();
}

export function isJsSandboxFallback(): boolean {
  return isQuickJSFallback();
}

export async function evalJs(code: string, context: JsContext): Promise<string | null> {
  if (!code) return null;

  try {
    await initQuickJSRuntime();
    if (!isQuickJSFallback()) {
      const out = await evalJsQuickJS(code, context);
      if (out !== null) return out;
    }
    return evalJsFallback(code, context);
  } catch (error) {
    console.error('JS执行错误:', error, '代码:', code);
    return null;
  }
}

async function evalJsQuickJS(code: string, context: JsContext): Promise<string | null> {
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
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  } finally {
    vm.dispose();
  }
}

function evalJsFallback(code: string, context: JsContext): string | null {
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
    toast(..._args: unknown[]) {},
    longToast(..._args: unknown[]) {},
    put(_key: string, _val: unknown) {},
    get(_key: string) {
      return '';
    },
  };

  let parsedResult: unknown = context.result;
  try {
    const tmp = JSON.parse(context.result);
    if (typeof tmp === 'object' && tmp !== null) parsedResult = tmp;
  } catch {
    /* 保留字符串 */
  }

  const scope = {
    result: parsedResult,
    baseUrl: context.baseUrl,
    book: context.book ?? {},
    source: context.source ?? {},
    chapter: context.chapter ?? {},
    java,
    JSON,
  };
  let body = code.trim();
  if (body && !body.includes('return ')) {
    const lines = body.split(/\n/).filter((l) => l.trim());
    const lastLine = lines[lines.length - 1]?.trim();
    if (lastLine && !/^(var|let|const|if|for|while|function|else|\}|return\s)/.test(lastLine)) {
      body = lines.slice(0, -1).join('\n') + '\nreturn (' + lastLine + ');';
    }
  }
  try {
    const fn = new Function(
      'result',
      'baseUrl',
      'book',
      'source',
      'chapter',
      'java',
      'JSON',
      '"use strict";\n' + body
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
    if (typeof out === 'string') return out;
    if (typeof out === 'number' || typeof out === 'boolean') return String(out);
    return JSON.stringify(out);
  } catch (e) {
    console.warn('[js-sandbox] fallback 执行报错:', e);
    return null;
  }
}

function injectContext(vm: QuickJSContext, context: JsContext): void {
  const resultStr = context.result;
  const safeResultStr = JSON.stringify(resultStr);
  evalCodeVoid(
    vm,
    `var result = (function(){ try { var _r = JSON.parse(${safeResultStr}); return (typeof _r === 'object' && _r !== null) ? _r : ${safeResultStr}; } catch(e) { return ${safeResultStr}; } })();`
  );
  setGlobalString(vm, 'baseUrl', context.baseUrl);

  if (context.book) {
    const bookHandle = vm.newObject();
    for (const [key, value] of Object.entries(context.book)) {
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
    };
  `);
}
