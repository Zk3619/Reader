/**
 * RSS阅读记录数据访问对象
 * 对应 legado 项目的 RssReadRecordDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { RssReadRecord } from '@/types';

/**
 * 获取阅读记录
 */
export async function getRssReadRecord(
  record: string
): Promise<RssReadRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM rssReadRecords WHERE record = ?',
    [record]
  );
  return rows.length > 0 ? mapRowToRecord(rows[0]) : null;
}

/**
 * 插入或更新阅读记录
 */
export async function upsertRssReadRecord(
  record: RssReadRecord
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO rssReadRecords (
      record, title, readTime, read, origin, sort, image, type, durPos, pubDate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.record,
      record.title ?? null,
      record.readTime ?? null,
      record.read ? 1 : 0,
      record.origin ?? '',
      record.sort ?? '',
      record.image ?? null,
      record.type ?? 0,
      record.durPos ?? 0,
      record.pubDate ?? null,
    ]
  );
}

/**
 * 标记为已读
 */
export async function markRssArticleAsRead(
  record: string,
  title?: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'INSERT OR REPLACE INTO rssReadRecords (record, title, readTime, read) VALUES (?, ?, ?, ?)',
    [record, title ?? null, Date.now(), 1]
  );
}

/**
 * 删除阅读记录
 */
export async function deleteRssReadRecord(record: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM rssReadRecords WHERE record = ?', [record]);
}

/**
 * 将数据库行映射为RssReadRecord对象
 */
function mapRowToRecord(row: Record<string, unknown>): RssReadRecord {
  return {
    record: String(row.record ?? ''),
    origin: String(row.origin ?? ''),
    sort: String(row.sort ?? ''),
    title: row.title ? String(row.title) : undefined,
    readTime: row.readTime ? Number(row.readTime) : undefined,
    read: Boolean(row.read ?? 1),
    image: row.image ? String(row.image) : undefined,
    type: Number(row.type ?? 0),
    durPos: Number(row.durPos ?? 0),
    pubDate: row.pubDate ? String(row.pubDate) : undefined,
  };
}
