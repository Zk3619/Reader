/**
 * 网易云音乐源（搜索 eapi 优先，cloudsearch / weapi 降级）
 */

import { firstFullest, hasItems } from '@/lib/media/audio/music-sdk/fallback';
import { eapiPost, eapiPlayerUrlPost, unwrapEapiBody } from '@/lib/media/audio/platform/api/eapi-crypto';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import {
  wyLevelForQuality,
  wyBrForQuality,
  qualityFallbackChain,
  getPlayQuality,
} from '@/lib/media/audio/music-quality';

const WY_DEFAULT_COOKIE = 'MUSIC_U=; os=pc';

async function resolveWyCookies(cookies?: string): Promise<string> {
  if (cookies?.trim()) return cookies;
  const auth = await loadAuthSession('netease');
  if (auth?.cookies?.trim()) return auth.cookies;
  return WY_DEFAULT_COOKIE;
}

type WySongResource = {
  baseInfo?: {
    simpleSongData?: {
      id?: number | string;
      name?: string;
      dt?: number;
      ar?: Array<{ name?: string }>;
      al?: { id?: number | string; name?: string; picUrl?: string };
      privilege?: { maxbr?: number; maxBrLevel?: string };
      hr?: { size?: number };
      sq?: { size?: number };
      h?: { size?: number };
      l?: { size?: number };
    };
  };
};

/** 对齐 lx wy handleResult：按 privilege.maxbr / maxBrLevel 填充 types */
function wyQualityFromSong(song: {
  privilege?: { maxbr?: number; maxBrLevel?: string };
  hr?: { size?: number };
  sq?: { size?: number };
  h?: { size?: number };
  l?: { size?: number };
}): { qualitys: string[]; _qualitys: Record<string, { size?: number }> } {
  const _qualitys: Record<string, { size?: number }> = {};
  const qualitys: string[] = [];
  const privilege = song.privilege;
  if (privilege?.maxBrLevel === 'hires') {
    _qualitys.flac24bit = { size: song.hr?.size };
    qualitys.push('flac24bit');
  }
  const maxbr = Number(privilege?.maxbr ?? 0);
  if (maxbr >= 999000) {
    _qualitys.flac = { size: song.sq?.size };
    qualitys.push('flac');
  }
  if (maxbr >= 320000) {
    _qualitys['320k'] = { size: song.h?.size };
    qualitys.push('320k');
  }
  if (maxbr >= 128000 || maxbr === 192000) {
    _qualitys['128k'] = { size: song.l?.size };
    qualitys.push('128k');
  }
  // 无 privilege 时保底 128k，避免完全无徽标依据
  if (qualitys.length === 0) {
    _qualitys['128k'] = {};
    qualitys.push('128k');
  }
  return { qualitys, _qualitys };
}

function mapResource(item: WySongResource): AudioTrack | null {
  const song = item.baseInfo?.simpleSongData;
  if (!song?.id) return null;
  const id = String(song.id);
  const ms = Number(song.dt ?? 0);
  const artists = song.ar ?? [];
  const { qualitys, _qualitys } = wyQualityFromSong(song);
  return {
    id: buildTrackId('wy', id),
    name: String(song.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: 'wy',
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId: id,
      songmid: id,
      albumId: String(song.al?.id ?? ''),
      albumName: String(song.al?.name ?? ''),
      coverUrl: String(song.al?.picUrl ?? ''),
      qualitys,
      _qualitys,
    },
  };
}

function mapSongRecord(s: Record<string, unknown>): AudioTrack | null {
  const id = String(s.id ?? '');
  if (!id) return null;
  const ms = Number(s.dt ?? 0);
  const artists = (s.ar as Array<{ name?: string }> | undefined) ?? [];
  const al = s.al as { id?: number | string; name?: string; picUrl?: string } | undefined;
  const privilege = s.privilege as { maxbr?: number; maxBrLevel?: string } | undefined;
  const { qualitys, _qualitys } = wyQualityFromSong({
    privilege,
    hr: s.hr as { size?: number } | undefined,
    sq: s.sq as { size?: number } | undefined,
    h: s.h as { size?: number } | undefined,
    l: s.l as { size?: number } | undefined,
  });
  return {
    id: buildTrackId('wy', id),
    name: String(s.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: 'wy',
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId: id,
      songmid: id,
      albumId: String(al?.id ?? ''),
      albumName: String(al?.name ?? ''),
      coverUrl: String(al?.picUrl ?? ''),
      qualitys,
      _qualitys,
    },
  };
}

async function searchEapiNew(keyword: string, page: number, limit: number): Promise<AudioTrack[] | null> {
  const raw = await eapiPost<unknown>('/api/search/song/list/page', {
    keyword,
    needCorrect: '1',
    channel: 'typing',
    offset: limit * (page - 1),
    scene: 'normal',
    total: page === 1,
    limit,
  });
  const body = unwrapEapiBody<{
    code?: number;
    data?: { resources?: WySongResource[] };
  }>(raw);
  if (body.code !== 200) return null;
  const resources = body.data?.resources ?? [];
  const ok = resources
    .map(mapResource)
    .filter((t): t is AudioTrack => t !== null);
  return hasItems(ok) ? ok : null;
}

async function searchEapiCloud(keyword: string, page: number, limit: number): Promise<AudioTrack[] | null> {
  const raw = await eapiPost<unknown>('/api/cloudsearch/pc', {
    s: keyword,
    type: 1,
    limit,
    offset: limit * (page - 1),
    total: page === 1,
  });
  const body = unwrapEapiBody<{
    code?: number;
    result?: { songs?: Record<string, unknown>[] };
  }>(raw);
  if (body.code !== 200) return null;
  const songs = body.result?.songs ?? [];
  const ok = songs.map(mapSongRecord).filter((t): t is AudioTrack => t !== null);
  return hasItems(ok) ? ok : null;
}

async function searchWeapi(keyword: string, page: number, limit: number): Promise<AudioTrack[] | null> {
  const body = await weapiPost<{
    code?: number;
    result?: { songs?: Record<string, unknown>[] };
  }>('cloudsearch/pc', {
    s: keyword,
    type: 1,
    limit,
    offset: limit * (page - 1),
    total: page === 1,
  });
  if (body.code !== 200) return null;
  const songs = body.result?.songs ?? [];
  const ok = songs.map(mapSongRecord).filter((t): t is AudioTrack => t !== null);
  return hasItems(ok) ? ok : null;
}

export async function wySearch(keyword: string, page = 1, limit = 30): Promise<AudioTrack[]> {
  const tracks = await firstFullest(
    [
      () => searchEapiNew(keyword, page, limit),
      () => searchEapiCloud(keyword, page, limit),
      () => searchWeapi(keyword, page, limit),
    ],
    (list) => list.length,
    limit,
    hasItems,
  );
  return tracks ?? [];
}

export async function wyGetMusicUrl(
  track: AudioTrack,
  cookies?: string,
  quality = getPlayQuality(),
): Promise<string | null> {
  const id = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!id) return null;
  const cookie = await resolveWyCookies(cookies);

  for (const q of qualityFallbackChain(quality)) {
    try {
      // 对齐官方 lx-music-source：直连 player/url，不用 eapi/batch
      const body = await eapiPlayerUrlPost<{
        code?: number;
        data?: Array<{ url?: string | null; freeTrialInfo?: unknown }>;
      }>({ ids: `[${id}]`, br: wyBrForQuality(q) }, cookie);
      const hit = body.data?.[0];
      const url = hit?.url;
      if (url?.trim() && !hit?.freeTrialInfo) return url;
    } catch {
      // eapi 失败时降级 weapi
    }

    try {
      const body = await weapiPost<{ data?: Array<{ url?: string | null }> }>(
        'song/enhance/player/url/v1',
        { ids: JSON.stringify([id]), level: wyLevelForQuality(q), encodeType: 'mp3' },
        cookie,
      );
      const url = body.data?.[0]?.url;
      if (url?.trim()) return url;
    } catch {
      // 尝试下一档音质
    }
  }
  return null;
}

export async function wyGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  const { fixWyTimeLabel, parseWyYrcBundle } = await import(
    '@/lib/media/audio/platform/api/wy-yrc-parse'
  );

  const toBundle = (info: {
    lyric: string;
    tlyric: string;
    rlyric: string;
    lxlyric: string;
  }): LyricBundle | null => {
    if (!info.lyric?.trim() && !info.tlyric?.trim()) return null;
    return {
      lyric: info.lyric || null,
      tlyric: info.tlyric || null,
      rlyric: info.rlyric || null,
      lxlyric: info.lxlyric || null,
    };
  };

  try {
    const { eapiLyricPost } = await import('@/lib/media/audio/platform/api/eapi-crypto');
    const cookie = await resolveWyCookies();
    const body = await eapiLyricPost<{
      code?: number;
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      romalrc?: { lyric?: string };
      yrc?: { lyric?: string };
      ytlrc?: { lyric?: string };
      yromalrc?: { lyric?: string };
    }>(
      {
        id,
        cp: false,
        tv: 0,
        lv: 0,
        rv: 0,
        kv: 0,
        yv: 0,
        ytv: 0,
        yrv: 0,
      },
      cookie,
    );
    if (body.code === 200 || body.lrc?.lyric || body.yrc?.lyric) {
      const fixed = fixWyTimeLabel(body.lrc?.lyric, body.tlyric?.lyric, body.romalrc?.lyric);
      const info = parseWyYrcBundle(
        body.yrc?.lyric,
        body.ytlrc?.lyric,
        body.yromalrc?.lyric,
        fixed.lrc,
        fixed.tlrc,
        fixed.romalrc,
      );
      const hit = toBundle(info);
      if (hit) return hit;
    }
  } catch {
    // fall through to weapi
  }

  try {
    const body = await weapiPost<{
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      romalrc?: { lyric?: string };
    }>('song/lyric', { id, lv: -1, kv: -1, tv: -1, rv: -1 });
    const fixed = fixWyTimeLabel(body.lrc?.lyric, body.tlyric?.lyric, body.romalrc?.lyric);
    return toBundle(
      parseWyYrcBundle(null, null, null, fixed.lrc, fixed.tlrc, fixed.romalrc),
    );
  } catch {
    return null;
  }
}

function mapSongToTrack(s: Record<string, unknown>, source: string): AudioTrack {
  const id = String(s.id ?? '');
  const ms = Number(s.dt ?? 0);
  const artists = (s.ar as Array<{ name?: string }> | undefined) ?? [];
  return {
    id: buildTrackId(source, id),
    name: String(s.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source,
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: { songId: id },
  };
}

export { mapSongToTrack };
