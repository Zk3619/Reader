/**
 * MusicFree 主题包 OPFS 存储（.mftheme 解压 / 远程主题离线资源）
 */

import type { MfThemeIframeMap } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';

export const OPFS_MF_THEMES_ROOT = 'reader-mf-themes';

const blobCache = new Map<string, string>();

function sanitizeThemeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'custom';
}

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function getThemesRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_MF_THEMES_ROOT, { create: true });
}

async function ensureDir(
  parent: FileSystemDirectoryHandle,
  parts: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = parent;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

async function writeFileToOpfs(
  themeId: string,
  relPath: string,
  data: Uint8Array,
): Promise<void> {
  const themesRoot = await getThemesRoot();
  const themeDir = await themesRoot.getDirectoryHandle(sanitizeThemeId(themeId), {
    create: true,
  });
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = parts.pop()!;
  const parent = parts.length ? await ensureDir(themeDir, parts) : themeDir;
  const handle = await parent.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data as BlobPart);
  await writable.close();
}

/** 去掉 zip 内常见根目录前缀（如 sakura/index.css → index.css） */
export function normalizeMfThemeZipEntries(
  entries: Record<string, Uint8Array>,
): Record<string, Uint8Array> {
  const keys = Object.keys(entries);
  const normalized: Record<string, Uint8Array> = {};
  let stripPrefix = '';
  const sample = keys.find((k) => k.includes('/'));
  if (sample) {
    const prefix = sample.split('/')[0]!;
    if (keys.every((k) => k === prefix || k.startsWith(`${prefix}/`))) {
      stripPrefix = `${prefix}/`;
    }
  }
  for (const [name, data] of Object.entries(entries)) {
    let path = name.replace(/\\/g, '/');
    if (stripPrefix && path.startsWith(stripPrefix)) {
      path = path.slice(stripPrefix.length);
    }
    if (!path || path.endsWith('/')) continue;
    normalized[path] = data;
  }
  return normalized;
}

export async function writeMfThemePackToOpfs(
  themeId: string,
  entries: Record<string, Uint8Array>,
): Promise<void> {
  const normalized = normalizeMfThemeZipEntries(entries);
  await clearMfThemeOpfsPack(themeId);
  for (const [path, data] of Object.entries(normalized)) {
    await writeFileToOpfs(themeId, path, data);
  }
}

export async function readMfThemeOpfsFile(
  themeId: string,
  relPath: string,
): Promise<Uint8Array | null> {
  try {
    const themesRoot = await getThemesRoot();
    const themeDir = await themesRoot.getDirectoryHandle(sanitizeThemeId(themeId));
    const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop()!;
    let dir = themeDir;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part);
    }
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function readMfThemeOpfsText(
  themeId: string,
  relPath: string,
): Promise<string | null> {
  const data = await readMfThemeOpfsFile(themeId, relPath);
  if (!data) return null;
  return new TextDecoder().decode(data);
}

export function revokeMfThemeOpfsBlobUrls(themeId?: string): void {
  const prefix = themeId ? `${sanitizeThemeId(themeId)}/` : '';
  for (const [key, url] of [...blobCache.entries()]) {
    if (!themeId || key.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      blobCache.delete(key);
    }
  }
}

export async function getMfThemeOpfsBlobUrl(
  themeId: string,
  relPath: string,
): Promise<string> {
  const safeId = sanitizeThemeId(themeId);
  const key = `${safeId}/${relPath.replace(/\\/g, '/')}`;
  const cached = blobCache.get(key);
  if (cached) return cached;
  const data = await readMfThemeOpfsFile(safeId, relPath);
  if (!data) throw new Error(`OPFS 主题资源不存在：${key}`);
  const url = URL.createObjectURL(new Blob([data], { type: mimeFromPath(relPath) }));
  blobCache.set(key, url);
  return url;
}

export function opfsMfThemePackBase(themeId: string): string {
  return `opfs:${sanitizeThemeId(themeId)}`;
}

export function parseOpfsMfThemePackBase(packBaseUrl?: string): string | null {
  if (!packBaseUrl?.startsWith('opfs:')) return null;
  const id = packBaseUrl.slice('opfs:'.length).trim();
  return id || null;
}

function opfsRelativeFromIframePath(slotPath: string): string {
  const trimmed = slotPath.trim();
  if (trimmed.startsWith('@/')) return trimmed.slice(2);
  return trimmed.replace(/^\//, '');
}

export async function resolveOpfsMfThemeIframeMap(
  themeId: string,
  iframe?: Record<string, string | undefined>,
): Promise<MfThemeIframeMap> {
  if (!iframe) return {};
  const out: MfThemeIframeMap = {};
  for (const [slot, path] of Object.entries(iframe)) {
    if (!path) continue;
    const rel = opfsRelativeFromIframePath(path);
    out[slot as keyof MfThemeIframeMap] = await getMfThemeOpfsBlobUrl(themeId, rel);
  }
  return out;
}

export async function clearMfThemeOpfsPack(themeId: string): Promise<void> {
  revokeMfThemeOpfsBlobUrls(themeId);
  try {
    const root = await navigator.storage.getDirectory();
    const themesRoot = await root.getDirectoryHandle(OPFS_MF_THEMES_ROOT);
    await themesRoot.removeEntry(sanitizeThemeId(themeId), { recursive: true });
  } catch {
    // ignore missing
  }
}

export function isOpfsMfThemeSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}
