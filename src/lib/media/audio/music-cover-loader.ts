/**
 * 音乐封面加载：L1 内存 → L2 磁盘/IDB → L3 网络（经 request，避免外站直连）。
 */

import { request } from '@/lib/http';
import {
  readMusicCoverFromDisk,
  resolveMusicCoverCacheKey,
  writeMusicCoverToDisk,
} from '@/lib/media/audio/music-cover-disk-cache';

const MAX_L1 = 256;
const l1BlobByKey = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function rememberL1(cacheKey: string, blobUrl: string): void {
  if (l1BlobByKey.has(cacheKey)) {
    const prev = l1BlobByKey.get(cacheKey);
    if (prev && prev !== blobUrl) URL.revokeObjectURL(prev);
    l1BlobByKey.delete(cacheKey);
  }
  l1BlobByKey.set(cacheKey, blobUrl);
  while (l1BlobByKey.size > MAX_L1) {
    const oldest = l1BlobByKey.keys().next().value;
    if (!oldest) break;
    const url = l1BlobByKey.get(oldest);
    l1BlobByKey.delete(oldest);
    if (url) URL.revokeObjectURL(url);
  }
}

function sniffMime(bytes: ArrayBuffer, headerMime?: string | null): string {
  const header = headerMime?.split(';')[0]?.trim().toLowerCase();
  if (header && header.startsWith('image/') && header !== 'image/*') return header;
  const u8 = new Uint8Array(bytes);
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    u8.length >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47
  ) {
    return 'image/png';
  }
  if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
    return 'image/gif';
  }
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function bytesToBlobUrl(bytes: ArrayBuffer, mime: string): string {
  const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
  return URL.createObjectURL(blob);
}

export type MusicCoverLoadOptions = {
  coverUrl?: string | null;
  trackId?: string | null;
  playlistSource?: string | null;
  playlistId?: string | null;
  /** 显式缓存键；缺省由 track/playlist/url 推导 */
  cacheKey?: string | null;
};

export function peekMusicCoverBlob(cacheKey: string | null | undefined): string | null {
  const key = cacheKey?.trim();
  if (!key) return null;
  return l1BlobByKey.get(key) ?? null;
}

export async function loadMusicCoverBlob(
  options: MusicCoverLoadOptions,
): Promise<string | null> {
  const coverUrl = options.coverUrl?.trim() ?? '';
  if (!coverUrl) return null;
  if (coverUrl.startsWith('blob:') || coverUrl.startsWith('data:')) return coverUrl;

  const cacheKey =
    options.cacheKey?.trim() ||
    resolveMusicCoverCacheKey({
      trackId: options.trackId,
      playlistSource: options.playlistSource,
      playlistId: options.playlistId,
      coverUrl,
    });
  if (!cacheKey) return null;

  const cached = l1BlobByKey.get(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    try {
      const disk = await readMusicCoverFromDisk(cacheKey);
      if (disk?.bytes && disk.bytes.byteLength > 0) {
        const blobUrl = bytesToBlobUrl(disk.bytes, disk.meta.mime);
        rememberL1(cacheKey, blobUrl);
        return blobUrl;
      }

      const res = await request(coverUrl, {
        timeout: 15_000,
        ignorePageNavigationAbort: true,
        useBackendHttp: true,
      });
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength < 32) return null;
      const mime = sniffMime(
        bytes,
        res.headers['content-type'] ?? res.headers['Content-Type'],
      );
      void writeMusicCoverToDisk(cacheKey, coverUrl, bytes, mime).catch(() => undefined);
      const blobUrl = bytesToBlobUrl(bytes, mime);
      rememberL1(cacheKey, blobUrl);
      return blobUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, task);
  return task;
}

/** 清除 L1 内存 blob（磁盘清理后调用） */
export function clearMusicCoverMemoryCache(): void {
  for (const url of l1BlobByKey.values()) {
    URL.revokeObjectURL(url);
  }
  l1BlobByKey.clear();
  inflight.clear();
}
