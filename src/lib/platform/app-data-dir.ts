/**
 * 应用数据根目录
 * - 由 config.json 的 dataDir 决定（安装版 config 在默认目录，便携版在 exe 同目录）
 * - 无 dataDir 时：安装版用系统目录，便携版用 exe 旁 AppData 等
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
