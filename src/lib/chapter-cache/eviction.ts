/**
 * 章节正文缓存容量与保留期淘汰
 */

import { getDatabase } from '@/lib/database/database-core';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import { deleteChapterFile } from '@/lib/chapter-cache/file-storage';
import { getChapterCacheSettings } from '@/lib/chapter-cache/settings';

export async function enforceChapterCacheLimits(): Promise<void> {
  const settings = await getChapterCacheSettings();
  if (settings.retentionDays > 0) {
    await purgeChapterCacheByRetention(settings.retentionDays);
  }
  if (settings.maxBytesMb > 0) {
    await purgeChapterCacheByTotalSize(settings.maxBytesMb * 1024 * 1024);
  }
}

async function purgeChapterCacheByRetention(retentionDays: number): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86_400;
  const db = await getDatabase();
  const rows = await db.select<{ book_url: string; chapter_index: number; file_path: string | null }>(
    `SELECT book_url, chapter_index, file_path FROM chapter_cache WHERE created_at > 0 AND created_at < ?`,
    [cutoff],
  );
  for (const row of rows) {
    if (row.file_path) {
      await deleteChapterFile(row.file_path).catch(() => {});
    }
    await chapterCacheDb.deleteChapterCache(row.book_url, row.chapter_index);
  }
}

async function purgeChapterCacheByTotalSize(maxBytes: number): Promise<void> {
  const db = await getDatabase();
  let rows = await db.select<{
    book_url: string;
    chapter_index: number;
    file_path: string | null;
    content: string | null;
    created_at: number;
  }>(
    `SELECT book_url, chapter_index, file_path, content, created_at
     FROM chapter_cache
     ORDER BY created_at ASC`,
  );

  let total = rows.reduce(
    (sum, r) => sum + estimateRowBytes(r.content, r.file_path),
    0,
  );

  while (total > maxBytes && rows.length > 0) {
    const row = rows.shift()!;
    if (row.file_path) {
      await deleteChapterFile(row.file_path).catch(() => {});
    }
    await chapterCacheDb.deleteChapterCache(row.book_url, row.chapter_index);
    total -= estimateRowBytes(row.content, row.file_path);
  }
}

function estimateRowBytes(content: string | null, filePath: string | null): number {
  if (filePath) return 600 * 1024;
  return new TextEncoder().encode(content ?? '').byteLength;
}
