/**
 * 图片章节 L2 磁盘缓存（按书分桶，与封面缓存分离）
 * Tauri：{appData}/image-cache/{bookKey}/{urlKey}/image.bin + meta.json
 *        全局 URL 索引：_url/{urlKey}.json
 * Web：IndexedDB reader-manga-image-cache-v2（bookUrl 索引）
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import {
  getMangaBookFolderKey,
  getMangaImageUrlKey,
  type MangaImageUrlIndexEntry,
} from '@/lib/media/image/image-cache-path';

const MANGA_CACHE_SUBDIR = 'image-cache';
const LEGACY_MANGA_CACHE_SUBDIR = 'manga-image-cache';
const INDEX_DIR = '_url';
const IMAGE_BIN_FILE = 'image.bin';
const META_FILE = 'meta.json';

const WEB_DB_NAME = 'reader-manga-image-cache-v2';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'images';

export type MangaImageCacheMeta = {
  id: string;
  bookUrl: string;
  chapterIndex: number;
  pageIndex: number;
  imageUrl: string;
  sourceId: string;
  mime: string;
  byteSize: number;
  savedAt: number;
};

type MangaImageCacheRecord = {
  id: string;
  bytes: ArrayBuffer;
  meta: MangaImageCacheMeta;
};

let cachedRoot: string | null = null;

export type MangaImageCacheBookStats = {
  imageCount: number;
  estimatedBytes: number;
};

const EMPTY_BOOK_STATS: MangaImageCacheBookStats = {
  imageCount: 0,
  estimatedBytes: 0,
};

let statsMapCache: {
  map: Map<string, MangaImageCacheBookStats>;
  at: number;
} | null = null;
let statsMapInflight: Promise<Map<string, MangaImageCacheBookStats>> | null = null;
const STATS_MAP_TTL_MS = 8_000;

export function invalidateMangaImageMetaIndex(): void {
  statsMapCache = null;
  statsMapInflight = null;
}

function resolveSourceId(sourceId?: string): string {
  return sourceId ?? '';
}

async function ensureMangaCacheDir(): Promise<string> {
  if (!isTauri()) return MANGA_CACHE_SUBDIR;
  if (cachedRoot) return cachedRoot;
  const appDir = await getAppDataDir();
  const fs = await getFileSystem();
  const dir = await join(appDir, MANGA_CACHE_SUBDIR);
  const legacy = await join(appDir, LEGACY_MANGA_CACHE_SUBDIR);
  if (await fs.exists(dir)) {
    cachedRoot = dir;
    return dir;
  }
  if (await fs.exists(legacy)) {
    cachedRoot = legacy;
    return legacy;
  }
  await fs.mkdir(dir, true);
  cachedRoot = dir;
  return dir;
}

function parseMetaJson(raw: string): MangaImageCacheMeta | null {
  try {
    const parsed = JSON.parse(raw) as MangaImageCacheMeta;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.bookUrl === 'string' &&
      typeof parsed.chapterIndex === 'number' &&
      typeof parsed.pageIndex === 'number' &&
      typeof parsed.imageUrl === 'string' &&
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

function openWebMangaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WEB_STORE_NAME)) {
        const store = db.createObjectStore(WEB_STORE_NAME, { keyPath: 'id' });
        store.createIndex('bookUrl', 'meta.bookUrl', { unique: false });
      }
    };
  });
}

async function webGetRecord(id: string): Promise<MangaImageCacheRecord | null> {
  const db = await openWebMangaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as MangaImageCacheRecord) ?? null);
  });
}

async function webGetRecordsByBook(bookUrl: string): Promise<MangaImageCacheRecord[]> {
  const db = await openWebMangaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const store = tx.objectStore(WEB_STORE_NAME);
    const index = store.index('bookUrl');
    const request = index.getAll(bookUrl.trim());
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as MangaImageCacheRecord[]) ?? []);
  });
}

async function webPutRecord(record: MangaImageCacheRecord): Promise<void> {
  const db = await openWebMangaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function webDeleteRecord(id: string): Promise<void> {
  const db = await openWebMangaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function webClearAll(): Promise<void> {
  const db = await openWebMangaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function tauriIndexPath(root: string, urlKey: string): Promise<string> {
  const indexRoot = await join(root, INDEX_DIR);
  const fs = await getFileSystem();
  if (!(await fs.exists(indexRoot))) {
    await fs.mkdir(indexRoot, true);
  }
  return join(indexRoot, `${urlKey}.json`);
}

async function tauriReadUrlIndex(
  root: string,
  urlKey: string,
): Promise<MangaImageUrlIndexEntry | null> {
  const fs = await getFileSystem();
  const path = await tauriIndexPath(root, urlKey);
  if (!(await fs.exists(path))) return null;
  try {
    const raw = await fs.readTextFile(path);
    const parsed = JSON.parse(raw) as MangaImageUrlIndexEntry;
    if (parsed?.bookKey && parsed?.urlKey) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

async function tauriWriteUrlIndex(
  root: string,
  entry: MangaImageUrlIndexEntry,
): Promise<void> {
  const fs = await getFileSystem();
  const path = await tauriIndexPath(root, entry.urlKey);
  await fs.writeTextFile(path, JSON.stringify(entry));
}

async function tauriBucketDir(
  root: string,
  bookKey: string,
  urlKey: string,
): Promise<string> {
  const fs = await getFileSystem();
  const dir = await join(root, bookKey, urlKey);
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, true);
  }
  return dir;
}

async function tauriReadBucket(
  root: string,
  bookKey: string,
  urlKey: string,
): Promise<{ bytes: ArrayBuffer; meta: MangaImageCacheMeta } | null> {
  const fs = await getFileSystem();
  const entry = await join(root, bookKey, urlKey);
  const binPath = await join(entry, IMAGE_BIN_FILE);
  const metaPath = await join(entry, META_FILE);
  if (!(await fs.exists(binPath)) || !(await fs.exists(metaPath))) return null;
  try {
    const metaRaw = await fs.readTextFile(metaPath);
    const meta = parseMetaJson(metaRaw);
    if (!meta) return null;
    const bytes = await fs.readFile(binPath);
    if (!bytes?.byteLength) return null;
    return { bytes, meta };
  } catch {
    return null;
  }
}

/** 兼容旧版扁平 {root}/{urlKey}/ 布局 */
async function tauriReadLegacyFlat(
  root: string,
  urlKey: string,
): Promise<{ bytes: ArrayBuffer; meta: MangaImageCacheMeta } | null> {
  const fs = await getFileSystem();
  const entry = await join(root, urlKey);
  const binPath = await join(entry, IMAGE_BIN_FILE);
  const metaPath = await join(entry, META_FILE);
  if (!(await fs.exists(binPath)) || !(await fs.exists(metaPath))) return null;
  try {
    const metaRaw = await fs.readTextFile(metaPath);
    const meta = parseMetaJson(metaRaw);
    if (!meta) return null;
    const bytes = await fs.readFile(binPath);
    if (!bytes?.byteLength) return null;
    return { bytes, meta };
  } catch {
    return null;
  }
}

async function tauriListMetasInBookFolder(
  root: string,
  bookKey: string,
): Promise<MangaImageCacheMeta[]> {
  const fs = await getFileSystem();
  const bookDir = await join(root, bookKey);
  if (!(await fs.exists(bookDir))) return [];
  const metas: MangaImageCacheMeta[] = [];
  try {
    const urlDirs = await fs.readDir(bookDir);
    for (const urlKey of urlDirs) {
      if (!urlKey || urlKey === '.' || urlKey === '..') continue;
      const metaPath = await join(bookDir, urlKey, META_FILE);
      if (!(await fs.exists(metaPath))) continue;
      try {
        const raw = await fs.readTextFile(metaPath);
        const meta = parseMetaJson(raw);
        if (meta) metas.push(meta);
      } catch {
        /* skip */
      }
    }
  } catch {
    return [];
  }
  return metas;
}

function aggregateStats(metas: MangaImageCacheMeta[]): MangaImageCacheBookStats {
  return {
    imageCount: metas.length,
    estimatedBytes: metas.reduce((sum, m) => sum + (m.byteSize || 0), 0),
  };
}

export async function readMangaImageFromDisk(
  imageUrl: string,
  sourceId?: string,
): Promise<{ bytes: ArrayBuffer; meta: MangaImageCacheMeta } | null> {
  const urlKey = await getMangaImageUrlKey(imageUrl, sourceId);
  if (!isTauri()) {
    const record = await webGetRecord(urlKey);
    if (!record?.bytes?.byteLength) return null;
    return { bytes: record.bytes, meta: record.meta };
  }

  const root = await ensureMangaCacheDir();
  const index = await tauriReadUrlIndex(root, urlKey);
  if (index) {
    const hit = await tauriReadBucket(root, index.bookKey, index.urlKey);
    if (hit) return hit;
  }
  return tauriReadLegacyFlat(root, urlKey);
}

export async function writeMangaImageToDisk(
  meta: Omit<MangaImageCacheMeta, 'byteSize' | 'savedAt'>,
  bytes: ArrayBuffer,
  mime: string,
): Promise<void> {
  if (!bytes.byteLength) return;
  const fullMeta: MangaImageCacheMeta = {
    ...meta,
    mime,
    byteSize: bytes.byteLength,
    savedAt: Math.floor(Date.now() / 1000),
  };

  if (!isTauri()) {
    await webPutRecord({ id: meta.id, bytes, meta: fullMeta });
    invalidateMangaImageMetaIndex();
    return;
  }

  const root = await ensureMangaCacheDir();
  const bookKey = await getMangaBookFolderKey(meta.bookUrl);
  const urlKey = meta.id;
  const bucket = await tauriBucketDir(root, bookKey, urlKey);
  const fs = await getFileSystem();
  const binPath = await join(bucket, IMAGE_BIN_FILE);
  const metaPath = await join(bucket, META_FILE);
  await fs.writeFile(binPath, bytes);
  await fs.writeTextFile(metaPath, JSON.stringify(fullMeta));
  await tauriWriteUrlIndex(root, { bookKey, urlKey });
  invalidateMangaImageMetaIndex();
}

export async function deleteMangaImageFromDisk(
  imageUrl: string,
  sourceId?: string,
): Promise<void> {
  const urlKey = await getMangaImageUrlKey(imageUrl, sourceId);
  if (!isTauri()) {
    await webDeleteRecord(urlKey);
    invalidateMangaImageMetaIndex();
    return;
  }

  const root = await ensureMangaCacheDir();
  const fs = await getFileSystem();
  const index = await tauriReadUrlIndex(root, urlKey);
  if (index) {
    const entry = await join(root, index.bookKey, index.urlKey);
    if (await fs.exists(entry)) {
      await fs.remove(entry, true);
    }
    const indexPath = await tauriIndexPath(root, urlKey);
    if (await fs.exists(indexPath)) {
      await fs.remove(indexPath);
    }
  }
  const legacy = await join(root, urlKey);
  if (await fs.exists(legacy)) {
    await fs.remove(legacy, true);
  }
  invalidateMangaImageMetaIndex();
}

async function buildStatsMapUncached(): Promise<Map<string, MangaImageCacheBookStats>> {
  const map = new Map<string, MangaImageCacheBookStats>();
  if (!isTauri()) {
    const db = await openWebMangaDb();
    const records = await new Promise<MangaImageCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const request = tx.objectStore(WEB_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as MangaImageCacheRecord[]) ?? []);
    });
    for (const record of records) {
      const key = record.meta.bookUrl.trim();
      const prev = map.get(key) ?? { ...EMPTY_BOOK_STATS };
      map.set(key, {
        imageCount: prev.imageCount + 1,
        estimatedBytes: prev.estimatedBytes + (record.meta.byteSize || 0),
      });
    }
    return map;
  }

  const root = await ensureMangaCacheDir();
  const fs = await getFileSystem();
  if (!(await fs.exists(root))) return map;
  const entries = await fs.readDir(root);
  for (const name of entries) {
    if (!name || name === '.' || name === '..' || name === INDEX_DIR) continue;
    const metas = await tauriListMetasInBookFolder(root, name);
    if (metas.length === 0) continue;
    const bookUrl = metas[0]!.bookUrl.trim();
    map.set(bookUrl, aggregateStats(metas));
  }
  return map;
}

async function getStatsMapCached(): Promise<Map<string, MangaImageCacheBookStats>> {
  const now = Date.now();
  if (statsMapCache && now - statsMapCache.at < STATS_MAP_TTL_MS) {
    return statsMapCache.map;
  }
  if (statsMapInflight) return statsMapInflight;
  statsMapInflight = buildStatsMapUncached()
    .then((map) => {
      statsMapCache = { map, at: Date.now() };
      return map;
    })
    .finally(() => {
      statsMapInflight = null;
    });
  return statsMapInflight;
}

export async function getMangaImageCacheStatsMap(): Promise<
  Map<string, MangaImageCacheBookStats>
> {
  return getStatsMapCached();
}

export async function getMangaImageCacheStatsForBook(
  bookUrl: string,
): Promise<MangaImageCacheBookStats> {
  const trimmed = bookUrl.trim();
  if (!isTauri()) {
    const records = await webGetRecordsByBook(trimmed);
    return aggregateStats(records.map((r) => r.meta));
  }
  const root = await ensureMangaCacheDir();
  const bookKey = await getMangaBookFolderKey(trimmed);
  const metas = await tauriListMetasInBookFolder(root, bookKey);
  if (metas.length > 0) {
    return aggregateStats(metas);
  }
  const map = await getStatsMapCached();
  return map.get(trimmed) ?? EMPTY_BOOK_STATS;
}

export async function getMangaImageCacheStats(): Promise<MangaImageCacheBookStats> {
  const map = await getStatsMapCached();
  let imageCount = 0;
  let estimatedBytes = 0;
  for (const stats of map.values()) {
    imageCount += stats.imageCount;
    estimatedBytes += stats.estimatedBytes;
  }
  return { imageCount, estimatedBytes };
}

export function formatMangaImageCacheSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function clearMangaImagesByBook(bookUrl: string): Promise<void> {
  const trimmed = bookUrl.trim();
  if (!isTauri()) {
    const records = await webGetRecordsByBook(trimmed);
    for (const record of records) {
      await webDeleteRecord(record.id);
    }
    invalidateMangaImageMetaIndex();
    return;
  }

  const root = await ensureMangaCacheDir();
  const fs = await getFileSystem();
  const bookKey = await getMangaBookFolderKey(trimmed);
  const indexRoot = await join(root, INDEX_DIR);
  if (await fs.exists(indexRoot)) {
    for (const file of await fs.readDir(indexRoot)) {
      if (!file?.endsWith('.json')) continue;
      const path = await join(indexRoot, file);
      try {
        const entry = JSON.parse(await fs.readTextFile(path)) as MangaImageUrlIndexEntry;
        if (entry.bookKey === bookKey && (await fs.exists(path))) {
          await fs.remove(path);
        }
      } catch {
        /* skip */
      }
    }
  }
  const bookDir = await join(root, bookKey);
  if (await fs.exists(bookDir)) {
    await fs.remove(bookDir, true);
  }
  invalidateMangaImageMetaIndex();
}

export async function clearAllMangaImages(): Promise<void> {
  if (!isTauri()) {
    await webClearAll();
    invalidateMangaImageMetaIndex();
    return;
  }
  const root = await ensureMangaCacheDir();
  const fs = await getFileSystem();
  if (await fs.exists(root)) {
    await fs.remove(root, true);
  }
  cachedRoot = null;
  invalidateMangaImageMetaIndex();
}

export async function trimMangaImagesOutsideChapters(
  bookUrl: string,
  minChapter: number,
  maxChapter: number,
): Promise<void> {
  const metas = await listMangaImageRecordsForBook(bookUrl);
  for (const meta of metas) {
    if (meta.chapterIndex >= minChapter && meta.chapterIndex <= maxChapter) continue;
    if (await chapterCacheDb.isManualCachedChapter(bookUrl, meta.chapterIndex)) {
      continue;
    }
    await deleteMangaImageFromDisk(meta.imageUrl, meta.sourceId);
  }
}

export async function listMangaImageRecordsForBook(
  bookUrl: string,
): Promise<MangaImageCacheMeta[]> {
  const trimmed = bookUrl.trim();
  if (!isTauri()) {
    const records = await webGetRecordsByBook(trimmed);
    return records
      .map((r) => r.meta)
      .sort((a, b) =>
        a.chapterIndex !== b.chapterIndex
          ? a.chapterIndex - b.chapterIndex
          : a.pageIndex - b.pageIndex,
      );
  }
  const root = await ensureMangaCacheDir();
  const bookKey = await getMangaBookFolderKey(trimmed);
  const metas = await tauriListMetasInBookFolder(root, bookKey);
  return metas
    .filter((m) => m.bookUrl === trimmed)
    .sort((a, b) =>
      a.chapterIndex !== b.chapterIndex
        ? a.chapterIndex - b.chapterIndex
        : a.pageIndex - b.pageIndex,
    );
}

export function buildMangaImageCacheMeta(
  imageUrl: string,
  options: {
    bookUrl: string;
    chapterIndex: number;
    pageIndex: number;
    sourceId?: string;
  },
): Promise<MangaImageCacheMeta> {
  return getMangaImageUrlKey(imageUrl, options.sourceId).then((id) => ({
    id,
    bookUrl: options.bookUrl.trim(),
    chapterIndex: options.chapterIndex,
    pageIndex: options.pageIndex,
    imageUrl: normalizeImageUrl(imageUrl.trim()),
    sourceId: resolveSourceId(options.sourceId),
    mime: 'image/jpeg',
    byteSize: 0,
    savedAt: 0,
  }));
}
