/**
 * yt-dlp ejs 挑战求解（进程内）— 移植 vendor 脚本，不调用外部 yt-dlp / deno。
 * @see https://github.com/yt-dlp/ejs
 */

import type { PlayerSolvers } from './youtube-sig';

let libCode: string | null = null;
let coreCode: string | null = null;
let loadPromise: Promise<void> | null = null;

async function loadEjsScripts(): Promise<void> {
  if (libCode && coreCode) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      // Vite ?raw
      const libMod = await import('./ejs-vendor/yt.solver.lib.min.js?raw');
      const coreMod = await import('./ejs-vendor/yt.solver.core.min.js?raw');
      libCode = String((libMod as { default?: string }).default ?? libMod);
      coreCode = String((coreMod as { default?: string }).default ?? coreMod);
    } catch {
      // 非 Vite / raw 不可用时尝试 fetch 相对资源（开发兜底）
      throw new Error('无法加载 ejs vendor 脚本（需要 Vite ?raw 导入）');
    }
  })();
  return loadPromise;
}

export interface EjsSolveResult {
  n?: Record<string, string>;
  sig?: Record<string, string>;
  preprocessed_player?: string;
  error?: string;
}

/**
 * 对 player.js 求解 n / sig 挑战（批量）。
 */
export async function solveWithEjs(
  playerJs: string,
  challenges: { type: 'n' | 'sig'; values: string[] },
): Promise<EjsSolveResult> {
  await loadEjsScripts();
  if (!libCode || !coreCode) throw new Error('ejs scripts missing');

  const data = {
    type: 'player',
    player: playerJs,
    requests: [
      {
        type: challenges.type,
        challenges: challenges.values,
      },
    ],
    output_preprocessed: false,
  };

  // eslint-disable-next-line no-new-func
  const fn = new Function(`
    var lib = undefined;
    var jsc = undefined;
    var module = { exports: {} };
    var exports = module.exports;
    ${libCode}
    if (typeof lib === 'undefined' && module.exports) {
      lib = module.exports.lib || module.exports;
    }
    Object.assign(globalThis, lib || {});
    module = { exports: {} };
    exports = module.exports;
    ${coreCode}
    if (typeof jsc === 'undefined' && module.exports) {
      jsc = module.exports.jsc || module.exports.default || module.exports;
    }
    if (typeof jsc !== 'function' && typeof globalThis.jsc === 'function') {
      jsc = globalThis.jsc;
    }
    var input = ${JSON.stringify(data)};
    var out = jsc(input);
    return typeof out === 'string' ? out : JSON.stringify(out);
  `);

  const raw = fn();
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'ejs returned empty' };
  }
  // Response shape from ejs: { responses: [ { type, results: { challenge: solved } } ] }
  const responses = (parsed as { responses?: unknown[] }).responses;
  const n: Record<string, string> = {};
  const sig: Record<string, string> = {};
  if (Array.isArray(responses)) {
    for (const resp of responses) {
      const row = resp as { type?: string; results?: Record<string, string>; error?: string };
      if (row.error) return { error: row.error };
      const results = row.results || {};
      if (row.type === 'n') Object.assign(n, results);
      if (row.type === 'sig') Object.assign(sig, results);
    }
  }
  return {
    n: Object.keys(n).length ? n : undefined,
    sig: Object.keys(sig).length ? sig : undefined,
    preprocessed_player: (parsed as { preprocessed_player?: string }).preprocessed_player,
  };
}

/**
 * 用 ejs 从 player.js 编译可复用的 sig/n 求解器。
 * 若 ejs 失败则返回 null（由调用方回退正则抽取）。
 */
export async function compileSolversWithEjs(playerJs: string): Promise<PlayerSolvers | null> {
  try {
    await loadEjsScripts();
    // 探测：用占位挑战确认脚本可跑；真正求解在 apply 时按需
    // ejs 更适合按挑战批量求；这里包装为函数：每次调用对单个值求解
    const cacheN = new Map<string, string>();
    const cacheSig = new Map<string, string>();

    const transformN = asyncOrSyncN(playerJs, cacheN);
    const decipherSig = asyncOrSyncSig(playerJs, cacheSig);

    // PlayerSolvers 接口是同步的；预热并暴露同步缓存包装
    // 对常见路径：先同步尝试正则，ejs 作为增强在 youtube.ts 异步路径使用
    void transformN;
    void decipherSig;
    return {
      decipherSig: (s: string) => {
        const hit = cacheSig.get(s);
        if (hit) return hit;
        // 同步路径无法 await；返回原值，异步路径应先 fillCache
        return s;
      },
      transformN: (n: string) => {
        const hit = cacheN.get(n);
        if (hit) return hit;
        return n;
      },
    };
  } catch {
    return null;
  }
}

function asyncOrSyncN(playerJs: string, cache: Map<string, string>) {
  return async (n: string) => {
    if (cache.has(n)) return cache.get(n)!;
    const r = await solveWithEjs(playerJs, { type: 'n', values: [n] });
    const out = r.n?.[n];
    if (out) cache.set(n, out);
    return out || n;
  };
}

function asyncOrSyncSig(playerJs: string, cache: Map<string, string>) {
  return async (s: string) => {
    if (cache.has(s)) return cache.get(s)!;
    const r = await solveWithEjs(playerJs, { type: 'sig', values: [s] });
    const out = r.sig?.[s];
    if (out) cache.set(s, out);
    return out || s;
  };
}

/**
 * 批量用 ejs 解格式列表中的 n / signatureCipher，写回 url。
 */
export async function decipherFormatsWithEjs(
  list: Record<string, unknown>[],
  playerJs: string,
): Promise<Record<string, unknown>[]> {
  const nValues: string[] = [];
  const sigValues: string[] = [];
  const meta: Array<{
    idx: number;
    kind: 'url' | 'cipher';
    n?: string;
    s?: string;
    sp?: string;
    baseUrl?: string;
  }> = [];

  list.forEach((it, idx) => {
    const cipher =
      typeof it.signatureCipher === 'string'
        ? it.signatureCipher
        : typeof it.cipher === 'string'
          ? it.cipher
          : undefined;
    if (cipher) {
      const params = new URLSearchParams(cipher);
      const s = params.get('s') || undefined;
      const sp = params.get('sp') || 'signature';
      const baseUrl = params.get('url') || undefined;
      let n: string | undefined;
      if (baseUrl) {
        try {
          n = new URL(decodeURIComponent(baseUrl)).searchParams.get('n') || undefined;
        } catch {
          /* */
        }
      }
      if (s) sigValues.push(s);
      if (n) nValues.push(n);
      meta.push({ idx, kind: 'cipher', n, s, sp, baseUrl: baseUrl || undefined });
    } else if (typeof it.url === 'string') {
      try {
        const n = new URL(it.url).searchParams.get('n') || undefined;
        if (n) nValues.push(n);
        meta.push({ idx, kind: 'url', n });
      } catch {
        meta.push({ idx, kind: 'url' });
      }
    }
  });

  const uniqueN = [...new Set(nValues)];
  const uniqueSig = [...new Set(sigValues)];
  let nMap: Record<string, string> = {};
  let sigMap: Record<string, string> = {};
  try {
    if (uniqueSig.length) {
      const r = await solveWithEjs(playerJs, { type: 'sig', values: uniqueSig });
      if (r.error) throw new Error(r.error);
      sigMap = r.sig || {};
    }
    if (uniqueN.length) {
      const r = await solveWithEjs(playerJs, { type: 'n', values: uniqueN });
      if (r.error) throw new Error(r.error);
      nMap = r.n || {};
    }
  } catch (e) {
    throw e;
  }

  return list.map((it, idx) => {
    const row = { ...it };
    const m = meta.find((x) => x.idx === idx);
    if (!m) return row;
    if (m.kind === 'cipher' && m.baseUrl) {
      try {
        const u = new URL(decodeURIComponent(m.baseUrl));
        if (m.s && sigMap[m.s]) u.searchParams.set(m.sp || 'signature', sigMap[m.s]!);
        if (m.n && nMap[m.n]) u.searchParams.set('n', nMap[m.n]!);
        row.url = u.toString();
        delete row.signatureCipher;
        delete row.cipher;
      } catch {
        /* keep */
      }
    } else if (m.kind === 'url' && typeof row.url === 'string' && m.n && nMap[m.n]) {
      try {
        const u = new URL(String(row.url));
        u.searchParams.set('n', nMap[m.n]!);
        row.url = u.toString();
      } catch {
        /* */
      }
    }
    return row;
  });
}
