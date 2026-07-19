/**
 * chapter_cache 增加 file_path，支持大章节落盘
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { ReaderTables } from '@/lib/database/table-names';
import {
  dropTableIfExists,
  dropViewIfExists,
  tableExists,
} from '@/lib/database/core/migration-helpers';

export const CHAPTER_CACHE_SCHEMA_VERSION = 97;

async function tableColumns(db: DatabaseAdapter, table: string): Promise<Set<string>> {
  const rows = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((c) => String(c.name ?? '').toLowerCase()));
}

/** 将旧 chapter_cache 合并进 reader_chapter_cache（按源表实际列投影） */
export async function mergeLegacyChapterCacheIntoReader(
  db: DatabaseAdapter,
): Promise<void> {
  await dropViewIfExists(db, 'chapter_cache');
  if (!(await tableExists(db, 'chapter_cache'))) return;

  const target = ReaderTables.chapterCache;
  if (!(await tableExists(db, target))) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${target} (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        cache_tier TEXT NOT NULL DEFAULT 'auto',
        PRIMARY KEY(book_url, chapter_index)
      )
    `);
  }

  const srcCols = await tableColumns(db, 'chapter_cache');
  const hasFilePath = srcCols.has('file_path');
  const hasCacheTier = srcCols.has('cache_tier');
  const hasCreatedAt = srcCols.has('created_at');

  const selectFile = hasFilePath ? 'file_path' : 'NULL';
  const selectTier = hasCacheTier ? 'cache_tier' : "'auto'";
  const selectCreated = hasCreatedAt
    ? 'created_at'
    : "strftime('%s', 'now')";

  await db.execute(`
    INSERT OR IGNORE INTO ${target}
      (book_url, chapter_index, content, file_path, created_at, cache_tier)
    SELECT book_url, chapter_index, content, ${selectFile}, ${selectCreated}, ${selectTier}
    FROM chapter_cache
  `);

  await dropTableIfExists(db, 'chapter_cache');
}

/** 与版本号无关：每次启动都应调用，只维护 reader_chapter_cache */
export async function ensureChapterCacheSchema(db: DatabaseAdapter): Promise<void> {
  const table = ReaderTables.chapterCache;

  await mergeLegacyChapterCacheIntoReader(db);

  if (!(await tableExists(db, table))) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${table} (
        book_url TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        content TEXT,
        file_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        cache_tier TEXT NOT NULL DEFAULT 'auto',
        PRIMARY KEY(book_url, chapter_index)
      )
    `);
    return;
  }

  const names = await tableColumns(db, table);
  if (!names.has('file_path')) {
    console.log(`[数据库迁移] ${table} 添加 file_path 列`);
    await db.execute(`ALTER TABLE ${table} ADD COLUMN file_path TEXT`);
  }
  if (!names.has('cache_tier')) {
    console.log(`[数据库迁移] ${table} 添加 cache_tier 列`);
    await db.execute(
      `ALTER TABLE ${table} ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'`,
    );
  }
}

export async function migrateChapterCacheV97(db: DatabaseAdapter): Promise<void> {
  await ensureChapterCacheSchema(db);
}
