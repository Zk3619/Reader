/**
 * 章节缓存相关用户设置（持久化）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'chapter_cache_settings';
/** 设置结构版本：2 = preDownloadNum 默认 10，旧版存 0 时自动升级 */
const SETTINGS_SCHEMA_VERSION = 2;

export interface ChapterCacheSettings {
  /** 持久化结构版本（内部字段） */
  schemaVersion?: number;
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
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  prefetchEnabled: true,
  prefetchCount: 1,
  /** 对齐 Legado AppConfig.preDownloadNum 默认值 */
  preDownloadNum: 10,
  maxBytesMb: 0,
  retentionDays: 0,
};

let cached: ChapterCacheSettings | null = null;

export async function getChapterCacheSettings(): Promise<ChapterCacheSettings> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<Partial<ChapterCacheSettings>>(STORAGE_KEY);
    if (parsed) {
      const schemaVersion = parsed.schemaVersion ?? 1;
      let preDownloadNum = clampInt(
        parsed.preDownloadNum ?? DEFAULTS.preDownloadNum,
        0,
        9999,
      );
      const migratedPreDownload =
        schemaVersion < SETTINGS_SCHEMA_VERSION && preDownloadNum === 0;
      if (migratedPreDownload) {
        preDownloadNum = DEFAULTS.preDownloadNum;
      }
      cached = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        prefetchEnabled: parsed.prefetchEnabled ?? DEFAULTS.prefetchEnabled,
        prefetchCount: clampInt(parsed.prefetchCount ?? DEFAULTS.prefetchCount, 1, 2),
        preDownloadNum,
        maxBytesMb: clampInt(parsed.maxBytesMb ?? DEFAULTS.maxBytesMb, 0, 102_400),
        retentionDays: clampInt(parsed.retentionDays ?? DEFAULTS.retentionDays, 0, 3650),
      };
      if (migratedPreDownload) {
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
