/**
 * 备份 Web API（对齐 Legado BackupController.kt）
 */

import { createReaderBackupZip, getBackupOverview, type BackupOverview } from '@/lib/database/reader-backup';
import {
  listRemoteBackups,
  restoreReaderBackupFromWebDav,
  uploadReaderBackupToWebDav,
} from '@/lib/backup/webdav-backup';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import { binaryApiResult, type WebApiDispatchResult } from '@/lib/web-api/response';

export type { BackupItemInfo, BackupOverview } from '@/lib/database/reader-backup';

export async function getBackupPreviewApi(): Promise<LegadoReturnData<BackupOverview>> {
  return legadoOk(await getBackupOverview());
}

export async function backupApi(): Promise<WebApiDispatchResult> {
  try {
    const { blob, filename } = await createReaderBackupZip();
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return binaryApiResult(buffer, 'application/zip', filename);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'json', payload: legadoErr(`备份失败: ${msg}`) };
  }
}

export async function backupPreviewOnlyErr(): Promise<LegadoReturnData<null>> {
  return legadoErr('备份预览不可用');
}

export async function webDavBackupListApi(): Promise<LegadoReturnData<{ backups: Awaited<ReturnType<typeof listRemoteBackups>> }>> {
  try {
    const backups = await listRemoteBackups();
    return legadoOk({ backups });
  } catch (e) {
    return legadoErr(e instanceof Error ? e.message : String(e));
  }
}

export async function webDavBackupUploadApi(): Promise<LegadoReturnData<{ fileName: string; size: number }>> {
  try {
    const result = await uploadReaderBackupToWebDav();
    return legadoOk(result);
  } catch (e) {
    return legadoErr(e instanceof Error ? e.message : String(e));
  }
}

export async function webDavBackupRestoreApi(
  postData: string | null,
): Promise<LegadoReturnData<{ summary: string[]; reloadRecommended: boolean }>> {
  if (!postData?.trim()) return legadoErr('fileName 不能为空');
  let payload: { fileName?: string };
  try {
    payload = JSON.parse(postData) as typeof payload;
  } catch {
    return legadoErr('格式不对');
  }
  const fileName = payload.fileName?.trim();
  if (!fileName) return legadoErr('fileName 不能为空');
  try {
    const result = await restoreReaderBackupFromWebDav(fileName);
    return legadoOk(result);
  } catch (e) {
    return legadoErr(e instanceof Error ? e.message : String(e));
  }
}

export async function webDavSyncAssetsApi(): Promise<
  LegadoReturnData<{ progressUpdated: number; bgUploaded: number; bgDownloaded: number }>
> {
  try {
    const { syncWebDavAssets } = await import('@/lib/backup/webdav-backup');
    const result = await syncWebDavAssets();
    return legadoOk(result);
  } catch (e) {
    return legadoErr(e instanceof Error ? e.message : String(e));
  }
}

export { restoreBackupApi } from '@/lib/web-api/restore-backup';

