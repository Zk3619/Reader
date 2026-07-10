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

export async function importLocalFilesToLibrary(
  filePaths: string[],
  playlistId = BUILTIN_PLAYLIST_IDS.LOCAL,
): Promise<AudioTrack[]> {
  const tracks = await parseLocalFilesMetadata(filePaths);
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
): Promise<AudioTrack[]> {
  const { filePaths, cancelled } = await scanMusicDirectories([rootPath], {
    signal,
    onProgress: (p) => onProgress?.(p.foundFiles, p.foundFiles, p.currentPath),
  });
  if (cancelled || filePaths.length === 0) return [];
  const tracks = await parseLocalFilesMetadata(filePaths, (done, total) =>
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
): Promise<AudioTrack[]> {
  const entries = await scanWebDirectoryFileEntries(handle);
  const tracks: AudioTrack[] = [];
  for (const entry of entries) {
    const file = await entry.handle.getFile();
    const track = await parseLocalFileMetadata(entry.path, file);
    registerWebTrackBlob(track.id, file);
    tracks.push(track);
  }
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
): Promise<AudioTrack[]> {
  const tracks = await scanAndroidMusicDirectory(onProgress);
  if (tracks.length === 0) return [];
  await upsertAudioTracks(tracks);
  for (const track of tracks) {
    await addTrackToPlaylist(BUILTIN_PLAYLIST_IDS.LOCAL, track.id);
  }
  return tracks;
}

export { registerWebTrackBlob };
