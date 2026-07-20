/**
 * TV .js Spider ES Module 支持（drpy2 / catvod），对齐 FongMi evaluateModule + ModuleLoader
 */

import type { QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten';

/** 兼容多行 import 与中文标识符（drpy2: import { cheerio, 模板 } from "..."） */
const MODULE_FROM_RE = /\bfrom\s+['"]([^'"]+)['"]/g;

export function isEsModuleSpiderSource(source: string): boolean {
  return /^\s*(import\s|export\s)/m.test(source) || /\bexport\s+default\b/.test(source);
}

export function isCatvodSpiderSource(source: string): boolean {
  return source.includes('__jsEvalReturn');
}

export function resolveTvModuleUrl(base: string, ref: string, configBase = ''): string {
  const name = ref.trim();
  if (!name) return name;
  if (name.startsWith('assets://')) {
    const path = name.replace(/^assets:\/\/js\/lib\//, 'lib/').replace(/^assets:\/\//, '');
    const root = configBase || base;
    try {
      return new URL(path, root).toString();
    } catch {
      return path;
    }
  }
  if (/^https?:\/\//i.test(name) || name.startsWith('file://')) return name;
  try {
    return new URL(name, base).toString();
  } catch {
    return name;
  }
}

export function resolveTvExtUrl(ext: string, configBase: string): string {
  const raw = ext.trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('file://')) return raw;
  try {
    return new URL(raw, configBase).toString();
  } catch {
    return raw;
  }
}

export function extractModuleImports(source: string): string[] {
  const out: string[] = [];
  MODULE_FROM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MODULE_FROM_RE.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function moduleCacheKeys(
  moduleName: string,
  entryUrl: string,
  configBase: string,
): string[] {
  const keys = new Set<string>();
  keys.add(moduleName);
  keys.add(resolveTvModuleUrl(entryUrl, moduleName, configBase));
  keys.add(resolveTvModuleUrl(configBase, moduleName, configBase));
  const tail = moduleName.split('/').pop()?.split('?')[0] ?? moduleName;
  for (const k of keys) {
    if (k) keys.add(k);
  }
  return [...keys, tail];
}

export async function prefetchTvModuleTree(
  entryUrl: string,
  entrySource: string,
  configBase: string,
  fetchText: (url: string) => Promise<string>,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const queue: Array<{ ref: string; parent: string; source?: string }> = [
    { ref: entryUrl, parent: configBase || entryUrl, source: entrySource },
  ];

  const remember = (url: string, code: string) => {
    cache.set(url, code);
    try {
      const u = new URL(url);
      const alt = `${u.origin}${u.pathname}${u.search}`;
      if (alt !== url) cache.set(alt, code);
    } catch {
      /* */
    }
  };

  const has = (url: string) =>
    moduleCacheKeys(url, entryUrl, configBase).some((k) => cache.has(k));

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const normalized = resolveTvModuleUrl(item.parent, item.ref, configBase);
    if (has(normalized)) continue;

    const code = item.source ?? (await fetchText(normalized));
    remember(normalized, code);

    for (const dep of extractModuleImports(code)) {
      const depUrl = resolveTvModuleUrl(normalized, dep, configBase);
      if (!has(depUrl)) queue.push({ ref: dep, parent: normalized });
    }
  }

  return cache;
}

export function attachTvModuleLoader(
  runtime: QuickJSRuntime,
  moduleCache: Map<string, string>,
  entryUrl: string,
  configBase: string,
): void {
  runtime.setModuleLoader((moduleName) => {
    for (const key of moduleCacheKeys(moduleName, entryUrl, configBase)) {
      const hit = moduleCache.get(key);
      if (hit != null) return hit;
    }
    for (const [k, v] of moduleCache) {
      const tail = moduleName.split('/').pop()?.split('?')[0] ?? moduleName;
      if (k === moduleName || k.endsWith(`/${tail}`) || k.endsWith(tail)) return v;
    }
    throw new Error(`TV module not prefetched: ${moduleName}`);
  });
}

export function evalModuleVoid(vm: QuickJSContext, code: string, filename: string): void {
  const r = vm.evalCode(code, filename, { type: 'module' });
  if (r.error) {
    const err = vm.dump(r.error);
    r.error.dispose();
    const msg =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
    throw new Error(`QuickJS module eval: ${msg}`);
  }
  r.value.dispose();
}

export function buildSpiderBootstrap(moduleUrl: string): string {
  return `
import * as spider from ${JSON.stringify(moduleUrl)};
if (!globalThis.__TV_SPIDER__) {
  if (typeof spider.__jsEvalReturn === 'function') {
    globalThis.__TV_SPIDER__ = spider.__jsEvalReturn();
  } else if (spider.default) {
    globalThis.__TV_SPIDER__ = typeof spider.default === 'function' ? spider.default() : spider.default;
  }
}
`;
}

export function buildSpiderInitArg(
  siteKey: string,
  ext: unknown,
  source: string,
  configUrl: string,
): unknown {
  if (isCatvodSpiderSource(source)) {
    if (typeof ext === 'object' && ext !== null) {
      return { stype: 3, skey: siteKey, ext };
    }
    const extStr = ext == null ? '' : String(ext);
    return { stype: 3, skey: siteKey, ext: resolveTvExtUrl(extStr, configUrl) };
  }
  if (typeof ext === 'string' && ext && !ext.trim().startsWith('{')) {
    return resolveTvExtUrl(ext, configUrl);
  }
  return ext ?? '';
}

type ReqResult = { code: number; content: string; headers: Record<string, string> };

/** drpy request() 封装：返回 HTML/JSON 文本 */
export function buildDrpyRequest(
  reqFn: (
    url: string,
    opt?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => ReqResult,
): (url: string, opt?: { method?: string; headers?: Record<string, string>; body?: string }) => string {
  return (url, opt) => reqFn(url, opt).content ?? '';
}
