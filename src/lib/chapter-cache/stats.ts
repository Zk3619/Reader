/**
 * 阅读缓存占用统计（章节正文 / 图片分项；音视频播放缓存预留）
 */

import { getDatabase } from '@/lib/database/database-core';
import { isTauri } from '@/lib/platform/detect';
import {
  estimateTauriBookCacheDirBytes,
  sumChapterFileByteSizes,
} from '@/lib/chapter-cache/file-storage';
import { sqlNonNegativeInt } from '@/lib/chapter-cache/sql-stats';
import { enforceChapterCacheLimits } from '@/lib/chapter-cache/eviction';
import {
  getMangaImageCacheStats,
  invalidateMangaImageMetaIndex,
} from '@/lib/media/image/image-disk-cache';

const FILE_CHAPTER_ESTIMATE_BYTES = 600 * 1024;

export interface ChapterCacheStorageBreakdown {
  /** 章节正文（HTML/文本）：DB 内联 + book-cache 落盘 */
  bodyBytes: number;
  mangaImageCount: number;
  mangaImageBytes: number;
  /** 视频/音频播放链接等持久化缓存（当前无实现，恒为 0） */
  mediaPlaybackBytes: number;
}

export interface ChapterCacheStats {
  chapterCount: number;
  /** 阅读自动缓存章数（受保留期/容量策略约束） */
  autoChapterCount: number;
  /** 用户离线缓存章数（仅用户清除） */
  manualChapterCount: number;
  breakdown: ChapterCacheStorageBreakdown;
  /** 各分项之和 */
  totalBytes: number;
  /** @deprecated 与 totalBytes 相同，兼容旧调用 */
  estimatedBytes: number;
}

export function sumChapterCacheBreakdownBytes(
  breakdown: ChapterCacheStorageBreakdown,
): number {
  return (
    breakdown.bodyBytes +
    breakdown.mangaImageBytes +
    breakdown.mediaPlaybackBytes
  );
}

async function loadMangaImageStats(): Promise<{
  imageCount: number;
  estimatedBytes: number;
}> {
  try {
    invalidateMangaImageMetaIndex();
    const stats = await getMangaImageCacheStats();
    return {
      imageCount: sqlNonNegativeInt(stats.imageCount),
      estimatedBytes: sqlNonNegativeInt(stats.estimatedBytes),
    };
  } catch (e) {
    console.warn('[chapter-cache-stats] manga image stats failed', e);
    return { imageCount: 0, estimatedBytes: 0 };
  }
}

async function estimateFileBackedBodyBytes(filePaths: string[]): Promise<number> {
  if (filePaths.length === 0) return 0;

  if (isTauri()) {
    const dirBytes = await estimateTauriBookCacheDirBytes();
    if (dirBytes > 0) return dirBytes;
  }

  const summed = await sumChapterFileByteSizes(filePaths);
  if (summed > 0) return summed;

  return filePaths.length * FILE_CHAPTER_ESTIMATE_BYTES;
}

export async function getChapterCacheStats(): Promise<ChapterCacheStats> {
  await enforceChapterCacheLimits().catch(() => { });

  const db = await getDatabase();
  const [rows, filePathRows, mangaStats] = await Promise.all([
    db.select<Record<string, unknown>>(
      `SELECT COUNT(*) as cnt,
              SUM(CASE WHEN cache_tier = 'manual' THEN 1 ELSE 0 END) as manual_cnt,
              SUM(CASE WHEN cache_tier IS NULL OR cache_tier = 'auto' THEN 1 ELSE 0 END) as auto_cnt,
              COALESCE(SUM(
                CASE WHEN file_path IS NULL OR file_path = '' THEN LENGTH(content) ELSE 0 END
              ), 0) as inline_bytes,
              SUM(
                CASE WHEN file_path IS NOT NULL AND file_path != '' THEN 1 ELSE 0 END
              ) as file_cnt
       FROM chapter_cache`,
    ),
    db.select<Record<string, unknown>>(
      `SELECT file_path FROM chapter_cache
       WHERE file_path IS NOT NULL AND file_path != ''`,
    ),
    loadMangaImageStats(),
  ]);

  const row = rows[0] ?? {};
  const chapterCount = sqlNonNegativeInt(row.cnt);
  const autoChapterCount = sqlNonNegativeInt(row.auto_cnt);
  const manualChapterCount = sqlNonNegativeInt(row.manual_cnt);
  const inlineBytes = sqlNonNegativeInt(row.inline_bytes);
  const fileCount = sqlNonNegativeInt(row.file_cnt);

  const filePaths = filePathRows
    .map((r) => String(r.file_path ?? '').trim())
    .filter((p) => p.length > 0);

  let fileBytes = 0;
  if (fileCount > 0 || filePaths.length > 0) {
    fileBytes = await estimateFileBackedBodyBytes(filePaths);
  }

  const breakdown: ChapterCacheStorageBreakdown = {
    bodyBytes: inlineBytes + fileBytes,
    mangaImageCount: mangaStats.imageCount,
    mangaImageBytes: mangaStats.estimatedBytes,
    mediaPlaybackBytes: 0,
  };
  const totalBytes = sumChapterCacheBreakdownBytes(breakdown);

  return {
    chapterCount,
    autoChapterCount,
    manualChapterCount,
    breakdown,
    totalBytes,
    estimatedBytes: totalBytes,
  };
}

export function formatChapterCacheSize(bytes: number): string {
  const n = sqlNonNegativeInt(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
