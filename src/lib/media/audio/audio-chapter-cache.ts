/**
 * 音频章节播放链接缓存（对齐 Legado / video-chapter-cache，TTL 30 分钟）
 */

import type { Book, BookChapter } from '@/types';

export const AUDIO_CHAPTER_CACHE_TTL_MS = 30 * 60 * 1000;

export interface CachedAudioChapterPlayback {
  urls: string[];
  primaryUrl: string;
  createdAt: number;
}

const cache = new Map<string, CachedAudioChapterPlayback>();

export function buildAudioChapterCacheKey(book: Book, chapter: BookChapter): string {
  return `${book.origin}|${book.bookUrl}|${chapter.url}|${chapter.index}`;
}

export function getCachedAudioChapterPlayback(
  key: string,
): CachedAudioChapterPlayback | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > AUDIO_CHAPTER_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setCachedAudioChapterPlayback(
  key: string,
  entry: Omit<CachedAudioChapterPlayback, 'createdAt'>,
): void {
  cache.set(key, { ...entry, createdAt: Date.now() });
}

export function invalidateAudioChapterCacheKey(key: string): void {
  cache.delete(key);
}

export function clearAudioChapterCache(): void {
  cache.clear();
}
