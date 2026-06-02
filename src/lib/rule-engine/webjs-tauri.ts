/**
 * Tauri 桌面端：后台 WebView 执行 WebJs（对齐 Legado BackstageWebView）
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { buildWebJsRpcInvokeShim } from '@/lib/rule-engine/webjs-java-rpc';
import { buildWebJsExecutable, type RunWebJsOptions } from '@/lib/rule-engine/webjs-script';

function buildTauriEvalScript(opts: RunWebJsOptions, requestId: string): string {
  const rpcShim = buildWebJsRpcInvokeShim();
  const executable = buildWebJsExecutable(opts);
  const escapedRpc = rpcShim.replace(/`/g, '\\`');

  return `
(async function() {
  ${escapedRpc}
  try {
    var __exec = ${JSON.stringify(executable)};
    var __fn = new Function('return (' + __exec + ')')();
    var __r = await __fn();
    var out = String(__r == null ? '' : __r);
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(requestId)},
      result: out,
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(requestId)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim();
}

/** CF / 纯拉 HTML：勿走 buildWebJsExecutable（内含 `;return` 会破坏 new Function 解析） */
export async function runBackstageFetchHtml(opts: {
  url: string;
  cookies?: string;
  headers?: Record<string, string>;
  delayMs?: number;
  timeoutMs?: number;
}): Promise<string> {
  if (!isTauri()) {
    throw new Error('非 Tauri 环境');
  }

  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `bw-html-${Date.now()}`;

  const script = `
(async function() {
  try {
    if (document.readyState !== 'complete') {
      await new Promise(function(resolve) {
        if (document.readyState === 'complete') { resolve(); return; }
        window.addEventListener('load', resolve, { once: true });
      });
    }
    await new Promise(function(r) { setTimeout(r, 400); });
    var out = document.documentElement ? document.documentElement.outerHTML : '';
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(requestId)},
      result: String(out),
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(requestId)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim();

  return invoke<string>('run_backstage_webjs', {
    params: {
      requestId,
      url: opts.url.trim(),
      script,
      cookies: opts.cookies?.trim() || undefined,
      headersJson: opts.headers ? JSON.stringify(opts.headers) : undefined,
      delayMs: opts.delayMs ?? 2000,
      timeoutMs: opts.timeoutMs ?? 90_000,
    },
  });
}

/** CF 搜索 POST：在 WebView 内 fetch（与 cf_clearance TLS 指纹一致） */
export async function runBackstageFetchPost(opts: {
  url: string;
  body: string;
  cookies?: string;
  headers?: Record<string, string>;
  responseCharset?: string;
  timeoutMs?: number;
}): Promise<string> {
  if (!isTauri()) {
    throw new Error('非 Tauri 环境');
  }

  const pageUrl = opts.url.trim();
  let origin = pageUrl;
  try {
    origin = `${new URL(pageUrl).origin}/`;
  } catch {
    /* keep pageUrl */
  }

  const hdrs = { ...(opts.headers ?? {}) };
  delete hdrs.Cookie;
  delete hdrs.cookie;
  const contentType =
    hdrs['Content-Type'] ?? hdrs['content-type'] ?? 'application/x-www-form-urlencoded';
  const responseCharset = opts.responseCharset?.trim() ?? '';
  let referer = pageUrl;
  try {
    referer = `${new URL(pageUrl).origin}/`;
  } catch {
    /* keep pageUrl */
  }
  referer = String(hdrs.Referer ?? hdrs.referer ?? referer).trim();
  const fetchHeaders: Record<string, string> = {
    'Content-Type': contentType,
    Accept:
      hdrs.Accept ??
      hdrs.accept ??
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (referer) fetchHeaders.Referer = referer;

  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `bw-post-${Date.now()}`;

  const script = `
(async function() {
  try {
    var resp = await fetch(${JSON.stringify(pageUrl)}, {
      method: 'POST',
      credentials: 'include',
      headers: ${JSON.stringify(fetchHeaders)},
      body: ${JSON.stringify(opts.body)}
    });
    var buf = await resp.arrayBuffer();
    var bytes = new Uint8Array(buf);
    var charset = ${JSON.stringify(responseCharset.toLowerCase())};
    var out = '';
    if (/^gb/.test(charset)) {
      try { out = new TextDecoder('gbk').decode(bytes); } catch (e) { out = new TextDecoder('utf-8').decode(bytes); }
    } else {
      out = new TextDecoder('utf-8').decode(bytes);
    }
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(requestId)},
      result: String(out),
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(requestId)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim();

  return invoke<string>('run_backstage_webjs', {
    params: {
      requestId,
      url: origin,
      script,
      cookies: opts.cookies?.trim() || undefined,
      headersJson: opts.headers ? JSON.stringify(hdrs) : undefined,
      delayMs: 2200,
      timeoutMs: opts.timeoutMs ?? 90_000,
    },
  });
}

export async function runWebJsInTauri(opts: RunWebJsOptions): Promise<string> {
  if (!isTauri()) {
    throw new Error('非 Tauri 环境');
  }

  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `bw-${Date.now()}`;

  const delayMs = opts.delayMs ?? (opts.script?.trim() ? 0 : 900);

  return invoke<string>('run_backstage_webjs', {
    params: {
      requestId,
      url: opts.url?.trim() || undefined,
      html: opts.html,
      baseUrl: opts.baseUrl,
      script: buildTauriEvalScript(opts, requestId),
      bridgeScript: undefined,
      cookies: opts.cookies?.trim() || undefined,
      headersJson: opts.headers ? JSON.stringify(opts.headers) : undefined,
      delayMs,
      timeoutMs: opts.timeoutMs ?? 60_000,
      priorResult: opts.priorResult,
      sourceRegex: opts.sourceRegex,
      overrideUrlRegex: opts.overrideUrlRegex,
    },
  });
}
