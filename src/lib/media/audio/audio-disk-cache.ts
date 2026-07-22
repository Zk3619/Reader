/**
 * 听书章节音频 L2 磁盘缓存
 * Tauri：{appData}/audio-cache/{bookKey}/{chapterIndex}_{segmentIndex}/audio.bin + meta.json
 * Web：IndexedDB reader-audio-cache-v1
 */

import { join } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { getMangaBookFolderKey } from '@/lib/media/image/image-cache-path';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';

const AUDIO_CACHE_SUBDIR = 'audio-cache';
const AUDIO_BIN_FILE = 'audio.bin';
const META_FILE = 'meta.json';

/** 音乐 auto 流缓存容量上限（仅淘汰 auto；manual 保留） */
export const MAX_MUSIC_AUTO_CACHE_BYTES = 512 * 1024 * 1024;

const WEB_DB_NAME = 'reader-audio-cache-v1';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'tracks';

export type AudioCacheMeta = {
  id: string;
  bookUrl: string;
  chapterIndex: number;
  segmentIndex: number;
  audioUrl: string;
  sourceId: string;
  mime: string;
  byteSize: number;
  savedAt: number;
  /** 音乐曲目缓存分级；听书章节可缺省 */
  cacheTier?: import('@/lib/media/audio/music-cache-tier').MusicCacheTier;
  quality?: string;
};

type AudioCacheRecord = {
  id: string;
  bytes: ArrayBuffer;
  meta: AudioCacheMeta;
};

export type AudioCacheBookStats = {
  trackCount: number;
  estimatedBytes: number;
};

const EMPTY_BOOK_STATS: AudioCacheBookStats = {
  trackCount: 0,
  estimatedBytes: 0,
};

let cachedRoot: string | null = null;

export function invalidateAudioCacheDir(): void {
  cachedRoot = null;
  statsMapCache = null;
}
let statsMapCache: {
  map: Map<string, AudioCacheBookStats>;
  at: number;
} | null = null;
let statsMapInflight: Promise<Map<string, AudioCacheBookStats>> | null = null;
const STATS_MAP_TTL_MS = 8_000;

export function invalidateAudioCacheMetaIndex(): void {
  statsMapCache = null;
  statsMapInflight = null;
}

export async function buildAudioCacheId(
  bookUrl: string,
  chapterIndex: number,
  segmentIndex: number,
  audioUrl: string,
  sourceId?: string,
): Promise<string> {
  const payload = `${bookUrl.trim()}\0${chapterIndex}\0${segmentIndex}\0${audioUrl.trim()}\0${sourceId ?? ''}`;
  const enc = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function segmentDirName(chapterIndex: number, segmentIndex: number): string {
  const ch = String(chapterIndex).padStart(5, '0');
  const seg = String(segmentIndex).padStart(3, '0');
  return `${ch}_${seg}`;
}

async function ensureAudioCacheDir(): Promise<string> {
  if (!isTauri()) return AUDIO_CACHE_SUBDIR;
  if (cachedRoot) return cachedRoot;
  const moduleRoot = await resolveModuleMediaRoot('music');
  const dir = await join(moduleRoot, AUDIO_CACHE_SUBDIR);
  const fs = await getFileSystem();
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, true);
  }
  cachedRoot = dir;
  return dir;
}

function openWebAudioDb(): Promise<IDBDatabase> {
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

async function webGetRecord(id: string): Promise<AudioCacheRecord | null> {
  const db = await openWebAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const request = tx.objectStore(WEB_STORE_NAME).get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as AudioCacheRecord) ?? null);
  });
}

async function webGetRecordsByBook(bookUrl: string): Promise<AudioCacheRecord[]> {
  const db = await openWebAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readonly');
    const index = tx.objectStore(WEB_STORE_NAME).index('bookUrl');
    const request = index.getAll(bookUrl.trim());
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
  });
}

async function webPutRecord(record: AudioCacheRecord): Promise<void> {
  const db = await openWebAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const request = tx.objectStore(WEB_STORE_NAME).put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function webDeleteRecord(id: string): Promise<void> {
  const db = await openWebAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const request = tx.objectStore(WEB_STORE_NAME).delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function webClearAll(): Promise<void> {
  const db = await openWebAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WEB_STORE_NAME], 'readwrite');
    const request = tx.objectStore(WEB_STORE_NAME).clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function parseMetaJson(raw: string): AudioCacheMeta | null {
  try {
    const parsed = JSON.parse(raw) as AudioCacheMeta;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.bookUrl === 'string' &&
      typeof parsed.chapterIndex === 'number' &&
      typeof parsed.segmentIndex === 'number' &&
      typeof parsed.audioUrl === 'string' &&
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

async function tauriTrackDir(
  root: string,
  bookKey: string,
  chapterIndex: number,
  segmentIndex: number,
): Promise<string> {
  const fs = await getFileSystem();
  const dir = await join(root, bookKey, segmentDirName(chapterIndex, segmentIndex));
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, true);
  }
  return dir;
}

function aggregateStats(metas: AudioCacheMeta[]): AudioCacheBookStats {
  return {
    trackCount: metas.length,
    estimatedBytes: metas.reduce((sum, m) => sum + (m.byteSize || 0), 0),
  };
}

export async function readAudioFromDisk(
  bookUrl: string,
  chapterIndex: number,
  segmentIndex: number,
  audioUrl: string,
  sourceId?: string,
): Promise<{ bytes: ArrayBuffer; meta: AudioCacheMeta } | null> {
  const id = await buildAudioCacheId(bookUrl, chapterIndex, segmentIndex, audioUrl, sourceId);
  if (!isTauri()) {
    const record = await webGetRecord(id);
    if (!record?.bytes?.byteLength) return null;
    return { bytes: record.bytes, meta: record.meta };
  }

  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const bookKey = await getMangaBookFolderKey(bookUrl);
  const dir = await join(root, bookKey, segmentDirName(chapterIndex, segmentIndex));
  const metaPath = await join(dir, META_FILE);
  const binPath = await join(dir, AUDIO_BIN_FILE);
  if (!(await fs.exists(metaPath)) || !(await fs.exists(binPath))) return null;
  const meta = parseMetaJson(await fs.readTextFile(metaPath));
  if (!meta) return null;
  const bytes = await fs.readFile(binPath);
  return { bytes, meta };
}

export async function writeAudioToDisk(
  meta: Omit<AudioCacheMeta, 'byteSize' | 'savedAt' | 'id'> & { id?: string },
  bytes: ArrayBuffer,
  mime: string,
): Promise<void> {
  if (!bytes.byteLength) return;
  const id =
    meta.id ??
    (await buildAudioCacheId(
      meta.bookUrl,
      meta.chapterIndex,
      meta.segmentIndex,
      meta.audioUrl,
      meta.sourceId,
    ));
  const fullMeta: AudioCacheMeta = {
    ...meta,
    id,
    mime,
    byteSize: bytes.byteLength,
    savedAt: Math.floor(Date.now() / 1000),
  };

  if (!isTauri()) {
    await webPutRecord({ id, bytes, meta: fullMeta });
    invalidateAudioCacheMetaIndex();
    return;
  }

  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const bookKey = await getMangaBookFolderKey(meta.bookUrl);
  const dir = await tauriTrackDir(root, bookKey, meta.chapterIndex, meta.segmentIndex);
  await fs.writeFile(await join(dir, AUDIO_BIN_FILE), bytes);
  await fs.writeTextFile(await join(dir, META_FILE), JSON.stringify(fullMeta));
  invalidateAudioCacheMetaIndex();
}

export async function listAudioRecordsForBook(bookUrl: string): Promise<AudioCacheMeta[]> {
  const trimmed = bookUrl.trim();
  if (!isTauri()) {
    const records = await webGetRecordsByBook(trimmed);
    return records
      .map((r) => r.meta)
      .sort((a, b) =>
        a.chapterIndex !== b.chapterIndex
          ? a.chapterIndex - b.chapterIndex
          : a.segmentIndex - b.segmentIndex,
      );
  }

  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const bookKey = await getMangaBookFolderKey(trimmed);
  const bookDir = await join(root, bookKey);
  if (!(await fs.exists(bookDir))) return [];
  const metas: AudioCacheMeta[] = [];
  for (const name of await fs.readDir(bookDir)) {
    if (!name || name === '.' || name === '..') continue;
    const metaPath = await join(bookDir, name, META_FILE);
    if (!(await fs.exists(metaPath))) continue;
    const meta = parseMetaJson(await fs.readTextFile(metaPath));
    if (meta?.bookUrl === trimmed) metas.push(meta);
  }
  return metas.sort((a, b) =>
    a.chapterIndex !== b.chapterIndex
      ? a.chapterIndex - b.chapterIndex
      : a.segmentIndex - b.segmentIndex,
  );
}

async function buildStatsMapUncached(): Promise<Map<string, AudioCacheBookStats>> {
  const map = new Map<string, AudioCacheBookStats>();
  if (!isTauri()) {
    const db = await openWebAudioDb();
    const records = await new Promise<AudioCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const request = tx.objectStore(WEB_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
    });
    for (const record of records) {
      const key = record.meta.bookUrl.trim();
      const prev = map.get(key) ?? { ...EMPTY_BOOK_STATS };
      map.set(key, {
        trackCount: prev.trackCount + 1,
        estimatedBytes: prev.estimatedBytes + (record.meta.byteSize || 0),
      });
    }
    return map;
  }

  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  if (!(await fs.exists(root))) return map;
  for (const bookKey of await fs.readDir(root)) {
    if (!bookKey || bookKey === '.' || bookKey === '..') continue;
    const metas = await listAudioRecordsForBookFromBookKey(root, bookKey);
    if (metas.length === 0) continue;
    map.set(metas[0]!.bookUrl.trim(), aggregateStats(metas));
  }
  return map;
}

async function listAudioRecordsForBookFromBookKey(
  root: string,
  bookKey: string,
): Promise<AudioCacheMeta[]> {
  const fs = await getFileSystem();
  const bookDir = await join(root, bookKey);
  if (!(await fs.exists(bookDir))) return [];
  const metas: AudioCacheMeta[] = [];
  for (const name of await fs.readDir(bookDir)) {
    const metaPath = await join(bookDir, name, META_FILE);
    if (!(await fs.exists(metaPath))) continue;
    const meta = parseMetaJson(await fs.readTextFile(metaPath));
    if (meta) metas.push(meta);
  }
  return metas;
}

async function getStatsMapCached(): Promise<Map<string, AudioCacheBookStats>> {
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

export async function getAudioCacheStatsMap(): Promise<Map<string, AudioCacheBookStats>> {
  return getStatsMapCached();
}

export async function getAudioCacheStatsForBook(
  bookUrl: string,
): Promise<AudioCacheBookStats> {
  const map = await getStatsMapCached();
  return map.get(bookUrl.trim()) ?? EMPTY_BOOK_STATS;
}

export function formatAudioCacheSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function clearAudioByBook(bookUrl: string): Promise<void> {
  const trimmed = bookUrl.trim();
  if (!isTauri()) {
    const records = await webGetRecordsByBook(trimmed);
    for (const record of records) {
      await webDeleteRecord(record.id);
    }
    invalidateAudioCacheMetaIndex();
    return;
  }

  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const bookKey = await getMangaBookFolderKey(trimmed);
  const bookDir = await join(root, bookKey);
  if (await fs.exists(bookDir)) {
    await fs.remove(bookDir, true);
  }
  invalidateAudioCacheMetaIndex();
}

export async function clearAllAudio(): Promise<void> {
  if (!isTauri()) {
    await webClearAll();
    invalidateAudioCacheMetaIndex();
    return;
  }
  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  if (await fs.exists(root)) {
    await fs.remove(root, true);
  }
  cachedRoot = null;
  invalidateAudioCacheMetaIndex();
}

export function createAudioObjectUrl(bytes: ArrayBuffer, mime: string): string {
  const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

const MUSIC_TRACK_PREFIX = 'music:';

export type MusicTrackCacheMeta = {
  trackId: string;
  sourceUrl: string;
  mime: string;
  byteSize: number;
  savedAt: number;
  cacheTier: import('@/lib/media/audio/music-cache-tier').MusicCacheTier;
  quality?: string;
};

export type MusicTrackCacheHit = {
  bytes: ArrayBuffer;
  mime: string;
  sourceUrl: string;
  cacheTier: import('@/lib/media/audio/music-cache-tier').MusicCacheTier;
  cachePath?: string;
};

/**
 * 曲目缓存 id（逻辑键）。磁盘目录名必须用 {@link musicTrackFsDirName}，
 * 不可直接 slice 本字符串——前缀 `music:` 在 Windows 上非法。
 * 不纳入 sourceUrl，避免 CDN 换链导致同曲多份/漏命中。
 */
export async function buildMusicTrackCacheId(
  trackId: string,
  _sourceUrl?: string,
): Promise<string> {
  return `${MUSIC_TRACK_PREFIX}${await buildAudioCacheId(trackId, 0, 0, '', 'music')}`;
}

/** 仅取 hash 前 16 位作目录名（不含 `music:`） */
function musicTrackFsDirName(cacheId: string): string {
  const hash = cacheId.startsWith(MUSIC_TRACK_PREFIX)
    ? cacheId.slice(MUSIC_TRACK_PREFIX.length)
    : cacheId;
  return hash.slice(0, 16);
}

function musicTrackBookUrl(trackId: string): string {
  return MUSIC_TRACK_PREFIX + trackId;
}

async function readMusicMetaFromDir(dir: string): Promise<AudioCacheMeta | null> {
  const fs = await getFileSystem();
  const metaPath = await join(dir, META_FILE);
  if (!(await fs.exists(metaPath))) return null;
  try {
    const metaText = new TextDecoder().decode(await fs.readFile(metaPath));
    return JSON.parse(metaText) as AudioCacheMeta;
  } catch {
    return null;
  }
}

async function readMusicHitFromDir(
  dir: string,
  relativeCachePath?: string,
): Promise<MusicTrackCacheHit | null> {
  const { normalizeMusicCacheTier } = await import('@/lib/media/audio/music-cache-tier');
  const fs = await getFileSystem();
  const binPath = await join(dir, AUDIO_BIN_FILE);
  if (!(await fs.exists(binPath))) return null;
  const raw = await fs.readFile(binPath);
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  if (!buf.byteLength) return null;
  let mime = 'audio/mpeg';
  let sourceUrl = '';
  let cacheTier: import('@/lib/media/audio/music-cache-tier').MusicCacheTier = 'auto';
  const meta = await readMusicMetaFromDir(dir);
  if (meta) {
    mime = meta.mime || mime;
    sourceUrl = meta.audioUrl || '';
    cacheTier = normalizeMusicCacheTier(meta.cacheTier);
  }
  return {
    bytes: buf,
    mime,
    sourceUrl,
    cacheTier,
    cachePath: relativeCachePath,
  };
}

async function readExistingMusicMeta(
  trackId: string,
): Promise<AudioCacheMeta | null> {
  const bookUrl = musicTrackBookUrl(trackId);
  if (!isTauri()) {
    const db = await openWebAudioDb();
    const records = await new Promise<AudioCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const index = tx.objectStore(WEB_STORE_NAME).index('bookUrl');
      const request = index.getAll(bookUrl);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
    });
    return records[0]?.meta ?? null;
  }
  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  // 优先稳定目录（按 trackId hash）
  const stableId = await buildMusicTrackCacheId(trackId);
  const stableDir = await join(root, 'music-tracks', musicTrackFsDirName(stableId));
  const stableMeta = await readMusicMetaFromDir(stableDir);
  if (stableMeta?.bookUrl === bookUrl) return stableMeta;
  // 兼容旧目录：全量扫 meta
  const musicDir = await join(root, 'music-tracks');
  if (!(await fs.exists(musicDir))) return null;
  for (const name of await fs.readDir(musicDir)) {
    if (!name) continue;
    const meta = await readMusicMetaFromDir(await join(musicDir, name));
    if (meta?.bookUrl === bookUrl) return meta;
  }
  return null;
}

async function syncTrackCacheIndex(options: {
  trackId: string;
  cachePath: string | null;
  cacheTier: import('@/lib/media/audio/music-cache-tier').MusicCacheTier | null;
  bytes: number;
  mime: string;
  quality?: string;
}): Promise<void> {
  try {
    const { updateAudioTrackCacheMeta } = await import('@/lib/database/audio-library');
    const ok = await updateAudioTrackCacheMeta(options.trackId, {
      cachePath: options.cachePath,
      cacheTier: options.cacheTier,
      cachedAt: options.cachePath ? Date.now() : null,
      cacheBytes: options.bytes || null,
      cacheMime: options.mime || null,
      cacheQuality: options.quality ?? null,
    });
    if (!ok && options.cachePath) {
      // 曲目尚未入库：暂存，等 upsertAudioTrack 后冲刷
      pendingTrackCacheMeta.set(options.trackId, { ...options });
    } else if (ok) {
      pendingTrackCacheMeta.delete(options.trackId);
      try {
        const { patchTrackInGroupTracksCaches } = await import(
          '@/lib/database/group-tracks-cache'
        );
        patchTrackInGroupTracksCaches(options.trackId, {
          meta: {
            ...(options.cacheTier ? { cacheTier: options.cacheTier } : {}),
            ...(options.cachePath ? { cachePath: options.cachePath } : {}),
          },
        });
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[music-cache] sync audio_tracks meta failed', err);
    if (options.cachePath) {
      pendingTrackCacheMeta.set(options.trackId, { ...options });
    }
  }
}

type PendingTrackCacheMeta = {
  trackId: string;
  cachePath: string | null;
  cacheTier: import('@/lib/media/audio/music-cache-tier').MusicCacheTier | null;
  bytes: number;
  mime: string;
  quality?: string;
};

/** 写盘成功但曲目尚未入库时的暂存索引 */
const pendingTrackCacheMeta = new Map<string, PendingTrackCacheMeta>();

/** 曲目入库后冲刷暂存的 cache meta */
export async function flushPendingTrackCacheMeta(trackId: string): Promise<boolean> {
  const pending = pendingTrackCacheMeta.get(trackId);
  if (!pending) return false;
  try {
    const { updateAudioTrackCacheMeta } = await import('@/lib/database/audio-library');
    const ok = await updateAudioTrackCacheMeta(pending.trackId, {
      cachePath: pending.cachePath,
      cacheTier: pending.cacheTier,
      cachedAt: pending.cachePath ? Date.now() : null,
      cacheBytes: pending.bytes || null,
      cacheMime: pending.mime || null,
      cacheQuality: pending.quality ?? null,
    });
    if (ok) {
      pendingTrackCacheMeta.delete(trackId);
      try {
        const { patchTrackInGroupTracksCaches } = await import(
          '@/lib/database/group-tracks-cache'
        );
        patchTrackInGroupTracksCaches(trackId, {
          meta: {
            ...(pending.cacheTier ? { cacheTier: pending.cacheTier } : {}),
            ...(pending.cachePath ? { cachePath: pending.cachePath } : {}),
          },
        });
      } catch {
        /* ignore */
      }
      return true;
    }
  } catch (err) {
    console.warn('[music-cache] flush pending meta failed', trackId.slice(0, 40), err);
  }
  return false;
}

async function backfillTrackCacheIndexIfNeeded(
  trackId: string,
  hit: MusicTrackCacheHit,
): Promise<void> {
  const rel = hit.cachePath?.trim();
  if (!rel) return;
  try {
    const { audioTrackNeedsCacheIndexBackfill } = await import('@/lib/database/audio-library');
    if (!(await audioTrackNeedsCacheIndexBackfill(trackId))) return;
    await syncTrackCacheIndex({
      trackId,
      cachePath: rel,
      cacheTier: hit.cacheTier,
      bytes: hit.bytes.byteLength,
      mime: hit.mime,
    });
  } catch {
    /* ignore */
  }
}

export async function cacheMusicTrackAudio(
  trackId: string,
  sourceUrl: string,
  bytes: ArrayBuffer,
  mime = 'audio/mpeg',
  options?: {
    tier?: import('@/lib/media/audio/music-cache-tier').MusicCacheTier;
    quality?: string;
  },
): Promise<string> {
  const { mergeMusicCacheTier, normalizeMusicCacheTier } = await import(
    '@/lib/media/audio/music-cache-tier'
  );
  const existing = await readExistingMusicMeta(trackId);
  const existingTier = existing?.cacheTier
    ? normalizeMusicCacheTier(existing.cacheTier)
    : undefined;
  const requested = options?.tier ?? 'auto';
  const tier = mergeMusicCacheTier(existingTier, requested);

  // 已有 manual 时不允许 auto 用更小/空内容覆盖文件体（仍更新索引 tier）
  if (existingTier === 'manual' && requested === 'auto' && existing) {
    const dirName = musicTrackFsDirName(existing.id || (await buildMusicTrackCacheId(trackId)));
    await syncTrackCacheIndex({
      trackId,
      cachePath: isTauri() ? `music-tracks/${dirName}` : null,
      cacheTier: 'manual',
      bytes: existing.byteSize || bytes.byteLength,
      mime: existing.mime || mime,
      quality: options?.quality,
    });
    return existing.id;
  }

  const id = await buildMusicTrackCacheId(trackId, sourceUrl);
  const meta: AudioCacheMeta = {
    id,
    bookUrl: musicTrackBookUrl(trackId),
    chapterIndex: 0,
    segmentIndex: 0,
    audioUrl: sourceUrl,
    sourceId: 'music',
    mime,
    byteSize: bytes.byteLength,
    savedAt: Date.now(),
    cacheTier: tier,
    quality: options?.quality,
  };
  let cachePath: string | null = null;
  if (!isTauri()) {
    await webPutRecord({ id, bytes, meta });
    invalidateAudioCacheMetaIndex();
  } else {
    const root = await ensureAudioCacheDir();
    const fs = await getFileSystem();
    const dirName = musicTrackFsDirName(id);
    const dir = await join(root, 'music-tracks', dirName);
    await fs.mkdir(dir, true);
    await fs.writeFile(await join(dir, AUDIO_BIN_FILE), new Uint8Array(bytes));
    await fs.writeFile(
      await join(dir, META_FILE),
      new TextEncoder().encode(JSON.stringify(meta)),
    );
    cachePath = `music-tracks/${dirName}`;
    invalidateAudioCacheMetaIndex();
  }
  await syncTrackCacheIndex({
    trackId,
    cachePath,
    cacheTier: tier,
    bytes: bytes.byteLength,
    mime,
    quality: options?.quality,
  });
  if (tier === 'auto' || requested === 'auto') {
    void evictAutoMusicTrackCachesIfNeeded().catch(() => undefined);
  }
  return id;
}

/** 按 savedAt 升序淘汰 auto 缓存直至低于容量上限 */
export async function evictAutoMusicTrackCachesIfNeeded(
  maxBytes = MAX_MUSIC_AUTO_CACHE_BYTES,
): Promise<number> {
  const { normalizeMusicCacheTier } = await import('@/lib/media/audio/music-cache-tier');
  type Entry = { id: string; trackId: string; savedAt: number; byteSize: number; dir?: string };
  const entries: Entry[] = [];

  if (!isTauri()) {
    const db = await openWebAudioDb();
    const all = await new Promise<AudioCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const request = tx.objectStore(WEB_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
    });
    for (const record of all) {
      if (!record.meta.bookUrl?.startsWith(MUSIC_TRACK_PREFIX)) continue;
      if (normalizeMusicCacheTier(record.meta.cacheTier) === 'manual') continue;
      entries.push({
        id: record.id,
        trackId: record.meta.bookUrl.slice(MUSIC_TRACK_PREFIX.length),
        savedAt: record.meta.savedAt || 0,
        byteSize: record.meta.byteSize || record.bytes.byteLength || 0,
      });
    }
  } else {
    const root = await ensureAudioCacheDir();
    const fs = await getFileSystem();
    const musicDir = await join(root, 'music-tracks');
    if (!(await fs.exists(musicDir))) return 0;
    for (const name of await fs.readDir(musicDir)) {
      const dir = await join(musicDir, name);
      const metaPath = await join(dir, META_FILE);
      if (!(await fs.exists(metaPath))) continue;
      try {
        const metaText = new TextDecoder().decode(await fs.readFile(metaPath));
        const meta = JSON.parse(metaText) as AudioCacheMeta;
        if (!meta.bookUrl?.startsWith(MUSIC_TRACK_PREFIX)) continue;
        if (normalizeMusicCacheTier(meta.cacheTier) === 'manual') continue;
        entries.push({
          id: meta.id,
          trackId: meta.bookUrl.slice(MUSIC_TRACK_PREFIX.length),
          savedAt: meta.savedAt || 0,
          byteSize: meta.byteSize || 0,
          dir,
        });
      } catch {
        // continue
      }
    }
  }

  let total = entries.reduce((s, e) => s + e.byteSize, 0);
  if (total <= maxBytes) return 0;
  entries.sort((a, b) => a.savedAt - b.savedAt);
  let removed = 0;
  for (const entry of entries) {
    if (total <= maxBytes) break;
    if (!isTauri()) {
      await webDeleteRecord(entry.id);
    } else if (entry.dir) {
      const fs = await getFileSystem();
      await fs.remove(entry.dir, true).catch(() => undefined);
    }
    await syncTrackCacheIndex({
      trackId: entry.trackId,
      cachePath: null,
      cacheTier: null,
      bytes: 0,
      mime: '',
    }).catch(() => {});
    total -= entry.byteSize;
    removed += 1;
  }
  if (removed) invalidateAudioCacheMetaIndex();
  return removed;
}

export async function getCachedMusicTrackAudio(
  trackId: string,
  sourceUrl: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (sourceUrl) {
    const hit = await getCachedMusicTrackAudioByKey(trackId, sourceUrl);
    if (hit) return hit;
  }
  const byId = await getCachedMusicTrackByTrackId(trackId);
  return byId ? { bytes: byId.bytes, mime: byId.mime } : null;
}

async function getCachedMusicTrackAudioByKey(
  trackId: string,
  sourceUrl: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  // 键已改为仅 trackId；sourceUrl 保留兼容签名
  void sourceUrl;
  const byId = await getCachedMusicTrackByTrackId(trackId);
  return byId ? { bytes: byId.bytes, mime: byId.mime } : null;
}

export async function getCachedMusicTrackByTrackId(
  trackId: string,
): Promise<MusicTrackCacheHit | null> {
  const { normalizeMusicCacheTier } = await import('@/lib/media/audio/music-cache-tier');
  const bookUrl = musicTrackBookUrl(trackId);
  if (!isTauri()) {
    const db = await openWebAudioDb();
    const records = await new Promise<AudioCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const index = tx.objectStore(WEB_STORE_NAME).index('bookUrl');
      const request = index.getAll(bookUrl);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
    });
    const record = records[0];
    if (!record?.bytes?.byteLength) return null;
    const hit: MusicTrackCacheHit = {
      bytes: record.bytes,
      mime: record.meta.mime || 'audio/mpeg',
      sourceUrl: record.meta.audioUrl,
      cacheTier: normalizeMusicCacheTier(record.meta.cacheTier),
    };
    // Web 无相对路径时仍写入 tier/bytes，便于列表徽章
    void backfillTrackCacheIndexIfNeeded(trackId, {
      ...hit,
      cachePath: `idb:${record.id}`,
    }).catch(() => undefined);
    return hit;
  }

  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();

  // 1) DB 索引路径（若曲目已入库）
  try {
    const { getDatabase } = await import('@/lib/database/database-core');
    const db = await getDatabase();
    const rows = await db.select<{ cache_path: string | null }>(
      'SELECT cache_path FROM audio_tracks WHERE id = ? LIMIT 1',
      [trackId],
    );
    const rel = rows[0]?.cache_path?.trim();
    if (rel && !rel.startsWith('idb:')) {
      const parts = rel.split(/[/\\]/).filter(Boolean);
      let dir = root;
      for (const p of parts) dir = await join(dir, p);
      const hit = await readMusicHitFromDir(dir, rel);
      if (hit) return hit;
    }
  } catch {
    // 索引不可用时回退扫盘
  }

  // 2) 稳定目录（按 trackId hash）
  const stableId = await buildMusicTrackCacheId(trackId);
  const dirName = musicTrackFsDirName(stableId);
  const stableRel = `music-tracks/${dirName}`;
  const stableHit = await readMusicHitFromDir(
    await join(root, 'music-tracks', dirName),
    stableRel,
  );
  if (stableHit) {
    // 校验 bookUrl，避免极端 hash 碰撞误读
    const meta = await readMusicMetaFromDir(await join(root, 'music-tracks', dirName));
    if (!meta || meta.bookUrl === bookUrl) {
      void backfillTrackCacheIndexIfNeeded(trackId, stableHit).catch(() => undefined);
      return stableHit;
    }
  }

  // 3) 兼容旧目录：按 bookUrl 扫 music-tracks
  const musicDir = await join(root, 'music-tracks');
  if (!(await fs.exists(musicDir))) return null;
  for (const name of await fs.readDir(musicDir)) {
    if (!name || name.includes(':')) continue; // 跳过非法/历史坏目录名
    const dir = await join(musicDir, name);
    const meta = await readMusicMetaFromDir(dir);
    if (!meta || meta.bookUrl !== bookUrl) continue;
    const hit = await readMusicHitFromDir(dir, `music-tracks/${name}`);
    if (hit) {
      void backfillTrackCacheIndexIfNeeded(trackId, hit).catch(() => undefined);
      return hit;
    }
  }
  return null;
}

/**
 * 扫描磁盘 music-tracks，将已入库曲目的 cache meta 回填到 audio_tracks。
 * 兼容换源：磁盘可能挂在备用源 id 上，而列表曲目是原 id（meta.toggleMusicInfo）。
 */
export async function reconcileMusicTrackCacheIndex(): Promise<{
  scanned: number;
  updated: number;
  skipped: number;
}> {
  const { normalizeMusicCacheTier } = await import('@/lib/media/audio/music-cache-tier');
  const {
    audioTrackNeedsCacheIndexBackfill,
    updateAudioTrackCacheMeta,
    listAudioTracksMissingCacheIndex,
  } = await import('@/lib/database/audio-library');

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  type DiskEntry = {
    trackId: string;
    cachePath: string;
    cacheTier: import('@/lib/media/audio/music-cache-tier').MusicCacheTier;
    bytes: number;
    mime: string;
    quality?: string;
    savedAt: number;
  };

  const diskByTrackId = new Map<string, DiskEntry>();

  const rememberDisk = (entry: DiskEntry) => {
    const prev = diskByTrackId.get(entry.trackId);
    if (!prev || entry.bytes >= prev.bytes) diskByTrackId.set(entry.trackId, entry);
  };

  const applyEntry = async (listTrackId: string, entry: DiskEntry): Promise<boolean> => {
    if (!(await audioTrackNeedsCacheIndexBackfill(listTrackId))) return false;
    return updateAudioTrackCacheMeta(listTrackId, {
      cachePath: entry.cachePath,
      cacheTier: entry.cacheTier,
      cachedAt: entry.savedAt || Date.now(),
      cacheBytes: entry.bytes || null,
      cacheMime: entry.mime || 'audio/mpeg',
      cacheQuality: entry.quality ?? null,
    });
  };

  if (!isTauri()) {
    const db = await openWebAudioDb();
    const all = await new Promise<AudioCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const request = tx.objectStore(WEB_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
    });
    for (const record of all) {
      if (!record.meta.bookUrl?.startsWith(MUSIC_TRACK_PREFIX)) continue;
      scanned += 1;
      const trackId = record.meta.bookUrl.slice(MUSIC_TRACK_PREFIX.length);
      rememberDisk({
        trackId,
        cachePath: `idb:${record.id}`,
        cacheTier: normalizeMusicCacheTier(record.meta.cacheTier),
        bytes: record.meta.byteSize || record.bytes?.byteLength || 0,
        mime: record.meta.mime || 'audio/mpeg',
        quality: record.meta.quality,
        savedAt: record.meta.savedAt || Date.now(),
      });
    }
  } else {
    const root = await ensureAudioCacheDir();
    const fs = await getFileSystem();
    const musicDir = await join(root, 'music-tracks');
    if (await fs.exists(musicDir)) {
      for (const name of await fs.readDir(musicDir)) {
        if (!name || name.includes(':')) continue;
        const dir = await join(musicDir, name);
        const meta = await readMusicMetaFromDir(dir);
        if (!meta?.bookUrl?.startsWith(MUSIC_TRACK_PREFIX)) continue;
        scanned += 1;
        const trackId = meta.bookUrl.slice(MUSIC_TRACK_PREFIX.length);
        const binPath = await join(dir, AUDIO_BIN_FILE);
        let bytes = meta.byteSize || 0;
        if (!bytes && (await fs.exists(binPath))) {
          try {
            bytes = await fs.getFileSize(binPath);
          } catch {
            /* ignore */
          }
        }
        rememberDisk({
          trackId,
          cachePath: `music-tracks/${name}`,
          cacheTier: normalizeMusicCacheTier(meta.cacheTier),
          bytes,
          mime: meta.mime || 'audio/mpeg',
          quality: meta.quality,
          savedAt: meta.savedAt || Date.now(),
        });
      }
    }
  }

  // 1) 磁盘 bookUrl 对应曲目直接回填
  for (const entry of diskByTrackId.values()) {
    if (await applyEntry(entry.trackId, entry)) updated += 1;
    else skipped += 1;
  }

  // 2) 缺索引的列表曲：按自身 id / toggleMusicInfo.id 关联磁盘
  const missing = await listAudioTracksMissingCacheIndex();
  for (const row of missing) {
    const toggleRaw = row.meta.toggleMusicInfo;
    const toggleId =
      toggleRaw &&
      typeof toggleRaw === 'object' &&
      typeof (toggleRaw as { id?: unknown }).id === 'string'
        ? String((toggleRaw as { id: string }).id).trim()
        : '';

    let entry =
      diskByTrackId.get(row.id) ?? (toggleId ? diskByTrackId.get(toggleId) : undefined);

    // 稳定 hash 目录（磁盘 meta 可能挂在备用源 id，但文件已在本曲 hash 下）
    if (!entry && isTauri()) {
      const stableId = await buildMusicTrackCacheId(row.id);
      const dirName = musicTrackFsDirName(stableId);
      const root = await ensureAudioCacheDir();
      const dir = await join(root, 'music-tracks', dirName);
      const meta = await readMusicMetaFromDir(dir);
      if (meta) {
        entry = {
          trackId: row.id,
          cachePath: `music-tracks/${dirName}`,
          cacheTier: normalizeMusicCacheTier(meta.cacheTier),
          bytes: meta.byteSize || 0,
          mime: meta.mime || 'audio/mpeg',
          quality: meta.quality,
          savedAt: meta.savedAt || Date.now(),
        };
      }
    }

    if (!entry) continue;
    if (await applyEntry(row.id, entry)) updated += 1;
  }

  return { scanned, updated, skipped };
}

/** 仅清除 auto 级音乐曲目缓存；manual 保留 */
export async function clearAutoMusicTrackCaches(): Promise<number> {
  const { normalizeMusicCacheTier } = await import('@/lib/media/audio/music-cache-tier');
  let removed = 0;
  if (!isTauri()) {
    const db = await openWebAudioDb();
    const all = await new Promise<AudioCacheRecord[]>((resolve, reject) => {
      const tx = db.transaction([WEB_STORE_NAME], 'readonly');
      const request = tx.objectStore(WEB_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as AudioCacheRecord[]) ?? []);
    });
    for (const record of all) {
      if (!record.meta.bookUrl?.startsWith(MUSIC_TRACK_PREFIX)) continue;
      if (normalizeMusicCacheTier(record.meta.cacheTier) === 'manual') continue;
      await webDeleteRecord(record.id);
      removed += 1;
      const trackId = record.meta.bookUrl.slice(MUSIC_TRACK_PREFIX.length);
      await syncTrackCacheIndex({
        trackId,
        cachePath: null,
        cacheTier: null,
        bytes: 0,
        mime: '',
      }).catch(() => {});
    }
    invalidateAudioCacheMetaIndex();
    return removed;
  }
  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const musicDir = await join(root, 'music-tracks');
  if (!(await fs.exists(musicDir))) return 0;
  for (const name of await fs.readDir(musicDir)) {
    const dir = await join(musicDir, name);
    const metaPath = await join(dir, META_FILE);
    if (!(await fs.exists(metaPath))) continue;
    try {
      const metaText = new TextDecoder().decode(await fs.readFile(metaPath));
      const meta = JSON.parse(metaText) as AudioCacheMeta;
      if (!meta.bookUrl?.startsWith(MUSIC_TRACK_PREFIX)) continue;
      if (normalizeMusicCacheTier(meta.cacheTier) === 'manual') continue;
      await fs.remove(dir, true);
      removed += 1;
      const trackId = meta.bookUrl.slice(MUSIC_TRACK_PREFIX.length);
      await syncTrackCacheIndex({
        trackId,
        cachePath: null,
        cacheTier: null,
        bytes: 0,
        mime: '',
      }).catch(() => {});
    } catch {
      // continue
    }
  }
  invalidateAudioCacheMetaIndex();
  return removed;
}
