/**
 * RSS收藏数据访问对象
 * 对应 legado 项目的 RssStarDao.kt
 */

import { getDatabase } from './database-core';
import type { RssStar } from '@/types';

/**
 * 获取所有RSS收藏
 */
export async function getAllRssStars(): Promise<RssStar[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM rssStars ORDER BY starTime DESC'
  );
  return rows.map(row => mapRowToStar(row));
}

/**
 * 根据来源和分类获取RSS收藏
 */
export async function getRssStarsByOriginAndSort(
  origin: string,
  sort: string
): Promise<RssStar[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM rssStars WHERE origin = ? AND sort = ? ORDER BY starTime DESC',
    [origin, sort]
  );
  return rows.map(row => mapRowToStar(row));
}

/**
 * 获取RSS收藏
 */
export async function getRssStar(
  origin: string,
  link: string
): Promise<RssStar | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM rssStars WHERE origin = ? AND link = ?',
    [origin, link]
  );
  return rows.length > 0 ? mapRowToStar(rows[0]) : null;
}

/**
 * 插入RSS收藏（如果存在则替换）
 */
export async function insertRssStar(star: RssStar): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO rssStars (
      origin, sort, title, starTime, link, pubDate,
      description, content, image, "group", variable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      star.origin,
      star.sort,
      star.title,
      star.starTime,
      star.link,
      star.pubDate ?? null,
      star.description ?? null,
      star.content ?? null,
      star.image ?? null,
      star.group,
      star.variable ?? null,
    ]
  );
}

/**
 * 删除RSS收藏
 */
export async function deleteRssStar(origin: string, link: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM rssStars WHERE origin = ? AND link = ?',
    [origin, link]
  );
}

/**
 * 将数据库行映射为RssStar对象
 */
function mapRowToStar(row: Record<string, unknown>): RssStar {
  return {
    origin: String(row.origin ?? ''),
    link: String(row.link ?? ''),
    sort: String(row.sort ?? ''),
    title: String(row.title ?? ''),
    starTime: Number(row.starTime ?? 0),
    pubDate: row.pubDate ? String(row.pubDate) : undefined,
    description: row.description ? String(row.description) : undefined,
    content: row.content ? String(row.content) : undefined,
    image: row.image ? String(row.image) : undefined,
    group: String(row.group ?? '默认分组'),
    variable: row.variable ? String(row.variable) : undefined,
  };
}
