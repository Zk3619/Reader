/**
 * 搜索关键词数据访问对象
 * 对齐 legado 项目的 SearchKeywordDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { SearchKeyword } from '@/types';

/**
 * 获取所有搜索关键词，按最后使用时间倒序
 */
export async function getAllSearchKeywords(): Promise<SearchKeyword[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM search_keywords ORDER BY lastUseTime DESC'
  );
  return rows.map(row => mapRowToKeyword(row));
}

/** 模糊搜索关键词，对齐 Legado SearchKeywordDao.flowSearch */
export async function searchSearchKeywords(key: string): Promise<SearchKeyword[]> {
  const q = key.trim();
  const db = await getDatabase();
  if (!q) {
    return getAllSearchKeywords();
  }
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM search_keywords WHERE word LIKE '%' || ? || '%'
     ORDER BY usage DESC, lastUseTime DESC`,
    [q]
  );
  return rows.map((row) => mapRowToKeyword(row));
}

/**
 * 获取单个搜索关键词
 */
export async function getSearchKeyword(
  word: string
): Promise<SearchKeyword | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM search_keywords WHERE word = ?',
    [word]
  );
  return rows.length > 0 ? mapRowToKeyword(rows[0]) : null;
}

/**
 * 插入或更新搜索关键词
 */
export async function upsertSearchKeyword(word: string): Promise<void> {
  const db = await getDatabase();
  const existing = await getSearchKeyword(word);
  
  if (existing) {
    // 增加使用次数并更新时间
    await db.execute(
      'UPDATE search_keywords SET usage = usage + 1, lastUseTime = ? WHERE word = ?',
      [Date.now(), word]
    );
  } else {
    // 插入新关键词
    await db.execute(
      'INSERT INTO search_keywords (word, usage, lastUseTime) VALUES (?, ?, ?)',
      [word, 1, Date.now()]
    );
  }
}

/**
 * 删除搜索关键词
 */
export async function deleteSearchKeyword(word: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM search_keywords WHERE word = ?', [word]);
}

/**
 * 清空所有搜索关键词
 */
export async function clearSearchKeywords(): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM search_keywords');
}

/**
 * 将数据库行映射为 SearchKeyword 对象
 */
function mapRowToKeyword(row: Record<string, unknown>): SearchKeyword {
  return {
    word: String(row.word ?? ''),
    usage: Number(row.usage ?? 1),
    lastUseTime: Number(row.lastUseTime ?? 0),
  };
}
