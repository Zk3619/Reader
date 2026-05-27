/**
 * chapter_cache 增加 file_path，支持大章节落盘
 */

import type { DatabaseAdapter } from '@/lib/platform/database';

export const CHAPTER_CACHE_SCHEMA_VERSION = 97;

/** 与版本号无关：每次启动都应调用，修复「已记录 v97 但缺列」等情况 */
export async function ensureChapterCacheSchema(db: DatabaseAdapter): Promise<void> {
  const tables = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_cache'`,
  );
  if (tables.length === 0) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chapter_cache (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY(book_url, chapter_index)
      )
    `);
    return;
  }

  const cols = await db.select<{ name: string }>(`PRAGMA table_info(chapter_cache)`);
  const names = cols.map((c) => String(c.name ?? '').toLowerCase());
  if (!names.includes('file_path')) {
    console.log('[数据库迁移] chapter_cache 添加 file_path 列');
    await db.execute('ALTER TABLE chapter_cache ADD COLUMN file_path TEXT');
  }
}

export async function migrateChapterCacheV97(db: DatabaseAdapter): Promise<void> {
  await ensureChapterCacheSchema(db);
}
