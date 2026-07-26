/**
 * YouTube player JS 解签（s / n 参数），QuickJS 优先，Function 降级
 */

import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import {
  createQuickJSContext,
  initQuickJSRuntime,
  isQuickJSFallback,
} from '@/lib/js-engine/core/runtime';

let playerJsCache: { url: string; code: string; at: number } | null = null;
let decipherCache: { playerUrl: string; fn: string; nFn: string | null } | null = null;

const PLAYER_CACHE_MS = 6 * 60 * 60 * 1000;

async function fetchText(url: string): Promise<string> {
  const res = await request(url, {
    method: 'GET',
    useBackendHttp: isTauri(),
    ignorePageNavigationAbort: true,
  });
  if (!res.ok) throw new Error(`fetch ${url} HTTP ${res.status}`);
  return res.text();
}

/** 从 watch / music 页或 player 响应提取 player JS URL */
export function extractPlayerJsUrl(htmlOrJson: string): string | null {
  const m =
    htmlOrJson.match(/"jsUrl"\s*:\s*"([^"]+)"/) ||
    htmlOrJson.match(/\/s\/player\/([a-zA-Z0-9_-]+)\/player_ias\.vflset\/[^"]+\/base\.js/) ||
    htmlOrJson.match(/PLAYER_JS_URL\s*=\s*"([^"]+)"/);
  if (!m) return null;
  let path = m[0]?.includes('jsUrl') ? m[1]! : m[0]!;
  if (path.startsWith('/s/player')) {
    const full = htmlOrJson.match(
      /\/s\/player\/[a-zA-Z0-9_-]+\/player_ias\.vflset\/[^"\\]+\/base\.js/,
    );
    path = full?.[0] ?? path;
  }
  if (path.startsWith('//')) return `https:${path}`;
  if (path.startsWith('/')) return `https://www.youtube.com${path}`;
  if (path.startsWith('http')) return path;
  return `https://www.youtube.com${path.startsWith('/') ? '' : '/'}${path}`;
}

function extractDecipherFunction(playerJs: string): { decipher: string; nTransform: string | null } {
  // 常见：a=a.split("")；…；return a.join("")
  const nameMatch =
    playerJs.match(
      /(?:^|[;,])(?:var\s+|let\s+|const\s+)?([A-Za-z0-9_$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
    ) ||
    playerJs.match(
      /function\s+([A-Za-z0-9_$]+)\s*\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
    );
  let decipher = '';
  if (nameMatch) {
    const name = nameMatch[1]!;
    const start = playerJs.indexOf(nameMatch[0]!);
    // 粗取函数体至匹配的 return a.join
    const slice = playerJs.slice(Math.max(0, start - 50), start + 8000);
    const fnMatch = slice.match(
      new RegExp(
        `(?:function\\s+${name}|${name}\\s*=\\s*function)\\s*\\(\\s*a\\s*\\)\\s*\\{[\\s\\S]*?return\\s+a\\.join\\(\\s*""\\s*\\)\\s*;?\\s*\\}`,
      ),
    );
    if (fnMatch) {
      decipher = `var __decipher=${fnMatch[0]!.replace(/^function\s+[A-Za-z0-9_$]+/, 'function')};`;
      if (!decipher.includes('var __decipher=function') && decipher.includes('function(')) {
        decipher = `var __decipher=${fnMatch[0]};`;
      }
      // 若匹配的是 `name=function`，规范化
      if (fnMatch[0]!.startsWith(name)) {
        decipher = `var __decipher=${fnMatch[0]!.replace(new RegExp(`^${name}\\s*=\\s*`), '')};`;
      }
    }
  }

  // 辅助对象：如 var b={...}
  if (decipher) {
    const objNames = [...decipher.matchAll(/([A-Za-z0-9_$]+)\.[A-Za-z0-9_$]+\(/g)].map(
      (x) => x[1]!,
    );
    const uniq = [...new Set(objNames)].filter((n) => n !== 'a' && n !== '__decipher');
    for (const obj of uniq) {
      const objRe = new RegExp(
        `(?:var|let|const)\\s+${obj}\\s*=\\s*\\{[^]{0,3000}?\\}\\s*;`,
      );
      const om = playerJs.match(objRe);
      if (om) decipher = `${om[0]}\n${decipher}`;
    }
  }

  // n 参数变换（可选）
  let nTransform: string | null = null;
  const nMatch = playerJs.match(
    /\.get\("n"\)\)&&\(b=([A-Za-z0-9_$]+)(?:\[(\d+)\])?\([^\)]*\)/,
  );
  if (nMatch) {
    const nName = nMatch[1]!;
    const nFn = playerJs.match(
      new RegExp(
        `${nName}\\s*=\\s*function\\s*\\(\\s*a\\s*\\)\\s*\\{[\\s\\S]{0,8000}?return\\s+b\\.join\\(\\s*""\\s*\\)`,
      ),
    );
    if (nFn) {
      nTransform = `var __nTransform=${nFn[0]};`;
    }
  }

  if (!decipher) {
    // 极简兜底：恒等
    decipher = 'var __decipher=function(a){return a;};';
  }
  return { decipher, nTransform };
}

async function loadPlayerJs(playerUrl: string): Promise<string> {
  const now = Date.now();
  if (playerJsCache && playerJsCache.url === playerUrl && now - playerJsCache.at < PLAYER_CACHE_MS) {
    return playerJsCache.code;
  }
  const code = await fetchText(playerUrl);
  playerJsCache = { url: playerUrl, code, at: now };
  return code;
}

async function evalTransform(script: string, fnCall: string): Promise<string | null> {
  await initQuickJSRuntime();
  if (!isQuickJSFallback()) {
    const vm = createQuickJSContext();
    if (vm) {
      try {
        const wrapped = `${script}\n;${fnCall}`;
        const result = vm.evalCode(wrapped);
        if (result.error) {
          result.error.dispose();
          return null;
        }
        const value = vm.dump(result.value);
        result.value?.dispose();
        return typeof value === 'string' ? value : null;
      } finally {
        vm.dispose();
      }
    }
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${script}\n;return (${fnCall});`);
    const value = fn();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export async function resolvePlayerJsUrlFromWatch(videoId: string): Promise<string | null> {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
    return extractPlayerJsUrl(html);
  } catch {
    return null;
  }
}

export async function decipherSignature(
  playerJsUrl: string,
  signature: string,
): Promise<string | null> {
  const code = await loadPlayerJs(playerJsUrl);
  if (!decipherCache || decipherCache.playerUrl !== playerJsUrl) {
    const extracted = extractDecipherFunction(code);
    decipherCache = {
      playerUrl: playerJsUrl,
      fn: extracted.decipher,
      nFn: extracted.nTransform,
    };
  }
  const sigJson = JSON.stringify(signature);
  return evalTransform(decipherCache.fn, `__decipher(${sigJson})`);
}

export async function transformNParam(
  playerJsUrl: string,
  n: string,
): Promise<string | null> {
  const code = await loadPlayerJs(playerJsUrl);
  if (!decipherCache || decipherCache.playerUrl !== playerJsUrl) {
    const extracted = extractDecipherFunction(code);
    decipherCache = {
      playerUrl: playerJsUrl,
      fn: extracted.decipher,
      nFn: extracted.nTransform,
    };
  }
  if (!decipherCache.nFn) return null;
  const nJson = JSON.stringify(n);
  return evalTransform(decipherCache.nFn, `__nTransform(${nJson})`);
}

export async function applySigToUrl(
  rawUrl: string,
  playerJsUrl: string | null,
): Promise<string> {
  try {
    const u = new URL(rawUrl);
    const cipher = u.searchParams.get('s') || u.searchParams.get('sig');
    if (cipher && playerJsUrl) {
      const dec = await decipherSignature(playerJsUrl, cipher);
      if (dec) {
        u.searchParams.delete('s');
        u.searchParams.set('sig', dec);
      }
    }
    const n = u.searchParams.get('n');
    if (n && playerJsUrl) {
      const nn = await transformNParam(playerJsUrl, n);
      if (nn) u.searchParams.set('n', nn);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/** 解析 signatureCipher 查询串 */
export function parseSignatureCipher(cipher: string): { url: string; s?: string; sp?: string } {
  const params = new URLSearchParams(cipher);
  return {
    url: params.get('url') ?? '',
    s: params.get('s') ?? undefined,
    sp: params.get('sp') ?? 'sig',
  };
}
