/**
 * Legado WebJsExtensions.request RPC（Web 主线程 / iframe 父页执行）
 * Tauri 后台 WebView 内脚本走 invoke('webjs_java_rpc')
 */

import type { BookSource } from '@/types';
import { request } from '@/lib/http';
import { evalJs } from '@/lib/js-engine';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';
import type { RunWebJsOptions } from '@/lib/rule-engine/webjs-script';
import { isTauri } from '@/lib/platform/detect';

export interface WebJsRpcContext {
  baseUrl: string;
  source?: BookSource;
  headers?: Record<string, string>;
  cookies?: string;
  jsLib?: string;
}

function parseHeaderArg(header: string | null | undefined): Record<string, string> {
  if (!header?.trim()) return {};
  try {
    const o = JSON.parse(header) as Record<string, string>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function mergeRpcHeaders(ctx: WebJsRpcContext, extra?: Record<string, string>): Record<string, string> {
  const out = { ...ctx.headers, ...extra };
  if (ctx.cookies?.trim()) {
    out.Cookie = out.Cookie ? `${out.Cookie}; ${ctx.cookies.trim()}` : ctx.cookies.trim();
  }
  return out;
}

async function rpcRun(jsCode: string, ctx: WebJsRpcContext): Promise<string> {
  const out = await evalJs(jsCode, {
    result: '',
    baseUrl: ctx.baseUrl,
    source: ctx.source as unknown as Record<string, unknown>,
  });
  return out == null ? '' : String(out);
}

async function rpcWebView(
  args: (string | null | undefined)[],
  ctx: WebJsRpcContext,
  withSourceRegex: boolean,
): Promise<string> {
  const html = args[0] ?? undefined;
  const url = args[1] ?? undefined;
  const script = args[2] ?? '';
  const sourceRegex = withSourceRegex ? args[3] ?? undefined : undefined;
  const cacheFirst = withSourceRegex ? args[4] === 'true' : args[3] === 'true';
  const delayMs = withSourceRegex ? Number(args[5] ?? 0) : Number(args[4] ?? 0);

  const opts: RunWebJsOptions = {
    html: html || undefined,
    url: url && /^https?:\/\//i.test(url) ? url : undefined,
    baseUrl: ctx.baseUrl,
    script,
    priorResult: html ?? '',
    headers: ctx.headers,
    cookies: ctx.cookies,
    sourceRegex,
    delayMs: Number.isFinite(delayMs) ? delayMs : 0,
    cacheFirst,
    isRule: true,
    sourceKey: typeof ctx.source?.bookSourceUrl === 'string' ? ctx.source.bookSourceUrl : undefined,
    source: ctx.source,
    jsLib: ctx.jsLib,
    timeoutMs: 60_000,
  };
  const { runWebJs } = await import('@/lib/rule-engine/webjs-runner');
  return runWebJs(opts);
}

/** Web 端 java.request 分发（Legado funName） */
export async function executeWebJsJavaRpc(
  funName: string,
  args: (string | null | undefined)[],
  ctx: WebJsRpcContext,
): Promise<string> {
  const a = args.map((x) => (x == null ? '' : String(x)));

  switch (funName) {
    case 'run':
      return rpcRun(a[0] ?? '', ctx);

    case 'ajaxAwait': {
      const url = a[0] ?? '';
      const res = await request(url, {
        headers: mergeRpcHeaders(ctx),
        enableCookieJar: true,
        timeout: Number(a[1]) || 30_000,
      });
      return res.text();
    }

    case 'connectAwait': {
      const url = a[0] ?? '';
      const res = await request(url, {
        method: 'GET',
        headers: mergeRpcHeaders(ctx, parseHeaderArg(a[1])),
        enableCookieJar: true,
        timeout: Number(a[2]) || 30_000,
        allowNon2xx: true,
      });
      return String(res.status);
    }

    case 'getAwait': {
      const url = a[0] ?? '';
      const res = await request(url, {
        headers: mergeRpcHeaders(ctx, parseHeaderArg(a[1])),
        enableCookieJar: true,
        timeout: Number(a[2]) || 30_000,
      });
      return res.text();
    }

    case 'headAwait': {
      const url = a[0] ?? '';
      const res = await request(url, {
        method: 'GET',
        headers: mergeRpcHeaders(ctx, parseHeaderArg(a[1])),
        enableCookieJar: true,
        timeout: Number(a[2]) || 30_000,
        allowNon2xx: true,
      });
      return JSON.stringify(res.headers);
    }

    case 'postAwait': {
      const url = a[0] ?? '';
      const res = await request(url, {
        method: 'POST',
        headers: mergeRpcHeaders(ctx, parseHeaderArg(a[2])),
        body: a[1] ?? '',
        enableCookieJar: true,
        timeout: Number(a[3]) || 30_000,
      });
      return res.text();
    }

    case 'webViewAwait':
      return rpcWebView(args, ctx, false);

    case 'webViewGetSourceAwait':
      return rpcWebView(args, ctx, true);

    case 'decryptStrAwait': {
      const alg = a[0] ?? '';
      const key = a[1] ?? '';
      const iv = a[2] ?? '';
      const data = a[3] ?? '';
      const script = `
        var c = java.createSymmetricCrypto(${JSON.stringify(alg)}, ${JSON.stringify(key)}, ${JSON.stringify(iv)});
        c.decryptStr(${JSON.stringify(data)});
      `;
      return rpcRun(script, ctx);
    }

    case 'encryptBase64Await': {
      const script = `
        var c = java.createSymmetricCrypto(${JSON.stringify(a[0])}, ${JSON.stringify(a[1])}, ${JSON.stringify(a[2])});
        c.encryptBase64(${JSON.stringify(a[3])});
      `;
      return rpcRun(script, ctx);
    }

    case 'encryptHexAwait': {
      const script = `
        var c = java.createSymmetricCrypto(${JSON.stringify(a[0])}, ${JSON.stringify(a[1])}, ${JSON.stringify(a[2])});
        c.encryptHex(${JSON.stringify(a[3])});
      `;
      return rpcRun(script, ctx);
    }

    case 'createSignHexAwait': {
      const script = `
        var s = java.createSign(${JSON.stringify(a[0])});
        s.setPublicKey(${JSON.stringify(a[1])});
        s.setPrivateKey(${JSON.stringify(a[2])});
        s.signHex(${JSON.stringify(a[3])});
      `;
      return rpcRun(script, ctx);
    }

    case 'importScriptAwait': {
      const path = a[0] ?? '';
      if (!path.trim()) return '';
      try {
        const res = await request(path, { headers: mergeRpcHeaders(ctx), enableCookieJar: true });
        const lib = await res.text();
        return rpcRun(lib, ctx);
      } catch {
        return '';
      }
    }

    case 'downloadFileAwait': {
      const url = a[0] ?? '';
      const buf = await request(url, {
        headers: mergeRpcHeaders(ctx),
        enableCookieJar: true,
      }).then((r) => r.arrayBuffer());
      const bytes = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i += 1) {
        s += String.fromCharCode(bytes[i]);
      }
      return btoa(s);
    }

    case 'readTxtFileAwait':
      return a[0] ?? '';

    case 'getStringAwait': {
      const rule = a[0] ?? '';
      const content = a[1] ?? '';
      if (!rule.trim()) return '';
      return analyzeString(rule, {
        content,
        contentType: content.trim().startsWith('{') ? 'json' : 'html',
        baseUrl: ctx.baseUrl,
        source: ctx.source as unknown as Record<string, unknown>,
        result: content,
      });
    }

    default:
      throw new Error(`不支持的 WebJs RPC: ${funName}`);
  }
}

/** 注册到 window，供 iframe / srcdoc 调用 */
export function installWebJsRpcDispatcher(ctx: WebJsRpcContext): () => void {
  const win = window as Window & {
    __READER_WEBJS_RPC__?: typeof executeWebJsJavaRpc;
    __READER_WEBJS_RPC_CTX__?: WebJsRpcContext;
  };
  win.__READER_WEBJS_RPC_CTX__ = ctx;
  win.__READER_WEBJS_RPC__ = (funName, args) =>
    executeWebJsJavaRpc(funName, args, ctx);

  return () => {
    delete win.__READER_WEBJS_RPC__;
    delete win.__READER_WEBJS_RPC_CTX__;
  };
}

/** Tauri 后台 WebView 内：优先 invoke，否则走本地 dispatcher */
export function buildWebJsRpcInvokeShim(): string {
  return `
(function(){
  if (window.__READER_JAVA_RPC_SHIM__) return;
  window.__READER_JAVA_RPC_SHIM__ = true;
  var pending = {};
  window.__READER_JSBridgeResult = function(id, ok) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    var v = window.cache && window.cache.get ? window.cache.get(id) : '';
    if (ok) p.resolve(v == null ? '' : String(v));
    else p.reject(new Error(v || 'rpc failed'));
  };
  function requestId(tag) {
    return 'req_' + tag + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }
  function callRpc(funName, args) {
    return new Promise(function(resolve, reject) {
      var id = requestId(funName);
      pending[id] = { resolve: resolve, reject: reject };
      var payload = {
        funName: funName,
        args: args || [],
        requestId: id
      };
      var inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv) {
        inv('webjs_java_rpc', { params: payload }).then(function(res) {
          delete pending[id];
          resolve(res == null ? '' : String(res));
        }).catch(function(e) {
          delete pending[id];
          reject(e);
        });
        return;
      }
      var local = window.__READER_WEBJS_RPC__;
      if (local) {
        local(funName, args).then(resolve).catch(reject);
        return;
      }
      if (window.parent && window.parent !== window && window.parent.__READER_WEBJS_RPC__) {
        window.parent.__READER_WEBJS_RPC__(funName, args).then(resolve).catch(reject);
        return;
      }
      reject(new Error('WebJs RPC 不可用'));
    });
  }
  window.java = window.java || {};
  var j = window.java;
  if (!j.request) {
    j.request = function(funName, jsParam, id) {
      callRpc(funName, jsParam || []).then(function(r) {
        if (window.cache && window.cache.put) window.cache.put(id, r);
        if (window.__READER_JSBridgeResult) window.__READER_JSBridgeResult(id, true);
      }).catch(function(e) {
        if (window.cache && window.cache.put) window.cache.put(id, String(e && e.message ? e.message : e));
        if (window.__READER_JSBridgeResult) window.__READER_JSBridgeResult(id, false);
      });
    };
  }
})();
`.trim();
}

export async function invokeWebJsJavaRpcFromMain(
  params: {
    funName: string;
    args: (string | null | undefined)[];
    baseUrl?: string;
    cookies?: string;
    headersJson?: string;
    sourceUrl?: string;
  },
  ctx: WebJsRpcContext,
): Promise<string> {
  // 与 Legado 语义对齐：getStringAwait 需要运行在当前规则引擎上下文，
  // Tauri 下也优先走本地解析器，避免后端桩实现丢语义。
  if (params.funName === 'getStringAwait') {
    return executeWebJsJavaRpc(params.funName, params.args, ctx);
  }
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('webjs_java_rpc', {
      params: {
        funName: params.funName,
        args: params.args,
        baseUrl: params.baseUrl ?? ctx.baseUrl,
        cookies: params.cookies ?? ctx.cookies,
        headersJson: params.headersJson ?? (ctx.headers ? JSON.stringify(ctx.headers) : undefined),
        sourceUrl: params.sourceUrl ?? ctx.source?.bookSourceUrl,
      },
    });
  }
  return executeWebJsJavaRpc(params.funName, params.args, ctx);
}
