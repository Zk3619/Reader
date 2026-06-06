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
