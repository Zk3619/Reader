/**
 * yt-dlp ejs 挑战求解（进程内）— 移植 vendor 脚本，不调用外部 yt-dlp / deno。
 * @see https://github.com/yt-dlp/ejs
 *
 * 重要：vendor 为 Node 沙箱注入 `globalThis.location = new URL('…watch?v=yt-dlp-wins')`。
 * 在浏览器主 WebView 里赋值 location 会整页跳转到 YouTube，表现为「此视频无法再播放」且无法回退。
 * 因此求解必须在隔离 iframe 的 Realm 中执行。
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

/** 在隔离 iframe 中执行，避免 ejs 的 location 赋值导航主窗口 */
function runEjsFunctionBody(body: string): string {
  if (typeof document === 'undefined') {
    // eslint-disable-next-line no-new-func
    const fn = new Function(body);
    const raw = fn();
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.setAttribute('title', 'ytdlp-ejs-sandbox');
  iframe.style.cssText =
    'position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
  document.documentElement.appendChild(iframe);
  try {
    const w = iframe.contentWindow;
    if (!w) throw new Error('ejs sandbox unavailable');
    // 拦截 vendor 的 location 赋值。勿 defineProperty(function, 'prototype')——
    // 普通函数 prototype 不可配置，会抛 Cannot redefine property: prototype。
    const win = w as Window & { Function: FunctionConstructor };
    const RealFunction = win.Function;
    const wrapBody = (args: unknown[]) => {
      const params = args.slice(0, -1) as string[];
      const src = String(args[args.length - 1] ?? '');
      const wrapped = `
        (function(){
          try {
            var __fakeLoc = {
              href: 'https://www.youtube.com/watch?v=yt-dlp-wins',
              protocol: 'https:', host: 'www.youtube.com', hostname: 'www.youtube.com',
              pathname: '/watch', search: '?v=yt-dlp-wins', hash: '', origin: 'https://www.youtube.com',
              port: '', username: '', password: ''
            };
            Object.defineProperty(globalThis, 'location', {
              configurable: true,
              get: function(){ return __fakeLoc; },
              set: function(){ /* ignore navigate */ }
            });
          } catch (e) {}
        })();
        ${src}
      `;
      return { params, wrapped };
    };
    win.Function = new Proxy(RealFunction, {
      apply(_target, _thisArg, args) {
        const { params, wrapped } = wrapBody(args as unknown[]);
        return RealFunction(...params, wrapped);
      },
      construct(_target, args) {
        const { params, wrapped } = wrapBody(args as unknown[]);
        return new RealFunction(...params, wrapped);
      },
    }) as FunctionConstructor;
    const fn = new win.Function(body) as () => unknown;
    const raw = fn();
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  } finally {
    iframe.remove();
  }
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

  const requests = [
    {
      type: challenges.type,
      challenges: challenges.values,
    },
  ];
  const data = {
    type: 'player',
    player: playerJs,
    requests,
    output_preprocessed: false,
  };

  const body = `
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
  `;

  const raw = runEjsFunctionBody(body);
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'ejs returned empty' };
  }
  // 官方 Output：responses[i] 对应 requests[i]；成功项为 { type:'result', data }，不是 results / type:n|sig
  if ((parsed as { type?: string }).type === 'error') {
    return { error: String((parsed as { error?: string }).error || 'ejs error') };
  }
  const responses = (parsed as { responses?: unknown[] }).responses;
  const n: Record<string, string> = {};
  const sig: Record<string, string> = {};
  if (Array.isArray(responses)) {
    for (let i = 0; i < responses.length; i++) {
      const row = responses[i] as {
        type?: string;
        data?: Record<string, string>;
        results?: Record<string, string>;
        error?: string;
      };
      if (row.type === 'error' || row.error) {
        return { error: String(row.error || 'ejs request failed') };
      }
      const map = row.data || row.results || {};
      const reqType = requests[i]?.type || challenges.type;
      if (reqType === 'n') Object.assign(n, map);
      else if (reqType === 'sig') Object.assign(sig, map);
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
    const cacheN = new Map<string, string>();
    const cacheSig = new Map<string, string>();

    // 预热：空挑战，确认 sandbox / jsc 可用
    const probe = await solveWithEjs(playerJs, { type: 'n', values: [] });
    if (probe.error) return null;

    return {
      decipherSig: (s: string) => {
        const hit = cacheSig.get(s);
        if (hit) return hit;
        // 同步 API 无法 await；调用方应优先用 decipherFormatsWithEjs
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

  if (uniqueSig.length) {
    const r = await solveWithEjs(playerJs, { type: 'sig', values: uniqueSig });
    if (r.error) throw new Error(r.error);
    sigMap = r.sig || {};
    if (!Object.keys(sigMap).length) throw new Error('ejs returned empty sig map');
  }
  if (uniqueN.length) {
    const r = await solveWithEjs(playerJs, { type: 'n', values: uniqueN });
    if (r.error) throw new Error(r.error);
    nMap = r.n || {};
    if (!Object.keys(nMap).length) throw new Error('ejs returned empty n map');
  }

  return list.map((it, idx) => {
    const row = { ...it };
    const m = meta.find((x) => x.idx === idx);
    if (!m) return row;
    if (m.kind === 'cipher' && m.baseUrl) {
      // 缺 sig 时不要写残缺 url，否则 googlevideo 立刻 403
      if (m.s && !sigMap[m.s]) return row;
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
