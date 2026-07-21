/**
 * Android SAF 音乐目录扫描（仅收集 URI + 字节，物化由 playlist-store 负责）
 */

import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import {
  androidPickDir,
  androidPersistDirPermission,
  androidReadDir,
  androidReadUriBytes,
} from '@/lib/platform/fs/android-bridge';
import { isMusicFileName } from '@/lib/media/audio/library/music-file-filter';

export interface AndroidMusicScanItem {
  uri: string;
  displayPath: string;
  fileName: string;
  bytes: ArrayBuffer;
}

export async function scanAndroidMusicDirectory(
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<AndroidMusicScanItem[]> {
  if (!mayUseAndroidFsLayer()) return [];
  const treeUri = await androidPickDir();
  if (!treeUri) return [];
  await androidPersistDirPermission(treeUri);

  const fileUris: { uri: string; path: string; name: string }[] = [];
  const queue: { uri: string; path: string }[] = [{ uri: treeUri, path: '' }];

  while (queue.length > 0) {
    const { uri, path } = queue.shift()!;
    const entries = await androidReadDir(uri);
    for (const entry of entries) {
      const childPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.is_dir) {
        queue.push({ uri: entry.uri, path: childPath });
      } else if (isMusicFileName(entry.name)) {
        fileUris.push({ uri: entry.uri, path: childPath, name: entry.name });
      }
    }
  }

  const items: AndroidMusicScanItem[] = [];
  for (let i = 0; i < fileUris.length; i++) {
    const { uri, path, name } = fileUris[i]!;
    onProgress?.(i + 1, fileUris.length, path);
    const bytes = await androidReadUriBytes(uri);
    items.push({ uri, displayPath: path, fileName: name, bytes });
  }
  return items;
}
