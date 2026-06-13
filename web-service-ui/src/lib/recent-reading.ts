import type { WebBook } from '@/lib/api';
import { buildReaderHref } from '@/lib/reader-route';

const RECENT_KEY = 'reader_web_reading_recent';

export interface RecentReading {
  bookUrl: string;
  name: string;
  author: string;
  chapterIndex: number;
  chapterPos?: number;
  chapterTitle?: string;
  isSearchBook?: boolean;
  updatedAt: number;
}

export function loadRecentReading(): RecentReading | null {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecentReading;
  } catch {
    return null;
  }
}

export function saveRecentReading(
  book: WebBook,
  chapterIndex?: number,
  chapterTitle?: string,
  chapterPos?: number,
): void {
  if (!book.bookUrl || !book.name) return;
  const entry: RecentReading = {
    bookUrl: book.bookUrl,
    name: book.name,
    author: book.author ?? '',
    chapterIndex: chapterIndex ?? book.durChapterIndex ?? 0,
    chapterPos: chapterPos ?? book.durChapterPos,
    chapterTitle: chapterTitle ?? book.durChapterTitle,
    updatedAt: Date.now(),
  };
  localStorage.setItem(RECENT_KEY, JSON.stringify(entry));
}

export function recentReadingHref(recent: RecentReading): string {
  return buildReaderHref({
    bookUrl: recent.bookUrl,
    name: recent.name,
    author: recent.author,
    index: recent.chapterIndex,
    pos: recent.chapterPos,
    searchBook: recent.isSearchBook,
  });
}
