/**
 * QQ 音乐源（musics.fcg 签名优先，musicu POST 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { zzcSign } from '@/lib/media/audio/platform/api/tx-sign';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';
import type { OnlineSearchResult } from '@/lib/media/audio/online/sources/kw';

function formatTxSingers(singers: unknown): string {
  if (!Array.isArray(singers)) return '未知';
  return singers
    .map((s) => (typeof s === 'object' && s && 'name' in s ? String((s as { name?: string }).name ?? '') : ''))
    .filter(Boolean)
    .join('、') || '未知';
}

async function txSignedRequest<T>(payload: Record<string, unknown>): Promise<T | null> {
  const bodyText = JSON.stringify(payload);
  const sign = zzcSign(bodyText);
  return safeCall(() =>
    onlineFetchJson<T>(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'QQMusic 14090508(android 12)',
      },
      body: bodyText,
    }),
  );
}

function buildTxSearchPayload(keyword: string, page: number, limit: number) {
  return {
    comm: {
      ct: '11',
      cv: '14090508',
      v: '14090508',
      tmeAppID: 'qqmusic',
      phonetype: 'EBG-AN10',
      deviceScore: '553.47',
      devicelevel: '50',
      newdevicelevel: '20',
      rom: 'HuaWei/EMOTION/EmotionUI_14.2.0',
      os_ver: '12',
      OpenUDID: '0',
      OpenUDID2: '0',
      QIMEI36: '0',
      udid: '0',
      chid: '0',
      aid: '0',
      oaid: '0',
      taid: '0',
      tid: '0',
      wid: '0',
      uid: '0',
      sid: '0',
      modeSwitch: '6',
      teenMode: '0',
      ui_mode: '2',
      nettype: '1020',
      v4ip: '',
    },
    req: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicMobile',
      param: {
        search_type: 0,
        searchid: Math.random().toString().slice(2),
        query: keyword,
        page_num: page,
        num_per_page: limit,
        highlight: 0,
        nqc_flag: 0,
        multi_zhida: 0,
        cat: 2,
        grp: 1,
        sin: 0,
        sem: 0,
      },
    },
  };
}

function mapSearchItems(list: Array<Record<string, unknown>>): AudioTrack[] {
  const tracks: AudioTrack[] = [];
  for (const item of list) {
    const file = item.file as Record<string, unknown> | undefined;
    if (!file?.media_mid) continue;
    const songId = String(item.id ?? '');
    const songmid = String(item.mid ?? '');
    const sec = Number(item.interval ?? 0);
    const album = item.album as { name?: string; mid?: string } | undefined;
    tracks.push({
      id: buildTrackId('tx', songId || songmid),
      name: String(item.title ?? item.songname ?? '未知'),
      artist: formatTxSingers(item.singer),
      source: 'tx',
      duration: sec > 0 ? formatDurationSec(sec) : '00:00',
      meta: {
        songId,
        songmid,
        mediaMid: String(file.media_mid ?? ''),
        albumMid: String(album?.mid ?? ''),
        albumName: String(album?.name ?? ''),
      },
    });
  }
  return tracks;
}

async function searchSigned(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const envelope = await txSignedRequest<{
    code?: number;
    req?: {
      code?: number;
      data?: {
        body?: { item_song?: Array<Record<string, unknown>> };
        meta?: { estimate_sum?: number };
      };
    };
  }>(buildTxSearchPayload(keyword, page, limit));
  if (!envelope?.req || envelope.code !== 0 || envelope.req.code !== 0) return null;
  const tracks = mapSearchItems(envelope.req.data?.body?.item_song ?? []);
  if (!hasItems(tracks)) return null;
  return {
    tracks,
    total: envelope.req.data?.meta?.estimate_sum ?? tracks.length,
  };
}

async function searchMusicu(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const payload = buildTxSearchPayload(keyword, page, limit);
  const envelope = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      req?: {
        code?: number;
        data?: {
          body?: { item_song?: Array<Record<string, unknown>> };
          meta?: { estimate_sum?: number };
        };
      };
    }>('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://y.qq.com',
        Referer: 'https://y.qq.com/',
      },
      body: JSON.stringify(payload),
    }),
  );
  if (!envelope?.req || envelope.code !== 0 || envelope.req.code !== 0) return null;
  const tracks = mapSearchItems(envelope.req.data?.body?.item_song ?? []);
  if (!hasItems(tracks)) return null;
  return {
    tracks,
    total: envelope.req.data?.meta?.estimate_sum ?? tracks.length,
  };
}

export async function txSearch(keyword: string, page = 1, limit = 30): Promise<OnlineSearchResult> {
  const result = await firstSuccess(
    [
      () => searchSigned(keyword, page, limit),
      () => searchMusicu(keyword, page, limit),
    ],
    (r) => hasItems(r.tracks),
  );
  return result ?? { tracks: [], total: 0 };
}

export async function txGetMusicUrl(
  track: AudioTrack,
  quality = getPlayQuality(),
): Promise<string | null> {
  const songmid = String(track.meta.songmid ?? track.meta.songId ?? '');
  if (!songmid) return null;
  const fileTypes: Record<string, string> = {
    '128k': 'M500',
    '320k': 'M800',
    flac: 'F000',
    flac24bit: 'RS01',
  };
  for (const q of qualityFallbackChain(quality)) {
    const filename = `${fileTypes[q] ?? 'M500'}${songmid}.mp3`;
    try {
      const body = await txSignedRequest<{
        req?: { data?: { midurlinfo?: Array<{ purl?: string }> } };
      }>({
        comm: { ct: 11, cv: 14090508 },
        req: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            guid: '10000',
            songmid: [songmid],
            songtype: [0],
            uin: '0',
            loginflag: 1,
            platform: '20',
            filename: [filename],
          },
        },
      });
      const purl = body?.req?.data?.midurlinfo?.[0]?.purl;
      if (purl) return `https://isure.stream.qqmusic.qq.com/${purl}`;
    } catch {
      // try next quality
    }
  }
  return null;
}

export async function txGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const songmid = String(track.meta.songmid ?? track.meta.songId ?? '');
  if (!songmid) return null;
  try {
    const body = await txSignedRequest<{
      req?: { data?: { lyric?: string; trans?: string; roma?: string } };
    }>({
      comm: { ct: 11, cv: 14090508 },
      req: {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param: { songmid },
      },
    });
    const b64 = body?.req?.data?.lyric;
    if (!b64) return null;
    const lyric = atob(b64);
    const tlyric = body?.req?.data?.trans ? atob(body.req.data.trans) : null;
    const rlyric = body?.req?.data?.roma ? atob(body.req.data.roma) : null;
    return { lyric, tlyric, rlyric, lxlyric: lyric };
  } catch {
    return null;
  }
}
