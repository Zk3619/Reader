/**
 * WebDAV 远程曲库列表（对齐 any-listen WebDAV listProvider 缩水版）
 * 使用主程序 WebDAV 配置；列表写入 source=remote 的歌单。
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { WebDavClient, type WebDavFileInfo } from '@/lib/remote-book/webdav-client';
import {
  buildRootWebDavUrl,
  loadWebDavConfig,
} from '@/lib/remote-book/webdav-config-storage';

export const WEBDAV_REMOTE_PLAYLIST_ID = 'pl_webdav_remote';
export const WEBDAV_REMOTE_PLAYLIST_NAME = 'WebDAV 曲库';

const AUDIO_EXT = new Set([
  'mp3',
  'flac',
  'ogg',
  'wav',
  'm4a',
  'aac',
  'opus',
  'ape',
  'wma',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function parseNameArtist(fileName: string): { name: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, '');
  const parts = base.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    return {
      artist: parts[0]!.trim() || '未知歌手',
      name: parts.slice(1).join(' - ').trim() || base,
    };
  }
  return { name: base || fileName, artist: '未知歌手' };
}

export async function createWebDavMusicClient(): Promise<{
  client: WebDavClient;
  rootMusicPath: string;
} | null> {
  const config = await loadWebDavConfig();
  if (!config) return null;
  const client = new WebDavClient(
    buildRootWebDavUrl(config),
    config.username,
    config.password,
  );
  const rootMusicPath = (getMusicSettings().webdavRemoteMusicPath || 'music')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  return { client, rootMusicPath };
}

async function walkAudioFiles(
  client: WebDavClient,
  path: string,
  depth: number,
  maxDepth: number,
  out: WebDavFileInfo[],
): Promise<void> {
  if (depth > maxDepth) return;
  let entries: WebDavFileInfo[] = [];
  try {
    entries = await client.listFiles(path);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDir) {
      await walkAudioFiles(client, entry.path, depth + 1, maxDepth, out);
      continue;
    }
    if (AUDIO_EXT.has(extOf(entry.displayName))) out.push(entry);
  }
}

export function webdavFileToTrack(file: WebDavFileInfo): AudioTrack {
  const { name, artist } = parseNameArtist(file.displayName);
  const ext = extOf(file.displayName);
  return {
    id: buildTrackId('webdav', file.path),
    name,
    artist,
    source: 'webdav',
    duration: '00:00',
    meta: {
      webdavPath: file.path,
      filePath: file.path,
      ext,
      size: file.size,
      remote: true,
    },
  };
}

/** 扫描 WebDAV 音乐目录并同步到远程歌单 */
export async function syncWebDavRemotePlaylist(): Promise<{
  trackCount: number;
  playlistId: string;
}> {
  const pair = await createWebDavMusicClient();
  if (!pair) throw new Error('请先在系统设置中配置 WebDAV');
  const { client, rootMusicPath } = pair;
  const maxDepth = getMusicSettings().webdavRemoteMaxDepth || 5;
  const files: WebDavFileInfo[] = [];
  await walkAudioFiles(client, rootMusicPath, 0, maxDepth, files);
  const tracks = files.map(webdavFileToTrack);

  const {
    createPlaylist,
    setPlaylistTracks,
    upsertAudioTracks,
  } = await import('@/lib/database/audio-library');
  const { getMusicGroupByListId } = await import('@/lib/database/media-groups');

  const group = await getMusicGroupByListId(WEBDAV_REMOTE_PLAYLIST_ID);
  if (!group) {
    await createPlaylist(WEBDAV_REMOTE_PLAYLIST_ID, WEBDAV_REMOTE_PLAYLIST_NAME, 'remote');
  }

  if (tracks.length) await upsertAudioTracks(tracks);
  await setPlaylistTracks(
    WEBDAV_REMOTE_PLAYLIST_ID,
    tracks.map((t) => t.id),
  );
  return { trackCount: tracks.length, playlistId: WEBDAV_REMOTE_PLAYLIST_ID };
}

export async function resolveWebDavTrackPlayback(
  track: AudioTrack,
): Promise<{ urls: string[]; revokeAll: () => void } | null> {
  if (track.source !== 'webdav' && !track.meta.webdavPath) return null;
  const path =
    (typeof track.meta.webdavPath === 'string' && track.meta.webdavPath.trim()) ||
    (typeof track.meta.filePath === 'string' && track.meta.filePath.trim()) ||
    '';
  if (!path) return null;

  const settings = getMusicSettings();
  if (settings.webdavRemoteCacheEnabled) {
    try {
      const { getOrFetchWebDavAudioCache } = await import(
        '@/lib/media/audio/library/webdav-remote-cache'
      );
      const cached = await getOrFetchWebDavAudioCache(path);
      if (cached) return cached;
    } catch (err) {
      console.warn('[webdav-remote] cache miss/fail', err);
    }
  }

  const pair = await createWebDavMusicClient();
  if (!pair) return null;
  const buf = await pair.client.downloadFile(path);
  const mime =
    extOf(path) === 'flac'
      ? 'audio/flac'
      : extOf(path) === 'ogg'
        ? 'audio/ogg'
        : extOf(path) === 'm4a'
          ? 'audio/mp4'
          : 'audio/mpeg';
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  return {
    urls: [url],
    revokeAll: () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    },
  };
}
