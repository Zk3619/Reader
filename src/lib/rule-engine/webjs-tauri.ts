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
