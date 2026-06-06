/**
 * 章节正文缓存键：统一使用目录数组下标（与阅读器 chapterIndex / 目录 UI 一致）
 */

import type { BookChapter } from '@/types';

/** 保证 catalog[i].index === i，避免缓存读写与云标错位 */
export function normalizeCatalogChapterIndices(
  chapters: BookChapter[],
): BookChapter[] {
  if (chapters.length === 0) return chapters;
  let changed = false;
  const next = chapters.map((chapter, index) => {
    if (chapter.index === index) return chapter;
    changed = true;
    return { ...chapter, index };
  });
  return changed ? next : chapters;
}

/** 目录数组下标 → chapter_cache.chapter_index */
export function catalogCacheIndex(
  catalogIndex: number,
  _chapter?: BookChapter,
): number {
  return catalogIndex;
}
