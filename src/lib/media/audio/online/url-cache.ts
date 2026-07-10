/**
 * 在线音乐 URL 缓存
 */

import {
  cacheTrackUrl,
  clearTrackUrlCache,
  getCachedTrackUrl,
} from '@/lib/database/audio-library';

export async function getOrFetchTrackUrl(
  trackId: string,
  fetcher: () => Promise<string | null>,
  ttlMs?: number,
  options?: { skipCache?: boolean },
): Promise<string | null> {
  if (!options?.skipCache) {
    const cached = await getCachedTrackUrl(trackId);
    if (cached) return cached;
  }
  const url = await fetcher();
  if (url) await cacheTrackUrl(trackId, url, ttlMs);
  return url;
}

export async function invalidateTrackUrlCache(trackId: string): Promise<void> {
  await clearTrackUrlCache(trackId);
}

export { getCachedTrackUrl, cacheTrackUrl, clearTrackUrlCache };
