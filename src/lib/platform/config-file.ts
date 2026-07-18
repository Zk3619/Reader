/**
 * settings.json 读写（便携版在 exe/AppData/settings.json；旧名 config.json 启动时迁移）
 * 用于程序配置与数据路径（如 dataDir），用户可迁移或手动编辑
 */

import { invoke } from '@tauri-apps/api/core';
import { clearCoverCacheDirectoryCache } from '@/lib/cover/cover-cache-path';
import { clearAppDataDirCache } from '@/lib/platform/app-data-dir';

export type ConfigJson = Record<string, unknown> & {
  dataDir?: string | null;
  webviewDataDir?: string | null;
  /** 更改 dataDir 前的路径，重启后自动迁移并清除 */
  dataDirMigrationSource?: string | null;
  /** 搬迁完成后保留的原目录路径，用户可在设置中手动清理 */
  dataDirMigrationBackup?: string | null;
};

/** 读取 settings.json 全文 */
export async function getConfig(): Promise<ConfigJson> {
  const raw = await invoke<Record<string, unknown>>('get_config');
  return raw as ConfigJson;
}

/** 写入 settings.json 全文；若修改了 dataDir，需重启应用后数据目录才生效 */
export async function setConfig(config: ConfigJson): Promise<void> {
  await invoke('set_config', { config });
  clearAppDataDirCache();
  clearCoverCacheDirectoryCache();
}

/**
 * 仅更新 dataDir 并保存；其他键保留
 */
export async function setDataDir(path: string | null): Promise<void> {
  const config = await getConfig();
  const { getAppDataDir } = await import('@/lib/platform/app-data-dir');
  const migrationSource = await getAppDataDir();
  if (path === null || path.trim() === '') {
    const { dataDir: _, dataDirMigrationSource: __, ...rest } = config;
    await setConfig({
      ...rest,
      dataDirMigrationSource: migrationSource,
    } as ConfigJson);
  } else {
    await setConfig({
      ...config,
      dataDir: path.trim(),
      dataDirMigrationSource: migrationSource,
    });
  }
}

/** 仅更新 webviewDataDir；修改后需重启应用生效（WebView 缓存不迁移，将重新生成） */
export async function setWebviewDataDir(path: string | null): Promise<void> {
  const config = await getConfig();
  if (path === null || path.trim() === '') {
    const { webviewDataDir: _, ...rest } = config;
    await setConfig(rest as ConfigJson);
  } else {
    await setConfig({ ...config, webviewDataDir: path.trim() });
  }
}