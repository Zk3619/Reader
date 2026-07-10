/**
 * 听书章节音频 L2 磁盘缓存
 * Tauri：{appData}/audio-cache/{bookKey}/{chapterIndex}_{segmentIndex}/audio.bin + meta.json
 * Web：IndexedDB reader-audio-cache-v1
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { getMangaBookFolderKey } from '@/lib/media/image/image-cache-path';

const AUDIO_CACHE_SUBDIR = 'audio-cache';
const AUDIO_BIN_FILE = 'audio.bin';
const META_FILE = 'meta.json';

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
  const appDir = await getAppDataDir();
  const dir = await join(appDir, AUDIO_CACHE_SUBDIR);
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
};

export async function buildMusicTrackCacheId(trackId: string, sourceUrl: string): Promise<string> {
  return `${MUSIC_TRACK_PREFIX}${await buildAudioCacheId(trackId, 0, 0, sourceUrl, 'music')}`;
}

export async function cacheMusicTrackAudio(
  trackId: string,
  sourceUrl: string,
  bytes: ArrayBuffer,
  mime = 'audio/mpeg',
): Promise<string> {
  const id = await buildMusicTrackCacheId(trackId, sourceUrl);
  const meta: AudioCacheMeta = {
    id,
    bookUrl: MUSIC_TRACK_PREFIX + trackId,
    chapterIndex: 0,
    segmentIndex: 0,
    audioUrl: sourceUrl,
    sourceId: 'music',
    mime,
    byteSize: bytes.byteLength,
    savedAt: Date.now(),
  };
  if (!isTauri()) {
    await webPutRecord({ id, bytes, meta });
    invalidateAudioCacheMetaIndex();
    return id;
  }
  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const dir = await join(root, 'music-tracks', id.slice(0, 16));
  await fs.mkdir(dir, true);
  await fs.writeFile(await join(dir, AUDIO_BIN_FILE), new Uint8Array(bytes));
  await fs.writeFile(
    await join(dir, META_FILE),
    new TextEncoder().encode(JSON.stringify(meta)),
  );
  invalidateAudioCacheMetaIndex();
  return id;
}

export async function getCachedMusicTrackAudio(
  trackId: string,
  sourceUrl: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (sourceUrl) {
    const hit = await getCachedMusicTrackAudioByKey(trackId, sourceUrl);
    if (hit) return hit;
  }
  return getCachedMusicTrackByTrackId(trackId);
}

async function getCachedMusicTrackAudioByKey(
  trackId: string,
  sourceUrl: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const id = await buildMusicTrackCacheId(trackId, sourceUrl);
  if (!isTauri()) {
    const record = await webGetRecord(id);
    if (!record) return null;
    return { bytes: record.bytes, mime: record.meta.mime || 'audio/mpeg' };
  }
  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const dir = await join(root, 'music-tracks', id.slice(0, 16));
  const binPath = await join(dir, AUDIO_BIN_FILE);
  if (!(await fs.exists(binPath))) return null;
  const raw = await fs.readFile(binPath);
  const metaPath = await join(dir, META_FILE);
  let mime = 'audio/mpeg';
  if (await fs.exists(metaPath)) {
    try {
      const metaText = new TextDecoder().decode(await fs.readFile(metaPath));
      const parsed = JSON.parse(metaText) as AudioCacheMeta;
      mime = parsed.mime || mime;
    } catch {
      // ignore
    }
  }
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  return { bytes: buf, mime };
}

export async function getCachedMusicTrackByTrackId(
  trackId: string,
): Promise<{ bytes: ArrayBuffer; mime: string; sourceUrl: string } | null> {
  const bookUrl = MUSIC_TRACK_PREFIX + trackId;
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
    return {
      bytes: record.bytes,
      mime: record.meta.mime || 'audio/mpeg',
      sourceUrl: record.meta.audioUrl,
    };
  }
  const root = await ensureAudioCacheDir();
  const fs = await getFileSystem();
  const musicDir = await join(root, 'music-tracks');
  if (!(await fs.exists(musicDir))) return null;
  for (const name of await fs.readDir(musicDir)) {
    const metaPath = await join(musicDir, name, META_FILE);
    if (!(await fs.exists(metaPath))) continue;
    try {
      const metaText = new TextDecoder().decode(await fs.readFile(metaPath));
      const meta = JSON.parse(metaText) as AudioCacheMeta;
      if (meta.bookUrl !== bookUrl) continue;
      const binPath = await join(musicDir, name, AUDIO_BIN_FILE);
      const raw = await fs.readFile(binPath);
      const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
      const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      return { bytes: buf, mime: meta.mime || 'audio/mpeg', sourceUrl: meta.audioUrl };
    } catch {
      // continue
    }
  }
  return null;
}
