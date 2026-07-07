/**
 * 阅读显示相关全局设置（持久化）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'reading_display_settings';

export interface ReadingDisplaySettings {
  /** 手动亮度时是否写入 Android 系统亮度（需「修改系统设置」权限），默认关闭 */
  syncSystemBrightness: boolean;
}

const DEFAULTS: ReadingDisplaySettings = {
  syncSystemBrightness: false,
};

let cached: ReadingDisplaySettings | null = null;

export async function getReadingDisplaySettings(): Promise<ReadingDisplaySettings> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<Partial<ReadingDisplaySettings>>(STORAGE_KEY);
    if (parsed) {
      cached = {
        syncSystemBrightness: parsed.syncSystemBrightness === true,
      };
      return cached;
    }
  } catch (e) {
    console.warn('[reading-display-settings] load failed', e);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export async function saveReadingDisplaySettings(
  patch: Partial<ReadingDisplaySettings>,
): Promise<ReadingDisplaySettings> {
  const current = await getReadingDisplaySettings();
  const next: ReadingDisplaySettings = {
    syncSystemBrightness:
      patch.syncSystemBrightness !== undefined
        ? patch.syncSystemBrightness === true
        : current.syncSystemBrightness,
  };
  cached = next;
  await setStorage(STORAGE_KEY, next);
  return next;
}

export function invalidateReadingDisplaySettingsCache(): void {
  cached = null;
}
