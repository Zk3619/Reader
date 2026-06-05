/**
 * 按书籍统计章节缓存占用
 */

import { join } from '@tauri-apps/api/path';
import { getDatabase } from '@/lib/database/database-core';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { fileExists } from '@/lib/platform/filesystem';
import { isTauri } from '@/lib/platform/detect';
import { bookCacheFolderKey } from '@/lib/chapter-cache/book-cache-key';

export interface BookChapterCacheStats {
  chapterCount: number;
  estimatedBytes: number;
}

export async function getChapterCacheStatsForBook(
  bookUrl: string,
  bookName?: string,
): Promise<BookChapterCacheStats> {
  const db = await getDatabase();
  const rows = await db.select<{ cnt: number; bytes: number; file_cnt: number }>(
    `SELECT COUNT(*) as cnt,
            COALESCE(SUM(LENGTH(content)), 0) as bytes,
            SUM(CASE WHEN file_path IS NOT NULL AND file_path != '' THEN 1 ELSE 0 END) as file_cnt
     FROM chapter_cache WHERE book_url = ?`,
    [bookUrl],
  );
  const chapterCount = rows[0]?.cnt ?? 0;
  let estimatedBytes = rows[0]?.bytes ?? 0;
  const fileCount = rows[0]?.file_cnt ?? 0;

  if (fileCount > 0 && isTauri()) {
    try {
      const appDir = await getAppDataDir();
      const folder = bookCacheFolderKey(bookUrl, bookName);
      const bookDir = await join(appDir, 'book-cache', folder);
      if (await fileExists(bookDir)) {
        estimatedBytes += await estimateDirSize(bookDir);
      } else {
        estimatedBytes += fileCount * 600 * 1024;
      }
    } catch {
      estimatedBytes += fileCount * 600 * 1024;
    }
  } else if (fileCount > 0) {
    estimatedBytes += fileCount * 600 * 1024;
  }

  return { chapterCount, estimatedBytes };
}

async function estimateDirSize(dir: string): Promise<number> {
  const { readDir, stat } = await import('@tauri-apps/plugin-fs');
  let total = 0;
  const entries = await readDir(dir);
  for (const entry of entries) {
    const path = await join(dir, entry.name);
    if (entry.isDirectory) {
      total += await estimateDirSize(path);
    } else {
      const info = await stat(path);
      total += info.size ?? 0;
    }
  }
  return total;
}
