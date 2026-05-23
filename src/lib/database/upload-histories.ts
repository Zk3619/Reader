import { getDatabase } from '@/lib/database/database-core';
import type { UploadHistory } from '@/types';

export async function getUploadHistories(limit = 50): Promise<UploadHistory[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM upload_histories ORDER BY uploadTime DESC LIMIT ?',
    [limit]
  );
  return rows.map(mapRow);
}

export async function insertUploadHistory(history: UploadHistory): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO upload_histories (
      fileName, fileSize, contentType, uploadTime, duration, downloadUrl,
      expireTime, ruleId, ruleSummary, success, errorMsg
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      history.fileName,
      history.fileSize,
      history.contentType,
      history.uploadTime,
      history.duration,
      history.downloadUrl,
      history.expireTime ?? null,
      history.ruleId,
      history.ruleSummary,
      history.success ? 1 : 0,
      history.errorMsg ?? null,
    ]
  );
}

export async function deleteUploadHistory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM upload_histories WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): UploadHistory {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    fileName: String(row.fileName ?? ''),
    fileSize: Number(row.fileSize ?? 0),
    contentType: String(row.contentType ?? ''),
    uploadTime: Number(row.uploadTime ?? 0),
    duration: Number(row.duration ?? 0),
    downloadUrl: String(row.downloadUrl ?? ''),
    expireTime: row.expireTime != null ? Number(row.expireTime) : undefined,
    ruleId: Number(row.ruleId ?? 0),
    ruleSummary: String(row.ruleSummary ?? ''),
    success: Boolean(row.success ?? 0),
    errorMsg: row.errorMsg ? String(row.errorMsg) : undefined,
  };
}
