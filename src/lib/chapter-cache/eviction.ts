/**
 * 章节正文缓存容量与保留期淘汰（仅作用于 auto 级：阅读自动缓存）
 */

import { getDatabase } from '@/lib/database/database-core';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import { deleteChapterFile } from '@/lib/chapter-cache/file-storage';
import { getChapterCacheSettings } from '@/lib/chapter-cache/settings';
import { ReaderTables } from '@/lib/database/table-names';

const AUTO_TIER_SQL = `(cache_tier IS NULL OR cache_tier = 'auto')`;

export async function enforceChapterCacheLimits(): Promise<void> {
  const settings = await getChapterCacheSettings();
  if (settings.retentionDays > 0) {
    await purgeAutoChapterCacheByRetention(settings.retentionDays);
  }
  if (settings.maxBytesMb > 0) {
    await purgeAutoChapterCacheByTotalSize(settings.maxBytesMb * 1024 * 1024);
  }
}

async function purgeAutoChapterCacheByRetention(retentionDays: number): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86_400;
  const db = await getDatabase();
  const rows = await db.select<{
    book_url: string;
    chapter_index: number;
    file_path: string | null;
  }>(
    `SELECT book_url, chapter_index, file_path FROM ${ReaderTables.chapterCache}
     WHERE ${AUTO_TIER_SQL} AND created_at > 0 AND created_at < ?`,
    [cutoff],
  );
  for (const row of rows) {
    if (row.file_path) {
      await deleteChapterFile(row.file_path).catch(() => {});
    }
    await chapterCacheDb.deleteChapterCache(row.book_url, row.chapter_index);
  }
}

async function purgeAutoChapterCacheByTotalSize(maxBytes: number): Promise<void> {
  const db = await getDatabase();
  let rows = await db.select<{
    book_url: string;
    chapter_index: number;
    file_path: string | null;
    content: string | null;
    created_at: number;
  }>(
    `SELECT book_url, chapter_index, file_path, content, created_at
     FROM ${ReaderTables.chapterCache}
     WHERE ${AUTO_TIER_SQL}
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
