/**
 * 封面缓存目录（Tauri）
 * 与本地书籍目录相同：优先用户设置，否则为数据根目录下的 cover-cache。
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';

const COVER_CACHE_SUBDIR = 'cover-cache';

let cachedDir: string | null = null;

export function clearCoverCacheDirectoryCache(): void {
  cachedDir = null;
}

/**
 * 默认封面缓存目录：{应用数据根}/cover-cache（受 config.json dataDir 影响）
 */
export async function getDefaultCoverCacheDirectory(): Promise<string> {
  if (!isTauri()) {
    return COVER_CACHE_SUBDIR;
  }
  try {
    const appDir = await getAppDataDir();
    return await join(appDir, COVER_CACHE_SUBDIR);
  } catch (error) {
    console.error('[cover-cache] 获取默认缓存目录失败:', error);
    return COVER_CACHE_SUBDIR;
  }
}

/**
 * 当前封面缓存目录（用户自定义或默认）
 */
export async function getCoverCacheDirectory(): Promise<string> {
  if (!isTauri()) {
    return COVER_CACHE_SUBDIR;
  }

  const custom = settingsStore.state.app.coverCacheDirectory?.trim();
  if (custom) {
    return custom;
  }

  if (cachedDir) {
    return cachedDir;
  }

  cachedDir = await getDefaultCoverCacheDirectory();
  return cachedDir;
}
