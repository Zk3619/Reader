/**
 * 网易云 API 客户端（账号态，weapi 统一）
 */

import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { mapSongToTrack } from '@/lib/media/audio/online/sources/wy';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';

export interface NeteasePlaylistSummary {
  id: string;
  name: string;
  coverUrl?: string;
  trackCount: number;
}

export async function getRecommendedPlaylists(limit = 30): Promise<NeteasePlaylistSummary[]> {
  const auth = await loadAuthSession('netease');
  try {
    const body = await weapiPost<{ recommend?: Array<Record<string, unknown>> }>(
      'personalized/playlist',
      { limit, total: true, n: limit },
      auth?.cookies,
    );
    const list = body.recommend ?? [];
    return list.map((p) => ({
      id: String(p.id ?? ''),
      name: String(p.name ?? ''),
      coverUrl: String((p.picUrl as string | undefined) ?? ''),
      trackCount: Number(p.trackCount ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function getPlaylistDetail(playlistId: string): Promise<AudioTrack[]> {
  const auth = await loadAuthSession('netease');
  const body = await weapiPost<{
    playlist?: { tracks?: Array<Record<string, unknown>> };
    code?: number;
  }>('v3/playlist/detail', { id: playlistId, n: 100000, s: 8 }, auth?.cookies);
  if (body.code === 301 || body.code === 50000005) {
    throw new Error('NEED_LOGIN');
  }
  const tracks = body.playlist?.tracks ?? [];
  return tracks.map((t) => mapSongToTrack(t, 'netease'));
}

export async function getNeteaseSongUrl(track: AudioTrack): Promise<string | null> {
  const auth = await loadAuthSession('netease');
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  const body = await weapiPost<{ data?: Array<{ url?: string | null }> }>(
    'song/enhance/player/url/v1',
    { ids: JSON.stringify([id]), level: 'exhigh', encodeType: 'mp3' },
    auth?.cookies,
  );
  const url = body.data?.[0]?.url;
  return url && url.trim() ? url : null;
}

export async function getNeteaseLyric(track: AudioTrack): Promise<string | null> {
  const id = String(track.meta.songId ?? '');
  if (!id) return null;
  try {
    const auth = await loadAuthSession('netease');
    const body = await weapiPost<{ lrc?: { lyric?: string } }>(
      'song/lyric',
      { id, lv: -1, kv: -1, tv: -1 },
      auth?.cookies,
    );
    return body.lrc?.lyric ?? null;
  } catch {
    return null;
  }
}
