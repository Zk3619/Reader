/**
 * æ?ç´¢å?³é?®è¯æ?°æ®è®¿é?®å¯¹è±¡
 * å¯¹åº? legado é¡¹ç?®ç?? SearchKeywordDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { SearchKeyword } from '@/types';

/**
 * è?·å?æ??æ??æ?ç´¢å?³é?®è¯ï¼?æ??ä½¿ç?¨æ¬¡æ?°å??æ?¶é?´æ??åºï¼?
 */
export async function getAllSearchKeywords(): Promise<SearchKeyword[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM search_keywords ORDER BY usage DESC, lastUseTime DESC'
  );
  return rows.map(row => mapRowToKeyword(row));
}

/** ??????????? Legado SearchKeywordDao.flowSearch? */
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
 * è?·å?æ?ç´¢å?³é?®è¯
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
 * æ?å?¥æ??æ?´æ?°æ?ç´¢å?³é?®è¯
 */
export async function upsertSearchKeyword(word: string): Promise<void> {
  const db = await getDatabase();
  const existing = await getSearchKeyword(word);
  
  if (existing) {
    // æ?´æ?°ä½¿ç?¨æ¬¡æ?°å??æ?¶é?´
    await db.execute(
      'UPDATE search_keywords SET usage = usage + 1, lastUseTime = ? WHERE word = ?',
      [Date.now(), word]
    );
  } else {
    // æ?å?¥æ?°å?³é?®è¯
    await db.execute(
      'INSERT INTO search_keywords (word, usage, lastUseTime) VALUES (?, ?, ?)',
      [word, 1, Date.now()]
    );
  }
}

/**
 * å? é?¤æ?ç´¢å?³é?®è¯
 */
export async function deleteSearchKeyword(word: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM search_keywords WHERE word = ?', [word]);
}

/**
 * æ¸?ç©ºæ??æ??æ?ç´¢å?³é?®è¯
 */
export async function clearSearchKeywords(): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM search_keywords');
}

/**
 * å°?æ?°æ®åº?è¡?æ? å°?ä¸ºSearchKeywordå¯¹è±¡
 */
function mapRowToKeyword(row: Record<string, unknown>): SearchKeyword {
  return {
    word: String(row.word ?? ''),
    usage: Number(row.usage ?? 1),
    lastUseTime: Number(row.lastUseTime ?? 0),
  };
}
