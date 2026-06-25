/**
 * 章节缓存相关用户设置（持久化）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'chapter_cache_settings';
/** 设置结构版本：4 = forward/backwardPrefetchNum；3 = imageRetainNum */
const SETTINGS_SCHEMA_VERSION = 4;

export interface ChapterCacheSettings {
  /** 持久化结构版本（内部字段） */
  schemaVersion?: number;
  /** 阅读时向前预下载章数（current+1 起），0=关闭 */
  forwardPrefetchNum: number;
  /** 阅读时向后预下载章数（对齐 Legado：current-2 起，跨度 min(5,n)），0=关闭；1=仅 current-1 */
  backwardPrefetchNum: number;
  /** 全局缓存上限（MB），0 = 不限制 */
  maxBytesMb: number;
  /** 超过该天数的缓存优先清理，0 = 不按时间清理 */
  retentionDays: number;
  /** 图片磁盘缓存保留章数（当前章 ±N，对齐 Legado imageRetainNum） */
  imageRetainNum: number;
}

const DEFAULTS: ChapterCacheSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  forwardPrefetchNum: 0,
  backwardPrefetchNum: 0,
  maxBytesMb: 0,
  retentionDays: 0,
  imageRetainNum: 2,
};

/** v3 设置迁移专用 */
type LegacyChapterCacheSettings = Partial<ChapterCacheSettings> & {
  prefetchEnabled?: boolean;
  prefetchCount?: number;
  preDownloadNum?: number;
  mangaImageRetainNum?: number;
};

let cached: ChapterCacheSettings | null = null;

function migratePrefetchFromLegacy(
  parsed: LegacyChapterCacheSettings,
): { forwardPrefetchNum: number; backwardPrefetchNum: number } {
  const preDownload = clampInt(parsed.preDownloadNum ?? 0, 0, 9999);
  const adjacentOn = parsed.prefetchEnabled !== false;
  const adjacent = clampInt(parsed.prefetchCount ?? 1, 1, 2);

  let forwardPrefetchNum = 0;
  if (adjacentOn) {
    forwardPrefetchNum = adjacent;
  }
  if (preDownload >= 2) {
    forwardPrefetchNum = Math.max(forwardPrefetchNum, preDownload);
  } else if (preDownload === 1) {
    forwardPrefetchNum = Math.max(forwardPrefetchNum, 1);
  }

  let backwardPrefetchNum = 0;
  if (preDownload >= 2) {
    backwardPrefetchNum = preDownload;
  } else if (adjacentOn) {
    backwardPrefetchNum = 1;
  }

  return { forwardPrefetchNum, backwardPrefetchNum };
}

export async function getChapterCacheSettings(): Promise<ChapterCacheSettings> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<LegacyChapterCacheSettings>(STORAGE_KEY);
    if (parsed) {
      const schemaVersion = parsed.schemaVersion ?? 1;
      let forwardPrefetchNum = clampInt(
        parsed.forwardPrefetchNum ?? 0,
        0,
        9999,
      );
      let backwardPrefetchNum = clampInt(
        parsed.backwardPrefetchNum ?? 0,
        0,
        9999,
      );
      let needsPersist = false;

      if (schemaVersion < 4) {
        const migrated = migratePrefetchFromLegacy(parsed);
        forwardPrefetchNum = migrated.forwardPrefetchNum;
        backwardPrefetchNum = migrated.backwardPrefetchNum;
        needsPersist = true;
      }

      cached = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        forwardPrefetchNum,
        backwardPrefetchNum,
        maxBytesMb: clampInt(parsed.maxBytesMb ?? DEFAULTS.maxBytesMb, 0, 102_400),
        retentionDays: clampInt(parsed.retentionDays ?? DEFAULTS.retentionDays, 0, 3650),
        imageRetainNum: clampInt(
          parsed.imageRetainNum ??
            parsed.mangaImageRetainNum ??
            DEFAULTS.imageRetainNum,
          0,
          30,
        ),
      };
      if (needsPersist || parsed.mangaImageRetainNum != null) {
        void setStorage(STORAGE_KEY, cached);
      }
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
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    forwardPrefetchNum: clampInt(
      patch.forwardPrefetchNum ?? current.forwardPrefetchNum,
      0,
      9999,
    ),
    backwardPrefetchNum: clampInt(
      patch.backwardPrefetchNum ?? current.backwardPrefetchNum,
      0,
      9999,
    ),
    maxBytesMb: clampInt(patch.maxBytesMb ?? current.maxBytesMb, 0, 102_400),
    retentionDays: clampInt(patch.retentionDays ?? current.retentionDays, 0, 3650),
    imageRetainNum: clampInt(
      patch.imageRetainNum ?? current.imageRetainNum,
      0,
      30,
    ),
  };
  cached = next;
  await setStorage(STORAGE_KEY, next);
  const prefetchChanged =
    (patch.forwardPrefetchNum !== undefined &&
      patch.forwardPrefetchNum !== current.forwardPrefetchNum) ||
    (patch.backwardPrefetchNum !== undefined &&
      patch.backwardPrefetchNum !== current.backwardPrefetchNum);
  if (prefetchChanged) {
    const { onChapterPrefetchSettingsSaved } = await import(
      '@/lib/chapter-cache/prefetch'
    );
    onChapterPrefetchSettingsSaved();
  }
  return next;
}

export function invalidateChapterCacheSettingsCache(): void {
  cached = null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
