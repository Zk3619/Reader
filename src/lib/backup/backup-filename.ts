/**
 * 备份文件命名（Legado 兼容）
 */

import { getDefaultDeviceName, sanitizeDeviceName } from '@/lib/remote-book/webdav-config-storage';

export function formatLegadoStyleBackupFileName(deviceName?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const device = sanitizeDeviceName(deviceName ?? getDefaultDeviceName());
  return `backup${date}-${device}.zip`;
}

export function isRemoteBackupFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('backup') || lower.startsWith('reader-backup');
}
