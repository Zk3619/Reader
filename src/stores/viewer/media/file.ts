/**
 * File Viewer：章节 raw → 文件 URL
 */

import { MediaKind } from '@/lib/book-source/book-type';
import { parsePrimaryMediaUrl } from '@/lib/media/parse-media-urls';
import {
  dispatchMediaTextFallback,
  ReaderMediaMessages,
} from '@/lib/media/text/reader-media-messages';
import { state, setState } from '@/stores/viewer/media/state';
import {
  loadMediaChapterWithApply,
  openMediaBookWithKind,
  setMediaBookInitialState,
} from '@/stores/viewer/media/chapter';
import type { Book, BookChapter } from '@/types';

export function setFileBookInitialState(book: Book): void {
  setMediaBookInitialState(book, MediaKind.file);
}

export function applyFileFromRaw(
  raw: string,
  chapterIndex: number,
  _chapter?: BookChapter,
  options?: { allowTextFallback?: boolean },
): void {
  const allowTextFallback = options?.allowTextFallback === true;
  const primary = parsePrimaryMediaUrl(raw, MediaKind.file);
  if (primary) {
    setState({
      rawContent: raw,
      mediaUrls: [primary],
      primaryUrl: primary,
      error: null,
    });
    return;
  }
  if (!raw.trim()) {
    setState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: ReaderMediaMessages.emptyContent,
    });
    return;
  }
  setState({
    rawContent: raw,
    mediaUrls: [],
    primaryUrl: null,
    error: null,
    loading: false,
  });
  if (allowTextFallback && state.book) {
    dispatchMediaTextFallback({
      bookUrl: state.book.bookUrl,
      chapterIndex,
      fromKind: MediaKind.file,
    });
  }
}

export async function loadFileChapter(
  index: number,
  options?: { forceRefresh?: boolean },
  saveProgressFn?: () => Promise<void>,
): Promise<void> {
  await loadMediaChapterWithApply(
    (raw, chapterIndex, chapter, opts) =>
      applyFileFromRaw(raw, chapterIndex, chapter, opts),
    index,
    options,
    saveProgressFn,
  );
}

export async function openFileBook(
  book: Book,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  await openMediaBookWithKind(MediaKind.file, book, options, (index) =>
    loadFileChapter(index),
  );
}
