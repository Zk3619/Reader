/**
 * 歌手浏览 API（对齐 lx singer.js 子集，经 source-router 取流）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { searchOnline } from '@/lib/media/audio/online/source-router';

export interface SingerDetail {
  id: string;
  name: string;
  coverUrl?: string;
  intro?: string;
  tracks: AudioTrack[];
  source: AudioTrackSource;
}

export async function fetchWySinger(singerId: string): Promise<SingerDetail | null> {
  const body = await weapiPost<{
    artist?: { name?: string; picUrl?: string; briefDesc?: string };
    hotSongs?: Array<{ id?: number; name?: string; dt?: number; ar?: Array<{ name?: string }> }>;
  }>('artist', { id: singerId });
  if (!body.artist) return null;
  const artist = String(body.artist.name ?? '');
  const tracks = (body.hotSongs ?? []).map((s) => ({
    id: buildTrackId('wy', String(s.id ?? '')),
    name: String(s.name ?? ''),
    artist: (s.ar ?? []).map((a) => a.name).filter(Boolean).join('、') || artist,
    source: 'wy' as const,
    duration: s.dt ? formatDurationSec(s.dt / 1000) : '00:00',
    meta: { songId: String(s.id ?? ''), singerId },
  }));
  return {
    id: singerId,
    name: artist,
    coverUrl: body.artist.picUrl,
    intro: body.artist.briefDesc,
    tracks,
    source: 'wy',
  };
}

export async function fetchKgSinger(singerId: string): Promise<SingerDetail | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: {
        info?: { singername?: string; imgurl?: string };
        list?: Array<{ hash?: string; songname?: string; duration?: number; Audioid?: string }>;
      };
    }>(`https://mobiles.kugou.com/api/v3/singer/song?singerid=${singerId}&page=1&pagesize=50`),
  );
  const info = body?.data?.info;
  if (!info) return null;
  const artist = String(info.singername ?? '');
  const tracks = (body?.data?.list ?? []).map((s) => ({
    id: buildTrackId('kg', `${s.Audioid ?? singerId}_${s.hash ?? ''}`),
    name: String(s.songname ?? ''),
    artist,
    source: 'kg' as const,
    duration: s.duration ? formatDurationSec(s.duration) : '00:00',
    meta: { songId: String(s.Audioid ?? ''), hash: s.hash, singerId },
  }));
  return {
    id: singerId,
    name: artist,
    coverUrl: info.imgurl,
    tracks,
    source: 'kg',
  };
}

/** kw/tx/mg 歌手详情桩：通过歌手名搜索热门曲目 */
async function fetchSingerBySearch(
  source: AudioTrackSource,
  singerId: string,
  singerName: string,
): Promise<SingerDetail | null> {
  const { tracks } = await searchOnline(source, singerName);
  const filtered = tracks.filter((t) => t.artist.includes(singerName) || singerName.includes(t.artist));
  return {
    id: singerId,
    name: singerName,
    tracks: (filtered.length > 0 ? filtered : tracks).slice(0, 30),
    source,
  };
}

export async function fetchSingerDetail(
  source: AudioTrackSource,
  singerId: string,
  singerName?: string,
): Promise<SingerDetail | null> {
  switch (source) {
    case 'wy':
      return fetchWySinger(singerId);
    case 'kg':
      return fetchKgSinger(singerId);
    case 'kw':
    case 'tx':
    case 'mg':
      if (!singerName?.trim()) return null;
      return fetchSingerBySearch(source, singerId, singerName);
    default:
      return null;
  }
}
