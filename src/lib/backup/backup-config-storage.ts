/**
 * 备份全局配置（对齐 Legado LocalConfig.password / AppConfig.syncBookProgress）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

export const BACKUP_CONFIG_KEY = 'reader_backup_config';

export interface BackupConfig {
  /** 备份 AES 加密密码（空则明文） */
  backupPassword?: string;
  /** 阅读进度 WebDAV 云同步 */
  syncBookProgress?: boolean;
}

const DEFAULTS: BackupConfig = {
  backupPassword: '',
  syncBookProgress: true,
};

export async function loadBackupConfig(): Promise<BackupConfig> {
  try {
    const raw = await getStorage<BackupConfig>(BACKUP_CONFIG_KEY);
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveBackupConfig(patch: Partial<BackupConfig>): Promise<BackupConfig> {
  const current = await loadBackupConfig();
  const next = { ...current, ...patch };
  await setStorage(BACKUP_CONFIG_KEY, next);
  return next;
}

export async function getBackupPassword(): Promise<string> {
  const config = await loadBackupConfig();
  return config.backupPassword?.trim() ?? '';
}

export async function isSyncBookProgressEnabled(): Promise<boolean> {
  const config = await loadBackupConfig();
  return config.syncBookProgress !== false;
}
