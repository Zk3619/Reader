/**
 * 按书籍统计章节缓存占用
 */

import { join } from '@tauri-apps/api/path';
import { getDatabase } from '@/lib/database/database-core';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { fileExists } from '@/lib/platform/filesystem';
import { isTauri } from '@/lib/platform/detect';
import { bookCacheFolderKey } from '@/lib/chapter-cache/book-cache-key';
import { getChapterFileByteSize } from '@/lib/chapter-cache/file-storage';
import { sqlNonNegativeInt } from '@/lib/chapter-cache/sql-stats';
import { ReaderTables } from '@/lib/database/table-names';

export interface BookChapterCacheStats {
  chapterCount: number;
  /** 阅读自动缓存 */
  autoChapterCount: number;
  /** 用户离线缓存 */
  manualChapterCount: number;
  estimatedBytes: number;
}

export async function getChapterCacheStatsForBook(
  bookUrl: string,
  bookName?: string,
): Promise<BookChapterCacheStats> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT COUNT(*) as cnt,
            SUM(CASE WHEN cache_tier = 'manual' THEN 1 ELSE 0 END) as manual_cnt,
            SUM(CASE WHEN cache_tier IS NULL OR cache_tier = 'auto' THEN 1 ELSE 0 END) as auto_cnt,
            COALESCE(SUM(
              CASE WHEN file_path IS NULL OR file_path = '' THEN LENGTH(content) ELSE 0 END
            ), 0) as inline_bytes,
            SUM(CASE WHEN file_path IS NOT NULL AND file_path != '' THEN 1 ELSE 0 END) as file_cnt
     FROM ${ReaderTables.chapterCache} WHERE book_url = ?`,
    [bookUrl],
  );
  const row = rows[0] ?? {};
  const chapterCount = sqlNonNegativeInt(row.cnt);
  const autoChapterCount = sqlNonNegativeInt(row.auto_cnt);
  const manualChapterCount = sqlNonNegativeInt(row.manual_cnt);
  let estimatedBytes = sqlNonNegativeInt(row.inline_bytes);
  const fileCount = sqlNonNegativeInt(row.file_cnt);

  if (fileCount > 0) {
    let fileBytes = 0;
    if (isTauri()) {
      try {
        const appDir = await getAppDataDir();
        const folder = bookCacheFolderKey(bookUrl, bookName);
        const bookDir = await join(appDir, 'book-cache', folder);
        if (await fileExists(bookDir)) {
          fileBytes = await estimateBookDirSize(bookDir);
        }
      } catch {
        fileBytes = 0;
      }
    }
    if (fileBytes <= 0) {
      const fileRows = await db.select<Record<string, unknown>>(
        `SELECT file_path FROM ${ReaderTables.chapterCache}
         WHERE book_url = ? AND file_path IS NOT NULL AND file_path != ''`,
        [bookUrl],
      );
      for (const fileRow of fileRows) {
        fileBytes += await getChapterFileByteSize(String(fileRow.file_path ?? ''));
      }
    }
    if (fileBytes <= 0) {
      fileBytes = fileCount * 600 * 1024;
    }
    estimatedBytes += fileBytes;
  }

  return { chapterCount, autoChapterCount, manualChapterCount, estimatedBytes };
}

async function estimateBookDirSize(dir: string): Promise<number> {
  const { readDir, stat } = await import('@tauri-apps/plugin-fs');
  let total = 0;
  const entries = await readDir(dir);
  for (const entry of entries) {
    const path = await join(dir, entry.name);
    if (entry.isDirectory) {
      total += await estimateBookDirSize(path);
    } else {
      const info = await stat(path);
      total += info.size ?? 0;
    }
  }
  return total;
}
