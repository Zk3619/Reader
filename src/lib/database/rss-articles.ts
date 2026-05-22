/**
 * RSS文章数据访问对象
 * 对应 legado 项目的 RssArticleDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { RssArticle, NewRssArticle } from '@/types';

/**
 * 根据来源和分类获取RSS文章
 */
export async function getRssArticlesByOriginAndSort(
  origin: string,
  sort: string
): Promise<RssArticle[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t1.*, IFNULL(t2.read, 0) as read
     FROM rssArticles as t1 
     LEFT JOIN rssReadRecords as t2 ON t1.link = t2.record
     WHERE t1.origin = ? AND t1.sort = ?
     ORDER BY t1."order" DESC`,
    [origin, sort]
  );
  return rows.map(row => mapRowToArticle(row));
}

/**
 * 获取RSS文章
 */
export async function getRssArticle(
  origin: string,
  link: string
): Promise<RssArticle | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM rssArticles WHERE origin = ? AND link = ?',
    [origin, link]
  );
  return rows.length > 0 ? mapRowToArticle(rows[0]) : null;
}

/**
 * 插入RSS文章（如果存在则替换）
 */
export async function insertRssArticle(article: NewRssArticle): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO rssArticles (
      origin, sort, title, "order", link, pubDate,
      description, content, image, "group", read, variable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      article.origin,
      article.sort ?? '',
      article.title,
      article.order ?? 0,
      article.link,
      article.pubDate ?? null,
      article.description ?? null,
      article.content ?? null,
      article.image ?? null,
      article.group ?? '默认分组',
      article.read ? 1 : 0,
      article.variable ?? null,
    ]
  );
}

/**
 * 追加RSS文章（如果存在则忽略）
 */
export async function appendRssArticle(article: NewRssArticle): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR IGNORE INTO rssArticles (
      origin, sort, title, "order", link, pubDate,
      description, content, image, "group", read, variable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      article.origin,
      article.sort ?? '',
      article.title,
      article.order ?? 0,
      article.link,
      article.pubDate ?? null,
      article.description ?? null,
      article.content ?? null,
      article.image ?? null,
      article.group ?? '默认分组',
      article.read ? 1 : 0,
      article.variable ?? null,
    ]
  );
}

/**
 * 批量插入RSS文章
 */
export async function insertRssArticles(
  articles: NewRssArticle[]
): Promise<void> {
  for (const article of articles) {
    await insertRssArticle(article);
  }
}

/**
 * 清理旧的RSS文章
 */
export async function clearOldRssArticles(
  origin: string,
  sort: string,
  order: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM rssArticles WHERE origin = ? AND sort = ? AND "order" < ?',
    [origin, sort, order]
  );
}

/**
 * 更新RSS文章
 */
export async function updateRssArticle(article: RssArticle): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE rssArticles SET
      sort = ?, title = ?, "order" = ?, pubDate = ?,
      description = ?, content = ?, image = ?,
      "group" = ?, read = ?, variable = ?
    WHERE origin = ? AND link = ?`,
    [
      article.sort,
      article.title,
      article.order,
      article.pubDate ?? null,
      article.description ?? null,
      article.content ?? null,
      article.image ?? null,
      article.group,
      article.read ? 1 : 0,
      article.variable ?? null,
      article.origin,
      article.link,
    ]
  );
}

/**
 * 删除来源的所有RSS文章
 */
export async function deleteRssArticlesByOrigin(origin: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM rssArticles WHERE origin = ?', [origin]);
}

/**
 * 将数据库行映射为RssArticle对象
 */
function mapRowToArticle(row: Record<string, unknown>): RssArticle {
  return {
    origin: String(row.origin ?? ''),
    link: String(row.link ?? ''),
    sort: String(row.sort ?? ''),
    title: String(row.title ?? ''),
    order: Number(row.order ?? 0),
    pubDate: row.pubDate ? String(row.pubDate) : undefined,
    description: row.description ? String(row.description) : undefined,
    content: row.content ? String(row.content) : undefined,
    image: row.image ? String(row.image) : undefined,
    group: String(row.group ?? '默认分组'),
    read: Boolean(row.read ?? 0),
    variable: row.variable ? String(row.variable) : undefined,
  };
}
