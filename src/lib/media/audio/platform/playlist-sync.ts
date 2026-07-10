/**
 * 登录后歌单同步到播放队列
 */

import {
  getRecommendedPlaylists,
  type NeteasePlaylistSummary,
} from '@/lib/media/audio/platform/api/netease';
import { loadNeteasePlaylistWithCache } from '@/lib/media/audio/platform/netease-playlist-cache';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { upsertAudioTracks } from '@/lib/database/audio-library';

export async function fetchNeteaseRecommendPlaylists(): Promise<NeteasePlaylistSummary[]> {
  return getRecommendedPlaylists(30);
}

export async function loadNeteasePlaylistTracks(playlistId: string): Promise<AudioTrack[]> {
  const tracks = await loadNeteasePlaylistWithCache(playlistId);
  await upsertAudioTracks(tracks);
  return tracks;
}

/** 将网易歌单曲目保存为新的本地歌单 */
export async function saveNeteasePlaylistAsLocal(
  neteasePlaylistId: string,
  localName?: string,
): Promise<string> {
  const tracks = await loadNeteasePlaylistTracks(neteasePlaylistId);
  const { createPlaylist, setPlaylistTracks } = await import('@/lib/database/audio-library');
  const id = `local_${neteasePlaylistId}_${Date.now()}`;
  await createPlaylist(id, localName ?? `网易歌单 ${neteasePlaylistId}`, 'local');
  await setPlaylistTracks(
    id,
    tracks.map((t) => t.id),
  );
  return id;
}
