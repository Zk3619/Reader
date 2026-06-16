import type { RssSource } from '@/types';
import type { RssSourcesFilterMeta } from '@/lib/rss/rss-sources-chunked-filter';

interface RssSourcesSessionCacheValue {
  sources: RssSource[];
  meta: RssSourcesFilterMeta;
  updatedAt: number;
}

let rssSourcesSessionCache: RssSourcesSessionCacheValue | null = null;

export function getRssSourcesSessionCache(): RssSourcesSessionCacheValue | null {
  return rssSourcesSessionCache;
}

export function setRssSourcesSessionCache(
  sources: RssSource[],
  meta?: RssSourcesFilterMeta,
): void {
  rssSourcesSessionCache = {
    sources: [...sources],
    meta: meta ?? rssSourcesSessionCache?.meta ?? { groupNames: [], domainNames: [] },
    updatedAt: Date.now(),
  };
}

export function setRssSourcesSessionMeta(meta: RssSourcesFilterMeta): void {
  if (!rssSourcesSessionCache) return;
  rssSourcesSessionCache = {
    ...rssSourcesSessionCache,
    meta: {
      groupNames: [...meta.groupNames],
      domainNames: [...meta.domainNames],
    },
    updatedAt: Date.now(),
  };
}

export function clearRssSourcesSessionCache(): void {
  rssSourcesSessionCache = null;
}
