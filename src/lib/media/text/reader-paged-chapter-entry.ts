/** 按页切章落点（对齐 Legado ReadBook.moveToPrevChapter toLast / moveToNextChapter） */

export type PagedChapterEntry = 'first' | 'last' | 'restore';

let pendingEntry: PagedChapterEntry = 'restore';

export function markPagedChapterEntry(entry: PagedChapterEntry): void {
  pendingEntry = entry;
}

export function consumePagedChapterEntry(): PagedChapterEntry {
  const entry = pendingEntry;
  pendingEntry = 'restore';
  return entry;
}

export function chapterPosForPagedEntry(entry: PagedChapterEntry, fallback: number): number {
  if (entry === 'last') return 1;
  if (entry === 'first') return 0;
  return Math.min(1, Math.max(0, fallback));
}

/** 滚动模式切章：章首对齐视口顶；按页模式沿用 first/last 端点 */
export function chapterPosForChapterSwitch(
  entry: PagedChapterEntry,
  fallback: number,
  scrollMode: boolean,
): number {
  if (scrollMode && (entry === 'first' || entry === 'last')) return 0;
  return chapterPosForPagedEntry(entry, fallback);
}
