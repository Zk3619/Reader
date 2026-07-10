/**
 * 专辑/歌手浏览（对齐 lx album.js / singer.js 子集）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';

export interface AlbumDetail {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
  tracks: AudioTrack[];
  source: AudioTrackSource;
}

export async function fetchWyAlbum(albumId: string): Promise<AlbumDetail | null> {
  const body = await weapiPost<{
    album?: { name?: string; picUrl?: string; artists?: Array<{ name?: string }> };
    songs?: Array<{ id?: number; name?: string; dt?: number; ar?: Array<{ name?: string }> }>;
  }>('album', { id: albumId });
  if (!body.album) return null;
  const artist = (body.album.artists ?? []).map((a) => a.name).filter(Boolean).join('、');
  const tracks = (body.songs ?? []).map((s) => ({
    id: buildTrackId('wy', String(s.id ?? '')),
    name: String(s.name ?? ''),
    artist: (s.ar ?? []).map((a) => a.name).filter(Boolean).join('、') || artist,
    source: 'wy' as const,
    duration: s.dt ? formatDurationSec(s.dt / 1000) : '00:00',
    meta: { songId: String(s.id ?? ''), albumId },
  }));
  return {
    id: albumId,
    name: String(body.album.name ?? ''),
    artist,
    coverUrl: body.album.picUrl,
    tracks,
    source: 'wy',
  };
}

export async function fetchKgAlbum(albumId: string): Promise<AlbumDetail | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: {
        info?: { albumname?: string; singername?: string; imgurl?: string };
        list?: Array<{ hash?: string; songname?: string; duration?: number }>;
      };
    }>(`https://mobiles.kugou.com/api/v3/album/song?albumid=${albumId}&page=1&pagesize=50`),
  );
  const info = body?.data?.info;
  if (!info) return null;
  const tracks = (body?.data?.list ?? []).map((s) => ({
    id: buildTrackId('kg', `${albumId}_${s.hash ?? ''}`),
    name: String(s.songname ?? ''),
    artist: String(info.singername ?? ''),
    source: 'kg' as const,
    duration: s.duration ? formatDurationSec(s.duration) : '00:00',
    meta: { songId: albumId, hash: s.hash, albumId },
  }));
  return {
    id: albumId,
    name: String(info.albumname ?? ''),
    artist: String(info.singername ?? ''),
    coverUrl: info.imgurl,
    tracks,
    source: 'kg',
  };
}

export async function fetchAlbumDetail(
  source: AudioTrackSource,
  albumId: string,
): Promise<AlbumDetail | null> {
  switch (source) {
    case 'wy':
      return fetchWyAlbum(albumId);
    case 'kg':
      return fetchKgAlbum(albumId);
    default:
      return null;
  }
}
