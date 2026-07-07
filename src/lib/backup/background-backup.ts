/**
 * 阅读背景图本地存储与 WebDAV 同步（对齐 Legado bg/ + background/）
 */

import { join } from '@tauri-apps/api/path';
import { WebDavClient } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { fileExists } from '@/lib/platform/filesystem';
import type { BackupItemInfo } from '@/lib/database/reader-backup';

export const BG_ZIP_PREFIX = 'bg/';
export const BG_REMOTE_DIR = 'background';

const OPFS_BG_DIR = 'reader-bg';

let opfsBgRoot: FileSystemDirectoryHandle | null = null;

async function iterateDirEntries(
  dir: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const handle = dir as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (!handle.entries) return [];
  const out: Array<[string, FileSystemHandle]> = [];
  for await (const entry of handle.entries()) out.push(entry);
  return out;
}

async function getTauriBgRoot(): Promise<string> {
  const appDir = await getAppDataDir();
  const dir = await join(appDir, 'bg');
  if (!(await fileExists(dir))) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function getOpfsBgRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsBgRoot) {
    const root = await navigator.storage.getDirectory();
    opfsBgRoot = await root.getDirectoryHandle(OPFS_BG_DIR, { create: true });
  }
  return opfsBgRoot;
}

export async function listLocalBackgroundFiles(): Promise<string[]> {
  if (isTauri()) {
    const root = await getTauriBgRoot();
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const entries = await readDir(root);
    return entries.filter((e) => !e.isDirectory).map((e) => e.name);
  }
  const root = await getOpfsBgRoot();
  const names: string[] = [];
  for (const [name, handle] of await iterateDirEntries(root)) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

async function readLocalBackgroundBytes(fileName: string): Promise<Uint8Array | null> {
  try {
    if (isTauri()) {
      const root = await getTauriBgRoot();
      const filePath = await join(root, fileName);
      if (!(await fileExists(filePath))) return null;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return await readFile(filePath);
    }
    const root = await getOpfsBgRoot();
    const handle = await root.getFileHandle(fileName);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function writeLocalBackgroundFile(fileName: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const root = await getTauriBgRoot();
    const filePath = await join(root, fileName);
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(filePath, bytes);
    return;
  }
  const root = await getOpfsBgRoot();
  const handle = await root.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function backgroundPathToDataUrl(fileName: string, bytes: Uint8Array): string {
  const lower = fileName.toLowerCase();
  const mime = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : lower.endsWith('.svg')
        ? 'image/svg+xml'
        : 'image/jpeg';
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function readLocalBackgroundAsDataUrl(fileName: string): Promise<string | null> {
  const bytes = await readLocalBackgroundBytes(fileName);
  if (!bytes?.length) return null;
  return backgroundPathToDataUrl(fileName, bytes);
}

export async function collectBackgroundZipEntries(): Promise<{
  entries: Record<string, Uint8Array>;
  item?: BackupItemInfo;
}> {
  const entries: Record<string, Uint8Array> = {};
  const names = await listLocalBackgroundFiles();
  let totalSize = 0;
  for (const name of names) {
    const bytes = await readLocalBackgroundBytes(name);
    if (!bytes?.length) continue;
    entries[`${BG_ZIP_PREFIX}${name}`] = bytes;
    totalSize += bytes.byteLength;
  }
  if (totalSize === 0) return { entries: {} };
  return {
    entries,
    item: {
      fileName: 'bg',
      displayName: '背景图片',
      description: '阅读/主题背景图',
      count: names.length,
      size: totalSize,
    },
  };
}

export async function restoreBackgroundFromZip(binary: Record<string, Uint8Array>): Promise<number> {
  let count = 0;
  for (const [path, data] of Object.entries(binary)) {
    const norm = path.replace(/\\/g, '/');
    if (!norm.startsWith(BG_ZIP_PREFIX)) continue;
    const fileName = norm.slice(BG_ZIP_PREFIX.length);
    if (!fileName || fileName.includes('/')) continue;
    await writeLocalBackgroundFile(fileName, data);
    count += 1;
  }
  return count;
}

async function createBgWebDavClient(): Promise<WebDavClient | null> {
  const config = await loadWebDavConfig();
  if (!config) return null;
  const root = buildRootWebDavUrl(config);
  return new WebDavClient(`${root}${BG_REMOTE_DIR}`, config.username, config.password);
}

export async function uploadBackgroundImagesToWebDav(): Promise<number> {
  const client = await createBgWebDavClient();
  if (!client) return 0;
  await client.ensureDirectories(['']);
  const remoteFiles = new Set(
    (await client.listFiles('')).filter((f) => !f.isDir).map((f) => f.displayName),
  );
  const localNames = await listLocalBackgroundFiles();
  let uploaded = 0;
  for (const name of localNames) {
    if (remoteFiles.has(name)) continue;
    const bytes = await readLocalBackgroundBytes(name);
    if (!bytes?.length) continue;
    await client.uploadFile(name, bytes);
    uploaded += 1;
  }
  return uploaded;
}

export async function downloadBackgroundImagesFromWebDav(): Promise<number> {
  const client = await createBgWebDavClient();
  if (!client) return 0;
  const remoteFiles = (await client.listFiles('')).filter((f) => !f.isDir);
  const localNames = new Set(await listLocalBackgroundFiles());
  let downloaded = 0;
  for (const file of remoteFiles) {
    if (localNames.has(file.displayName)) continue;
    const buffer = await client.downloadFile(file.path || file.displayName);
    await writeLocalBackgroundFile(file.displayName, new Uint8Array(buffer));
    downloaded += 1;
  }
  return downloaded;
}
