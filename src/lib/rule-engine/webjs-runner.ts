/**
 * Legado WebJs / BackstageWebView
 * 浏览器：隐藏 iframe + java.request RPC；Tauri 桌面：原生后台 WebView；失败时回退 QuickJS
 */

import { evalJs, type JsContext } from '@/lib/js-engine';
import { request } from '@/lib/http';
import { shouldUseWebHttpProxy } from '@/lib/http/web-http-proxy';
import { isTauri } from '@/lib/platform/detect';
import { syncBackstageWebViewCookies } from '@/lib/rule-engine/webjs-cookie-sync';
import {
  buildWebJsRpcInvokeShim,
  installWebJsRpcDispatcher,
  type WebJsRpcContext,
} from '@/lib/rule-engine/webjs-java-rpc';
import { buildWebJsExecutable, type RunWebJsOptions } from '@/lib/rule-engine/webjs-script';

export type { RunWebJsOptions } from '@/lib/rule-engine/webjs-script';
export { buildWebJsUserScript, buildWebJsExecutable, buildWebJsPrelude } from '@/lib/rule-engine/webjs-script';

function buildSrcDoc(opts: RunWebJsOptions, executable: string): string {
  const base = (opts.baseUrl || opts.url || 'about:blank').replace(/"/g, '&quot;');
  const bodyHtml = opts.html || '';
  const rpcShim = buildWebJsRpcInvokeShim();

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<base href="${base}">
</head><body>
<div id="legado-root">${bodyHtml}</div>
<script>${rpcShim}</script>
<script>
(function(){
  try {
    var __exec = ${JSON.stringify(executable)};
    var __fn = new Function('return (' + __exec + ')')();
    var __p = __fn();
    if (__p && typeof __p.then === 'function') {
      __p.then(function(__r) {
        window.__legadoWebJsResult = String(__r == null ? '' : __r);
      }).catch(function(e) {
        window.__legadoWebJsError = String(e && e.message ? e.message : e);
      });
    } else {
      window.__legadoWebJsResult = String(__p == null ? '' : __p);
    }
  } catch (e) {
    window.__legadoWebJsError = String(e && e.message ? e.message : e);
  }
})();
</script>
</body></html>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildRpcContext(opts: RunWebJsOptions): WebJsRpcContext {
  return {
    baseUrl: opts.baseUrl || opts.url || '',
    headers: opts.headers,
    cookies: opts.cookies,
    jsLib: opts.jsLib,
    source: opts.source,
  };
}

function runWebJsInIframe(opts: RunWebJsOptions): Promise<string> {
  const ctx = buildRpcContext(opts);
  const teardownRpc = installWebJsRpcDispatcher(ctx);
  const executable = buildWebJsExecutable(opts);

  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const iframe = document.createElement('iframe');
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups',
    );
    iframe.style.cssText =
      'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none';

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      teardownRpc();
      iframe.remove();
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('WebJs 执行超时')));
    }, timeoutMs);

    const runAfterLoad = async () => {
      const delay = opts.delayMs ?? (opts.script?.trim() ? 0 : 900);
      if (delay > 0) await sleep(delay);
      try {
        const win = iframe.contentWindow as Window & {
          __legadoWebJsResult?: string;
          __legadoWebJsError?: string;
        };
        if (win?.__legadoWebJsError) {
          finish(() => reject(new Error(win.__legadoWebJsError)));
          return;
        }
        const raw = win?.__legadoWebJsResult ?? '';
        finish(() => resolve(String(raw)));
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      }
    };

    iframe.onload = () => {
      void runAfterLoad();
    };

    iframe.onerror = () => {
      finish(() => reject(new Error('WebJs iframe 加载失败')));
    };

    document.body.appendChild(iframe);

    const httpUrl = opts.url?.trim();
    if (httpUrl && /^https?:\/\//i.test(httpUrl)) {
      const shouldProxyDoc =
        !isTauri() &&
        !!opts.script?.trim() &&
        shouldUseWebHttpProxy(httpUrl, opts.headers ?? {});
      if (shouldProxyDoc) {
        void (async () => {
          try {
            const res = await request(httpUrl, {
              method: 'GET',
              headers: opts.headers,
              enableCookieJar: true,
              timeout: opts.timeoutMs ?? 30_000,
            });
            const html = await res.text();
            iframe.srcdoc = buildSrcDoc({ ...opts, html }, executable);
          } catch (e) {
            finish(() =>
              reject(
                e instanceof Error ? e : new Error(String(e)),
              ),
            );
          }
        })();
      } else {
        iframe.src = httpUrl;
      }
    } else {
      iframe.srcdoc = buildSrcDoc(opts, executable);
    }
  });
}

function buildQuickJsContext(opts: RunWebJsOptions): JsContext {
  return {
    result: opts.priorResult ?? opts.html ?? '',
    baseUrl: opts.baseUrl || opts.url || '',
    source: opts.sourceKey ? { bookSourceUrl: opts.sourceKey } : undefined,
  };
}

/** 执行 WebJs */
export async function runWebJs(opts: RunWebJsOptions): Promise<string> {
  const jsCtx = buildQuickJsContext(opts);
  const script = opts.script?.trim() ?? '';
  const pageUrl = opts.url?.trim() || opts.baseUrl?.trim() || '';

  if (isTauri() && typeof window !== 'undefined') {
    try {
      const { runWebJsInTauri } = await import('@/lib/rule-engine/webjs-tauri');
      const out = await runWebJsInTauri(opts);
      if (opts.source && pageUrl.startsWith('http')) {
        await syncBackstageWebViewCookies(opts.source, pageUrl);
      }
      return out;
    } catch (e) {
      console.warn('[webjs] Tauri 后台 WebView 失败，尝试 iframe', e);
    }
  }

  if (typeof document !== 'undefined') {
    try {
      return await runWebJsInIframe(opts);
    } catch (e) {
      console.warn('[webjs] iframe 执行失败，回退 QuickJS', e);
    }
  }

  if (!script) {
    return opts.priorResult ?? opts.html ?? '';
  }

  const v = await evalJs(script, jsCtx);
  return v == null ? '' : String(v);
}

/** 尝试将 WebJs 结果解析为字符串列表（Legado fromJsonArray） */
export function parseWebJsListResult(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t) as unknown[];
      if (Array.isArray(arr)) {
        return arr.map((x) => (x == null ? '' : String(x))).filter((s) => s.trim());
      }
    } catch {
      // fall through
    }
  }
  return t.includes('\n') ? t.split('\n').map((s) => s.trim()).filter(Boolean) : [t];
}
