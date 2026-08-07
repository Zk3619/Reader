/**
 * Subtitle / danmaku helpers for Bilibili (aligned with bilibili.py _get_subtitles + BiliTools seg.so).
 */

import type { Subtitle } from '../types';
import { BILI_HEADERS } from './bilibili-shared';

function srtTimecode(seconds: number): string {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

export function biliJson2Srt(
  body: { body?: Array<{ from?: number; to?: number; content?: string }> } | Array<{ from?: number; to?: number; content?: string }>,
): string {
  const lines = Array.isArray(body) ? body : body?.body || [];
  return lines
    .map((line, idx) => {
      const from = Number(line.from) || 0;
      const to = Number(line.to) || from + 1;
      const content = String(line.content || '').replace(/\n/g, ' ');
      return `${idx + 1}\n${srtTimecode(from)} --> ${srtTimecode(to)}\n${content}\n`;
    })
    .join('\n');
}

type DownloadJson = <T = unknown>(
  url: string,
  videoId?: string,
  note?: string,
  opts?: {
    headers?: Record<string, string>;
    fatal?: boolean;
    query?: Record<string, string>;
  },
) => Promise<T>;

type WarnFn = (msg: string) => void;

/**
 * Prefer BiliTools-style seg.so URL (WBI) when aid known; keep legacy XML as fallback entry.
 */
export function biliDanmakuEntries(
  cid: number | string,
  aid?: string | null,
): Subtitle[] {
  const oid = String(cid);
  const out: Subtitle[] = [];
  if (aid) {
    out.push({
      ext: 'xml',
      url: `https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=${oid}&pid=${aid}&segment_index=1`,
      name: 'danmaku-seg',
    });
  }
  out.push({
    ext: 'xml',
    url: `https://comment.bilibili.com/${oid}.xml`,
    name: 'danmaku-xml',
  });
  return out;
}

/**
 * Returns danmaku + CC subtitles (srt data) when available.
 * Login-required CC emits a warning and is skipped.
 */
export async function extractBiliSubtitles(
  downloadJson: DownloadJson,
  reportWarning: WarnFn,
  videoId: string,
  cid: number | string,
  aid?: string | null,
): Promise<Record<string, Subtitle[]>> {
  const subtitles: Record<string, Subtitle[]> = {
    danmaku: biliDanmakuEntries(cid, aid),
  };

  const query: Record<string, string> = aid
    ? { aid: String(aid), cid: String(cid) }
    : { bvid: videoId, cid: String(cid) };

  const videoInfo = await downloadJson<{
    data?: {
      need_login_subtitle?: boolean;
      subtitle?: {
        subtitles?: Array<{ lan?: string; subtitle_url?: string; lan_doc?: string }>;
      };
    };
  }>('https://api.bilibili.com/x/player/wbi/v2', videoId, `Extracting subtitle info ${cid}`, {
    headers: BILI_HEADERS,
    fatal: false,
    query,
  });

  const needLogin = Boolean(videoInfo?.data?.need_login_subtitle);
  const list = videoInfo?.data?.subtitle?.subtitles || [];
  if (needLogin && !list.length) {
    reportWarning('Bilibili CC subtitles require login cookie');
  }

  for (const s of list) {
    const lan = String(s.lan || s.lan_doc || 'und');
    let subUrl = String(s.subtitle_url || '');
    if (!subUrl) continue;
    if (subUrl.startsWith('//')) subUrl = `https:${subUrl}`;
    try {
      const body = await downloadJson<{ body?: Array<{ from?: number; to?: number; content?: string }> }>(
        subUrl,
        videoId,
        `Downloading CC ${lan}`,
        { headers: BILI_HEADERS, fatal: false },
      );
      if (!body) continue;
      const srt = biliJson2Srt(body);
      if (!subtitles[lan]) subtitles[lan] = [];
      subtitles[lan]!.push({ ext: 'srt', data: srt, name: s.lan_doc || lan });
    } catch {
      reportWarning(`Failed to download CC subtitle ${lan}`);
    }
  }

  return subtitles;
}
