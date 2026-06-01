/**
 * 视频章节播放链接缓存（对齐 Legado VideoPlay.chapterLinkCache，TTL 30 分钟）
 */

import type { Book, BookChapter } from '@/types';

export const VIDEO_CHAPTER_CACHE_TTL_MS = 30 * 60 * 1000;

export interface CachedVideoChapterPlayback {
  urls: string[];
  primaryUrl: string;
  createdAt: number;
}

const cache = new Map<string, CachedVideoChapterPlayback>();
const preloadingKeys = new Set<string>();

export function buildVideoChapterCacheKey(book: Book, chapter: BookChapter): string {
  return `${book.origin}|${book.bookUrl}|${chapter.url}|${chapter.index}`;
}

export function getCachedVideoChapterPlayback(
  key: string,
): CachedVideoChapterPlayback | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > VIDEO_CHAPTER_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setCachedVideoChapterPlayback(
  key: string,
  entry: Omit<CachedVideoChapterPlayback, 'createdAt'>,
): void {
  cache.set(key, { ...entry, createdAt: Date.now() });
}

export function invalidateVideoChapterCacheKey(key: string): void {
  cache.delete(key);
}

export function clearVideoChapterCache(): void {
  cache.clear();
  preloadingKeys.clear();
}

export function tryBeginVideoPreload(key: string): boolean {
  if (getCachedVideoChapterPlayback(key)) return false;
  if (preloadingKeys.has(key)) return false;
  preloadingKeys.add(key);
  return true;
}

export function endVideoPreload(key: string): void {
  preloadingKeys.delete(key);
}
