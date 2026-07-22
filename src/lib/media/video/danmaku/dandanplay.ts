/**
 * 弹弹play 弹幕匹配（E3）
 * API：https://api.dandanplay.net （需 appId/appSecret，用户自备）
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

/** 文件名匹配（简化：match API）；完整哈希匹配后续补 */
export async function matchDanDanByFileName(
  fileName: string,
): Promise<DanDanMatchResult[]> {
  const cfg = getDanDanPlayConfig();
  if (!isDanDanPlayConfigured()) {
    throw new Error('未配置弹弹play appId/appSecret');
  }
  const url = `${cfg.apiBase.replace(/\/$/, '')}/api/v2/match`;
  const body = {
    fileName,
    fileHash: '00000000000000000000000000000000',
    fileSize: 0,
    videoDuration: 0,
    matchMode: 'hashAndFileName',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-AppId': cfg.appId,
      'X-AppSecret': cfg.appSecret,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`弹弹匹配失败 HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    isMatched?: boolean;
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

/** 拉取弹幕评论（返回原始 JSON，由调用方转为 artplayer-danmuku） */
export async function fetchDanDanComments(episodeId: number): Promise<unknown> {
  const cfg = getDanDanPlayConfig();
  if (!isDanDanPlayConfigured()) {
    throw new Error('未配置弹弹play appId/appSecret');
  }
  const url = `${cfg.apiBase.replace(/\/$/, '')}/api/v2/comment/${episodeId}?withRelated=true`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-AppId': cfg.appId,
      'X-AppSecret': cfg.appSecret,
    },
  });
  if (!res.ok) throw new Error(`弹幕拉取失败 HTTP ${res.status}`);
  return res.json();
}
