/**
 * Image Viewer：章节 raw → 图片 URL 列表
 */

import { resetChapterContentPool } from '@/lib/chapter-cache/chapter-content-pool';
import { MediaKind } from '@/lib/book-source/book-type';
import { countFlowImages, flowImages } from '@/lib/media/image/flow-images';
import { commitMangaChapterToPool } from '@/lib/media/image/image-chapter-pool';
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

export function setImageBookInitialState(book: Book): void {
  setMediaBookInitialState(book, MediaKind.image);
  resetChapterContentPool(book.bookUrl);
}

export function applyImageFromRaw(
  raw: string,
  chapterIndex: number,
  chapter?: BookChapter,
  options?: { allowTextFallback?: boolean },
): void {
  const allowTextFallback = options?.allowTextFallback === true;
  const urls = flowImages(raw, chapter?.url ?? chapter?.baseUrl ?? '');
  if (urls.length > 0) {
    setState({
      rawContent: raw,
      mediaUrls: urls,
      primaryUrl: urls[0] ?? null,
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
  const chapterUrl = chapter?.url ?? chapter?.baseUrl ?? '';
  if (countFlowImages(raw, chapterUrl) > 0) {
    setState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: null,
      loading: false,
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
      fromKind: MediaKind.image,
    });
  }
}

export async function loadImageChapter(
  index: number,
  options?: { forceRefresh?: boolean },
  saveProgressFn?: () => Promise<void>,
): Promise<void> {
  await loadMediaChapterWithApply(
    (raw, chapterIndex, chapter, opts) => {
      applyImageFromRaw(raw, chapterIndex, chapter, opts);
      const book = state.book;
      if (book && raw) {
        commitMangaChapterToPool(book, state.catalog, chapterIndex, raw);
      }
    },
    index,
    options,
    saveProgressFn,
  );
}

export async function openImageBook(
  book: Book,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  await openMediaBookWithKind(MediaKind.image, book, options, (index) =>
    loadImageChapter(index),
  );
}
