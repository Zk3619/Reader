/**
 * Folo 发现页内存缓存：TTL + inflight 去重，避免分类/频道切换闪旧数据与重复请求。
 */

import { isAbortError } from '@/lib/http';
import type {
  FoloRsshubAnalyticsIndex,
  FoloRsshubIndex,
  FoloTrendingItem,
  FoloTrendingLanguage,
  FoloTrendingRange,
} from '@/lib/subscribe/folo-cloud';
import type { SubscribeFeedViewKind } from '@/lib/subscribe/feed-view';
import { subscribeFeedViewKindToNumber } from '@/lib/subscribe/feed-view';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 32;

type CacheEntry<T> = { data: T; at: number };

function peekMap<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    map.delete(key);
    return undefined;
  }
  // LRU: re-insert
  map.delete(key);
  map.set(key, entry);
  return entry.data;
}

function putMap<T>(map: Map<string, CacheEntry<T>>, key: string, data: T): void {
  if (map.has(key)) map.delete(key);
  map.set(key, { data, at: Date.now() });
  while (map.size > CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
}

async function getOrFetchMap<T>(
  cache: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; _retriedAfterAbort?: boolean },
): Promise<T> {
  if (!options?.force) {
    const hit = peekMap(cache, key);
    if (hit !== undefined) return hit;
  }

  const pending = inflight.get(key);
  if (pending) {
    try {
      return await pending;
    } catch (error) {
      // 复用了已被页面导航取消的 inflight：警告并强制重拉一次
      if (isAbortError(error) && !options?._retriedAfterAbort) {
        console.warn('[folo-discover-cache] inflight 请求已取消，重新拉取', key, error);
        return getOrFetchMap(cache, inflight, key, fetcher, {
          force: true,
          _retriedAfterAbort: true,
        });
      }
      throw error;
    }
  }

  const task = fetcher()
    .then((data) => {
      putMap(cache, key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, task);

  try {
    return await task;
  } catch (error) {
    if (isAbortError(error) && !options?._retriedAfterAbort) {
      console.warn('[folo-discover-cache] 请求已取消，重新拉取', key, error);
      return getOrFetchMap(cache, inflight, key, fetcher, {
        force: true,
        _retriedAfterAbort: true,
      });
    }
    throw error;
  }
}

const trendingCache = new Map<string, CacheEntry<FoloTrendingItem[]>>();
const trendingInflight = new Map<string, Promise<FoloTrendingItem[]>>();
const rsshubCache = new Map<string, CacheEntry<FoloRsshubIndex>>();
const rsshubInflight = new Map<string, Promise<FoloRsshubIndex>>();
const analyticsCache = new Map<string, CacheEntry<FoloRsshubAnalyticsIndex>>();
const analyticsInflight = new Map<string, Promise<FoloRsshubAnalyticsIndex>>();

export type TrendingDiscoverCacheOpts = {
  language: FoloTrendingLanguage | 'all';
  view: SubscribeFeedViewKind;
  range?: FoloTrendingRange;
  limit?: number;
};

export function makeTrendingDiscoverCacheKey(opts: TrendingDiscoverCacheOpts): string {
  const viewN = subscribeFeedViewKindToNumber(opts.view);
  const range = opts.range ?? '7d';
  const limit = opts.limit ?? 24;
  return `trending:${opts.language}:${viewN ?? 'all'}:${range}:${limit}`;
}

export function makeRsshubDiscoverCacheKey(opts: {
  category: string;
  lang?: string;
}): string {
  const lang = opts.lang?.trim() || 'all';
  return `rsshub:${opts.category || 'all'}:${lang}`;
}

const ANALYTICS_CACHE_KEY = 'rsshub-analytics';

export function peekTrendingDiscoverCache(key: string): FoloTrendingItem[] | undefined {
  return peekMap(trendingCache, key);
}

export function peekRsshubDiscoverCache(key: string): FoloRsshubIndex | undefined {
  return peekMap(rsshubCache, key);
}

export function peekRsshubAnalyticsCache(): FoloRsshubAnalyticsIndex | undefined {
  return peekMap(analyticsCache, ANALYTICS_CACHE_KEY);
}

export async function getOrFetchTrendingDiscover(
  key: string,
  fetcher: () => Promise<FoloTrendingItem[]>,
  options?: { force?: boolean },
): Promise<FoloTrendingItem[]> {
  return getOrFetchMap(trendingCache, trendingInflight, key, fetcher, options);
}

export async function getOrFetchRsshubDiscover(
  key: string,
  fetcher: () => Promise<FoloRsshubIndex>,
  options?: { force?: boolean },
): Promise<FoloRsshubIndex> {
  return getOrFetchMap(rsshubCache, rsshubInflight, key, fetcher, options);
}

export async function getOrFetchRsshubAnalytics(
  fetcher: () => Promise<FoloRsshubAnalyticsIndex>,
  options?: { force?: boolean },
): Promise<FoloRsshubAnalyticsIndex> {
  return getOrFetchMap(
    analyticsCache,
    analyticsInflight,
    ANALYTICS_CACHE_KEY,
    fetcher,
    options,
  );
}

export function invalidateTrendingDiscoverCache(key?: string): void {
  if (key) trendingCache.delete(key);
  else trendingCache.clear();
}

export function invalidateRsshubDiscoverCache(key?: string): void {
  if (key) rsshubCache.delete(key);
  else rsshubCache.clear();
}

export function invalidateRsshubAnalyticsCache(): void {
  analyticsCache.delete(ANALYTICS_CACHE_KEY);
}

export function clearFoloDiscoverCache(): void {
  trendingCache.clear();
  rsshubCache.clear();
  analyticsCache.clear();
  trendingInflight.clear();
  rsshubInflight.clear();
  analyticsInflight.clear();
}
