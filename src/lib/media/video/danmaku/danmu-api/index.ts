/**
 * Reader ↔ danmu_api（LogVar）桥接
 * - 全平台搜索/匹配/取弹幕
 * - DANMU_PUSH_URL 推送到外置播放器
 */

import { Globals, matchAnime, getComment } from './vendor-bridge';
import {
  danmuApiPrefsToEnvAsync,
  getDanmuApiPrefs,
  type DanmuApiPrefs,
} from './prefs';
import { request } from '@/lib/http';

let lastEnvKey = '';

async function ensureEngine(prefs?: DanmuApiPrefs): Promise<void> {
  const p = prefs ?? getDanmuApiPrefs();
  const env = await danmuApiPrefsToEnvAsync(p);
  const key = JSON.stringify(env);
  if (key === lastEnvKey && Globals.envs && Object.keys(Globals.envs).length) {
    return;
  }
  Globals.init(env);
  Globals.deployPlatform = 'node'; // 走内存缓存分支，跳过浏览器 fs
  lastEnvKey = key;
}

function mockRequest(url: string, body?: unknown): Request {
  return {
    url,
    method: body ? 'POST' : 'GET',
    json: async () => body ?? {},
    headers: new Headers(),
  } as unknown as Request;
}

export type BuiltinDanmakuMatch = {
  episodeId: number;
  animeTitle: string;
  episodeTitle: string;
  /** 可供外置播放器刷新的 XML 评论 URL（内存会话内有效的 commentId） */
  commentPath: string;
};

export type BuiltinDanmakuResult = {
  source: 'danmu-api';
  label: string;
  /** 弹弹兼容 JSON：{ count, comments: [{p,m}] } */
  raw: { count: number; comments: Array<{ p?: string; m?: string }> };
  match: BuiltinDanmakuMatch;
};

/** 按文件名/标题匹配并拉取弹幕（全平台） */
export async function fetchBuiltinDanmaku(opts: {
  fileNameHint: string;
  animeTitle?: string;
  episodeName?: string;
  episodeIndex?: number;
}): Promise<BuiltinDanmakuResult | null> {
  const prefs = getDanmuApiPrefs();
  if (!prefs.enabled) return null;

  await ensureEngine(prefs);

  const title = (opts.animeTitle || '').trim();
  const epName = (opts.episodeName || '').trim();
  const epNo =
    typeof opts.episodeIndex === 'number' && opts.episodeIndex >= 0
      ? opts.episodeIndex + 1
      : undefined;

  // danmu_api 的 extractTitleSeasonEpisode 只稳认 S##E##；
  // 「遮天 第01集」会被整段当地名搜索，导致全平台 miss。
  let fileName = '';
  if (title && epNo) {
    fileName = `${title} S01E${String(epNo).padStart(2, '0')}`;
  } else if (title && epName) {
    const m = epName.match(/(\d+)/);
    const n = m ? Number(m[1]) : 0;
    fileName =
      n > 0
        ? `${title} S01E${String(n).padStart(2, '0')}`
        : `${title} S01E01`;
  } else {
    fileName = (opts.fileNameHint || '').trim();
    // 把「第N集」改写成 S01EN，便于上游解析
    fileName = fileName.replace(
      /[.\s_-]*第\s*(\d+)\s*[集话期]/gi,
      (_, n) => ` S01E${String(Number(n)).padStart(2, '0')}`,
    );
    fileName = fileName.replace(
      /[.\s_-]*(?:EP?|episode)\s*(\d+)\b/gi,
      (_, n) => ` S01E${String(Number(n)).padStart(2, '0')}`,
    );
  }
  if (!fileName) return null;

  const baseUrl = 'http://127.0.0.1/reader-danmu-api';
  const matchReq = mockRequest(`${baseUrl}/api/v2/match`, { fileName });
  const matchRes = await matchAnime(
    new URL(`${baseUrl}/api/v2/match`),
    matchReq,
    '127.0.0.1',
  );
  const matchData = (await matchRes.json()) as {
    isMatched?: boolean;
    matches?: Array<{
      episodeId: number;
      animeTitle?: string;
      episodeTitle?: string;
    }>;
  };

  const best = matchData.matches?.[0];
  if (!best?.episodeId) {
    console.warn('[danmu-api] match miss', fileName, matchData);
    return null;
  }

  const commentPath = `/api/v2/comment/${best.episodeId}`;
  const commentRes = await getComment(commentPath, 'json', false, '127.0.0.1', false);
  const raw = (await commentRes.json()) as {
    count?: number;
    comments?: Array<{ p?: string; m?: string }>;
  };
  const comments = raw.comments ?? [];
  if (!comments.length) {
    console.warn('[danmu-api] empty comments', best.episodeId);
    return null;
  }

  const label =
    `${best.animeTitle || title || '弹幕'} · ${best.episodeTitle || epName || best.episodeId}`.trim();

  const result: BuiltinDanmakuResult = {
    source: 'danmu-api',
    label,
    raw: { count: comments.length, comments },
    match: {
      episodeId: best.episodeId,
      animeTitle: best.animeTitle || title,
      episodeTitle: best.episodeTitle || epName,
      commentPath,
    },
  };

  if (prefs.autoPushOnMatch && prefs.danmuPushUrl.trim()) {
    void pushDanmakuToExternalPlayer(prefs.danmuPushUrl, result).catch((e) =>
      console.warn('[danmu-api] auto push failed', e),
    );
  }

  return result;
}

/**
 * 将弹幕推送到外置播放器（对齐 danmu_api UI）：
 * GET `${pushUrl}${encodeURIComponent(commentXmlUrlOrPayload)}`
 *
 * 若 pushUrl 以 path= 结尾（FongMi refresh），会附带一个 data: XML URL；
 * 否则对 pushUrl 做 GET，query 带上 episodeId / title。
 */
export async function pushDanmakuToExternalPlayer(
  pushUrl: string,
  result: BuiltinDanmakuResult,
): Promise<void> {
  const base = pushUrl.trim();
  if (!base) throw new Error('未配置 DANMU_PUSH_URL');

  const xml = commentsToBilibiliXml(result.raw.comments);
  const dataUrl = `data:application/xml;charset=utf-8,${encodeURIComponent(xml)}`;

  let target: string;
  if (/[?&]path=\s*$/i.test(base) || /path=$/i.test(base)) {
    target = `${base}${encodeURIComponent(dataUrl)}`;
  } else if (base.includes('{url}')) {
    target = base.replace(/\{url\}/gi, encodeURIComponent(dataUrl));
  } else {
    const u = new URL(base, 'http://127.0.0.1');
    u.searchParams.set('danmakuUrl', dataUrl);
    u.searchParams.set('episodeId', String(result.match.episodeId));
    u.searchParams.set('title', result.label);
    target = u.toString();
  }

  await request(target, {
    method: 'GET',
    allowNon2xx: true,
    timeout: 15000,
    retry: 0,
  });
}

/** 无弹弹密钥时：把用户发送的一条弹幕 POST 到 DANMU_PUSH_URL */
export async function pushSingleCommentToExternal(opts: {
  time: number;
  mode: number;
  color: number;
  comment: string;
  episodeId?: number;
}): Promise<void> {
  const prefs = getDanmuApiPrefs();
  const base = prefs.danmuPushUrl.trim();
  if (!base) throw new Error('未配置 DANMU_PUSH_URL');

  // FongMi 本地插入：/action?do=danmaku&text=
  if (/[?&]do=danmaku\b/i.test(base) || /type=danmaku/i.test(base)) {
    const u = new URL(base, 'http://127.0.0.1');
    if (!u.searchParams.has('do')) u.searchParams.set('do', 'danmaku');
    u.searchParams.set('text', opts.comment);
    if (opts.time != null) u.searchParams.set('time', String(opts.time));
    await request(u.toString(), {
      method: 'GET',
      allowNon2xx: true,
      timeout: 10000,
      retry: 0,
    });
    return;
  }

  await request(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      time: opts.time,
      mode: opts.mode,
      color: opts.color,
      comment: opts.comment,
      episodeId: opts.episodeId,
    }),
    allowNon2xx: false,
    timeout: 15000,
    retry: 0,
  });
}

function commentsToBilibiliXml(
  comments: Array<{ p?: string; m?: string }>,
): string {
  const lines = comments.map((c) => {
    const p = String(c.p || '0,1,25,16777215');
    // 弹弹 p: time,mode,color,... → B站 p: time,mode,size,color,...
    const parts = p.split(',');
    const time = parts[0] || '0';
    const mode = parts[1] || '1';
    const color = parts[2] || '16777215';
    const biliP = [time, mode, '25', color, '0', '0', '0', '0'].join(',');
    const text = escapeXml(String(c.m || ''));
    return `<d p="${biliP}">${text}</d>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><i>${lines.join('')}</i>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function isBuiltinDanmakuEnabled(): boolean {
  return getDanmuApiPrefs().enabled;
}
