import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';

const MAX_ENTRIES = 12;

const cache = new Map<string, ReaderChapterLayout>();

export function getCachedChapterLayout(cacheKey: string): ReaderChapterLayout | undefined {
  const hit = cache.get(cacheKey);
  if (!hit) return undefined;
  cache.delete(cacheKey);
  cache.set(cacheKey, hit);
  return hit;
}

export function setCachedChapterLayout(cacheKey: string, layout: ReaderChapterLayout): void {
  if (cache.has(cacheKey)) cache.delete(cacheKey);
  cache.set(cacheKey, { ...layout, cacheKey });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function clearChapterLayoutCache(): void {
  cache.clear();
}

/** @internal 测试用 */
export function chapterLayoutCacheSize(): number {
  return cache.size;
}
