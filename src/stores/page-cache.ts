/**
 * 页面数据缓存 Store
 * 用于缓存发现页和书籍信息页的数据，避免页面切换时重新加载
 */

import { createStore } from 'solid-js/store';
import type { BookChapter, SearchBook } from '@/types';

interface ExplorePageCache {
  sourceId: string;
  sectionUrl: string;
  books: SearchBook[];
  page: number;
  allBooks: SearchBook[];
  /** false 表示已加载至末页，滚动加载不应再触发 */
  hasMore?: boolean;
  timestamp: number;
}

interface BookInfoCache {
  bookUrl: string;
  book: SearchBook;
  /** 详情页预加载的目录（重进时同步恢复，避免目录行闪「加载中」） */
  chapters?: BookChapter[];
  timestamp: number;
}

interface PageCacheState {
  explore: Map<string, ExplorePageCache>;
  bookInfo: Map<string, BookInfoCache>;
}

const CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟过期

function getExploreCacheKey(sourceId: string, sectionUrl: string): string {
  return `${sourceId}:${sectionUrl}`;
}

function getBookInfoCacheKey(bookUrl: string): string {
  return bookUrl;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_EXPIRY;
}

const [state, setState] = createStore<PageCacheState>({
  explore: new Map(),
  bookInfo: new Map(),
});

export const pageCacheStore = {
  // 发现页缓存
  getExploreCache(sourceId: string, sectionUrl: string): ExplorePageCache | null {
    const key = getExploreCacheKey(sourceId, sectionUrl);
    const cache = state.explore.get(key);
    if (cache && isCacheValid(cache.timestamp)) {
      return cache;
    }
    return null;
  },

  setExploreCache(
    sourceId: string,
    sectionUrl: string,
    books: SearchBook[],
    page: number = 1,
    allBooks: SearchBook[] = [],
    hasMore: boolean = true,
  ): void {
    const key = getExploreCacheKey(sourceId, sectionUrl);
    setState('explore', (prev) => {
      const newMap = new Map(prev);
      newMap.set(key, {
        sourceId,
        sectionUrl,
        books,
        page,
        allBooks,
        hasMore,
        timestamp: Date.now(),
      });
      return newMap;
    });
  },

  updateExploreCache(
    sourceId: string,
    sectionUrl: string,
    updater: (cache: ExplorePageCache) => ExplorePageCache
  ): void {
    const key = getExploreCacheKey(sourceId, sectionUrl);
    setState('explore', (prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key);
      if (existing) {
        newMap.set(key, updater(existing));
      }
      return newMap;
    });
  },

  clearExploreCache(sourceId?: string, sectionUrl?: string): void {
    if (sourceId && sectionUrl) {
      const key = getExploreCacheKey(sourceId, sectionUrl);
      setState('explore', (prev) => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
    } else {
      setState('explore', new Map());
    }
  },

  /** 清除某书源下全部分类列表页缓存（删除书源时调用） */
  clearExploreCacheForSource(sourceId: string): void {
    const id = sourceId.trim();
    if (!id) return;
    const prefix = `${id}:`;
    setState('explore', (prev) => {
      const newMap = new Map(prev);
      for (const key of newMap.keys()) {
        if (key.startsWith(prefix)) newMap.delete(key);
      }
      return newMap;
    });
  },

  // 书籍信息页缓存
  getBookInfoCache(bookUrl: string): BookInfoCache | null {
    const key = getBookInfoCacheKey(bookUrl);
    const cache = state.bookInfo.get(key);
    if (cache && isCacheValid(cache.timestamp)) {
      return cache;
    }
    return null;
  },

  setBookInfoCache(bookUrl: string, book: SearchBook, chapters?: BookChapter[]): void {
    const key = getBookInfoCacheKey(bookUrl);
    setState('bookInfo', (prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key);
      newMap.set(key, {
        bookUrl,
        book,
        chapters: chapters ?? existing?.chapters,
        timestamp: Date.now(),
      });
      return newMap;
    });
  },

  setBookInfoTocCache(bookUrl: string, chapters: BookChapter[]): void {
    if (chapters.length === 0) return;
    const key = getBookInfoCacheKey(bookUrl);
    setState('bookInfo', (prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key);
      if (!existing) return prev;
      newMap.set(key, {
        ...existing,
        chapters,
        timestamp: Date.now(),
      });
      return newMap;
    });
  },

  clearBookInfoCache(bookUrl?: string): void {
    if (bookUrl) {
      const key = getBookInfoCacheKey(bookUrl);
      setState('bookInfo', (prev) => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
    } else {
      setState('bookInfo', new Map());
    }
  },

  // 清理所有过期缓存
  clearExpiredCache(): void {
    setState('explore', (prev) => {
      const newMap = new Map();
      for (const [key, cache] of prev.entries()) {
        if (isCacheValid(cache.timestamp)) {
          newMap.set(key, cache);
        }
      }
      return newMap;
    });

    setState('bookInfo', (prev) => {
      const newMap = new Map();
      for (const [key, cache] of prev.entries()) {
        if (isCacheValid(cache.timestamp)) {
          newMap.set(key, cache);
        }
      }
      return newMap;
    });
  },
};

// 定期清理过期缓存（每10分钟）
if (typeof window !== 'undefined') {
  setInterval(() => {
    pageCacheStore.clearExpiredCache();
  }, 10 * 60 * 1000);
}
