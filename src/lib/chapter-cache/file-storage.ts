/**
 * 大章节正文文件缓存（>512KB 落盘，DB 仅存 file_path）
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { writeTextFile, readTextFile, fileExists } from '@/lib/platform/filesystem';
import { bookCacheFolderKey } from '@/lib/chapter-cache/book-cache-key';

export const CHAPTER_FILE_THRESHOLD_BYTES = 512 * 1024;

const OPFS_CACHE_DIR = 'book-cache';

let opfsRoot: FileSystemDirectoryHandle | null = null;

async function getOpfsCacheRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsRoot) {
    const root = await navigator.storage.getDirectory();
    opfsRoot = await root.getDirectoryHandle(OPFS_CACHE_DIR, { create: true });
  }
  return opfsRoot;
}

async function getTauriCacheRoot(): Promise<string> {
  const appDir = await getAppDataDir();
  const dir = await join(appDir, OPFS_CACHE_DIR);
  if (!(await fileExists(dir))) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

function chapterFileName(chapterIndex: number): string {
  return `${String(chapterIndex).padStart(5, '0')}.txt`;
}

export async function writeChapterFile(
  bookUrl: string,
  bookName: string | undefined,
  chapterIndex: number,
  content: string,
): Promise<string> {
  const folder = bookCacheFolderKey(bookUrl, bookName);
  const fileName = chapterFileName(chapterIndex);

  if (isTauri()) {
    const root = await getTauriCacheRoot();
    const bookDir = await join(root, folder);
    if (!(await fileExists(bookDir))) {
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(bookDir, { recursive: true });
    }
    const filePath = await join(bookDir, fileName);
    await writeTextFile(filePath, content);
    return filePath;
  }

  const root = await getOpfsCacheRoot();
  const bookDir = await root.getDirectoryHandle(folder, { create: true });
  const fileHandle = await bookDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return `opfs:${OPFS_CACHE_DIR}/${folder}/${fileName}`;
}

export async function readChapterFile(filePath: string): Promise<string | null> {
  if (!filePath) return null;
  try {
    if (filePath.startsWith('opfs:')) {
      const rel = filePath.slice(`opfs:${OPFS_CACHE_DIR}/`.length);
      const [folder, ...rest] = rel.split('/');
      const fileName = rest.join('/');
      const root = await getOpfsCacheRoot();
      const bookDir = await root.getDirectoryHandle(folder);
      const fileHandle = await bookDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return await file.text();
    }
    if (isTauri() && (await fileExists(filePath))) {
      return await readTextFile(filePath);
    }
  } catch (e) {
    console.warn('[chapter-cache] read file failed', filePath, e);
  }
  return null;
}

export async function deleteChapterFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    if (filePath.startsWith('opfs:')) {
      const rel = filePath.slice(`opfs:${OPFS_CACHE_DIR}/`.length);
      const [folder, ...rest] = rel.split('/');
      const fileName = rest.join('/');
      const root = await getOpfsCacheRoot();
      const bookDir = await root.getDirectoryHandle(folder);
      await bookDir.removeEntry(fileName);
      return;
    }
    if (isTauri()) {
      const { remove } = await import('@tauri-apps/plugin-fs');
      if (await fileExists(filePath)) {
        await remove(filePath);
      }
    }
  } catch {
    /* 文件可能已不存在 */
  }
}

export async function deleteBookCacheFiles(
  bookUrl: string,
  bookName?: string,
): Promise<void> {
  const folder = bookCacheFolderKey(bookUrl, bookName);
  if (isTauri()) {
    const root = await getTauriCacheRoot();
    const bookDir = await join(root, folder);
    if (await fileExists(bookDir)) {
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(bookDir, { recursive: true });
    }
    return;
  }
  try {
    const root = await getOpfsCacheRoot();
    await root.removeEntry(folder, { recursive: true });
  } catch {
    /* */
  }
}

export async function clearAllChapterCacheFiles(): Promise<void> {
  if (isTauri()) {
    const root = await getTauriCacheRoot();
    const { readDir, remove } = await import('@tauri-apps/plugin-fs');
    if (!(await fileExists(root))) return;
    const entries = await readDir(root);
    for (const entry of entries) {
      if (entry.isDirectory) {
        await remove(await join(root, entry.name), { recursive: true });
      } else {
        await remove(await join(root, entry.name));
      }
    }
    return;
  }
  opfsRoot = null;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_CACHE_DIR, { recursive: true });
  } catch {
    /* */
  }
}
