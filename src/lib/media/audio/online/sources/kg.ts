/**
 * 酷狗音乐源（songsearch 优先，msearchretry 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { OnlineSearchResult } from '@/lib/media/audio/online/sources/kw';

const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

function formatKgSingers(singers: unknown): string {
  if (!Array.isArray(singers)) return '未知';
  return singers
    .map((s) => (typeof s === 'object' && s && 'name' in s ? String((s as { name?: string }).name ?? '') : ''))
    .filter(Boolean)
    .join('、') || '未知';
}

function mapKgItem(item: Record<string, unknown>): AudioTrack | null {
  const songId = String(item.Audioid ?? '');
  const hash = String(item.FileHash ?? '');
  if (!songId || !hash) return null;
  const sec = Number(item.Duration ?? 0);
  const hash320 = String(item.HQFileHash ?? '');
  const hashFlac = String(item.SQFileHash ?? '');
  const hashHigh = String(item.ResFileHash ?? '');
  const _qualitys: Record<string, { hash: string }> = {
    '128k': { hash },
  };
  if (hash320) _qualitys['320k'] = { hash: hash320 };
  if (hashFlac) _qualitys.flac = { hash: hashFlac };
  if (hashHigh) _qualitys.flac24bit = { hash: hashHigh };
  return {
    id: buildTrackId('kg', `${songId}_${hash}`),
    name: String(item.SongName ?? item.OriSongName ?? '未知'),
    artist: formatKgSingers(item.Singers) || String(item.SingerName ?? '未知'),
    source: 'kg',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      hash,
      hash_320: hash320 || undefined,
      hash_flac: hashFlac || undefined,
      hash_high: hashHigh || undefined,
      albumId: String(item.AlbumID ?? ''),
      albumName: String(item.AlbumName ?? ''),
      songmid: songId,
      _qualitys,
      qualitys: Object.keys(_qualitys),
    },
  };
}

function collectTracks(list: Record<string, unknown>[]): AudioTrack[] {
  const seen = new Set<string>();
  const tracks: AudioTrack[] = [];
  for (const item of list) {
    const key = `${item.Audioid}_${item.FileHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const track = mapKgItem(item);
    if (track) tracks.push(track);
    const grp = (item.Grp as Array<Record<string, unknown>> | undefined) ?? [];
    for (const child of grp) {
      const childKey = `${child.Audioid}_${child.FileHash}`;
      if (seen.has(childKey)) continue;
      seen.add(childKey);
      const childTrack = mapKgItem(child);
      if (childTrack) tracks.push(childTrack);
    }
  }
  return tracks;
}

async function searchSongsearch(keyword: string, page: number): Promise<OnlineSearchResult | null> {
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=30&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      error_code?: number;
      data?: { lists?: Array<Record<string, unknown>>; total?: number };
    }>(url, { headers: KUGOU_HEADERS }),
  );
  if (!body || body.error_code !== 0) return null;
  const tracks = collectTracks(body.data?.lists ?? []);
  if (!hasItems(tracks)) return null;
  return { tracks, total: body.data?.total ?? tracks.length };
}

async function searchMsearchretry(keyword: string, page: number): Promise<OnlineSearchResult | null> {
  const url = `http://msearchretry.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=30&showtype=10&filter=0&version=7910&sver=2`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      error_code?: number;
      data?: { lists?: Array<Record<string, unknown>>; total?: number };
    }>(url, { headers: KUGOU_HEADERS }),
  );
  if (!body || body.error_code !== 0) return null;
  const tracks = collectTracks(body.data?.lists ?? []);
  if (!hasItems(tracks)) return null;
  return { tracks, total: body.data?.total ?? tracks.length };
}

export async function kgSearch(keyword: string, page = 1): Promise<OnlineSearchResult> {
  const result = await firstSuccess(
    [() => searchSongsearch(keyword, page), () => searchMsearchretry(keyword, page)],
    (r) => hasItems(r.tracks),
  );
  return result ?? { tracks: [], total: 0 };
}

function kgHashForQuality(track: AudioTrack, quality: MusicQuality): string {
  const m = track.meta;
  const fromTypes = (m._qualitys as Record<string, { hash?: string }> | undefined)?.[quality]
    ?.hash;
  if (fromTypes) return String(fromTypes);
  switch (quality) {
    case 'flac24bit':
      return String(m.hash_high ?? m.hash_flac ?? m.hash ?? '');
    case 'flac':
      return String(m.hash_flac ?? m.hash ?? '');
    case '320k':
      return String(m.hash_320 ?? m.hash ?? '');
    default:
      return String(m.hash ?? '');
  }
}

export async function kgGetMusicUrl(
  track: AudioTrack,
  quality = getPlayQuality(),
): Promise<string | null> {
  const albumId = String(track.meta.albumId ?? '');
  for (const q of qualityFallbackChain(quality)) {
    const hash = kgHashForQuality(track, q);
    if (!hash) continue;
    const url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&album_id=${albumId}&dfid=3&mid=1&platid=4`;
    try {
      const body = await onlineFetchJson<{ data?: { play_url?: string } }>(url, {
        headers: KUGOU_HEADERS,
      });
      const playUrl = body.data?.play_url;
      if (playUrl && playUrl.trim()) return playUrl;
    } catch {
      // try next quality
    }
  }
  return null;
}

export async function kgGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const hash = String(track.meta.hash ?? '');
  if (!hash) return null;
  try {
    const url = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${hash}&album_audio_id=`;
    const body = await onlineFetchJson<{ candidates?: Array<{ id?: string }> }>(url);
    const id = body.candidates?.[0]?.id;
    if (!id) return null;
    const lrcUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${id}&accesskey=&fmt=lrc&charset=utf8`;
    const { onlineFetchText } = await import('@/lib/media/audio/online/online-http');
    const lyric = await onlineFetchText(lrcUrl);
    return lyric?.trim() ? { lyric } : null;
  } catch {
    return null;
  }
}
