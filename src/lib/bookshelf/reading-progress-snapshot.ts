import { readerStore } from '@/stores/reader';
import type { Book } from '@/types';

/** 加入书架时可携带的阅读进度（如从阅读器/详情页带着进度上架） */
export type ShelfReadingProgressInput = Pick<
  Book,
  | 'durChapterIndex'
  | 'durChapterPos'
  | 'durChapterTitle'
  | 'durChapterTime'
>;

/**
 * 若当前阅读器正在读同一本书，取快照用于加入书架。
 */
export function getReaderProgressSnapshot(bookUrl: string): ShelfReadingProgressInput | null {
  const state = readerStore.state;
  const book = state.book;
  if (!book || book.bookUrl !== bookUrl || state.catalog.length === 0) {
    return null;
  }

  const chapter = state.catalog[state.chapterIndex];
  const progress = Math.min(1, Math.max(0, state.chapterPos));

  return {
    durChapterIndex: state.chapterIndex,
    durChapterPos: progress,
    durChapterTitle: chapter?.title,
    durChapterTime: Date.now(),
  };
}

export function mergeShelfReadingProgress(
  book: Book,
  input?: ShelfReadingProgressInput | null
): Book {
  if (!input) return book;
  return {
    ...book,
    durChapterIndex: input.durChapterIndex ?? book.durChapterIndex,
    durChapterPos: input.durChapterPos ?? book.durChapterPos,
    durChapterTitle: input.durChapterTitle ?? book.durChapterTitle,
    durChapterTime: input.durChapterTime ?? book.durChapterTime,
  };
}
