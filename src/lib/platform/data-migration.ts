/**
 * 数据目录迁移：旧版 APPDATA、搬迁进度、备份清理
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktopTauri } from '@/lib/platform/webview-storage';

export interface DataMigrationResult {
  migrated: boolean;
  message: string;
  copied: string[];
}

export interface MigrationProgress {
  phase: string;
  copiedBytes: number;
  totalBytes: number;
  currentFile: string | null;
}

export interface MigrationPrecheck {
  sourceBytes: number;
  targetFreeBytes: number | null;
  canProceed: boolean;
  message: string;
}

export interface MigrationBackupInfo {
  path: string;
  bytes: number;
}

export async function runLegacyDataMigration(): Promise<DataMigrationResult> {
  return invoke<DataMigrationResult>('run_legacy_data_migration');
}

export async function precheckDataDirMigration(
  source: string,
  target: string,
): Promise<MigrationPrecheck> {
  return invoke<MigrationPrecheck>('precheck_data_dir_migration', { source, target });
}

export async function revertPendingDataDirMigration(): Promise<void> {
  return invoke('revert_pending_data_dir_migration');
}

export async function retryPendingRelocationMigration(): Promise<void> {
  return invoke('retry_pending_relocation_migration');
}

export async function getDataDirMigrationBackup(): Promise<MigrationBackupInfo | null> {
  return invoke<MigrationBackupInfo | null>('get_data_dir_migration_backup');
}

export async function clearDataDirMigrationBackup(): Promise<void> {
  return invoke('clear_data_dir_migration_backup');
}

/** 监听启动/手动迁移完成，重新加载数据库 */
export async function setupDataMigrationListener(
  onMigrated: (result: DataMigrationResult) => void | Promise<void>,
): Promise<() => void> {
  if (!isDesktopTauri()) {
    return () => {};
  }
  const unlisten = await listen<DataMigrationResult>('reader-data-migrated', (event) => {
    void onMigrated(event.payload);
  });
  return unlisten;
}

export function formatMigrationBytes(n: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(1)} KB`;
  return `${n} B`;
}
