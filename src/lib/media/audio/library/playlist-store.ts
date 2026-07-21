/**
 * 本地曲库歌单 store 操作
 */

import {
  addTrackToPlaylist,
  getPlaylistTracks,
  listPlaylists,
  setPlaylistTracks,
  upsertAudioTracks,
} from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS, type AudioTrack } from '@/lib/media/audio/track-types';
import { parseLocalFilesMetadata } from '@/lib/media/audio/library/parse-metadata';
import {
  scanMusicDirectories,
  scanWebDirectoryFileEntries,
} from '@/lib/media/audio/library/scan-directories';
import { scanAndroidMusicDirectory } from '@/lib/media/audio/library/scan-android-music';
import { parseLocalFileMetadata } from '@/lib/media/audio/library/parse-metadata';
import { registerWebTrackBlob } from '@/lib/media/audio/library/local-resolver';
import {
  materializeFileToLocalLibrary,
  materializeFilesToLocalLibrary,
  type ImportMediaAction,
} from '@/lib/media/local-media-import';
import { parseStorageRef } from '@/lib/platform/fs/storage-ref';
import { readBytes } from '@/lib/platform/fs/read-write';

export async function importLocalFilesToLibrary(
  filePaths: string[],
  playlistId = BUILTIN_PLAYLIST_IDS.LOCAL,
  action: ImportMediaAction = 'none',
): Promise<AudioTrack[]> {
  const paths = await materializeFilesToLocalLibrary('music', filePaths, action);
  const tracks = await parseLocalFilesMetadata(paths);
  await upsertAudioTracks(tracks);
  for (const track of tracks) {
    await addTrackToPlaylist(playlistId, track.id);
  }
  return tracks;
}

export async function scanAndImportDirectory(
  rootPath: string,
  onProgress?: (done: number, total: number, path: string) => void,
  signal?: AbortSignal,
  action: ImportMediaAction = 'none',
): Promise<AudioTrack[]> {
  const { filePaths, cancelled } = await scanMusicDirectories([rootPath], {
    signal,
    onProgress: (p) => onProgress?.(p.foundFiles, p.foundFiles, p.currentPath),
  });
  if (cancelled || filePaths.length === 0) return [];
  const paths = await materializeFilesToLocalLibrary('music', filePaths, action, (done, total, path) =>
    onProgress?.(done, total, path),
  );
  const tracks = await parseLocalFilesMetadata(paths, (done, total) =>
    onProgress?.(done, total, rootPath),
  );
  await upsertAudioTracks(tracks);
  const ids = tracks.map((t) => t.id);
  await setPlaylistTracks(BUILTIN_PLAYLIST_IDS.LOCAL, [
    ...ids,
    ...(await getPlaylistTracks(BUILTIN_PLAYLIST_IDS.LOCAL)).map((t) => t.id).filter((id) => !ids.includes(id)),
  ]);
  return tracks;
}

export async function importWebDirectory(
  handle: FileSystemDirectoryHandle,
  action: ImportMediaAction = 'copy',
  onProgress?: (done: number, total: number, path: string) => void,
): Promise<AudioTrack[]> {
  const entries = await scanWebDirectoryFileEntries(handle);
  const tracks: AudioTrack[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    onProgress?.(i, entries.length, entry.path);
    const file = await entry.handle.getFile();
    const bytes = await file.arrayBuffer();
    const fileName = entry.path.split('/').pop() ?? file.name;
    const location = await materializeFileToLocalLibrary('music', entry.path, action, {
      fileName,
      content: bytes,
    });
    const trackFile =
      action === 'none'
        ? file
        : new File([bytes], fileName, { type: file.type || 'audio/mpeg' });
    const track = await parseLocalFileMetadata(location, trackFile);
    const ref = parseStorageRef(location);
    if (ref.kind === 'uri' || location.startsWith('content://')) {
      track.meta = { ...track.meta, filePath: location, androidUri: location };
    } else {
      track.meta = { ...track.meta, filePath: location };
    }
    registerWebTrackBlob(track.id, trackFile);
    tracks.push(track);
  }
  onProgress?.(entries.length, entries.length, entries[entries.length - 1]?.path ?? '');
  await upsertAudioTracks(tracks);
  for (const track of tracks) {
    await addTrackToPlaylist(BUILTIN_PLAYLIST_IDS.LOCAL, track.id);
  }
  return tracks;
}

export async function loadLibraryPlaylists() {
  return listPlaylists();
}

export async function loadPlaylistTracks(playlistId: string) {
  return getPlaylistTracks(playlistId);
}

export async function importAndroidMusicDirectory(
  onProgress?: (done: number, total: number, path: string) => void,
  action: ImportMediaAction = 'none',
): Promise<AudioTrack[]> {
  const scanned = await scanAndroidMusicDirectory(onProgress);
  if (scanned.length === 0) return [];

  const tracks: AudioTrack[] = [];
  for (let i = 0; i < scanned.length; i++) {
    const item = scanned[i]!;
    onProgress?.(i, scanned.length, item.displayPath);
    const location = await materializeFileToLocalLibrary('music', item.uri, action, {
      fileName: item.fileName,
      content: item.bytes,
    });
    const blob = new Blob([item.bytes]);
    const file = new File([blob], item.fileName, { type: blob.type || 'audio/mpeg' });
    const track = await parseLocalFileMetadata(location, file);
    const ref = parseStorageRef(location);
    if (ref.kind === 'uri' || location.startsWith('content://')) {
      track.meta = { ...track.meta, filePath: location, androidUri: location };
    } else {
      track.meta = { ...track.meta, filePath: location };
    }
    // 物化后仍可用 blob 立即播放；持久路径由 local-resolver 按 StorageRef 再读
    registerWebTrackBlob(track.id, file);
    if (location.startsWith('content://') || ref.kind === 'uri') {
      track.meta.androidUri = location.startsWith('content://')
        ? location
        : ref.value;
    }
    tracks.push(track);
  }
  onProgress?.(scanned.length, scanned.length, scanned[scanned.length - 1]?.displayPath ?? '');

  await upsertAudioTracks(tracks);
  for (const track of tracks) {
    await addTrackToPlaylist(BUILTIN_PLAYLIST_IDS.LOCAL, track.id);
  }
  return tracks;
}

/** 从已物化路径恢复播放缓存（可选） */
export async function hydrateTrackBlobFromStorage(track: AudioTrack): Promise<void> {
  const path = track.meta.filePath;
  if (!path) return;
  try {
    const bytes = await readBytes(parseStorageRef(path));
    const name = path.replace(/^.*[/\\]/, '') || 'audio';
    registerWebTrackBlob(track.id, new File([bytes], name));
  } catch {
    /* 保留已有 blob */
  }
}

export { registerWebTrackBlob };
