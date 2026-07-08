/**
 * 主题包资产持久化 — {appData}/themes/{presetId}/assets/
 * Web 端使用 OPFS reader-themes/
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { fileExists } from '@/lib/platform/filesystem';
import type { ThemeAssetEntry, ThemeAssetManifest } from '@/lib/theme/schema/theme-pack-v1';

const OPFS_THEMES_DIR = 'reader-themes';

let opfsThemesRoot: FileSystemDirectoryHandle | null = null;

async function getOpfsThemesRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsThemesRoot) {
    const root = await navigator.storage.getDirectory();
    opfsThemesRoot = await root.getDirectoryHandle(OPFS_THEMES_DIR, { create: true });
  }
  return opfsThemesRoot;
}

async function getPresetAssetsDir(presetId: string): Promise<string> {
  const appDir = await getAppDataDir();
  const dir = await join(appDir, 'themes', presetId, 'assets');
  if (!(await fileExists(dir))) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function getOpfsPresetAssetsDir(presetId: string): Promise<FileSystemDirectoryHandle> {
  const root = await getOpfsThemesRoot();
  const presetDir = await root.getDirectoryHandle(presetId, { create: true });
  return presetDir.getDirectoryHandle('assets', { create: true });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** 写入单个资产文件 */
export async function writeThemeAssetFile(
  presetId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const safeName = sanitizeFileName(fileName);
  if (isTauri()) {
    const dir = await getPresetAssetsDir(presetId);
    const filePath = await join(dir, safeName);
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(filePath, bytes);
    return safeName;
  }
  const dir = await getOpfsPresetAssetsDir(presetId);
  const handle = await dir.getFileHandle(safeName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes as BufferSource);
  await writable.close();
  return safeName;
}

/** 读取资产字节 */
export async function readThemeAssetBytes(
  presetId: string,
  fileName: string,
): Promise<Uint8Array | null> {
  try {
    const safeName = sanitizeFileName(fileName);
    if (isTauri()) {
      const dir = await getPresetAssetsDir(presetId);
      const filePath = await join(dir, safeName);
      if (!(await fileExists(filePath))) return null;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return await readFile(filePath);
    }
    const dir = await getOpfsPresetAssetsDir(presetId);
    const handle = await dir.getFileHandle(safeName);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/** blob URL 缓存（预览用，需 revoke） */
const blobUrlCache = new Map<string, string>();

function cacheKey(presetId: string, fileName: string): string {
  return `${presetId}::${fileName}`;
}

/** 解析资产为可渲染 URL（blob: 或相对 public） */
export async function resolveThemeAssetUrl(
  presetId: string,
  assetId: string,
  manifest?: ThemeAssetManifest,
): Promise<string | undefined> {
  const entry = manifest?.[assetId];
  const fileName = entry?.path?.split('/').pop() ?? assetId;
  const key = cacheKey(presetId, fileName);
  const cached = blobUrlCache.get(key);
  if (cached) return cached;

  const bytes = await readThemeAssetBytes(presetId, fileName);
  if (!bytes) return undefined;

  const mime = entry?.mime ?? 'application/octet-stream';
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(key, url);
  return url;
}

export function revokeThemeAssetUrls(presetId?: string): void {
  for (const [key, url] of blobUrlCache.entries()) {
    if (!presetId || key.startsWith(`${presetId}::`)) {
      URL.revokeObjectURL(url);
      blobUrlCache.delete(key);
    }
  }
}

/** 从 ZIP 条目批量写入资产，返回更新后的 manifest */
export async function persistThemeAssetsFromZip(
  presetId: string,
  entries: Record<string, Uint8Array>,
  existingManifest?: ThemeAssetManifest,
): Promise<ThemeAssetManifest> {
  const manifest: ThemeAssetManifest = { ...existingManifest };

  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.includes('assets/') && !path.startsWith('assets\\')) continue;
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized.startsWith('assets/')) continue;
    const fileName = normalized.slice('assets/'.length);
    if (!fileName || fileName.includes('..')) continue;

    await writeThemeAssetFile(presetId, fileName, bytes);
    const assetId = fileName.replace(/\.[^.]+$/, '') || fileName;
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const kind = guessAssetKind(ext);
    manifest[assetId] = {
      path: `assets/${fileName}`,
      mime: guessMime(ext),
      kind,
    };
  }

  return manifest;
}

function guessAssetKind(ext: string): ThemeAssetEntry['kind'] {
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (ext === 'gif') return 'gif';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) return 'font';
  return 'image';
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** 收集 preset 资产用于 ZIP 导出 */
export async function readThemeAssetsForExport(
  presetId: string,
  manifest?: ThemeAssetManifest,
): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  if (!manifest) return out;
  for (const entry of Object.values(manifest)) {
    const fileName = entry.path.replace(/^assets\//, '');
    const bytes = await readThemeAssetBytes(presetId, fileName);
    if (bytes) out[`assets/${fileName}`] = bytes;
  }
  return out;
}

/** 删除 preset 全部资产 */
export async function deleteThemePresetAssets(presetId: string): Promise<void> {
  revokeThemeAssetUrls(presetId);
  if (isTauri()) {
    const appDir = await getAppDataDir();
    const dir = await join(appDir, 'themes', presetId);
    if (await fileExists(dir)) {
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(dir, { recursive: true });
    }
    return;
  }
  try {
    const root = await getOpfsThemesRoot();
    await root.removeEntry(presetId, { recursive: true });
  } catch {
    /* ignore */
  }
}
