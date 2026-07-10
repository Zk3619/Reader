/**
 * 网易云歌单磁盘缓存
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getPlaylistDetail } from '@/lib/media/audio/platform/api/netease';
import { isTauri } from '@/lib/platform/detect';

const CACHE_DIR = 'cache/netease_playlists';

async function cachePath(playlistId: string): Promise<string> {
  return `${CACHE_DIR}/${playlistId}.json`;
}

export async function getCachedNeteasePlaylist(playlistId: string): Promise<AudioTrack[] | null> {
  try {
    if (isTauri()) {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const path = await cachePath(playlistId);
      const text = await readTextFile(path, { baseDir: BaseDirectory.AppData });
      return JSON.parse(text) as AudioTrack[];
    }
    const key = `reader_netease_pl_${playlistId}`;
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as AudioTrack[]) : null;
  } catch {
    return null;
  }
}

export async function saveCachedNeteasePlaylist(
  playlistId: string,
  tracks: AudioTrack[],
): Promise<void> {
  const json = JSON.stringify(tracks);
  if (isTauri()) {
    const { writeTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir(CACHE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(await cachePath(playlistId), json, { baseDir: BaseDirectory.AppData });
    return;
  }
  localStorage.setItem(`reader_netease_pl_${playlistId}`, json);
}

export async function loadNeteasePlaylistWithCache(playlistId: string): Promise<AudioTrack[]> {
  try {
    const tracks = await getPlaylistDetail(playlistId);
    await saveCachedNeteasePlaylist(playlistId, tracks);
    return tracks;
  } catch (e) {
    if (String(e).includes('NEED_LOGIN')) throw e;
    const cached = await getCachedNeteasePlaylist(playlistId);
    if (cached?.length) return cached;
    throw e;
  }
}
