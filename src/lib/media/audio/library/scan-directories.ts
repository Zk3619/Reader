/**
 * 本地音乐目录 BFS 扫描（TS 优先）
 */

import { readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import {
  AUDIO_EXTENSIONS,
  isMusicFileName,
} from '@/lib/media/audio/library/music-file-filter';

export interface ScanProgress {
  scannedDirs: number;
  foundFiles: number;
  currentPath: string;
}

export interface ScanResult {
  filePaths: string[];
  cancelled: boolean;
}

async function scanDirBfs(
  rootPath: string,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [rootPath.replace(/\\/g, '/').replace(/\/+$/, '')];
  let scannedDirs = 0;

  while (queue.length > 0) {
    if (signal?.aborted) return files;
    const dir = queue.shift()!;
    scannedDirs++;
    onProgress?.({ scannedDirs, foundFiles: files.length, currentPath: dir });

    try {
      if (isTauri()) {
        const entries = await readDir(dir);
        for (const entry of entries) {
          if (signal?.aborted) return files;
          const name = entry.name ?? '';
          const childPath = `${dir}/${name}`.replace(/\/+/g, '/');
          if (entry.isDirectory) {
            queue.push(childPath);
          } else if (entry.isFile && isMusicFileName(name)) {
            files.push(childPath);
          }
        }
      }
    } catch (e) {
      console.warn('[audio-scan] skip dir', dir, e);
    }
  }
  return files;
}

export interface WebDirectoryFileEntry {
  path: string;
  handle: FileSystemFileHandle;
}

/** Web：File System Access API 目录扫描（含 file handle） */
export async function scanWebDirectoryFileEntries(
  handle: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<WebDirectoryFileEntry[]> {
  const files: WebDirectoryFileEntry[] = [];
  let scannedDirs = 0;

  async function walk(dir: FileSystemDirectoryHandle, path: string): Promise<void> {
    if (signal?.aborted) return;
    scannedDirs++;
    onProgress?.({ scannedDirs, foundFiles: files.length, currentPath: path });
    for await (const entry of (dir as FileSystemDirectoryHandle & {
      values: () => AsyncIterableIterator<FileSystemHandle>;
    }).values()) {
      if (signal?.aborted) return;
      const name = 'name' in entry ? entry.name : '';
      const childPath = `${path}/${name}`;
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, childPath);
      } else if (entry.kind === 'file' && isMusicFileName(name)) {
        files.push({ path: childPath, handle: entry as FileSystemFileHandle });
      }
    }
  }

  await walk(handle, handle.name);
  return files;
}

/** Web：File System Access API 目录扫描（仅路径） */
export async function scanWebDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const entries = await scanWebDirectoryFileEntries(handle, onProgress, signal);
  return entries.map((e) => e.path);
}

export async function scanMusicDirectories(
  roots: string[],
  options?: {
    onProgress?: (p: ScanProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ScanResult> {
  const all: string[] = [];
  for (const root of roots) {
    if (options?.signal?.aborted) {
      return { filePaths: all, cancelled: true };
    }
    const found = await scanDirBfs(root, options?.onProgress, options?.signal);
    all.push(...found);
  }
  return { filePaths: all, cancelled: options?.signal?.aborted ?? false };
}

export { AUDIO_EXTENSIONS, BaseDirectory };
