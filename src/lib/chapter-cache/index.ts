export {
  type ChapterCacheTier,
  CHAPTER_CACHE_TIER_AUTO,
  CHAPTER_CACHE_TIER_MANUAL,
  mergeChapterCacheTier,
  normalizeChapterCacheTier,
} from '@/lib/chapter-cache/cache-tier';
export {
  readCachedChapterRaw,
  writeCachedChapterRaw,
  deleteCachedChaptersByBook,
  clearAllCachedChapters,
  countCachedChapters,
  fetchAndCacheChapterContent,
  isManualCachedChapter,
  promoteChapterCacheToManual,
  type FetchAndCacheChapterOptions,
  type WriteCachedChapterOptions,
} from '@/lib/chapter-cache/storage';
export { getChapterCacheSettings, saveChapterCacheSettings } from '@/lib/chapter-cache/settings';
export { useChapterBodyPrefetchSettings } from '@/lib/chapter-cache/use-chapter-body-prefetch-settings';
export {
  prefetchChaptersOnRead,
  scheduleChapterBodyCachePrefetch,
  cancelPrefetchOnRead,
  collectPrefetchIndices,
} from '@/lib/chapter-cache/prefetch';
export {
  chapterCacheDownloadStore,
  enqueueChapterDownload,
  enqueueDownloadAll,
  enqueueDownloadFromCurrent,
  stopChapterDownload,
  stopAllChapterDownloads,
} from '@/lib/chapter-cache/download-queue';
export {
  enqueueOfflineCacheRange,
  formatOfflineCacheProgressText,
  getOfflineCacheBlockedReason,
  getOfflineCacheDownloadProgress,
  isOfflineCacheDownloading,
  offlineCacheDefaultRange,
  parseOfflineCacheChapterRange,
  resolveOfflineCacheChapterTotal,
  stopOfflineCacheForBook,
  type OfflineCacheChapterRange,
} from '@/lib/chapter-cache/offline-cache-actions';
export {
  getChapterCacheStats,
  formatChapterCacheSize,
  sumChapterCacheBreakdownBytes,
  type ChapterCacheStats,
  type ChapterCacheStorageBreakdown,
} from '@/lib/chapter-cache/stats';
export { getChapterCacheStatsForBook } from '@/lib/chapter-cache/stats-by-book';
export { clearInvalidChapterCache } from '@/lib/chapter-cache/cleanup';
export { enforceChapterCacheLimits } from '@/lib/chapter-cache/eviction';
