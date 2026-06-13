/**
 * 统一 Viewer Store：按 MediaKind 调度 text / image / audio / video / file
 */

import * as chaptersDb from '@/lib/database/chapters';
import { deleteCachedChapter } from '@/lib/chapter-cache/storage';
import { MediaKind } from '@/lib/book-source/book-type';
import { clearChapterContentPool } from '@/lib/chapter-cache/chapter-content-pool';
import {
  cancelPrefetchOnRead,
  restartChapterBodyCachePrefetch,
  subscribeChapterPrefetchSettingsChange,
} from '@/lib/chapter-cache/prefetch';
import { isLocalBook } from '@/lib/local-book';
import { flushReadingSession } from '@/lib/media/text/reading-session';
import type { Book, BookChapter } from '@/types';
import { state, setState, resetViewerState } from '@/stores/viewer/media/state';
import {
  isMediaViewerBootstrapping,
  resetMediaChapterSession,
  saveMediaProgress,
} from '@/stores/viewer/media/chapter';
import {
  loadImageChapter,
  openImageBook,
  setImageBookInitialState,
} from '@/stores/viewer/media/image';
import {
  loadAudioChapter,
  openAudioBook,
  setAudioBookInitialState,
} from '@/stores/viewer/media/audio';
import {
  loadVideoChapter,
  openVideoBook,
  setVideoBookInitialState,
} from '@/stores/viewer/media/video';
import {
  loadFileChapter,
  openFileBook,
  setFileBookInitialState,
} from '@/stores/viewer/media/file';
import {
  loadTextChapter,
  openTextBook,
  resetTextViewerSession,
  saveTextProgress,
  setTextBookInitialState,
} from '@/stores/viewer/media/text';

function setBookInitialStateForKind(book: Book, kind: MediaKind): void {
  switch (kind) {
    case MediaKind.text:
      setTextBookInitialState(book);
      break;
    case MediaKind.image:
      setImageBookInitialState(book);
      break;
    case MediaKind.audio:
      setAudioBookInitialState(book);
      break;
    case MediaKind.video:
      setVideoBookInitialState(book);
      break;
    case MediaKind.file:
      setFileBookInitialState(book);
      break;
  }
}

async function openBookForKind(
  book: Book,
  kind: MediaKind,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  switch (kind) {
    case MediaKind.text:
      await openTextBook(book, options);
      return;
    case MediaKind.image:
      await openImageBook(book, options);
      return;
    case MediaKind.audio:
      await openAudioBook(book, options);
      return;
    case MediaKind.video:
      await openVideoBook(book, options);
      return;
    case MediaKind.file:
      await openFileBook(book, options);
      return;
  }
}

async function loadChapterForKind(
  kind: MediaKind,
  index: number,
  options?: { forceRefresh?: boolean },
): Promise<void> {
  const save = () => viewerStore.saveProgress();
  switch (kind) {
    case MediaKind.text:
      await loadTextChapter(index, options);
      return;
    case MediaKind.image:
      await loadImageChapter(index, options, save);
      return;
    case MediaKind.audio:
      await loadAudioChapter(index, options, save);
      return;
    case MediaKind.video:
      await loadVideoChapter(index, options, save);
      return;
    case MediaKind.file:
      await loadFileChapter(index, options, save);
      return;
  }
}

export const viewerStore = {
  get state() {
    return state;
  },

  setBookInitialState(book: Book, kind: MediaKind): void {
    setBookInitialStateForKind(book, kind);
  },

  async openBook(
    book: Book,
    kind: MediaKind,
    options?: { initialCatalog?: BookChapter[] },
  ): Promise<void> {
    await openBookForKind(book, kind, options);
  },

  async loadChapter(
    index: number,
    options?: { forceRefresh?: boolean },
  ): Promise<void> {
    const kind = state.kind;
    if (!kind) throw new Error('未打开书籍');
    await loadChapterForKind(kind, index, options);
  },

  async refreshChapter(index?: number): Promise<void> {
    if (!state.book || !state.kind) {
      throw new Error('未打开书籍');
    }
    const idx = index ?? state.chapterIndex;
    if (
      state.kind === MediaKind.text &&
      !isLocalBook(state.book) &&
      state.book.origin &&
      state.book.origin !== 'local'
    ) {
      await deleteCachedChapter(state.book.bookUrl, idx);
    }
    if (state.kind === MediaKind.video) {
      const { invalidateCurrentVideoChapterCache } = await import(
        '@/stores/viewer/media/video'
      );
      invalidateCurrentVideoChapterCache();
    }
    if (state.kind === MediaKind.audio) {
      const { invalidateCurrentAudioChapterCache } = await import(
        '@/stores/viewer/media/audio'
      );
      invalidateCurrentAudioChapterCache();
    }
    await viewerStore.loadChapter(idx, { forceRefresh: true });
  },

  async loadCatalog(bookUrl: string): Promise<BookChapter[]> {
    if (state.book?.bookUrl === bookUrl && state.catalog.length > 0) {
      return state.catalog;
    }
    try {
      const catalog = await chaptersDb.getChapterList(bookUrl);
      if (state.book?.bookUrl === bookUrl) {
        setState({ catalog });
      }
      return catalog;
    } catch (e) {
      console.error('加载章节列表失败:', e);
      throw e;
    }
  },

  isOpen(): boolean {
    return state.book != null && state.kind != null;
  },

  setChapterPos(pos: number): void {
    setState({ chapterPos: pos });
  },

  async saveProgress(): Promise<void> {
    if (!state.book || state.guestReading) return;
    if (state.kind === MediaKind.text) {
      await saveTextProgress();
      return;
    }
    if (state.kind) {
      await saveMediaProgress();
    }
  },

  isGuestReading(): boolean {
    return state.guestReading;
  },

  setGuestReading(value: boolean): void {
    setState({ guestReading: value });
  },

  isMediaViewerBootstrapping(): boolean {
    return isMediaViewerBootstrapping();
  },

  async closeBook(): Promise<void> {
    const book = state.book;
    const kind = state.kind;

    if (book && !state.guestReading) {
      await viewerStore.saveProgress();
    }

    if (kind === MediaKind.text) {
      await flushReadingSession(state.guestReading ? null : book);
      if (book?.bookUrl) cancelPrefetchOnRead(book.bookUrl);
      resetTextViewerSession();
    } else if (kind) {
      resetMediaChapterSession();
    }

    clearChapterContentPool();
    resetViewerState();
  },

  async switchToTextAtChapter(chapterIndex: number): Promise<void> {
    const book = state.book;
    const catalog = state.catalog.length > 0 ? [...state.catalog] : undefined;
    if (!book) return;

    resetMediaChapterSession();
    cancelPrefetchOnRead(book.bookUrl);
    resetTextViewerSession();
    clearChapterContentPool();
    resetViewerState();

    setTextBookInitialState(book);
    await openTextBook(book, { initialCatalog: catalog });
    await loadTextChapter(chapterIndex);
  },
};

subscribeChapterPrefetchSettingsChange(() => {
  const book = state.book;
  if (!book || state.guestReading) return;
  if (state.catalog.length === 0) return;
  restartChapterBodyCachePrefetch(book, state.catalog, state.chapterIndex);
});
