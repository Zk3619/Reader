/**
 * Android SAF 音乐目录扫描
 */

import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import {
  androidPickDir,
  androidPersistDirPermission,
  androidReadDir,
  androidReadUriBytes,
} from '@/lib/platform/fs/android-bridge';
import { isMusicFileName } from '@/lib/media/audio/library/music-file-filter';
import { parseLocalFileMetadata } from '@/lib/media/audio/library/parse-metadata';
import { registerWebTrackBlob } from '@/lib/media/audio/library/local-resolver';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export async function scanAndroidMusicDirectory(
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<AudioTrack[]> {
  if (!mayUseAndroidFsLayer()) return [];
  const treeUri = await androidPickDir();
  if (!treeUri) return [];
  await androidPersistDirPermission(treeUri);

  const fileUris: { uri: string; path: string }[] = [];
  const queue: { uri: string; path: string }[] = [{ uri: treeUri, path: '' }];

  while (queue.length > 0) {
    const { uri, path } = queue.shift()!;
    const entries = await androidReadDir(uri);
    for (const entry of entries) {
      const childPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.is_dir) {
        queue.push({ uri: entry.uri, path: childPath });
      } else if (isMusicFileName(entry.name)) {
        fileUris.push({ uri: entry.uri, path: childPath });
      }
    }
  }

  const tracks: AudioTrack[] = [];
  for (let i = 0; i < fileUris.length; i++) {
    const { uri, path } = fileUris[i]!;
    onProgress?.(i + 1, fileUris.length, path);
    const bytes = await androidReadUriBytes(uri);
    const blob = new Blob([bytes]);
    const file = new File([blob], path.split('/').pop() ?? 'audio', { type: blob.type });
    const track = await parseLocalFileMetadata(path, file);
    track.meta = { ...track.meta, filePath: uri, androidUri: uri };
    registerWebTrackBlob(track.id, file);
    tracks.push(track);
  }
  return tracks;
}
