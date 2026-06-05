/**
 * 封面 L2 持久化缓存：按 bookUrl 稳定主键。
 * Tauri：cover-cache/{hash}/cover.bin + meta.json（用户可指定缓存根目录）。
 * Web：独立 IndexedDB。
 */

import { join } from '@tauri-apps/api/path';
import { getCoverCacheDirectory } from '@/lib/cover/cover-cache-path';
import {
  getCoverCacheMaxBytes,
  getCoverCacheSettings,
} from '@/lib/cover/cover-cache-settings';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';

export { getCoverCacheDirectory, getDefaultCoverCacheDirectory } from '@/lib/cover/cover-cache-path';

/** 默认上限（未配置时） */
export const MAX_COVER_CACHE_BYTES = 300 * 1024 * 1024;

export type CoverCacheMeta = {
  bookUrl: string;
  lastCoverUrl: string;
  mime: string;
  byteSize: number;
  savedAt: number;
};

type CoverCacheRecord = {
  id: string;
  bytes: ArrayBuffer;
  meta: CoverCacheMeta;
};

const WEB_DB_NAME = 'reader-cover-cache';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'covers';

/** 无 .meta.json 的孤儿 .bin 在统计/淘汰时用此前缀携带磁盘 hash */
const ORPHAN_BIN_BOOK_URL_PREFIX = '__bin__:';

const COVER_BIN_FILE = 'cover.bin';
const COVER_META_FILE = 'meta.json';
const HASH_DIR_RE = /^[a-f0-9]{64}$/i;

/** 已迁移的 hash，避免列表滚动时反复 plugin-fs exists */
const legacyMigrationDone = new Set<string>();
let cachedCoverCacheRoot: string | null = null;
/** 按 hash 缓存绝对路径，避免每次 read 多次 path|join */
const diskPathsByHash = new Map<string, { binPath: string; metaPath: string }>();

async function resolveDiskPaths(
  root: string,
  hash: string,
): Promise<{ binPath: string; metaPath: string }> {
  const cached = diskPathsByHash.get(hash);
  if (cached) return cached;
  const entry = await diskEntryDir(root, hash);
  const next = {
    binPath: await join(entry, COVER_BIN_FILE),
    metaPath: await join(entry, COVER_META_FILE),
  };
  diskPathsByHash.set(hash, next);
  return next;
}

type CoverDiskFs = Awaited<ReturnType<typeof getFileSystem>>;

function diskHashFromMeta(meta: CoverCacheMeta): Promise<string> {
  if (meta.bookUrl.startsWith(ORPHAN_BIN_BOOK_URL_PREFIX)) {
    return Promise.resolve(meta.bookUrl.slice(ORPHAN_BIN_BOOK_URL_PREFIX.length));
  }
  return getCoverCacheKey(meta.bookUrl);
}

export async function getCoverCacheKey(bookUrl: string): Promise<string> {
  const trimmed = bookUrl.trim();
  const enc = new TextEncoder().encode(trimmed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function ensureDiskCacheDir(): Promise<string> {
  if (cachedCoverCacheRoot) return cachedCoverCacheRoot;
  const dir = await getCoverCacheDirectory();
  const fs = await getFileSystem();
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, true);
  }
  cachedCoverCacheRoot = dir;
  return dir;
}

async function diskEntryDir(root: string, hash: string): Promise<string> {
  return join(root, hash);
}

async function diskBinPath(root: string, hash: string): Promise<string> {
  return join(await diskEntryDir(root, hash), COVER_BIN_FILE);
}

async function diskMetaPath(root: string, hash: string): Promise<string> {
  return join(await diskEntryDir(root, hash), COVER_META_FILE);
}

async function legacyFlatBinPath(root: string, hash: string): Promise<string> {
  return join(root, `${hash}.bin`);
}

async function legacyFlatMetaPath(root: string, hash: string): Promise<string> {
  return join(root, `${hash}.meta.json`);
}

async function ensureEntryDir(root: string, hash: string): Promise<string> {
  const fs = await getFileSystem();
  const entry = await diskEntryDir(root, hash);
  if (!(await fs.exists(entry))) {
    await fs.mkdir(entry, true);
  }
  return entry;
}

/** 旧版扁平 {hash}.bin / {hash}.meta.json → {hash}/cover.bin + meta.json */
async function migrateLegacyFlatEntry(
  fs: CoverDiskFs,
  root: string,
  hash: string,
): Promise<boolean> {
  if (legacyMigrationDone.has(hash)) return false;
  const legacyBin = await legacyFlatBinPath(root, hash);
  const legacyMeta = await legacyFlatMetaPath(root, hash);
  const hasLegacy =
    (await fs.exists(legacyBin)) || (await fs.exists(legacyMeta));
  if (!hasLegacy) {
    legacyMigrationDone.add(hash);
    return false;
  }

  await ensureEntryDir(root, hash);
  const binPath = await diskBinPath(root, hash);
  const metaPath = await diskMetaPath(root, hash);

  if ((await fs.exists(legacyBin)) && !(await fs.exists(binPath))) {
    const bytes = await fs.readFile(legacyBin);
    await fs.writeFile(binPath, bytes);
  }
  if ((await fs.exists(legacyMeta)) && !(await fs.exists(metaPath))) {
    const raw = await fs.readTextFile(legacyMeta);
    await fs.writeTextFile(metaPath, raw);
  }

  if (await fs.exists(legacyBin)) await fs.remove(legacyBin);
  if (await fs.exists(legacyMeta)) await fs.remove(legacyMeta);
  legacyMigrationDone.add(hash);
  return true;
}

function parseMetaJson(raw: string): CoverCacheMeta | null {
  try {
    const parsed = JSON.parse(raw) as CoverCacheMeta;
    if (
      typeof parsed.bookUrl === 'string' &&
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

// --- Web IndexedDB ---

function openWebCoverDb(): Promise<IDBDatabase> {
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

async function webGetAllRecords(): Promise<CoverCacheRecord[]> {
  const db = await openWebCoverDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as CoverCacheRecord[]) ?? []);
  });
}

async function webDeleteRecord(id: string): Promise<void> {
  const db = await openWebCoverDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function metaFromOrphanBin(
  fs: Awaited<ReturnType<typeof getFileSystem>>,
  dir: string,
  hash: string,
): Promise<CoverCacheMeta | null> {
  const binPath = await diskBinPath(dir, hash);
  if (!(await fs.exists(binPath))) return null;
  try {
    const byteSize = await fs.getFileSize(binPath);
    if (byteSize <= 0) return null;
    return {
      bookUrl: `${ORPHAN_BIN_BOOK_URL_PREFIX}${hash}`,
      lastCoverUrl: '',
      mime: 'image/jpeg',
      byteSize,
      savedAt: 0,
    };
  } catch {
    return null;
  }
}

async function loadMetaFromEntry(
  fs: CoverDiskFs,
  root: string,
  hash: string,
): Promise<CoverCacheMeta | null> {
  await migrateLegacyFlatEntry(fs, root, hash);
  const metaPath = await diskMetaPath(root, hash);
  if (!(await fs.exists(metaPath))) return null;
  try {
    return parseMetaJson(await fs.readTextFile(metaPath));
  } catch {
    return null;
  }
}

/**
 * 迁移旧扁平布局并补写子目录内缺失的 meta.json（打开设置统计时执行）。
 */
export async function repairOrphanCoverDiskMetas(): Promise<number> {
  if (!isTauri()) return 0;

  const fs = await getFileSystem();
  const root = await getCoverCacheDirectory();
  if (!(await fs.exists(root))) return 0;

  const names = await fs.readDir(root);
  const hashes = new Set<string>();

  for (const name of names) {
    if (HASH_DIR_RE.test(name)) {
      hashes.add(name);
    } else if (name.endsWith('.bin')) {
      hashes.add(name.replace(/\.bin$/, ''));
    } else if (name.endsWith('.meta.json')) {
      hashes.add(name.replace(/\.meta\.json$/, ''));
    }
  }

  let migrated = 0;
  let repaired = 0;

  for (const hash of hashes) {
    if (!HASH_DIR_RE.test(hash)) continue;
    if (await migrateLegacyFlatEntry(fs, root, hash)) migrated += 1;

    const metaPath = await diskMetaPath(root, hash);
    if (await fs.exists(metaPath)) continue;

    const orphan = await metaFromOrphanBin(fs, root, hash);
    if (!orphan) continue;

    orphan.savedAt = Date.now();
    try {
      await ensureEntryDir(root, hash);
      await fs.writeTextFile(metaPath, JSON.stringify(orphan));
      repaired += 1;
    } catch (e) {
      console.warn('[cover-cache] 补写 meta 失败', hash.slice(0, 12), e);
    }
  }

  if (migrated > 0 || repaired > 0) {
    console.info(
      `[cover-cache] 布局整理：迁移 ${migrated} 条，补写 meta ${repaired} 条`,
    );
  }
  return migrated + repaired;
}

async function listAllCacheMetas(): Promise<CoverCacheMeta[]> {
  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getCoverCacheDirectory();
    if (!(await fs.exists(root))) return [];
    const names = await fs.readDir(root);
    const metas: CoverCacheMeta[] = [];
    const seen = new Set<string>();

    const pushEntry = async (hash: string) => {
      if (!HASH_DIR_RE.test(hash) || seen.has(hash)) return;
      seen.add(hash);
      const meta = await loadMetaFromEntry(fs, root, hash);
      if (meta) {
        metas.push(meta);
        return;
      }
      const orphan = await metaFromOrphanBin(fs, root, hash);
      if (orphan) metas.push(orphan);
    };

    for (const name of names) {
      if (HASH_DIR_RE.test(name)) {
        await pushEntry(name);
        continue;
      }
      if (name.endsWith('.meta.json')) {
        await pushEntry(name.replace(/\.meta\.json$/, ''));
        continue;
      }
      if (name.endsWith('.bin')) {
        await pushEntry(name.replace(/\.bin$/, ''));
      }
    }

    return metas;
  }

  const records = await webGetAllRecords();
  return records.map((r) => r.meta);
}

async function deleteCacheEntryByHash(hash: string): Promise<void> {
  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getCoverCacheDirectory();
    const entry = await diskEntryDir(root, hash);
    if (await fs.exists(entry)) {
      await fs.remove(entry, true);
      invalidateEstimatedCacheBytes();
    }
    const legacyBin = await legacyFlatBinPath(root, hash);
    const legacyMeta = await legacyFlatMetaPath(root, hash);
    if (await fs.exists(legacyBin)) await fs.remove(legacyBin);
    if (await fs.exists(legacyMeta)) await fs.remove(legacyMeta);
    return;
  }
  await webDeleteRecord(hash);
}

/** 估算缓存总字节，避免每次 write 全目录 list（探索列表批量 network-fetch 时会打穿 plugin-fs） */
let estimatedCacheTotalBytes: number | null = null;
let lastFullEvictScanAt = 0;
const FULL_EVICT_SCAN_INTERVAL_MS = 60_000;

function bumpEstimatedCacheBytes(delta: number): void {
  if (estimatedCacheTotalBytes == null) return;
  estimatedCacheTotalBytes = Math.max(0, estimatedCacheTotalBytes + delta);
}

function invalidateEstimatedCacheBytes(): void {
  estimatedCacheTotalBytes = null;
}

/** 写入前按保留期与容量淘汰最旧条目 */
async function evictIfNeeded(incomingBytes: number): Promise<void> {
  const maxBytes = await getCoverCacheMaxBytes();
  const { retentionDays } = await getCoverCacheSettings();
  const estimate = estimatedCacheTotalBytes;
  if (
    estimate != null &&
    Number.isFinite(maxBytes) &&
    estimate + incomingBytes <= maxBytes
  ) {
    estimatedCacheTotalBytes = estimate + incomingBytes;
    return;
  }

  const now = Date.now();
  if (
    estimate != null &&
    now - lastFullEvictScanAt < FULL_EVICT_SCAN_INTERVAL_MS
  ) {
    estimatedCacheTotalBytes = estimate + incomingBytes;
    return;
  }

  lastFullEvictScanAt = now;
  let metas = await listAllCacheMetas();

  if (retentionDays > 0) {
    const cutoff = now - retentionDays * 86_400_000;
    for (const meta of metas) {
      if (meta.savedAt > 0 && meta.savedAt < cutoff) {
        const hash = await diskHashFromMeta(meta);
        await deleteCacheEntryByHash(hash);
      }
    }
    metas = await listAllCacheMetas();
  }

  let total = metas.reduce((sum, m) => sum + m.byteSize, 0);
  estimatedCacheTotalBytes = total;
  if (!Number.isFinite(maxBytes) || total + incomingBytes <= maxBytes) {
    estimatedCacheTotalBytes = total + incomingBytes;
    return;
  }

  const sorted = [...metas].sort((a, b) => a.savedAt - b.savedAt);
  for (const meta of sorted) {
    if (total + incomingBytes <= maxBytes) break;
    const hash = await diskHashFromMeta(meta);
    await deleteCacheEntryByHash(hash);
    total -= meta.byteSize;
  }
  estimatedCacheTotalBytes = total + incomingBytes;
}

export async function readCoverFromDisk(
  bookUrl: string,
): Promise<{ bytes: ArrayBuffer; meta: CoverCacheMeta } | null> {
  const trimmed = bookUrl.trim();
  if (!trimmed) return null;

  const hash = await getCoverCacheKey(trimmed);

  try {
    if (isTauri()) {
      const fs = await getFileSystem();
      const root = await ensureDiskCacheDir();
      const { binPath, metaPath } = await resolveDiskPaths(root, hash);
      // 列表批量读盘不做 legacy 迁移（每次 6+ exists）；迁移留给写入或维护任务
      if (!(await fs.exists(binPath))) {
        return null;
      }
      const bytes = await fs.readFile(binPath);
      if (bytes.byteLength === 0) {
        await deleteCacheEntryByHash(hash);
        return null;
      }

      if (await fs.exists(metaPath)) {
        const meta = parseMetaJson(await fs.readTextFile(metaPath));
        if (!meta) {
          await deleteCacheEntryByHash(hash);
          return null;
        }
        return { bytes, meta };
      }

      const repaired: CoverCacheMeta = {
        bookUrl: trimmed,
        lastCoverUrl: '',
        mime: 'image/jpeg',
        byteSize: bytes.byteLength,
        savedAt: Date.now(),
      };
      await ensureEntryDir(root, hash);
      await fs.writeTextFile(metaPath, JSON.stringify(repaired)).catch(() => { });
      return { bytes, meta: repaired };
    }

    const db = await openWebCoverDb();
    const record = await new Promise<CoverCacheRecord | undefined>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const store = tx.objectStore(WEB_STORE_NAME);
      const request = store.get(hash);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as CoverCacheRecord | undefined);
    });

    if (!record?.bytes || !record.meta) return null;
    return { bytes: record.bytes, meta: record.meta };
  } catch {
    await deleteCoverFromDisk(trimmed).catch(() => { });
    return null;
  }
}

/** 仅更新 meta 中的 lastCoverUrl（磁盘命中后刷新签名 URL，不重下图片） */
export async function patchCoverDiskMetaLastUrl(
  bookUrl: string,
  coverUrl: string,
): Promise<void> {
  const trimmed = bookUrl.trim();
  if (!trimmed) return;

  const hash = await getCoverCacheKey(trimmed);

  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getCoverCacheDirectory();
    await migrateLegacyFlatEntry(fs, root, hash);
    const metaPath = await diskMetaPath(root, hash);
    if (!(await fs.exists(metaPath))) return;
    const meta = parseMetaJson(await fs.readTextFile(metaPath));
    if (!meta) return;
    meta.lastCoverUrl = coverUrl;
    await fs.writeTextFile(metaPath, JSON.stringify(meta));
    return;
  }

  const db = await openWebCoverDb();
  const record = await new Promise<CoverCacheRecord | undefined>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.get(hash);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as CoverCacheRecord | undefined);
  });
  if (!record?.meta) return;
  record.meta.lastCoverUrl = coverUrl;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function writeCoverToDisk(
  bookUrl: string,
  coverUrl: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<void> {
  const trimmed = bookUrl.trim();
  if (!trimmed || bytes.byteLength === 0) return;

  const hash = await getCoverCacheKey(trimmed);
  const meta: CoverCacheMeta = {
    bookUrl: trimmed,
    lastCoverUrl: coverUrl,
    mime: mime || 'image/jpeg',
    byteSize: bytes.byteLength,
    savedAt: Date.now(),
  };

  await evictIfNeeded(bytes.byteLength);

  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await ensureDiskCacheDir();
    await ensureEntryDir(root, hash);
    const binPath = await diskBinPath(root, hash);
    const metaPath = await diskMetaPath(root, hash);
    await fs.writeTextFile(metaPath, JSON.stringify(meta));
    try {
      await fs.writeFile(binPath, bytes);
      bumpEstimatedCacheBytes(bytes.byteLength);
      legacyMigrationDone.add(hash);
    } catch (e) {
      await fs.remove(metaPath).catch(() => { });
      throw e;
    }
    return;
  }

  const db = await openWebCoverDb();
  const record: CoverCacheRecord = { id: hash, bytes, meta };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteCoverFromDisk(bookUrl: string): Promise<void> {
  const trimmed = bookUrl.trim();
  if (!trimmed) return;
  const hash = await getCoverCacheKey(trimmed);
  await deleteCacheEntryByHash(hash);
}

export async function clearAllCoverCache(): Promise<void> {
  if (isTauri()) {
    const fs = await getFileSystem();
    const root = await getCoverCacheDirectory();
    if (await fs.exists(root)) {
      const names = await fs.readDir(root);
      for (const name of names) {
        const target = await join(root, name);
        await fs.remove(target, HASH_DIR_RE.test(name));
      }
    }
    return;
  }

  const db = await openWebCoverDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(WEB_STORE_NAME);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getCoverCacheStats(): Promise<{
  count: number;
  totalBytes: number;
}> {
  if (isTauri()) {
    await repairOrphanCoverDiskMetas();
  }
  const metas = await listAllCacheMetas();
  return {
    count: metas.length,
    totalBytes: metas.reduce((sum, m) => sum + m.byteSize, 0),
  };
}

export function formatCoverCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
