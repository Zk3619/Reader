/**
 * YouTube player.js 签名 / n 参数变换 — 移植自 ytdl-core / yt-dlp 的 JS 挑战求解思路。
 * 在进程内用 Function 执行从 player 抽出的求解函数，不调用外部 yt-dlp。
 */

const playerCache = new Map<string, { decipher?: string; ncode?: string; at: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cutAfterJS(mixedJson: string): string {
  let open: string | null = null;
  let close: string | null = null;
  for (const ch of mixedJson) {
    if (ch === '{') {
      open = '{';
      close = '}';
      break;
    }
    if (ch === '[') {
      open = '[';
      close = ']';
      break;
    }
    if (ch === '(') {
      open = '(';
      close = ')';
      break;
    }
  }
  if (!open || !close) return '';

  let isEscaped = false;
  let isInQuote: string | null = null;
  let stack = 0;
  for (let i = 0; i < mixedJson.length; i++) {
    const ch = mixedJson[i]!;
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (ch === '\\') {
      isEscaped = true;
      continue;
    }
    if (isInQuote) {
      if (ch === isInQuote) isInQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      isInQuote = ch;
      continue;
    }
    if (ch === open) stack++;
    else if (ch === close) {
      stack--;
      if (stack === 0) return mixedJson.slice(0, i + 1);
    }
  }
  return '';
}

function between(haystack: string, left: string, right: string): string {
  const i = haystack.indexOf(left);
  if (i < 0) return '';
  const start = i + left.length;
  const j = haystack.indexOf(right, start);
  if (j < 0) return '';
  return haystack.slice(start, j);
}

function extractManipulations(body: string, caller: string): string {
  const functionName = between(caller, 'a=a.split("");', '.');
  if (!functionName) return '';
  const functionStart = `var ${functionName}={`;
  const ndx = body.indexOf(functionStart);
  if (ndx < 0) return '';
  const subBody = body.slice(ndx + functionStart.length - 1);
  return `var ${functionName}=${cutAfterJS(subBody)}`;
}

function extractDecipherFunction(body: string): string | null {
  const patterns = [
    () => between(body, 'a.set("alr","yes");c&&(c=', '(decodeURIC'),
    () => between(body, 'a.set("alr","yes");c&&(c=', '(decodeURIComponent'),
    () => {
      const m = body.match(
        /(?:^|[,;{])(?:var\s+)?([A-Za-z0-9_$]{2,})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
      );
      return m?.[1] || '';
    },
  ];
  for (const getName of patterns) {
    let functionName = getName();
    if (!functionName) continue;
    if (functionName.includes('[') || functionName.includes(')')) continue;
    const functionStart = `${functionName}=function(a)`;
    let ndx = body.indexOf(functionStart);
    if (ndx < 0) {
      const alt = `var ${functionName}=function(a)`;
      ndx = body.indexOf(alt);
      if (ndx >= 0) {
        const subBody = body.slice(ndx + alt.length);
        const functionBody = `var ${functionName}=function(a)${cutAfterJS(subBody)}`;
        const manip = extractManipulations(body, functionBody);
        return `${manip};${functionBody};return ${functionName}(sig);`;
      }
      continue;
    }
    const subBody = body.slice(ndx + functionStart.length);
    const functionBody = `var ${functionStart}${cutAfterJS(subBody)}`;
    const manip = extractManipulations(body, functionBody);
    return `${manip};${functionBody};return ${functionName}(sig);`;
  }
  return null;
}

function extractNcodeFunction(body: string): string | null {
  let functionName = between(body, '&&(b=a.get("n"))&&(b=', '(b)');
  if (!functionName) {
    functionName = between(body, '&&(b=a.get("n"))&&(b=', '(b,');
  }
  if (functionName.includes('[')) {
    const arrName = functionName.split('[')[0]!;
    functionName = between(body, `var ${arrName}=[`, ']');
  }
  if (!functionName) {
    const m = body.match(
      /(?:^|[,;{])(?:var\s+)?([A-Za-z0-9_$]{2,})\s*=\s*function\(\s*a\s*\)\s*\{\s*(?:var\s+)?(?:b|c)\s*=\s*a\?\.?split\(/,
    );
    functionName = m?.[1] || '';
  }
  if (!functionName || functionName.includes('(')) return null;

  const functionStart = `${functionName}=function(a)`;
  let ndx = body.indexOf(functionStart);
  let prefix = `var ${functionStart}`;
  if (ndx < 0) {
    const alt = `var ${functionName}=function(a)`;
    ndx = body.indexOf(alt);
    prefix = alt;
    if (ndx < 0) return null;
    const subBody = body.slice(ndx + alt.length);
    return `var ${functionName}=function(a)${cutAfterJS(subBody)};return ${functionName}(ncode);`;
  }
  const subBody = body.slice(ndx + functionStart.length);
  return `${prefix}${cutAfterJS(subBody)};return ${functionName}(ncode);`;
}

export function extractPlayerFunctions(playerJs: string): {
  decipher: string | null;
  ncode: string | null;
} {
  return {
    decipher: extractDecipherFunction(playerJs),
    ncode: extractNcodeFunction(playerJs),
  };
}

function runSolver(code: string, argName: string, value: string): string {
  // eslint-disable-next-line no-new-func
  const fn = new Function(argName, code);
  const out = fn(value);
  return typeof out === 'string' ? out : String(out ?? value);
}

export interface PlayerSolvers {
  decipherSig: ((s: string) => string) | null;
  transformN: ((n: string) => string) | null;
}

export function compileSolvers(playerJs: string): PlayerSolvers {
  const extracted = extractPlayerFunctions(playerJs);
  return {
    decipherSig: extracted.decipher
      ? (s) => runSolver(extracted.decipher!, 'sig', s)
      : null,
    transformN: extracted.ncode
      ? (n) => runSolver(extracted.ncode!, 'ncode', n)
      : null,
  };
}

export async function getCachedSolvers(
  playerUrl: string,
  download: (url: string) => Promise<string>,
): Promise<PlayerSolvers> {
  const key = playerUrl;
  const hit = playerCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return {
      decipherSig: hit.decipher ? (s) => runSolver(hit.decipher!, 'sig', s) : null,
      transformN: hit.ncode ? (n) => runSolver(hit.ncode!, 'ncode', n) : null,
    };
  }
  const body = await download(playerUrl);
  const extracted = extractPlayerFunctions(body);
  playerCache.set(key, {
    decipher: extracted.decipher || undefined,
    ncode: extracted.ncode || undefined,
    at: Date.now(),
  });
  return compileSolvers(body);
}

/** 从 watch 页 HTML 提取 html5player URL */
export function extractPlayerJsUrl(webpage: string): string | null {
  const patterns = [
    /"jsUrl"\s*:\s*"([^"]+)"/,
    /"PLAYER_JS_URL"\s*:\s*"([^"]+)"/,
    /\/s\/player\/([0-9a-f]{8})\/player_ias\.vflset\/[^"]+\/base\.js/,
    /<script[^>]+src="([^"]+player[^"]*\/base\.js)"/,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m) continue;
    let path = m[1] || m[0];
    if (!path) continue;
    path = path.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (path.startsWith('/')) return `https://www.youtube.com${path}`;
    if (path.startsWith('http')) return path;
    if (/^[0-9a-f]{8}$/i.test(path)) {
      // only hash from pattern 3 — reconstruct poorly; skip
      continue;
    }
  }
  // pattern 3 full match
  const m3 = webpage.match(
    /(\/s\/player\/[0-9a-f]{8}\/player_ias\.vflset\/[^"'\\]+\/base\.js)/,
  );
  if (m3?.[1]) return `https://www.youtube.com${m3[1]}`;
  return null;
}

export function applySolversToUrl(
  url: string,
  solvers: PlayerSolvers,
  opts?: { signatureCipher?: string },
): string {
  let finalUrl = url;
  if (opts?.signatureCipher) {
    const params = new URLSearchParams(opts.signatureCipher);
    const cipherUrl = params.get('url');
    const s = params.get('s');
    const sp = params.get('sp') || 'signature';
    if (cipherUrl && s && solvers.decipherSig) {
      try {
        const sig = solvers.decipherSig(decodeURIComponent(s));
        const u = new URL(decodeURIComponent(cipherUrl));
        u.searchParams.set(sp, sig);
        finalUrl = u.toString();
      } catch {
        finalUrl = decodeURIComponent(cipherUrl);
      }
    } else if (cipherUrl) {
      finalUrl = decodeURIComponent(cipherUrl);
    }
  }

  if (solvers.transformN && finalUrl) {
    try {
      const u = new URL(finalUrl);
      const n = u.searchParams.get('n');
      if (n) {
        u.searchParams.set('n', solvers.transformN(n));
        finalUrl = u.toString();
      }
    } catch {
      /* keep */
    }
  }
  return finalUrl;
}

export function decipherFormatList(
  list: Record<string, unknown>[],
  solvers: PlayerSolvers,
): Record<string, unknown>[] {
  return list.map((it) => {
    const row = { ...it };
    const cipher =
      typeof row.signatureCipher === 'string'
        ? row.signatureCipher
        : typeof row.cipher === 'string'
          ? row.cipher
          : undefined;
    const baseUrl = typeof row.url === 'string' ? row.url : '';
    if (cipher) {
      row.url = applySolversToUrl('', solvers, { signatureCipher: cipher });
      delete row.signatureCipher;
      delete row.cipher;
    } else if (baseUrl) {
      row.url = applySolversToUrl(baseUrl, solvers);
    }
    return row;
  });
}
