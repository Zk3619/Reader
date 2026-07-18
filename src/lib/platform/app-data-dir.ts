/**
 * 应用数据根目录
 * - 桌面：settings.json 与默认数据均在 exe/AppData（可由 settings.dataDir 或 reader.json 覆盖）
 * - 移动端：仍使用系统应用数据目录
 */

import { invoke } from '@tauri-apps/api/core';

let cached: string | null = null;

/**
 * 获取应用数据根目录（与 Rust get_app_data_root 一致）
 */
export async function getAppDataDir(): Promise<string> {
  if (cached !== null) return cached;
  cached = await invoke<string>('get_app_data_root');
  return cached;
}

/** 清除缓存（例如保存 config 后，下次 getAppDataDir 会重新读取；数据目录实际生效仍需重启） */
export function clearAppDataDirCache(): void {
  cached = null;
}
