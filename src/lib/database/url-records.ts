import { getDatabase } from '@/lib/database/database-core';
import type { UrlRecord } from '@/types';

export async function getUrlRecords(limit = 100): Promise<UrlRecord[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM url_records ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
  return rows.map(mapRow);
}

export async function insertUrlRecord(record: UrlRecord): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO url_records (
      url, domain, method, sourceName, sourceUrl, timestamp,
      responseCode, duration, requestBody, errorMsg
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.url,
      record.domain,
      record.method,
      record.sourceName ?? null,
      record.sourceUrl ?? null,
      record.timestamp,
      record.responseCode,
      record.duration,
      record.requestBody ?? null,
      record.errorMsg ?? null,
    ]
  );
}

export async function deleteUrlRecord(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM url_records WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): UrlRecord {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    url: String(row.url ?? ''),
    domain: String(row.domain ?? ''),
    method: String(row.method ?? ''),
    sourceName: row.sourceName ? String(row.sourceName) : undefined,
    sourceUrl: row.sourceUrl ? String(row.sourceUrl) : undefined,
    timestamp: Number(row.timestamp ?? 0),
    responseCode: Number(row.responseCode ?? 0),
    duration: Number(row.duration ?? 0),
    requestBody: row.requestBody ? String(row.requestBody) : undefined,
    errorMsg: row.errorMsg ? String(row.errorMsg) : undefined,
  };
}
