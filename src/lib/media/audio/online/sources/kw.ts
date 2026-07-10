/**
 * 酷我音乐源（search.kuwo.cn 优先，wapi 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import {
  decodeKwLyricRaw,
  isValidKwLrc,
  parseKwLrcText,
  stripKwWordTimeTags,
} from '@/lib/media/audio/platform/api/kw-lyric-decode';
import { request } from '@/lib/http';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { kwTypeForQuality, qualityFallbackChain, getPlayQuality } from '@/lib/media/audio/music-quality';

export interface OnlineSearchResult {
  tracks: AudioTrack[];
  total: number;
}

function formatKwArtist(raw: unknown): string {
  const text = String(raw ?? '');
  return text.replace(/&/g, '、').trim() || '未知';
}

function mapAbslistItem(info: Record<string, unknown>): AudioTrack | null {
  if (!info.N_MINFO) return null;
  const songId = String(info.MUSICRID ?? '').replace('MUSIC_', '');
  if (!songId) return null;
  const sec = parseInt(String(info.DURATION ?? '0'), 10);
  return {
    id: buildTrackId('kw', songId),
    name: String(info.SONGNAME ?? '未知'),
    artist: formatKwArtist(info.ARTIST),
    source: 'kw',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      albumId: String(info.ALBUMID ?? ''),
      albumName: String(info.ALBUM ?? ''),
    },
  };
}

function mapWapiItem(info: Record<string, unknown>): AudioTrack | null {
  const songId = String(info.rid ?? info.id ?? '').replace('MUSIC_', '');
  if (!songId) return null;
  const sec = parseInt(String(info.duration ?? '0'), 10);
  return {
    id: buildTrackId('kw', songId),
    name: String(info.name ?? '未知'),
    artist: formatKwArtist(info.artist),
    source: 'kw',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      albumId: String(info.albumid ?? ''),
      albumName: String(info.album ?? ''),
    },
  };
}

async function searchKuwoR(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const url =
    `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}` +
    `&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1` +
    `&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8` +
    `&rformat=json&vermerge=1&mobi=1&issubtitle=1`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      TOTAL?: string;
      abslist?: Array<Record<string, unknown>>;
    }>(url),
  );
  const tracks = (body?.abslist ?? [])
    .map(mapAbslistItem)
    .filter((t): t is AudioTrack => t !== null);
  if (!hasItems(tracks)) return null;
  return {
    tracks,
    total: parseInt(String(body?.TOTAL ?? tracks.length), 10) || tracks.length,
  };
}

async function searchWapi(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const url =
    `http://wapi.kuwo.cn/api/www/search/searchMusicBykeyWord?key=${encodeURIComponent(keyword)}` +
    `&pn=${page - 1}&rn=${limit}`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: { list?: Array<Record<string, unknown>>; total?: number };
    }>(url, { headers: { Referer: 'https://www.kuwo.cn/' } }),
  );
  const tracks = (body?.data?.list ?? [])
    .map(mapWapiItem)
    .filter((t): t is AudioTrack => t !== null);
  if (!hasItems(tracks)) return null;
  return {
    tracks,
    total: Number(body?.data?.total ?? tracks.length),
  };
}

export async function kwSearch(
  keyword: string,
  page = 1,
  limit = 30,
): Promise<OnlineSearchResult> {
  const result = await firstSuccess(
    [
      () => searchKuwoR(keyword, page, limit),
      () => searchWapi(keyword, page, limit),
    ],
    (r) => hasItems(r.tracks),
  );
  return result ?? { tracks: [], total: 0 };
}

export async function kwGetMusicUrl(track: AudioTrack, quality = getPlayQuality()): Promise<string | null> {
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!songId) return null;
  for (const q of qualityFallbackChain(quality)) {
    const type = kwTypeForQuality(q);
    const url = `https://www.kuwo.cn/api/www/music/musicUrl?mid=${songId}&type=${type}`;
    const body = await safeCall(() =>
      onlineFetchJson<{ code: number; data?: { url?: string } }>(url, {
        headers: { Referer: 'https://www.kuwo.cn/' },
      }),
    );
    const playUrl = body?.data?.url;
    if (playUrl?.trim()) return playUrl;
  }
  return null;
}

function buildKwLyricParams(id: string, isGetLyricx: boolean): string {
  let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`;
  if (isGetLyricx) params += '&lrcx=1';
  const bufKey = new Uint8Array([121, 101, 101, 108, 105, 111, 110]);
  const bufStr = new TextEncoder().encode(params);
  const output = new Uint16Array(bufStr.length);
  let i = 0;
  while (i < bufStr.length) {
    let j = 0;
    while (j < bufKey.length && i < bufStr.length) {
      output[i] = bufKey[j]! ^ bufStr[i]!;
      i++;
      j++;
    }
  }
  const bytes = new Uint8Array(output.buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function kwGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '').replace('MUSIC_', '');
  if (!songId) return null;
  const param = buildKwLyricParams(songId, true);
  const res = await safeCall(() =>
    request(`http://newlyric.kuwo.cn/newlyric.lrc?${param}`, { method: 'GET' }),
  );
  if (!res?.ok) return null;
  const raw = await res.arrayBuffer();
  const decoded = await decodeKwLyricRaw(raw, true);
  if (!decoded) return null;
  const parsed = parseKwLrcText(decoded);
  let lyric = stripKwWordTimeTags(parsed.lyric);
  const tlyric = parsed.tlyric ? stripKwWordTimeTags(parsed.tlyric) : '';
  if (!isValidKwLrc(lyric)) return null;
  return { lyric, tlyric: tlyric || null, lxlyric: lyric };
}

export async function kwHotSearch(): Promise<string[]> {
  try {
    const body = await onlineFetchJson<{ data?: string[] }>(
      'https://www.kuwo.cn/api/www/search/hotSearch',
      { headers: { Referer: 'https://www.kuwo.cn/' } },
    );
    return body.data ?? [];
  } catch {
    return [];
  }
}
