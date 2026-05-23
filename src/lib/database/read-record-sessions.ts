import { getDatabase } from '@/lib/database/database-core';
import type { ReadRecordSession } from '@/types';

export async function getReadRecordSessions(
  deviceId: string,
  bookName: string,
  bookAuthor: string
): Promise<ReadRecordSession[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM readRecordSession
     WHERE deviceId = ? AND bookName = ? AND bookAuthor = ?
     ORDER BY startTime DESC`,
    [deviceId, bookName, bookAuthor]
  );
  return rows.map(mapRow);
}

export async function insertReadRecordSession(session: ReadRecordSession): Promise<number> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO readRecordSession (deviceId, bookName, bookAuthor, startTime, endTime, words)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session.deviceId,
      session.bookName,
      session.bookAuthor,
      session.startTime,
      session.endTime,
      session.words,
    ]
  );
  const rows = await db.select<{ id: number }>('SELECT last_insert_rowid() as id');
  return Number(rows[0]?.id ?? 0);
}

export async function deleteReadRecordSession(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM readRecordSession WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): ReadRecordSession {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    deviceId: String(row.deviceId ?? ''),
    bookName: String(row.bookName ?? ''),
    bookAuthor: String(row.bookAuthor ?? ''),
    startTime: Number(row.startTime ?? 0),
    endTime: Number(row.endTime ?? 0),
    words: Number(row.words ?? 0),
  };
}
