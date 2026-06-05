/**
 * 章节缓存占用统计
 */

import { getDatabase } from '@/lib/database/database-core';
import { isTauri } from '@/lib/platform/detect';
import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { fileExists } from '@/lib/platform/filesystem';
import { enforceChapterCacheLimits } from '@/lib/chapter-cache/eviction';

export interface ChapterCacheStats {
  chapterCount: number;
  /** 估算字节（DB content 长度 + 文件大小未精确扫描时为近似） */
  estimatedBytes: number;
}

export async function getChapterCacheStats(): Promise<ChapterCacheStats> {
  await enforceChapterCacheLimits().catch(() => {});
  const db = await getDatabase();
  const rows = await db.select<{ cnt: number; bytes: number }>(
    `SELECT COUNT(*) as cnt,
            COALESCE(SUM(LENGTH(content)), 0) as bytes
     FROM chapter_cache`,
  );
  const chapterCount = rows[0]?.cnt ?? 0;
  let estimatedBytes = rows[0]?.bytes ?? 0;

  const fileRows = await db.select<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM chapter_cache WHERE file_path IS NOT NULL AND file_path != ''`,
  );
  const fileCount = fileRows[0]?.cnt ?? 0;
  if (fileCount > 0 && isTauri()) {
    try {
      const appDir = await getAppDataDir();
      const cacheDir = await join(appDir, 'book-cache');
      if (await fileExists(cacheDir)) {
        const dirSize = await estimateDirSize(cacheDir);
        estimatedBytes += dirSize;
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

export function formatChapterCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
