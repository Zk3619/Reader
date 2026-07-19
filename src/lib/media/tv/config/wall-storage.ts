/**
 * 影视壁纸文件缓存（对齐 fongmi wallpaper_0）
 * Tauri：{appData}/tv/wall/
 * Web：OPFS reader-tv-wall/
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { fileExists } from '@/lib/platform/filesystem';

const WALL_FILE = 'wallpaper_0';
const OPFS_DIR = 'reader-tv-wall';

let opfsRoot: FileSystemDirectoryHandle | null = null;

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsRoot) {
    const root = await navigator.storage.getDirectory();
    opfsRoot = await root.getDirectoryHandle(OPFS_DIR, { create: true });
  }
  return opfsRoot;
}

async function getTauriWallDir(): Promise<string> {
  const appDir = await getAppDataDir();
  const dir = await join(appDir, 'tv', 'wall');
  if (!(await fileExists(dir))) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function writeWallBytes(bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const dir = await getTauriWallDir();
    const path = await join(dir, WALL_FILE);
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return;
  }
  const root = await getOpfsRoot();
  const handle = await root.getFileHandle(WALL_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes as BufferSource);
  await writable.close();
}

export async function readWallBytes(): Promise<Uint8Array | null> {
  try {
    if (isTauri()) {
      const dir = await getTauriWallDir();
      const path = await join(dir, WALL_FILE);
      if (!(await fileExists(path))) return null;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return await readFile(path);
    }
    const root = await getOpfsRoot();
    const handle = await root.getFileHandle(WALL_FILE);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function clearWallBytes(): Promise<void> {
  try {
    if (isTauri()) {
      const dir = await getTauriWallDir();
      const path = await join(dir, WALL_FILE);
      if (!(await fileExists(path))) return;
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(path);
      return;
    }
    const root = await getOpfsRoot();
    await root.removeEntry(WALL_FILE);
  } catch {
    /* */
  }
}
