/**
 * 章节缓存相关用户设置（持久化）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'chapter_cache_settings';

export interface ChapterCacheSettings {
  /** 阅读时预取相邻章节 */
  prefetchEnabled: boolean;
  /** 向前/向后各预取章数（1–2） */
  prefetchCount: number;
  /** 阅读后自动预下载后续章节数，0=关闭 */
  preDownloadNum: number;
  /** 全局缓存上限（MB），0 = 不限制 */
  maxBytesMb: number;
  /** 超过该天数的缓存优先清理，0 = 不按时间清理 */
  retentionDays: number;
}

const DEFAULTS: ChapterCacheSettings = {
  prefetchEnabled: true,
  prefetchCount: 1,
  preDownloadNum: 0,
  maxBytesMb: 0,
  retentionDays: 0,
};

let cached: ChapterCacheSettings | null = null;

export async function getChapterCacheSettings(): Promise<ChapterCacheSettings> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<Partial<ChapterCacheSettings>>(STORAGE_KEY);
    if (parsed) {
      cached = {
        prefetchEnabled: parsed.prefetchEnabled ?? DEFAULTS.prefetchEnabled,
        prefetchCount: clampInt(parsed.prefetchCount ?? DEFAULTS.prefetchCount, 1, 2),
        preDownloadNum: clampInt(
          parsed.preDownloadNum ?? DEFAULTS.preDownloadNum,
          0,
          9999,
        ),
        maxBytesMb: clampInt(parsed.maxBytesMb ?? DEFAULTS.maxBytesMb, 0, 102_400),
        retentionDays: clampInt(parsed.retentionDays ?? DEFAULTS.retentionDays, 0, 3650),
      };
      return cached;
    }
  } catch (e) {
    console.warn('[chapter-cache-settings] load failed', e);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export async function saveChapterCacheSettings(
  patch: Partial<ChapterCacheSettings>,
): Promise<ChapterCacheSettings> {
  const current = await getChapterCacheSettings();
  const next: ChapterCacheSettings = {
    prefetchEnabled: patch.prefetchEnabled ?? current.prefetchEnabled,
    prefetchCount: clampInt(
      patch.prefetchCount ?? current.prefetchCount,
      1,
      2,
    ),
    preDownloadNum: clampInt(
      patch.preDownloadNum ?? current.preDownloadNum,
      0,
      9999,
    ),
    maxBytesMb: clampInt(patch.maxBytesMb ?? current.maxBytesMb, 0, 102_400),
    retentionDays: clampInt(patch.retentionDays ?? current.retentionDays, 0, 3650),
  };
  cached = next;
  await setStorage(STORAGE_KEY, next);
  return next;
}

export function invalidateChapterCacheSettingsCache(): void {
  cached = null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
