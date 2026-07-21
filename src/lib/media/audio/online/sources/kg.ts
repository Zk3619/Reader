/**
 * 酷狗音乐源（songsearch 优先，msearchretry 降级）
 */

import { firstFullest, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { OnlineSearchResult } from '@/lib/media/audio/online/sources/kw';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';

const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

function formatKgSingers(singers: unknown): string {
  if (!Array.isArray(singers)) return '未知';
  return (
    singers
      .map((s) =>
        typeof s === 'object' && s && 'name' in s ? String((s as { name?: string }).name ?? '') : '',
      )
      .filter(Boolean)
      .join('、') || '未知'
  );
}

function firstKgSingerId(item: Record<string, unknown>): string {
  const singers = item.Singers;
  if (Array.isArray(singers) && singers.length > 0) {
    const first = singers[0];
    if (first && typeof first === 'object') {
      const id = (first as { id?: number | string }).id;
      if (id != null && String(id) !== '0') return String(id);
    }
  }
  const top = item.SingerId ?? item.singerid;
  if (top != null && String(top) !== '0') return String(top);
  return '';
}

/** 对齐 lx #2782：`OriSongName` + `Suffix`，再 decodeName */
function formatKgSongName(item: Record<string, unknown>): string {
  const ori = String(item.OriSongName ?? item.SongName ?? '');
  const suffix = String(item.Suffix ?? '').trim();
  const raw = suffix ? `${ori} ${suffix}` : ori;
  return decodeHtmlEntities(raw) || '未知';
}

function mapKgItem(item: Record<string, unknown>): AudioTrack | null {
  const songId = String(item.Audioid ?? '');
  const hash = String(item.FileHash ?? '');
  if (!songId || !hash) return null;
  const sec = Number(item.Duration ?? 0);
  // 对齐 lx filterData：按 *FileSize !== 0 判定可用音质（勿仅凭 hash 字符串）
  const hash320 = String(item.HQFileHash ?? '');
  const hashFlac = String(item.SQFileHash ?? '');
  const hashHigh = String(item.ResFileHash ?? '');
  const _qualitys: Record<string, { hash: string }> = {};
  const qualitys: string[] = [];
  if (Number(item.FileSize ?? 0) !== 0) {
    _qualitys['128k'] = { hash };
    qualitys.push('128k');
  }
  if (Number(item.HQFileSize ?? 0) !== 0 && hash320) {
    _qualitys['320k'] = { hash: hash320 };
    qualitys.push('320k');
  }
  if (Number(item.SQFileSize ?? 0) !== 0 && hashFlac) {
    _qualitys.flac = { hash: hashFlac };
    qualitys.push('flac');
  }
  if (Number(item.ResFileSize ?? 0) !== 0 && hashHigh) {
    _qualitys.flac24bit = { hash: hashHigh };
    qualitys.push('flac24bit');
  }
  return {
    id: buildTrackId('kg', `${songId}_${hash}`),
    name: formatKgSongName(item),
    artist: decodeHtmlEntities(
      formatKgSingers(item.Singers) || String(item.SingerName ?? '未知'),
    ),
    source: 'kg',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      hash,
      hash_320: hash320 || undefined,
      hash_flac: hashFlac || undefined,
      hash_high: hashHigh || undefined,
      albumId: String(item.AlbumID ?? ''),
      albumName: decodeHtmlEntities(String(item.AlbumName ?? '')),
      songmid: songId,
      singerId: firstKgSingerId(item),
      _qualitys,
      qualitys,
    },
  };
}

/**
 * 对齐 lx kg/musicSearch.handleResult：仅顶层。
 * lx 对 `Grp` 子项用父项 Audioid+FileHash 再判重，子项实际进不了列表。
 */
function collectTracks(list: Record<string, unknown>[]): AudioTrack[] {
  const seen = new Set<string>();
  const tracks: AudioTrack[] = [];
  for (const item of list) {
    const key = `${item.Audioid ?? ''}${item.FileHash ?? ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const track = mapKgItem(item);
    // 对齐 lx：跳过无法映射的条目，不整页作废
    if (!track) continue;
    tracks.push(track);
  }
  return tracks;
}

async function searchSongsearch(
  keyword: string,
  page: number,
  limit: number,
): Promise<OnlineSearchResult | null> {
  const url =
    `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}` +
    `&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter` +
    `&filter=2&iscorrection=1&privilege_filter=0&area_code=1`;
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

async function searchMsearchretry(
  keyword: string,
  page: number,
  limit: number,
): Promise<OnlineSearchResult | null> {
  const url =
    `http://msearchretry.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(keyword)}` +
    `&page=${page}&pagesize=${limit}&showtype=10&filter=0&version=7910&sver=2`;
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

export async function kgSearch(
  keyword: string,
  page = 1,
  limit = 30,
): Promise<OnlineSearchResult> {
  const result = await firstFullest(
    [
      () => searchSongsearch(keyword, page, limit),
      () => searchMsearchretry(keyword, page, limit),
    ],
    (r) => r.tracks.length,
    limit,
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
  const name = track.name || '';
  const getIntv = (interval?: string) => {
    if (!interval) return 0;
    const parts = interval.split(':');
    let intv = 0;
    let unit = 1;
    while (parts.length) {
      intv += Number(parts.pop()) * unit;
      unit *= 60;
    }
    return Math.floor(intv);
  };
  const timeMs =
    Number(track.meta._interval ?? 0) || getIntv(track.duration) * 1000 || 0;

  try {
    const searchUrl =
      `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc` +
      `&keyword=${encodeURIComponent(name)}&hash=${hash}&timelength=${timeMs}&lrctxt=1`;
    const search = await onlineFetchJson<{
      candidates?: Array<{
        id?: string | number;
        accesskey?: string;
        idrtype?: number;
        contenttype?: number;
      }>;
    }>(searchUrl, {
      headers: {
        'KG-RC': '1',
        'KG-THash': 'expand_search_manager.cpp:852736169:451',
        'User-Agent': 'KuGou2012-9020-ExpandSearchManager',
      },
    });
    const info = search.candidates?.[0];
    if (!info?.id) return null;
    const fmt =
      info.idrtype === 1 && info.contenttype !== 1 ? 'krc' : 'lrc';
    const dl = await onlineFetchJson<{
      fmt?: string;
      content?: string;
    }>(
      `http://lyrics.kugou.com/download?ver=1&client=pc&id=${info.id}&accesskey=${info.accesskey ?? ''}&fmt=${fmt}&charset=utf8`,
      {
        headers: {
          'KG-RC': '1',
          'KG-THash': 'expand_search_manager.cpp:852736169:451',
          'User-Agent': 'KuGou2012-9020-ExpandSearchManager',
        },
      },
    );
    if (!dl.content) return null;
    const { decodeKrc, decodeKgLrcBase64 } = await import(
      '@/lib/media/audio/platform/api/kg-krc-decode'
    );
    const parsed =
      (dl.fmt ?? fmt) === 'krc' ? await decodeKrc(dl.content) : decodeKgLrcBase64(dl.content);
    if (!parsed.lyric?.trim()) return null;
    return {
      lyric: parsed.lyric,
      tlyric: parsed.tlyric || null,
      rlyric: parsed.rlyric || null,
      lxlyric: parsed.lxlyric || null,
    };
  } catch {
    return null;
  }
}
