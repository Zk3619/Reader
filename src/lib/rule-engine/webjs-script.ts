/**
 * WebJs 脚本拼装（iframe / Tauri 共用）
 */

import { buildLegadoWebJsInjection } from '@/lib/rule-engine/webjs-legado-injection';
import { buildWebJsSniffScript } from '@/lib/rule-engine/webjs-sniff';

export interface RunWebJsOptions {
  url?: string;
  html?: string;
  baseUrl?: string;
  script: string;
  priorResult?: unknown;
  timeoutMs?: number;
  delayMs?: number;
  headers?: Record<string, string>;
  cookies?: string;
  sourceRegex?: string;
  overrideUrlRegex?: string;
  encode?: string;
  cacheFirst?: boolean;
  isRule?: boolean;
  sourceKey?: string;
  source?: import('@/types').BookSource;
  jsLib?: string;
}

function escapeScript(s: string): string {
  return s.replace(/<\/script/gi, '<\\/script');
}

/** 页面内前置：Legado 注入 + 嗅探 */
export function buildWebJsPrelude(opts: RunWebJsOptions): string {
  const sniff = buildWebJsSniffScript({
    sourceRegex: opts.sourceRegex,
    overrideUrlRegex: opts.overrideUrlRegex,
    timeoutMs: opts.timeoutMs,
  });
  const legado = buildLegadoWebJsInjection(opts.jsLib);
  return [sniff, legado].filter(Boolean).join('\n');
}

/** 在页面上下文中执行的脚本体（可 async） */
export function buildWebJsUserScript(opts: RunWebJsOptions): string {
  const prior = JSON.stringify(opts.priorResult ?? opts.html ?? '');
  const userScript = escapeScript(opts.script.trim());
  const hasNavSniff = !!(opts.sourceRegex?.trim() || opts.overrideUrlRegex?.trim());

  const htmlSniff =
    opts.sourceRegex?.trim() && !opts.overrideUrlRegex?.trim() ?
      `
  if (${JSON.stringify(opts.sourceRegex)}) {
    try {
      var __sn = document.documentElement.outerHTML.match(new RegExp(${JSON.stringify(opts.sourceRegex)}));
      if (__sn && __sn[0]) document.documentElement.innerHTML = __sn[0];
    } catch (e) { console.warn('[webjs] sourceRegex', e); }
  }
`
    : '';

  const core = `
  var result = ${prior};
  var baseUrl = ${JSON.stringify(opts.baseUrl || '')};
  var src = result;
  ${htmlSniff}
  try {
    ${userScript}
  } catch (e) {
    throw e;
  }
  if (typeof result === 'undefined') {
    result = document.documentElement.outerHTML;
  } else if (result !== null && typeof result === 'object') {
    try { result = JSON.stringify(result); } catch (e) { result = String(result); }
  } else {
    result = result == null ? '' : String(result);
  }
  return result;
`.trim();

  if (!hasNavSniff) return core;

  return `
  if (typeof __readerWaitSniff === 'function') {
    var __hit = await __readerWaitSniff();
    if (__hit) return String(__hit);
  }
  ${core}
`.trim();
}

/** 完整可执行块（prelude + async IIFE） */
export function buildWebJsExecutable(opts: RunWebJsOptions): string {
  const prelude = buildWebJsPrelude(opts);
  const body = buildWebJsUserScript(opts);
  return `
${prelude}
;return (async function(){
${body}
})();
`.trim();
}
