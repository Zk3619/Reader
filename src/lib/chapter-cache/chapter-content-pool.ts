/**
 * 阅读器正文内存池（对齐 Legado ReadBook cur/prev/nextTextChapter）
 * 相邻已处理正文常驻内存，切章时命中则无需再读库/拉网。
 */

type PoolEntry = { index: number; content: string };

let poolBookUrl = '';
let prevEntry: PoolEntry | null = null;
let currentEntry: PoolEntry | null = null;
let nextEntry: PoolEntry | null = null;

export function resetChapterContentPool(bookUrl: string): void {
  poolBookUrl = bookUrl;
  prevEntry = null;
  currentEntry = null;
  nextEntry = null;
}

export function clearChapterContentPool(): void {
  poolBookUrl = '';
  prevEntry = null;
  currentEntry = null;
  nextEntry = null;
}

export function getPooledChapterContent(
  bookUrl: string,
  index: number,
): string | null {
  if (bookUrl !== poolBookUrl) return null;
  if (currentEntry?.index === index) return currentEntry.content;
  if (prevEntry?.index === index) return prevEntry.content;
  if (nextEntry?.index === index) return nextEntry.content;
  return null;
}

export function setCurrentChapterInPool(
  bookUrl: string,
  index: number,
  content: string,
): void {
  if (poolBookUrl && poolBookUrl !== bookUrl) {
    resetChapterContentPool(bookUrl);
  } else if (!poolBookUrl) {
    poolBookUrl = bookUrl;
  }
  currentEntry = { index, content };
  if (prevEntry && prevEntry.index !== index - 1) prevEntry = null;
  if (nextEntry && nextEntry.index !== index + 1) nextEntry = null;
}

export function setAdjacentChapterInPool(
  bookUrl: string,
  currentIndex: number,
  index: number,
  content: string,
): void {
  if (bookUrl !== poolBookUrl) return;
  if (index === currentIndex - 1) {
    prevEntry = { index, content };
  } else if (index === currentIndex + 1) {
    nextEntry = { index, content };
  }
}

/** 下一章已预载：将 next 提升为 current（对齐 Legado moveToNextChapter） */
export function swapPoolToNextChapter(): {
  index: number;
  content: string;
} | null {
  if (!nextEntry || !currentEntry) return null;
  prevEntry = currentEntry;
  currentEntry = nextEntry;
  nextEntry = null;
  return currentEntry;
}

/** 上一章已预载：将 prev 提升为 current（对齐 Legado moveToPrevChapter） */
export function swapPoolToPrevChapter(): {
  index: number;
  content: string;
} | null {
  if (!prevEntry || !currentEntry) return null;
  nextEntry = currentEntry;
  currentEntry = prevEntry;
  prevEntry = null;
  return currentEntry;
}

export function hasPooledNextChapter(): boolean {
  return nextEntry != null && currentEntry != null && nextEntry.index === currentEntry.index + 1;
}

export function hasPooledPrevChapter(): boolean {
  return prevEntry != null && currentEntry != null && prevEntry.index === currentEntry.index - 1;
}
