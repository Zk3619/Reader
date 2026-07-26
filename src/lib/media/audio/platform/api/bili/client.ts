/**
 * Bilibili 客户端：搜索 / view / playurl / 收藏夹
 */

import { platformFetchJson } from '@/lib/media/audio/platform/api/platform-http';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { buildWbiUrl } from '@/lib/media/audio/platform/api/bili/wbi';
import {
  parseBiliDashAudio,
  selectBiliAudioStream,
} from '@/lib/media/audio/platform/api/bili/audio-select';

export interface BiliStreamResult {
  url: string;
  headers?: Record<string, string>;
}

const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
/** DASH | DOLBY */
const FNVAL = String(16 | 256);

export interface BiliFavoriteFolder {
  id: string;
  title: string;
  mediaCount: number;
  coverUrl?: string;
}

async function biliCookies(): Promise<string | undefined> {
  const auth = await loadAuthSession('bili');
  return auth?.cookies?.trim() || undefined;
}

function biliHeaders(cookies?: string): Record<string, string> {
  return {
    Referer: REFERER,
    'User-Agent': WEB_UA,
    ...(cookies ? { Cookie: cookies } : {}),
  };
}

function parseDuration(raw: string | number | undefined): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return formatDurationSec(raw);
  }
  if (typeof raw === 'string' && raw.includes(':')) {
    const parts = raw.split(':').map((p) => parseInt(p, 10));
    if (parts.every((n) => !Number.isNaN(n))) {
      let sec = 0;
      let unit = 1;
      while (parts.length) {
        sec += (parts.pop() ?? 0) * unit;
        unit *= 60;
      }
      return formatDurationSec(sec);
    }
    return raw;
  }
  return '00:00';
}

function stripHtml(title: string): string {
  return title.replace(/<[^>]+>/g, '').trim();
}

export async function biliSearch(
  keyword: string,
  page = 1,
  limit = 20,
): Promise<{ tracks: AudioTrack[]; total: number }> {
  const cookies = await biliCookies();
  try {
    const url = await buildWbiUrl(
      'https://api.bilibili.com/x/web-interface/wbi/search/type',
      {
        search_type: 'video',
        keyword,
        page: String(page),
        page_size: String(limit),
      },
      cookies,
    );
    const body = await platformFetchJson<{
      data?: {
        result?: Array<{
          bvid?: string;
          title?: string;
          author?: string;
          duration?: string;
          pic?: string;
          aid?: number;
        }>;
        numResults?: number;
      };
    }>(url, { headers: biliHeaders(cookies) });
    const rows = body.data?.result ?? [];
    const tracks = rows.slice(0, limit).map((item) => {
      const bvid = String(item.bvid ?? '');
      return {
        id: buildTrackId('bili', bvid || item.title || keyword),
        name: stripHtml(item.title ?? keyword),
        artist: item.author ?? '',
        source: 'bili' as const,
        duration: parseDuration(item.duration),
        meta: {
          bvid,
          songId: bvid,
          aid: item.aid,
          coverUrl: item.pic
            ? item.pic.startsWith('//')
              ? `https:${item.pic}`
              : item.pic
            : undefined,
          albumName: 'Bilibili',
        },
      };
    });
    const total = Number(body.data?.numResults ?? tracks.length);
    return { tracks, total };
  } catch (err) {
    console.warn('[bili] search failed', err);
    return { tracks: [], total: 0 };
  }
}

async function resolveCid(bvid: string, cookies?: string): Promise<{ cid: string; aid?: number } | null> {
  try {
    const url = await buildWbiUrl(
      'https://api.bilibili.com/x/web-interface/wbi/view',
      { bvid },
      cookies,
    );
    const body = await platformFetchJson<{
      data?: { cid?: number; aid?: number; pages?: Array<{ cid?: number }> };
    }>(url, { headers: biliHeaders(cookies) });
    const cid = body.data?.cid ?? body.data?.pages?.[0]?.cid;
    if (!cid) return null;
    return { cid: String(cid), aid: body.data?.aid };
  } catch {
    try {
      const body = await platformFetchJson<{
        data?: Array<{ cid?: number }>;
      }>(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`, {
        headers: biliHeaders(cookies),
      });
      const cid = body.data?.[0]?.cid;
      return cid ? { cid: String(cid) } : null;
    } catch {
      return null;
    }
  }
}

export async function getBiliSongStream(
  track: AudioTrack,
  quality?: MusicQuality,
): Promise<BiliStreamResult | null> {
  const cookies = await biliCookies();
  const bvid = String(track.meta.bvid ?? track.meta.songId ?? '');
  if (!bvid) return null;
  let cid = String(track.meta.cid ?? '');
  if (!cid) {
    const resolved = await resolveCid(bvid, cookies);
    if (!resolved) return null;
    cid = resolved.cid;
    if (resolved.aid) track.meta.aid = resolved.aid;
    track.meta.cid = cid;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = await buildWbiUrl(
        'https://api.bilibili.com/x/player/wbi/playurl',
        {
          bvid,
          cid,
          fnval: FNVAL,
          fourk: '1',
        },
        cookies,
      );
      const body = await platformFetchJson<{
        data?: {
          dash?: { audio?: Array<Record<string, unknown>> };
          durl?: Array<{ url?: string }>;
        };
      }>(url, { headers: biliHeaders(cookies) });
      const streams = parseBiliDashAudio(body.data?.dash?.audio);
      const selected = selectBiliAudioStream(streams, quality);
      if (selected?.url) {
        return {
          url: selected.url,
          headers: {
            Referer: REFERER,
            'User-Agent': WEB_UA,
            ...(cookies ? { Cookie: cookies } : {}),
          },
        };
      }
      const mp4 = body.data?.durl?.[0]?.url;
      if (mp4) {
        return {
          url: mp4,
          headers: {
            Referer: REFERER,
            'User-Agent': WEB_UA,
            ...(cookies ? { Cookie: cookies } : {}),
          },
        };
      }
    } catch (err) {
      console.warn('[bili] playurl attempt', attempt, err);
    }
  }
  return null;
}

/** 兼容旧调用 */
export async function getBiliSongUrl(track: AudioTrack): Promise<string | null> {
  const stream = await getBiliSongStream(track);
  return stream?.url ?? null;
}

export async function listBiliFavoriteFolders(): Promise<BiliFavoriteFolder[]> {
  const cookies = await biliCookies();
  if (!cookies || !/SESSDATA=/i.test(cookies)) return [];
  const midMatch = /DedeUserID=(\d+)/i.exec(cookies);
  const mid = midMatch?.[1];
  if (!mid) return [];
  try {
    const body = await platformFetchJson<{
      data?: {
        list?: Array<{ id?: number; title?: string; media_count?: number; cover?: string }>;
      };
    }>(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}&jsonp=jsonp`,
      { headers: biliHeaders(cookies) },
    );
    return (body.data?.list ?? []).map((f) => ({
      id: String(f.id ?? ''),
      title: String(f.title ?? ''),
      mediaCount: Number(f.media_count ?? 0),
      coverUrl: f.cover,
    }));
  } catch (err) {
    console.warn('[bili] favorite folders failed', err);
    return [];
  }
}

/** 订阅的他人收藏夹 / 合集（对齐 Neri collected/list） */
export async function listBiliCollectedFolders(): Promise<BiliFavoriteFolder[]> {
  const cookies = await biliCookies();
  if (!cookies || !/SESSDATA=/i.test(cookies)) return [];
  const midMatch = /DedeUserID=(\d+)/i.exec(cookies);
  const mid = midMatch?.[1];
  if (!mid) return [];
  try {
    const body = await platformFetchJson<{
      data?: {
        list?: Array<{ id?: number; title?: string; media_count?: number; cover?: string }>;
      };
    }>(
      `https://api.bilibili.com/x/v3/fav/folder/collected/list?pn=1&ps=50&up_mid=${mid}&platform=web`,
      { headers: biliHeaders(cookies) },
    );
    return (body.data?.list ?? [])
      .map((f) => ({
        id: String(f.id ?? ''),
        title: String(f.title ?? ''),
        mediaCount: Number(f.media_count ?? 0),
        coverUrl: f.cover,
      }))
      .filter((f) => f.id);
  } catch (err) {
    console.warn('[bili] collected folders failed', err);
    return [];
  }
}

/** 是否已具备拉收藏夹所需的登录 Cookie */
export async function isBiliLoggedInForFavorites(): Promise<boolean> {
  const cookies = await biliCookies();
  return Boolean(cookies && /SESSDATA=/i.test(cookies) && /DedeUserID=\d+/i.test(cookies));
}

export async function getBiliFavoriteTracks(
  folderId: string,
  page = 1,
  pageSize = 40,
): Promise<{ tracks: AudioTrack[]; total: number; hasMore: boolean }> {
  const cookies = await biliCookies();
  if (!cookies) return { tracks: [], total: 0, hasMore: false };
  try {
    const body = await platformFetchJson<{
      data?: {
        medias?: Array<{
          bvid?: string;
          title?: string;
          upper?: { name?: string };
          duration?: number;
          cover?: string;
          ugc?: { first_cid?: number };
        }>;
        info?: { media_count?: number };
        has_more?: boolean;
      };
    }>(
      `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${encodeURIComponent(folderId)}&pn=${page}&ps=${pageSize}&keyword=&order=mtime&type=0&tid=0&platform=web`,
      { headers: biliHeaders(cookies) },
    );
    const medias = body.data?.medias ?? [];
    const tracks = medias.map((m) => {
      const bvid = String(m.bvid ?? '');
      return {
        id: buildTrackId('bili', bvid),
        name: stripHtml(m.title ?? bvid),
        artist: m.upper?.name ?? '',
        source: 'bili' as const,
        duration: parseDuration(m.duration),
        meta: {
          bvid,
          songId: bvid,
          cid: m.ugc?.first_cid ? String(m.ugc.first_cid) : undefined,
          coverUrl: m.cover,
          albumName: 'Bilibili',
        },
      };
    });
    const total = Number(body.data?.info?.media_count ?? tracks.length);
    return {
      tracks,
      total,
      hasMore: Boolean(body.data?.has_more) || page * pageSize < total,
    };
  } catch (err) {
    console.warn('[bili] favorite tracks failed', err);
    return { tracks: [], total: 0, hasMore: false };
  }
}
