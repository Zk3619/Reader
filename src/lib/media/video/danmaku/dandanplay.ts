/**
 * 弹弹play 弹幕 API（对齐 Kazumi DanmakuApi / DanmakuClient）
 * https://api.dandanplay.net — 需用户配置 appId/appSecret
 *
 * 鉴权：优先签名模式（X-AppId + X-Timestamp + X-Signature），与 Kazumi 一致。
 */

const STORAGE_KEY = 'reader.video.dandanplay.v1';

export type DanDanPlayConfig = {
  appId: string;
  appSecret: string;
  apiBase: string;
};

export type DanDanMatchResult = {
  episodeId: number;
  animeTitle: string;
  episodeTitle: string;
  shift?: number;
};

export type DanDanAnimeHit = {
  animeId: number;
  animeTitle: string;
  episodeCount?: number;
};

const DEFAULT_BASE = 'https://api.dandanplay.net';

export function getDanDanPlayConfig(): DanDanPlayConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { appId: '', appSecret: '', apiBase: DEFAULT_BASE };
    return { appId: '', appSecret: '', apiBase: DEFAULT_BASE, ...JSON.parse(raw) };
  } catch {
    return { appId: '', appSecret: '', apiBase: DEFAULT_BASE };
  }
}

export function setDanDanPlayConfig(patch: Partial<DanDanPlayConfig>): DanDanPlayConfig {
  const next = { ...getDanDanPlayConfig(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function isDanDanPlayConfigured(): boolean {
  const c = getDanDanPlayConfig();
  return Boolean(c.appId.trim() && c.appSecret.trim());
}

/** 对齐 Kazumi extractEpisodeNumber：第N话/集 → N */
export function extractEpisodeNumber(input: string, fallback = 0): number {
  const s = input.trim();
  if (!s) return fallback;
  const m =
    s.match(/第\s*(\d+)\s*[话集話]/) ||
    s.match(/(?:^|[^\d])(\d+)\s*[话集話]/) ||
    s.match(/(?:EP|E|episode)\s*(\d+)/i) ||
    s.match(/(\d+)/);
  if (m?.[1]) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/** animeId + episode → 猜测的弹幕库 episodeId（如 1758 + 1 → 17580001） */
export function guessDanDanEpisodeId(animeId: number, episode: number): number {
  if (animeId <= 0 || episode <= 0) return 0;
  return Number(`${animeId}${String(episode).padStart(4, '0')}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Base64(SHA256(AppId + Timestamp + Path + AppSecret)) */
async function generateDandanSignature(
  path: string,
  timestamp: number,
  appId: string,
  appSecret: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${appId}${timestamp}${path}${appSecret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64(new Uint8Array(digest));
}

async function dandanAuthHeaders(apiPath: string): Promise<Record<string, string>> {
  const cfg = getDanDanPlayConfig();
  const appId = cfg.appId.trim();
  const appSecret = cfg.appSecret.trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await generateDandanSignature(apiPath, timestamp, appId, appSecret);
  return {
    Accept: 'application/json',
    'X-Auth': '1',
    'X-AppId': appId,
    'X-Timestamp': String(timestamp),
    'X-Signature': signature,
  };
}

async function dandanGet(apiPath: string, query?: Record<string, string>): Promise<unknown> {
  if (!isDanDanPlayConfigured()) {
    throw new Error('未配置弹弹play appId/appSecret');
  }
  const cfg = getDanDanPlayConfig();
  const base = cfg.apiBase.replace(/\/$/, '');
  const qs = query
    ? `?${new URLSearchParams(query).toString()}`
    : '';
  const url = `${base}${apiPath}${qs}`;
  const res = await fetch(url, {
    headers: await dandanAuthHeaders(apiPath),
  });
  if (!res.ok) {
    const errMsg = res.headers.get('X-Error-Message') || '';
    throw new Error(`弹弹请求失败 HTTP ${res.status}${errMsg ? `: ${errMsg}` : ''}`);
  }
  return res.json();
}

async function dandanPost(apiPath: string, body: unknown): Promise<unknown> {
  if (!isDanDanPlayConfigured()) {
    throw new Error('未配置弹弹play appId/appSecret');
  }
  const cfg = getDanDanPlayConfig();
  const base = cfg.apiBase.replace(/\/$/, '');
  const url = `${base}${apiPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await dandanAuthHeaders(apiPath)),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errMsg = res.headers.get('X-Error-Message') || '';
    throw new Error(`弹弹请求失败 HTTP ${res.status}${errMsg ? `: ${errMsg}` : ''}`);
  }
  return res.json();
}

/** 简易标题相似度 0–1（对齐 Kazumi 标题选番用途） */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  }
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length >= y.length ? y : x;
  if (longer.length === 0) return 1;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[～〜~]/g, '')
    .replace(/[ⅡⅢⅣⅤⅱⅲ]/g, (c) => {
      const map: Record<string, string> = {
        Ⅱ: '2',
        Ⅲ: '3',
        Ⅳ: '4',
        Ⅴ: '5',
        ⅱ: '2',
        ⅲ: '3',
      };
      return map[c] ?? c;
    })
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

/** GET /api/v2/search/anime?keyword= */
export async function searchDanDanAnime(keyword: string): Promise<DanDanAnimeHit[]> {
  const q = keyword.trim();
  if (!q) return [];
  const data = (await dandanGet('/api/v2/search/anime', { keyword: q })) as {
    animes?: Array<{ animeId?: number; animeTitle?: string; episodeCount?: number }>;
  };
  return (data.animes ?? [])
    .map((a) => ({
      animeId: Number(a.animeId) || 0,
      animeTitle: String(a.animeTitle || ''),
      episodeCount: a.episodeCount,
    }))
    .filter((a) => a.animeId >= 2 && a.animeId < 100000);
}

/** 标题搜番：选相似度最高（对齐 Kazumi getBangumiIDByTitle） */
export async function resolveDanDanAnimeIdByTitle(title: string): Promise<DanDanAnimeHit | null> {
  const hits = await searchDanDanAnime(title);
  let best: DanDanAnimeHit | null = null;
  let maxSim = 0;
  for (const anime of hits) {
    const sim = titleSimilarity(anime.animeTitle, title);
    if (sim === 1) return anime;
    if (sim > maxSim) {
      maxSim = sim;
      best = anime;
    }
  }
  // 过低相似度视为未命中，避免乱挂弹幕
  if (best && maxSim >= 0.4) return best;
  return best && hits.length === 1 ? best : null;
}

/**
 * Bangumi subject id → 弹弹 animeId
 * GET /api/v2/bangumi/bgmtv/{bgmId}
 */
export async function getDanDanAnimeIdByBgmId(bgmSubjectId: number): Promise<number> {
  if (!bgmSubjectId || bgmSubjectId <= 0) return 0;
  const data = (await dandanGet(`/api/v2/bangumi/bgmtv/${bgmSubjectId}`)) as {
    bangumi?: { animeId?: number };
  };
  return Number(data.bangumi?.animeId) || 0;
}

/** 拉取某集弹幕（episodeId） */
export async function fetchDanDanComments(episodeId: number): Promise<unknown> {
  if (!episodeId) throw new Error('无效 episodeId');
  return dandanGet(`/api/v2/comment/${episodeId}`, { withRelated: 'true' });
}

/** 按 animeId + 集数拉取（Kazumi getDanDanmaku 猜测 ID 规则） */
export async function fetchDanDanCommentsByAnimeEpisode(
  animeId: number,
  episode: number,
): Promise<unknown> {
  const episodeId = guessDanDanEpisodeId(animeId, episode);
  if (!episodeId) throw new Error('无法构造 episodeId');
  return fetchDanDanComments(episodeId);
}

/** 文件名匹配（match API）；完整哈希匹配后续补 */
export async function matchDanDanByFileName(
  fileName: string,
): Promise<DanDanMatchResult[]> {
  const data = (await dandanPost('/api/v2/match', {
    fileName,
    fileHash: '00000000000000000000000000000000',
    fileSize: 0,
    videoDuration: 0,
    matchMode: 'hashAndFileName',
  })) as {
    matches?: Array<{
      episodeId: number;
      animeTitle: string;
      episodeTitle: string;
    }>;
  };
  return (data.matches ?? []).map((m) => ({
    episodeId: m.episodeId,
    animeTitle: m.animeTitle,
    episodeTitle: m.episodeTitle,
  }));
}

/** 供发送等 POST 复用签名头 */
export async function buildDanDanAuthHeaders(apiPath: string): Promise<Record<string, string>> {
  return dandanAuthHeaders(apiPath);
}
