/**
 * 咪咕音乐源（jadeite v3 优先，app.c.nf search_all 降级）
 */

import CryptoJS from 'crypto-js';
import { firstFullest, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import type { OnlineSearchResult } from '@/lib/media/audio/online/sources/kw';

const MG_DEVICE_ID = '963B7AA0D21511ED807EE5846EC87D20';
const MG_SIGNATURE_MD5 = '6cdc72a439cef99a3418d2a78aa28c73';

export function mgSearchHeaders(text: string): Record<string, string> {
  const time = Date.now().toString();
  const sign = CryptoJS.MD5(
    `${text}${MG_SIGNATURE_MD5}yyapp2d16148780a1dcc7408e06336b98cfd50${MG_DEVICE_ID}${time}`,
  ).toString();
  return {
    uiVersion: 'A_music_3.6.1',
    deviceId: MG_DEVICE_ID,
    timestamp: time,
    sign,
    channel: '0146921',
    'User-Agent':
      'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  };
}

function formatMgSingers(singers: unknown): string {
  if (!Array.isArray(singers)) return '未知';
  return singers
    .map((s) => {
      if (typeof s === 'object' && s && 'name' in s) return String((s as { name?: string }).name ?? '');
      if (typeof s === 'object' && s && 'singer' in s) return String((s as { singer?: string }).singer ?? '');
      return '';
    })
    .filter(Boolean)
    .join('、') || '未知';
}

function mapMgSong(data: Record<string, unknown>): AudioTrack | null {
  const songId = String(data.songId ?? '');
  const copyrightId = String(data.copyrightId ?? '');
  if (!songId || !copyrightId) return null;
  const sec = Number(data.duration ?? 0);
  // 对齐 lx mg filterData：audioFormats → PQ/HQ/SQ/ZQ24
  const _qualitys: Record<string, { size?: number | string }> = {};
  const qualitys: string[] = [];
  const formats = data.audioFormats;
  if (Array.isArray(formats)) {
    for (const raw of formats) {
      if (!raw || typeof raw !== 'object') continue;
      const type = raw as { formatType?: string; asize?: number | string; isize?: number | string };
      const size = type.asize ?? type.isize;
      switch (type.formatType) {
        case 'PQ':
          _qualitys['128k'] = { size };
          qualitys.push('128k');
          break;
        case 'HQ':
          _qualitys['320k'] = { size };
          qualitys.push('320k');
          break;
        case 'SQ':
          _qualitys.flac = { size };
          qualitys.push('flac');
          break;
        case 'ZQ24':
        case 'ZQ':
          _qualitys.flac24bit = { size };
          qualitys.push('flac24bit');
          break;
        default:
          break;
      }
    }
  }
  return {
    id: buildTrackId('mg', copyrightId),
    name: String(data.name ?? '未知'),
    artist: formatMgSingers(data.singerList),
    source: 'mg',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      copyrightId,
      albumId: String(data.albumId ?? ''),
      albumName: String(data.album ?? ''),
      ...(qualitys.length > 0 ? { qualitys, _qualitys } : {}),
    },
  };
}

function collectV3Tracks(
  resultList: Array<Array<Record<string, unknown>>>,
): AudioTrack[] {
  const seen = new Set<string>();
  const tracks: AudioTrack[] = [];
  for (const group of resultList) {
    for (const data of group) {
      const copyrightId = String(data.copyrightId ?? '');
      if (!copyrightId || seen.has(copyrightId)) continue;
      seen.add(copyrightId);
      const track = mapMgSong(data);
      if (track) tracks.push(track);
    }
  }
  return tracks;
}

async function searchJadeite(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const url =
    `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1` +
    `&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D` +
    `&pageSize=${limit}&text=${encodeURIComponent(keyword)}&pageNo=${page}&sort=0&sid=USS`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string;
      songResultData?: {
        resultList?: Array<Array<Record<string, unknown>>>;
        totalCount?: number | string;
      };
    }>(url, { headers: mgSearchHeaders(keyword) }),
  );
  if (!body || body.code !== '000000') return null;
  const tracks = collectV3Tracks(body.songResultData?.resultList ?? []);
  if (!hasItems(tracks)) return null;
  const total = parseInt(String(body.songResultData?.totalCount ?? tracks.length), 10);
  return { tracks, total: Number.isNaN(total) ? tracks.length : total };
}

async function searchAppNf(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const url =
    `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1` +
    `&pageNo=${page}&pageSize=${limit}` +
    `&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22songlist%22%3A0%2C%22bestShow%22%3A0%7D` +
    `&sort=0&text=${encodeURIComponent(keyword)}`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string;
      songResultData?: { result?: Record<string, unknown>[]; totalCount?: number | string };
    }>(url, { headers: mgSearchHeaders(keyword) }),
  );
  if (!body || body.code !== '000000') return null;
  const seen = new Set<string>();
  const tracks: AudioTrack[] = [];
  for (const data of body.songResultData?.result ?? []) {
    const copyrightId = String(data.copyrightId ?? '');
    if (!copyrightId || seen.has(copyrightId)) continue;
    seen.add(copyrightId);
    const track = mapMgSong(data);
    if (track) tracks.push(track);
  }
  if (!hasItems(tracks)) return null;
  const total = parseInt(String(body.songResultData?.totalCount ?? tracks.length), 10);
  return { tracks, total: Number.isNaN(total) ? tracks.length : total };
}

/** 默认 30 对齐 lx listInfos 聚合/单源搜索传入的 limit（musicSearch.limit=20 仅无参兜底） */
export async function mgSearch(keyword: string, page = 1, limit = 30): Promise<OnlineSearchResult> {
  const result = await firstFullest(
    [
      () => searchJadeite(keyword, page, limit),
      () => searchAppNf(keyword, page, limit),
    ],
    (r) => r.tracks.length,
    limit,
    (r) => hasItems(r.tracks),
  );
  return result ?? { tracks: [], total: 0 };
}

export async function mgGetMusicUrl(
  track: AudioTrack,
  quality = getPlayQuality(),
): Promise<string | null> {
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '');
  const copyrightId = String(track.meta.copyrightId ?? '');
  if (!songId && !copyrightId) return null;
  const formatTypes: Record<string, string> = {
    '128k': 'PQ',
    '320k': 'HQ',
    flac: 'SQ',
    flac24bit: 'ZQ',
  };
  for (const q of qualityFallbackChain(quality)) {
    const toneFlag = formatTypes[q] ?? 'PQ';
    // 对齐官方 lx-music-source：listen-url/v2.2
    if (songId) {
      try {
        const url =
          `https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2` +
          `?netType=01&resourceType=E&songId=${encodeURIComponent(songId)}&toneFlag=${toneFlag}`;
        const body = await onlineFetchJson<{
          code?: string;
          data?: { url?: string };
        }>(url, {
          headers: {
            ...mgSearchHeaders(songId),
            channel: '0146951',
            uid: '0',
          },
        });
        let playUrl = body.data?.url?.trim();
        if (playUrl) {
          if (playUrl.startsWith('//')) playUrl = `https:${playUrl}`;
          return playUrl.replace(/\+/g, '%2B').split('?')[0] ?? playUrl;
        }
      } catch {
        // fallback below
      }
    }
    if (!copyrightId) continue;
    try {
      const url = `https://app.c.nf.migu.cn/v1.0/content/resourceinfo.do?copyrightId=${copyrightId}&resourceType=2&formatType=${toneFlag}`;
      const body = await onlineFetchJson<{
        playUrl?: string;
        url?: string;
        data?: { playUrl?: string };
      }>(url, { headers: mgSearchHeaders(copyrightId) });
      const playUrl = body.playUrl ?? body.url ?? body.data?.playUrl;
      if (playUrl && playUrl.trim()) return playUrl;
    } catch {
      // try next quality
    }
  }
  return null;
}

export async function mgGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const copyrightId = String(track.meta.copyrightId ?? track.meta.songId ?? '');
  if (!copyrightId) return null;

  type MgLyricInfo = {
    mrcUrl?: string;
    lrcUrl?: string;
    trcUrl?: string;
  };

  const resolveInfo = async (): Promise<MgLyricInfo> => {
    if (track.meta.mrcUrl || track.meta.lrcUrl) {
      return {
        mrcUrl: String(track.meta.mrcUrl ?? ''),
        lrcUrl: String(track.meta.lrcUrl ?? ''),
        trcUrl: String(track.meta.trcUrl ?? ''),
      };
    }
    const body = await safeCall(() =>
      onlineFetchJson<{
        resource?: Array<{
          mrcUrl?: string;
          lrcUrl?: string;
          trcUrl?: string;
          lyricUrl?: string;
        }>;
        data?: Array<{
          mrcUrl?: string;
          lrcUrl?: string;
          trcUrl?: string;
        }>;
      }>(
        `https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?copyrightId=${copyrightId}&resourceType=2`,
        { headers: mgSearchHeaders(copyrightId) },
      ),
    );
    const item = body?.resource?.[0] ?? body?.data?.[0];
    return {
      mrcUrl: item?.mrcUrl,
      lrcUrl: item?.lrcUrl ?? (item as { lyricUrl?: string } | undefined)?.lyricUrl,
      trcUrl: item?.trcUrl,
    };
  };

  try {
    const info = await resolveInfo();
    const { decryptMrc, parseMrcLyric } = await import(
      '@/lib/media/audio/platform/api/mg-mrc-decode'
    );
    const { onlineFetchText } = await import('@/lib/media/audio/online/online-http');
    const headers = {
      Referer: 'https://app.c.nf.migu.cn/',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Mobile Safari/537.36',
      channel: '0146921',
    };

    let lyric = '';
    let lxlyric = '';
    if (info.mrcUrl) {
      const raw = await onlineFetchText(info.mrcUrl, { headers });
      const parsed = parseMrcLyric(decryptMrc(raw));
      lyric = parsed.lyric;
      lxlyric = parsed.lxlyric;
    } else if (info.lrcUrl) {
      lyric = await onlineFetchText(info.lrcUrl, { headers });
    } else {
      const url = `https://app.c.nf.migu.cn/v1.0/content/getLyric.do?copyrightId=${copyrightId}`;
      const body = await onlineFetchJson<{ lyric?: string; lrc?: { lyric?: string } }>(url, {
        headers: mgSearchHeaders(copyrightId),
      });
      lyric = body.lyric ?? body.lrc?.lyric ?? '';
    }

    let tlyric: string | null = null;
    if (info.trcUrl) {
      tlyric = await onlineFetchText(info.trcUrl, { headers }).catch(() => null);
    }

    if (!lyric?.trim()) return null;
    return { lyric, tlyric, lxlyric: lxlyric || null };
  } catch {
    return null;
  }
}
