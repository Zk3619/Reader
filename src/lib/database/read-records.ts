/**
 * 阅读记录数据访问对象
 * 对应 legado 项目的 ReadRecordDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { ReadRecord } from '@/types';

/**
 * 获取全部阅读记录（按最近阅读排序）
 */
export async function getAllReadRecords(): Promise<ReadRecord[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM readRecord ORDER BY lastRead DESC',
  );
  return rows.map((row) => mapRowToRecord(row));
}

/**
 * 获取阅读记录
 */
export async function getReadRecord(
  deviceId: string,
  bookName: string,
  bookAuthor = ''
): Promise<ReadRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM readRecord WHERE deviceId = ? AND bookName = ? AND bookAuthor = ?',
    [deviceId, bookName, bookAuthor]
  );
  return rows.length > 0 ? mapRowToRecord(rows[0]) : null;
}

/**
 * 插入或更新阅读记录
 */
export async function upsertReadRecord(record: ReadRecord): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO readRecord (
      deviceId, bookName, bookAuthor, readTime, lastRead, durChapterTitle, durChapterIndex
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.deviceId,
      record.bookName,
      record.bookAuthor ?? '',
      record.readTime,
      record.lastRead,
      record.durChapterTitle ?? '',
      record.durChapterIndex ?? 0,
    ]
  );
}

/**
 * 更新阅读时间
 */
export async function updateReadTime(
  deviceId: string,
  bookName: string,
  readTime: number,
  bookAuthor = ''
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE readRecord SET readTime = ?, lastRead = ? WHERE deviceId = ? AND bookName = ? AND bookAuthor = ?',
    [readTime, Date.now(), deviceId, bookName, bookAuthor]
  );
}

/**
 * 删除阅读记录
 */
export async function deleteReadRecord(
  deviceId: string,
  bookName: string,
  bookAuthor = ''
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM readRecord WHERE deviceId = ? AND bookName = ? AND bookAuthor = ?',
    [deviceId, bookName, bookAuthor]
  );
}

/**
 * 将数据库行映射为ReadRecord对象
 */
function mapRowToRecord(row: Record<string, unknown>): ReadRecord {
  return {
    deviceId: String(row.deviceId ?? ''),
    bookName: String(row.bookName ?? ''),
    bookAuthor: String(row.bookAuthor ?? ''),
    readTime: Number(row.readTime ?? 0),
    lastRead: Number(row.lastRead ?? 0),
    durChapterTitle: String(row.durChapterTitle ?? ''),
    durChapterIndex: Number(row.durChapterIndex ?? 0),
  };
}
