/**
 * 分模块搜索历史 DAO（镜像 reader_search_keywords）
 */

import { getDatabase } from '@/lib/database/database-core';
import { AudioTables, SubTables, VideoTables } from '@/lib/database/table-names';

export interface ModuleSearchKeyword {
  word: string;
  usage: number;
  lastUseTime: number;
}

type KeywordTable =
  | typeof AudioTables.searchKeywords
  | typeof VideoTables.searchKeywords
  | typeof SubTables.searchKeywords;

function mapRow(row: Record<string, unknown>): ModuleSearchKeyword {
  return {
    word: String(row.word ?? ''),
    usage: Number(row.usage ?? 1),
    lastUseTime: Number(row.lastUseTime ?? 0),
  };
}

async function upsertKeyword(table: KeywordTable, word: string): Promise<void> {
  const db = await getDatabase();
  const trimmed = word.trim();
  if (!trimmed) return;
  const now = Date.now();
  const existing = await db.select<{ usage: number }>(
    `SELECT usage FROM ${table} WHERE word = ?`,
    [trimmed],
  );
  if (existing[0]) {
    await db.execute(
      `UPDATE ${table} SET usage = ?, lastUseTime = ? WHERE word = ?`,
      [Number(existing[0].usage ?? 0) + 1, now, trimmed],
    );
  } else {
    await db.execute(
      `INSERT INTO ${table} (word, usage, lastUseTime) VALUES (?, 1, ?)`,
      [trimmed, now],
    );
  }
}

async function searchKeywords(
  table: KeywordTable,
  query: string,
  limit = 20,
): Promise<ModuleSearchKeyword[]> {
  const db = await getDatabase();
  const q = query.trim();
  const rows = q
    ? await db.select<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE word LIKE ? ORDER BY lastUseTime DESC LIMIT ?`,
        [`%${q}%`, limit],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT * FROM ${table} ORDER BY lastUseTime DESC LIMIT ?`,
        [limit],
      );
  return rows.map(mapRow);
}

async function deleteKeyword(table: KeywordTable, word: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${table} WHERE word = ?`, [word]);
}

async function clearKeywords(table: KeywordTable): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${table}`);
}

export const upsertAudioSearchKeyword = (word: string) =>
  upsertKeyword(AudioTables.searchKeywords, word);
export const searchAudioSearchKeywords = (query: string, limit?: number) =>
  searchKeywords(AudioTables.searchKeywords, query, limit);
export const deleteAudioSearchKeyword = (word: string) =>
  deleteKeyword(AudioTables.searchKeywords, word);
export const clearAudioSearchKeywords = () => clearKeywords(AudioTables.searchKeywords);

export const upsertVideoSearchKeyword = (word: string) =>
  upsertKeyword(VideoTables.searchKeywords, word);
export const searchVideoSearchKeywords = (query: string, limit?: number) =>
  searchKeywords(VideoTables.searchKeywords, query, limit);
export const deleteVideoSearchKeyword = (word: string) =>
  deleteKeyword(VideoTables.searchKeywords, word);
export const clearVideoSearchKeywords = () => clearKeywords(VideoTables.searchKeywords);

export const upsertSubSearchKeyword = (word: string) =>
  upsertKeyword(SubTables.searchKeywords, word);
export const searchSubSearchKeywords = (query: string, limit?: number) =>
  searchKeywords(SubTables.searchKeywords, query, limit);
export const deleteSubSearchKeyword = (word: string) =>
  deleteKeyword(SubTables.searchKeywords, word);
export const clearSubSearchKeywords = () => clearKeywords(SubTables.searchKeywords);

/** 从 settings 数组一次性迁入（usage=1） */
export async function importAudioSearchHistoryWords(words: string[]): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  let i = 0;
  for (const raw of words) {
    const word = String(raw ?? '').trim();
    if (!word) continue;
    await db.execute(
      `INSERT OR IGNORE INTO ${AudioTables.searchKeywords} (word, usage, lastUseTime)
       VALUES (?, 1, ?)`,
      [word, now - i],
    );
    i += 1;
  }
}
