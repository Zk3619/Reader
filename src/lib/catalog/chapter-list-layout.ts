/**
 * 目录列表行布局（对齐 legado 卷下缩进，O(n) 预计算）
 */

import type { BookChapter } from '@/types';

/** 虚拟列表行高估计（py-2.5 + text-sm 单行） */
export const CATALOG_ROW_HEIGHT_PX = 40;

/** 非卷章节：前方是否出现过卷标题 */
export function computeUnderVolumeFlags(chapters: readonly BookChapter[]): boolean[] {
  let seenVolume = false;
  return chapters.map((ch) => {
    if (ch.isVolume) {
      seenVolume = true;
      return false;
    }
    return seenVolume;
  });
}

export type ChapterRowMeta = {
  chapter: BookChapter;
  index: number;
  underVolume: boolean;
};

export function buildChapterRowMetas(chapters: readonly BookChapter[]): ChapterRowMeta[] {
  const under = computeUnderVolumeFlags(chapters);
  return chapters.map((chapter, index) => ({
    chapter,
    index,
    underVolume: under[index] ?? false,
  }));
}
