/**
 * 备份 Web API（对齐 Legado BackupController.kt）
 */

import { createReaderBackupZip, getBackupOverview, type BackupOverview } from '@/lib/database/reader-backup';
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

export { restoreBackupApi } from '@/lib/web-api/restore-backup';

