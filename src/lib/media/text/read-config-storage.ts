/**
 * 阅读器 UI 配置持久化（对齐 Legado ReadBookConfig / readConfig.json）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import type { TextViewerUiConfig as ReadConfig } from '@/lib/media/text/reader-ui-config';

const STORAGE_KEY = 'reader_ui_config_v1';

let cached: ReadConfig | null = null;

export async function loadReaderUiConfig(): Promise<ReadConfig | null> {
  if (cached) return cached;
  try {
    const parsed = await getStorage<ReadConfig>(STORAGE_KEY);
    if (parsed && typeof parsed === 'object') {
      cached = parsed;
      return parsed;
    }
  } catch (e) {
    console.warn('[read-config-storage] load failed', e);
  }
  return null;
}

export async function saveReaderUiConfig(config: ReadConfig): Promise<void> {
  cached = config;
  try {
    await setStorage(STORAGE_KEY, config);
  } catch (e) {
    console.warn('[read-config-storage] save failed', e);
  }
}

export function invalidateReaderUiConfigCache(): void {
  cached = null;
}
