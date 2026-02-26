/**
 * 页面数据缓存 Store
 * 用于缓存发现页和书籍信息页的数据，避免页面切换时重新加载
 */

import { createStore } from 'solid-js/store';
import type { SearchBook } from '@/types';

interface DiscoverPageCache {
  sourceId: string;
  sectionUrl: string;
  books: SearchBook[];
  page: number;
  allBooks: SearchBook[];
  timestamp: number;
}

interface BookInfoCache {
  bookUrl: string;
  book: SearchBook;
  timestamp: number;
}

interface PageCacheState {
  discover: Map<string, DiscoverPageCache>;
  bookInfo: Map<string, BookInfoCache>;
}

const CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟过期

function getDiscoverCacheKey(sourceId: string, sectionUrl: string): string {
  return `${sourceId}:${sectionUrl}`;
}

function getBookInfoCacheKey(bookUrl: string): string {
  return bookUrl;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_EXPIRY;
}

const [state, setState] = createStore<PageCacheState>({
  discover: new Map(),
  bookInfo: new Map(),
});

export const pageCacheStore = {
  // 发现页缓存
  getDiscoverCache(sourceId: string, sectionUrl: string): DiscoverPageCache | null {
    const key = getDiscoverCacheKey(sourceId, sectionUrl);
    const cache = state.discover.get(key);
    if (cache && isCacheValid(cache.timestamp)) {
      return cache;
    }
    return null;
  },

  setDiscoverCache(
    sourceId: string,
    sectionUrl: string,
    books: SearchBook[],
    page: number = 1,
    allBooks: SearchBook[] = []
  ): void {
    const key = getDiscoverCacheKey(sourceId, sectionUrl);
    setState('discover', (prev) => {
      const newMap = new Map(prev);
      newMap.set(key, {
        sourceId,
        sectionUrl,
        books,
        page,
        allBooks,
        timestamp: Date.now(),
      });
      return newMap;
    });
  },

  updateDiscoverCache(
    sourceId: string,
    sectionUrl: string,
    updater: (cache: DiscoverPageCache) => DiscoverPageCache
  ): void {
    const key = getDiscoverCacheKey(sourceId, sectionUrl);
    setState('discover', (prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key);
      if (existing) {
        newMap.set(key, updater(existing));
      }
      return newMap;
    });
  },

  clearDiscoverCache(sourceId?: string, sectionUrl?: string): void {
    if (sourceId && sectionUrl) {
      const key = getDiscoverCacheKey(sourceId, sectionUrl);
      setState('discover', (prev) => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
    } else {
      setState('discover', new Map());
    }
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

  setBookInfoCache(bookUrl: string, book: SearchBook): void {
    const key = getBookInfoCacheKey(bookUrl);
    setState('bookInfo', (prev) => {
      const newMap = new Map(prev);
      newMap.set(key, {
        bookUrl,
        book,
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
    setState('discover', (prev) => {
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
