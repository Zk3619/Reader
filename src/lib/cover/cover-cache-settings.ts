/**
 * 封面缓存容量与保留策略（持久化于 config.json）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'cover_cache_settings';

export interface CoverCacheSettings {
  /** 磁盘上限（MB），0 = 不限制 */
  maxBytesMb: number;
  /** 超过该天数的条目优先淘汰，0 = 不按时间淘汰 */
  retentionDays: number;
}

const DEFAULTS: CoverCacheSettings = {
  maxBytesMb: 300,
  retentionDays: 0,
};

let cached: CoverCacheSettings | null = null;

export async function getCoverCacheSettings(): Promise<CoverCacheSettings> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<Partial<CoverCacheSettings>>(STORAGE_KEY);
    if (parsed) {
      cached = {
        maxBytesMb: clampInt(parsed.maxBytesMb ?? DEFAULTS.maxBytesMb, 0, 10_240),
        retentionDays: clampInt(parsed.retentionDays ?? DEFAULTS.retentionDays, 0, 3650),
      };
      return cached;
    }
  } catch (e) {
    console.warn('[cover-cache-settings] load failed', e);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export async function saveCoverCacheSettings(
  patch: Partial<CoverCacheSettings>,
): Promise<CoverCacheSettings> {
  const current = await getCoverCacheSettings();
  const next: CoverCacheSettings = {
    maxBytesMb: clampInt(patch.maxBytesMb ?? current.maxBytesMb, 0, 10_240),
    retentionDays: clampInt(patch.retentionDays ?? current.retentionDays, 0, 3650),
  };
  cached = next;
  await setStorage(STORAGE_KEY, next);
  return next;
}

export async function getCoverCacheMaxBytes(): Promise<number> {
  const s = await getCoverCacheSettings();
  return s.maxBytesMb > 0 ? s.maxBytesMb * 1024 * 1024 : Number.POSITIVE_INFINITY;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
