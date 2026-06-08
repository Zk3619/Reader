/**
 * 章节正文缓存分级：auto=阅读自动写入（可淘汰）；manual=用户离线缓存（仅用户清除）
 */

export type ChapterCacheTier = 'auto' | 'manual';

export const CHAPTER_CACHE_TIER_AUTO: ChapterCacheTier = 'auto';
export const CHAPTER_CACHE_TIER_MANUAL: ChapterCacheTier = 'manual';

export function normalizeChapterCacheTier(raw: unknown): ChapterCacheTier {
  return raw === 'manual' ? 'manual' : 'auto';
}

/** 写入时：manual 优先，已有 manual 不被 auto 覆盖 */
export function mergeChapterCacheTier(
  existing: ChapterCacheTier | undefined,
  requested: ChapterCacheTier,
): ChapterCacheTier {
  if (requested === 'manual' || existing === 'manual') return 'manual';
  return 'auto';
}
