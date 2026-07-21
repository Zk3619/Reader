/**
 * 音乐封面 L2 持久化缓存：按稳定 cacheKey（曲目/歌单 id 或封面 URL）。
 * Tauri：{appData}/music-cover-cache/{hash}/cover.bin + meta.json
 * Web：IndexedDB reader-music-cover-cache
 */

import { join } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';

const CACHE_SUBDIR = 'music-cover-cache';
const COVER_BIN_FILE = 'cover.bin';
const COVER_META_FILE = 'meta.json';
const HASH_DIR_RE = /^[a-f0-9]{64}$/i;

/** 默认容量上限 200MB */
export const MAX_MUSIC_COVER_CACHE_BYTES = 200 * 1024 * 1024;

export type MusicCoverCacheMeta = {
  cacheKey: string;
  lastCoverUrl: string;
  mime: string;
  byteSize: number;
  savedAt: number;
};

type MusicCoverCacheRecord = {
  id: string;
  bytes: ArrayBuffer;
  meta: MusicCoverCacheMeta;
};

const WEB_DB_NAME = 'reader-music-cover-cache';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'covers';

let cachedRoot: string | null = null;

export function invalidateMusicCoverCacheDir(): void {
  cachedRoot = null;
  estimatedTotalBytes = null;
}
let estimatedTotalBytes: number | null = null;

export async function getMusicCoverCacheKey(cacheKey: string): Promise<string> {
  const enc = new TextEncoder().encode(cacheKey.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getMusicCoverCacheDirectory(): Promise<string> {
  if (!isTauri()) return CACHE_SUBDIR;
  if (cachedRoot) return cachedRoot;
  const moduleRoot = await resolveModuleMediaRoot('music');
  const dir = await join(moduleRoot, CACHE_SUBDIR);
  const fs = await getFileSystem();
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, true);
  }
  cachedRoot = dir;
  return dir;
}

function openWebDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WEB_STORE_NAME)) {
        db.createObjectStore(WEB_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

function parseMeta(raw: string): MusicCoverCacheMeta | null {
  try {
    const parsed = JSON.parse(raw) as MusicCoverCacheMeta;
    if (
      typeof parsed.cacheKey === 'string' &&
      typeof parsed.lastCoverUrl === 'string' &&
      typeof parsed.mime === 'string' &&
      typeof parsed.byteSize === 'number' &&
      typeof parsed.savedAt === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function listAllMetas(): Promise<MusicCoverCacheMeta[]> {
  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getMusicCoverCacheDirectory();
    if (!(await fs.exists(root))) return [];
    const names = await fs.readDir(root);
    const metas: MusicCoverCacheMeta[] = [];
    for (const name of names) {
      if (!HASH_DIR_RE.test(name)) continue;
      const metaPath = await join(root, name, COVER_META_FILE);
      if (!(await fs.exists(metaPath))) continue;
      try {
        const meta = parseMeta(await fs.readTextFile(metaPath));
        if (meta) metas.push(meta);
      } catch {
        /* ignore */
      }
    }
    return metas;
  }

  const db = await openWebDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const request = tx.objectStore(WEB_STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = (request.result as MusicCoverCacheRecord[]) ?? [];
      resolve(records.map((r) => r.meta));
    };
  });
}

async function deleteByHash(hash: string): Promise<void> {
  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getMusicCoverCacheDirectory();
    const entry = await join(root, hash);
    if (await fs.exists(entry)) {
      await fs.remove(entry, true);
      estimatedTotalBytes = null;
    }
    return;
  }
  const db = await openWebDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const request = tx.objectStore(WEB_STORE_NAME).delete(hash);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function evictIfNeeded(incomingBytes: number): Promise<void> {
  const maxBytes = MAX_MUSIC_COVER_CACHE_BYTES;
  if (estimatedTotalBytes != null && estimatedTotalBytes + incomingBytes <= maxBytes) {
    estimatedTotalBytes += incomingBytes;
    return;
  }

  let metas = await listAllMetas();
  let total = metas.reduce((sum, m) => sum + m.byteSize, 0);
  estimatedTotalBytes = total;
  if (total + incomingBytes <= maxBytes) {
    estimatedTotalBytes = total + incomingBytes;
    return;
  }

  const sorted = [...metas].sort((a, b) => a.savedAt - b.savedAt);
  for (const meta of sorted) {
    if (total + incomingBytes <= maxBytes) break;
    const hash = await getMusicCoverCacheKey(meta.cacheKey);
    await deleteByHash(hash);
    total -= meta.byteSize;
  }
  estimatedTotalBytes = total + incomingBytes;
}

export async function readMusicCoverFromDisk(
  cacheKey: string,
): Promise<{ bytes: ArrayBuffer; meta: MusicCoverCacheMeta } | null> {
  const key = cacheKey.trim();
  if (!key) return null;
  const hash = await getMusicCoverCacheKey(key);

  try {
    if (isTauri()) {
      const fs = await getFileSystem();
      const root = await getMusicCoverCacheDirectory();
      const binPath = await join(root, hash, COVER_BIN_FILE);
      const metaPath = await join(root, hash, COVER_META_FILE);
      if (!(await fs.exists(binPath))) return null;
      const bytes = await fs.readFile(binPath);
      if (bytes.byteLength === 0) {
        await deleteByHash(hash);
        return null;
      }
      let meta: MusicCoverCacheMeta | null = null;
      if (await fs.exists(metaPath)) {
        meta = parseMeta(await fs.readTextFile(metaPath));
      }
      if (!meta) {
        meta = {
          cacheKey: key,
          lastCoverUrl: '',
          mime: 'image/jpeg',
          byteSize: bytes.byteLength,
          savedAt: Date.now(),
        };
      }
      return { bytes, meta };
    }

    const db = await openWebDb();
    const record = await new Promise<MusicCoverCacheRecord | undefined>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const request = tx.objectStore(WEB_STORE_NAME).get(hash);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as MusicCoverCacheRecord | undefined);
    });
    if (!record?.bytes || !record.meta) return null;
    return { bytes: record.bytes, meta: record.meta };
  } catch {
    await deleteMusicCoverFromDisk(key).catch(() => undefined);
    return null;
  }
}

export async function writeMusicCoverToDisk(
  cacheKey: string,
  coverUrl: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<void> {
  const key = cacheKey.trim();
  if (!key || bytes.byteLength === 0) return;
  const hash = await getMusicCoverCacheKey(key);
  const meta: MusicCoverCacheMeta = {
    cacheKey: key,
    lastCoverUrl: coverUrl,
    mime: mime || 'image/jpeg',
    byteSize: bytes.byteLength,
    savedAt: Date.now(),
  };

  await evictIfNeeded(bytes.byteLength);

  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getMusicCoverCacheDirectory();
    const entry = await join(root, hash);
    if (!(await fs.exists(entry))) await fs.mkdir(entry, true);
    const binPath = await join(entry, COVER_BIN_FILE);
    const metaPath = await join(entry, COVER_META_FILE);
    await fs.writeTextFile(metaPath, JSON.stringify(meta));
    await fs.writeFile(binPath, bytes);
    return;
  }

  const db = await openWebDb();
  const record: MusicCoverCacheRecord = { id: hash, bytes, meta };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const request = tx.objectStore(WEB_STORE_NAME).put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteMusicCoverFromDisk(cacheKey: string): Promise<void> {
  const key = cacheKey.trim();
  if (!key) return;
  await deleteByHash(await getMusicCoverCacheKey(key));
}

export async function clearAllMusicCoverCache(): Promise<void> {
  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getMusicCoverCacheDirectory();
    if (await fs.exists(root)) {
      const names = await fs.readDir(root);
      for (const name of names) {
        await fs.remove(await join(root, name), HASH_DIR_RE.test(name));
      }
    }
    estimatedTotalBytes = 0;
    return;
  }

  const db = await openWebDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const request = tx.objectStore(WEB_STORE_NAME).clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
  estimatedTotalBytes = 0;
}

export async function getMusicCoverCacheStats(): Promise<{
  count: number;
  totalBytes: number;
}> {
  const metas = await listAllMetas();
  const totalBytes = metas.reduce((sum, m) => sum + m.byteSize, 0);
  estimatedTotalBytes = totalBytes;
  return { count: metas.length, totalBytes };
}

export function formatMusicCoverCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 稳定缓存键：优先业务 id，否则用封面 URL */
export function musicCoverCacheKeyForTrack(trackId: string | null | undefined): string | null {
  const id = trackId?.trim();
  return id ? `track:${id}` : null;
}

export function musicCoverCacheKeyForPlaylist(
  source: string | null | undefined,
  playlistId: string | null | undefined,
): string | null {
  const src = source?.trim();
  const id = playlistId?.trim();
  if (src && id) return `playlist:${src}:${id}`;
  if (id) return `playlist:${id}`;
  return null;
}

export function musicCoverCacheKeyFromUrl(coverUrl: string | null | undefined): string | null {
  const url = coverUrl?.trim();
  return url ? `url:${url}` : null;
}

export function resolveMusicCoverCacheKey(options: {
  trackId?: string | null;
  playlistSource?: string | null;
  playlistId?: string | null;
  coverUrl?: string | null;
}): string | null {
  return (
    musicCoverCacheKeyForTrack(options.trackId) ??
    musicCoverCacheKeyForPlaylist(options.playlistSource, options.playlistId) ??
    musicCoverCacheKeyFromUrl(options.coverUrl)
  );
}
