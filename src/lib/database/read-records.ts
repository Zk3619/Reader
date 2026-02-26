/**
 * 阅读记录数据访问对象
 * 对应 legado 项目的 ReadRecordDao.kt
 */

import { getDatabase } from './database-core';
import type { ReadRecord } from '@/types';

/**
 * 获取阅读记录
 */
export async function getReadRecord(
  deviceId: string,
  bookName: string
): Promise<ReadRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM readRecord WHERE deviceId = ? AND bookName = ?',
    [deviceId, bookName]
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
      deviceId, bookName, readTime, lastRead
    ) VALUES (?, ?, ?, ?)`,
    [record.deviceId, record.bookName, record.readTime, record.lastRead]
  );
}

/**
 * 更新阅读时间
 */
export async function updateReadTime(
  deviceId: string,
  bookName: string,
  readTime: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE readRecord SET readTime = ?, lastRead = ? WHERE deviceId = ? AND bookName = ?',
    [readTime, Date.now(), deviceId, bookName]
  );
}

/**
 * 删除阅读记录
 */
export async function deleteReadRecord(
  deviceId: string,
  bookName: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM readRecord WHERE deviceId = ? AND bookName = ?',
    [deviceId, bookName]
  );
}

/**
 * 将数据库行映射为ReadRecord对象
 */
function mapRowToRecord(row: Record<string, unknown>): ReadRecord {
  return {
    deviceId: String(row.deviceId ?? ''),
    bookName: String(row.bookName ?? ''),
    readTime: Number(row.readTime ?? 0),
    lastRead: Number(row.lastRead ?? 0),
  };
}
