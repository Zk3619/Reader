/**
 * 网易云音乐源（搜索 eapi 优先，cloudsearch / weapi 降级）
 */

import { firstSuccess, hasItems } from '@/lib/media/audio/music-sdk/fallback';
import { eapiPost, unwrapEapiBody } from '@/lib/media/audio/platform/api/eapi-crypto';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { wyLevelForQuality, qualityFallbackChain, getPlayQuality } from '@/lib/media/audio/music-quality';

type WySongResource = {
  baseInfo?: {
    simpleSongData?: {
      id?: number | string;
      name?: string;
      dt?: number;
      ar?: Array<{ name?: string }>;
      al?: { id?: number | string; name?: string; picUrl?: string };
      privilege?: { maxbr?: number; maxBrLevel?: string };
    };
  };
};

function mapResource(item: WySongResource): AudioTrack | null {
  const song = item.baseInfo?.simpleSongData;
  if (!song?.id) return null;
  const id = String(song.id);
  const ms = Number(song.dt ?? 0);
  const artists = song.ar ?? [];
  return {
    id: buildTrackId('wy', id),
    name: String(song.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: 'wy',
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId: id,
      albumId: String(song.al?.id ?? ''),
      albumName: String(song.al?.name ?? ''),
      coverUrl: String(song.al?.picUrl ?? ''),
    },
  };
}

function mapSongRecord(s: Record<string, unknown>): AudioTrack | null {
  const id = String(s.id ?? '');
  if (!id) return null;
  const ms = Number(s.dt ?? 0);
  const artists = (s.ar as Array<{ name?: string }> | undefined) ?? [];
  const al = s.al as { id?: number | string; name?: string; picUrl?: string } | undefined;
  return {
    id: buildTrackId('wy', id),
    name: String(s.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: 'wy',
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId: id,
      albumId: String(al?.id ?? ''),
      albumName: String(al?.name ?? ''),
      coverUrl: String(al?.picUrl ?? ''),
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
  const tracks = (body.data?.resources ?? [])
    .map(mapResource)
    .filter((t): t is AudioTrack => t !== null);
  return hasItems(tracks) ? tracks : null;
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
  const tracks = (body.result?.songs ?? [])
    .map(mapSongRecord)
    .filter((t): t is AudioTrack => t !== null);
  return hasItems(tracks) ? tracks : null;
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
  const tracks = (body.result?.songs ?? [])
    .map(mapSongRecord)
    .filter((t): t is AudioTrack => t !== null);
  return hasItems(tracks) ? tracks : null;
}

export async function wySearch(keyword: string, page = 1, limit = 30): Promise<AudioTrack[]> {
  const tracks = await firstSuccess(
    [
      () => searchEapiNew(keyword, page, limit),
      () => searchEapiCloud(keyword, page, limit),
      () => searchWeapi(keyword, page, limit),
    ],
    hasItems,
  );
  return tracks ?? [];
}

export async function wyGetMusicUrl(
  track: AudioTrack,
  cookies?: string,
  quality = getPlayQuality(),
): Promise<string | null> {
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  for (const q of qualityFallbackChain(quality)) {
    const body = await weapiPost<{ data?: Array<{ url?: string | null }> }>(
      'song/enhance/player/url/v1',
      { ids: JSON.stringify([id]), level: wyLevelForQuality(q), encodeType: 'mp3' },
      cookies,
    );
    const url = body.data?.[0]?.url;
    if (url?.trim()) return url;
  }
  return null;
}

export async function wyGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  try {
    const body = await weapiPost<{
      lrc?: { lyric?: string };
      tlyric?: { lyric?: string };
      romalrc?: { lyric?: string };
    }>('song/lyric', {
      id,
      lv: -1,
      kv: -1,
      tv: -1,
      rv: -1,
    });
    const lyric = body.lrc?.lyric ?? null;
    const tlyric = body.tlyric?.lyric ?? null;
    const rlyric = body.romalrc?.lyric ?? null;
    if (!lyric?.trim() && !tlyric?.trim()) return null;
    return { lyric, tlyric, rlyric };
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
