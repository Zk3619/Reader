/**
 * JavaScript沙箱
 * 对应 legado 项目的 JS 执行功能
 *
 * 优先从固定 URL /quickjs/emscripten-module.wasm 加载 WASM（由 Vite 正确提供），
 * 失败时再试默认 getQuickJS()；若仍失败则降级为原生 Function 执行。
 */

import {
  getQuickJS,
  newQuickJSWASMModuleFromVariant,
  newVariant,
  RELEASE_SYNC,
  type QuickJSContext,
} from 'quickjs-emscripten';

/** 由 Vite 插件/静态复制提供的 QuickJS WASM 路径，避免 node_modules 请求被 SPA 回退成 HTML */
const QUICKJS_WASM_URL = '/quickjs/emscripten-module.wasm';

let quickJS: Awaited<ReturnType<typeof getQuickJS>> | null = null;
/** WASM 加载失败时使用原生执行（无沙箱隔离，仅用于降级） */
let useFallback = false;
let initPromise: Promise<void> | null = null;

/**
 * JS执行上下文
 */
export interface JsContext {
  /** 上一步结果 */
  result: string;
  /** 基础URL */
  baseUrl: string;
  /** 书籍信息 */
  book?: Record<string, unknown>;
  /** 书源信息 */
  source?: Record<string, unknown>;
  /** 章节信息 */
  chapter?: Record<string, unknown>;
}

/**
 * 初始化QuickJS引擎
 * 先尝试从 /quickjs/emscripten-module.wasm 加载，失败则用默认方式，再失败则启用原生降级
 */
export async function initJsSandbox(): Promise<void> {
  if (quickJS || useFallback) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    try {
      const variant = newVariant(RELEASE_SYNC, { wasmLocation: QUICKJS_WASM_URL });
      quickJS = await newQuickJSWASMModuleFromVariant(variant);
    } catch (e1) {
      try {
        quickJS = await getQuickJS();
      } catch (e2) {
        console.warn('[js-sandbox] QuickJS WASM 加载失败，将使用原生执行降级:', e2);
        useFallback = true;
      }
    }
  })();
  await initPromise;
}

/**
 * 在沙箱中执行JavaScript代码
 */
export async function evalJs(code: string, context: JsContext): Promise<string | null> {
  if (!code) {
    return null;
  }

  try {
    if (!quickJS && !useFallback) {
      await initJsSandbox();
    }

    if (quickJS) {
      return await evalJsQuickJS(code, context);
    }

    return evalJsFallback(code, context);
  } catch (error) {
    console.error('JS执行错误:', error, '代码:', code);
    return null;
  }
}

async function evalJsQuickJS(code: string, context: JsContext): Promise<string | null> {
  const vm = quickJS!.newContext();
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

/**
 * 原生降级：用 new Function 注入上下文执行，供 WASM 不可用时使用。
 * 与 QuickJS 一致：若最后一行像表达式（非声明/控制），则作为返回值。
 */
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
        const bytes = new Uint8Array((hex.match(/.{1,2}/g) || []).map(b => parseInt(b, 16)));
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return String(hex);
      }
    },
    log(..._args: unknown[]) { /* no-op */ },
    toast(..._args: unknown[]) { /* no-op */ },
    longToast(..._args: unknown[]) { /* no-op */ },
    put(_key: string, _val: unknown) { /* no-op */ },
    get(_key: string) { return ''; },
  };
  // 若 result 是合法 JSON 对象/数组，则解析为对象，与 QuickJS 路径行为一致
  let parsedResult: unknown = context.result;
  try {
    const tmp = JSON.parse(context.result);
    if (typeof tmp === 'object' && tmp !== null) parsedResult = tmp;
  } catch { /* 保留字符串 */ }

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

/**
 * 注入上下文变量
 */
function injectContext(vm: QuickJSContext, context: JsContext): void {
  // 注入result —— 若是合法 JSON 则解析为对象，否则保留字符串
  // legado 规则中 JS 代码经常通过 result.field 访问属性，要求 result 是对象
  const resultStr = context.result;
  const safeResultStr = JSON.stringify(resultStr); // 正确转义字符串
  vm.evalCode(`var result = (function(){ try { var _r = JSON.parse(${safeResultStr}); return (typeof _r === 'object' && _r !== null) ? _r : ${safeResultStr}; } catch(e) { return ${safeResultStr}; } })();`);

  // 注入baseUrl
  const baseUrlHandle = vm.newString(context.baseUrl);
  vm.setProp(vm.global, 'baseUrl', baseUrlHandle);
  baseUrlHandle.dispose();

  // 注入book
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

  // 注入source
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

  // 注入chapter
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

/**
 * 注入工具函数
 */
function injectUtils(vm: QuickJSContext): void {
  // QuickJS 自带 JSON.parse / JSON.stringify，无需覆盖

  // 注入常用工具函数 + java 对象（legado 规则常用 java.base64Encode / java.hexDecodeToString）
  // 重要：base64Encode 必须先将 UTF-16 字符串转为 UTF-8 字节再编码，
  //       否则中文等多字节字符只保留低 8 位会被截断（legado 的 Java 实现用 UTF-8 字节）
  const utilsCode = `
    var __b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    /** 将 JS 字符串转为 UTF-8 字节数组 */
    function __strToUtf8(str) {
      var utf8 = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) {
          utf8.push(c);
        } else if (c < 0x800) {
          utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c >= 0xd800 && c <= 0xdbff) {
          // 代理对 (surrogate pair)
          var hi = c, lo = str.charCodeAt(++i);
          var cp = ((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
          utf8.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
          utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
      }
      return utf8;
    }

    /** 将 UTF-8 字节数组转为 JS 字符串 */
    function __utf8ToStr(bytes) {
      var out = '', i = 0;
      while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80) {
          out += String.fromCharCode(b);
        } else if ((b & 0xe0) === 0xc0) {
          out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        } else if ((b & 0xf0) === 0xe0) {
          out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        } else if ((b & 0xf8) === 0xf0) {
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

    /** legado: java.hexDecodeToString — 将 hex 编码的字节序列还原为 UTF-8 字符串 */
    function hexDecodeToString(hex) {
      if (typeof hex !== 'string') hex = String(hex);
      var bytes = [];
      for (var i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return __utf8ToStr(bytes);
    }

    function md5(str) { return str; }
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
  `;
  vm.evalCode(utilsCode);
}
