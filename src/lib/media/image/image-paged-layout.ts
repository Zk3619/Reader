/**
 * 漫画页码与阅读进度换算
 */

/** 将持久化 chapterPos 解析为 0-based 页索引（兼容旧版整型页码与 0–1 比例） */
export function chapterPosToPageIndex(pos: number, totalPages: number): number {
  if (totalPages <= 1) return 0;
  if (
    Number.isFinite(pos) &&
    pos >= 0 &&
    pos < totalPages &&
    Number.isInteger(pos)
  ) {
    return pos;
  }
  return Math.round(Math.max(0, Math.min(1, pos)) * (totalPages - 1));
}

/** 页索引 → 0–1 本章进度 */
export function pageIndexToChapterPos(pageIndex: number, totalPages: number): number {
  if (totalPages <= 1) return 0;
  return Math.max(0, Math.min(1, pageIndex / (totalPages - 1)));
}
