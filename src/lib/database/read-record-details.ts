import { getDatabase } from '@/lib/database/database-core';
import type { ReadRecordDetail } from '@/types';

export async function getReadRecordDetails(
  deviceId: string,
  bookName: string,
  bookAuthor: string
): Promise<ReadRecordDetail[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM readRecordDetail
     WHERE deviceId = ? AND bookName = ? AND bookAuthor = ?
     ORDER BY date DESC`,
    [deviceId, bookName, bookAuthor]
  );
  return rows.map(mapRow);
}

export async function upsertReadRecordDetail(detail: ReadRecordDetail): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO readRecordDetail (
      deviceId, bookName, bookAuthor, date, readTime, readWords, firstReadTime, lastReadTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      detail.deviceId,
      detail.bookName,
      detail.bookAuthor,
      detail.date,
      detail.readTime,
      detail.readWords,
      detail.firstReadTime,
      detail.lastReadTime,
    ]
  );
}

export async function deleteReadRecordDetail(
  deviceId: string,
  bookName: string,
  bookAuthor: string,
  date: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM readRecordDetail
     WHERE deviceId = ? AND bookName = ? AND bookAuthor = ? AND date = ?`,
    [deviceId, bookName, bookAuthor, date]
  );
}

function mapRow(row: Record<string, unknown>): ReadRecordDetail {
  return {
    deviceId: String(row.deviceId ?? ''),
    bookName: String(row.bookName ?? ''),
    bookAuthor: String(row.bookAuthor ?? ''),
    date: String(row.date ?? ''),
    readTime: Number(row.readTime ?? 0),
    readWords: Number(row.readWords ?? 0),
    firstReadTime: Number(row.firstReadTime ?? 0),
    lastReadTime: Number(row.lastReadTime ?? 0),
  };
}
