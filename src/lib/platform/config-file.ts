/**
 * config.json 读写（安装版在默认目录、便携版在 exe 同目录）
 * 用于程序配置与数据路径（如 dataDir），用户可迁移或手动编辑
 */

import { invoke } from '@tauri-apps/api/core';
import { clearAppDataDirCache } from '@/lib/platform/app-data-dir';

export type ConfigJson = Record<string, unknown> & { dataDir?: string | null };

/**
 * 读取 config.json 全文
 */
export async function getConfig(): Promise<ConfigJson> {
  const raw = await invoke<Record<string, unknown>>('get_config');
  return raw as ConfigJson;
}

/**
 * 写入 config.json 全文；若修改了 dataDir，需重启应用后数据目录才生效
 */
export async function setConfig(config: ConfigJson): Promise<void> {
  await invoke('set_config', { config });
  clearAppDataDirCache();
}

/**
 * 仅更新 dataDir 并保存；其他键保留
 */
export async function setDataDir(path: string | null): Promise<void> {
  const config = await getConfig();
  if (path === null || path.trim() === '') {
    const { dataDir: _, ...rest } = config;
    await setConfig(rest as ConfigJson);
  } else {
    await setConfig({ ...config, dataDir: path.trim() });
  }
}