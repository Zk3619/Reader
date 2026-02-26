/**
 * 搜索关键词数据访问对象
 * 对应 legado 项目的 SearchKeywordDao.kt
 */

import { getDatabase } from './database-core';
import type { SearchKeyword } from '@/types';

/**
 * 获取所有搜索关键词（按使用次数和时间排序）
 */
export async function getAllSearchKeywords(): Promise<SearchKeyword[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM search_keywords ORDER BY usage DESC, lastUseTime DESC'
  );
  return rows.map(row => mapRowToKeyword(row));
}

/**
 * 获取搜索关键词
 */
export async function getSearchKeyword(
  word: string
): Promise<SearchKeyword | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
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
    // 更新使用次数和时间
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
 * 将数据库行映射为SearchKeyword对象
 */
function mapRowToKeyword(row: Record<string, unknown>): SearchKeyword {
  return {
    word: String(row.word ?? ''),
    usage: Number(row.usage ?? 1),
    lastUseTime: Number(row.lastUseTime ?? 0),
  };
}
