/**
 * 图片 / 音频 / 视频 / 文件阅读器状态
 * 对齐 Legado ReadManga / AudioPlay / VideoPlay 的章节与进度模型（Web 简化版）
 */

import { createStore } from 'solid-js/store';
import * as chaptersDb from '@/lib/database/chapters';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook, getLocalContent, readLocalBookContent } from '@/lib/local-book';
import {
  fetchAndCacheChapterContent,
  readCachedChapterRaw,
} from '@/lib/chapter-cache/storage';
import { fetchChapterListDeduped, toNewBookChapter } from '@/lib/book-source/chapters';
import { updateBookChapterMeta } from '@/lib/bookshelf/save-book-to-shelf';
import { MediaKind } from '@/lib/book-source/book-type';
import { flowImages } from '@/lib/media/flow-images';
import { parsePrimaryMediaUrl } from '@/lib/media/parse-media-urls';
import {
  dispatchMediaTextFallback,
  ReaderMediaMessages,
} from '@/lib/reader/reader-media-messages';
import type { Book, BookChapter } from '@/types';

export interface MediaReaderState {
  kind: MediaKind | null;
  book: Book | null;
  catalog: BookChapter[];
  chapterIndex: number;
  /** 图片：章内页索引；音视频：秒 */
  chapterPos: number;
  rawContent: string;
  mediaUrls: string[];
  primaryUrl: string | null;
  loading: boolean;
  error: string | null;
  guestReading: boolean;
}

const [state, setState] = createStore<MediaReaderState>({
  kind: null,
  book: null,
  catalog: [],
  chapterIndex: 0,
  chapterPos: 0,
  rawContent: '',
  mediaUrls: [],
  primaryUrl: null,
  loading: false,
  error: null,
  guestReading: false,
});

function clampChapterIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

async function persistCatalogToDb(
  book: Book,
  chapters: BookChapter[],
  guestReading: boolean,
): Promise<void> {
  if (guestReading || chapters.length === 0) return;
  const dbCount = await chaptersDb.getChapterCount(book.bookUrl);
  if (dbCount >= chapters.length) return;
  await chaptersDb.deleteChaptersByBook(book.bookUrl);
  await chaptersDb.insertChapters(chapters.map((ch) => toNewBookChapter(ch, book.bookUrl)));
  await updateBookChapterMeta(book.bookUrl, chapters);
}

function dispatchTextFallbackIfNeeded(kind: MediaKind): void {
  const book = state.book;
  if (!book) return;
  dispatchMediaTextFallback({
    bookUrl: book.bookUrl,
    chapterIndex: state.chapterIndex,
    fromKind: kind,
  });
}

function applyMediaFromRaw(
  raw: string,
  kind: MediaKind,
  chapter?: BookChapter,
): void {
  if (kind === MediaKind.image) {
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
    setState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: null,
      loading: false,
    });
    dispatchTextFallbackIfNeeded(kind);
    return;
  }

  if (
    kind === MediaKind.audio ||
    kind === MediaKind.video ||
    kind === MediaKind.file
  ) {
    const primary = parsePrimaryMediaUrl(raw, kind);
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
    dispatchTextFallbackIfNeeded(kind);
    return;
  }
}

async function loadChapterRaw(
  book: Book,
  chapter: BookChapter,
  catalog: BookChapter[],
  index: number,
  forceRefresh: boolean,
): Promise<string> {
  if (!forceRefresh) {
    const cached = await readCachedChapterRaw(book.bookUrl, index);
    if (cached?.trim()) return cached;
  }

  if (isLocalBook(book)) {
    const fileContent = await readLocalBookContent(book.bookUrl);
    return (await getLocalContent(book, chapter, fileContent)) ?? '';
  }

  const source = await sourcesDb.getSource(book.origin);
  if (!source?.enabled) {
    throw new Error('书源不存在或已禁用');
  }

  const next = catalog[index + 1];
  const raw = await fetchAndCacheChapterContent(
    source,
    book,
    chapter,
    next?.url,
  );
  return raw ?? '';
}

export const mediaReaderStore = {
  get state() {
    return state;
  },

  setBookInitialState(book: Book, kind: MediaKind): void {
    setState({
      kind,
      book,
      loading: true,
      error: null,
    });
  },

  async openBook(
    book: Book,
    kind: MediaKind,
    options?: { initialCatalog?: BookChapter[] },
  ): Promise<void> {
    const guestReading =
      !isLocalBook(book) && !(await booksDb.hasBook(book.bookUrl));

    setState({
      kind,
      book,
      guestReading,
      loading: true,
      error: null,
    });

    const rawIndex = book.durChapterIndex ?? 0;
    const chapterPos = book.durChapterPos ?? 0;
    const reverseToc = book.readConfig?.reverseToc === true;

    let catalogToUse = options?.initialCatalog?.length ? options.initialCatalog : [];
    if (!catalogToUse.length && !guestReading) {
      catalogToUse = await chaptersDb.getChapterList(book.bookUrl);
    }

    const source =
      !isLocalBook(book) && book.origin ? await sourcesDb.getSource(book.origin) : null;

    if (catalogToUse.length === 0 && source && book.tocUrl) {
      await fetchChapterListDeduped(source, book.tocUrl, {
        reverseToc,
        bookVariable: book.variable,
        onPartial: async (partial) => {
          if (partial.chapters.length === 0) return;
          if (state.book?.bookUrl !== book.bookUrl) return;
          const idx = clampChapterIndex(rawIndex, partial.chapters.length);
          setState({ catalog: partial.chapters, chapterIndex: idx, chapterPos });
          if (!state.rawContent && partial.chapters.length > 0) {
            await mediaReaderStore.loadChapter(idx);
          }
          if (partial.isComplete) {
            await persistCatalogToDb(book, partial.chapters, guestReading);
          }
        },
      });
      if (state.catalog.length > 0 && !state.primaryUrl && !state.error) {
        const idx = clampChapterIndex(rawIndex, state.catalog.length);
        await mediaReaderStore.loadChapter(idx);
      }
      return;
    }

    const chapterIndex = clampChapterIndex(rawIndex, catalogToUse.length);
    setState({ catalog: catalogToUse, chapterIndex, chapterPos });

    if (catalogToUse.length === 0) {
      setState({ loading: false, error: '暂无章节' });
      return;
    }

    await persistCatalogToDb(book, catalogToUse, guestReading);
    await mediaReaderStore.loadChapter(chapterIndex);
  },

  async loadChapter(index: number, options?: { forceRefresh?: boolean }): Promise<void> {
    const book = state.book;
    const kind = state.kind;
    if (!book || !kind) throw new Error('未打开书籍');
    if (kind === MediaKind.text) throw new Error('文本书籍请使用文本阅读器');

    if (index < 0 || index >= state.catalog.length) {
      throw new Error('章节索引超出范围');
    }

    const chapter = state.catalog[index];
    if (!chapter) throw new Error('章节不存在');

    setState({ loading: true, chapterIndex: index, error: null });

    try {
      const raw = await loadChapterRaw(
        book,
        chapter,
        state.catalog,
        index,
        options?.forceRefresh === true,
      );
      applyMediaFromRaw(raw, kind, chapter);
      setState({ loading: false });
      await mediaReaderStore.saveProgress();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载失败';
      setState({
        loading: false,
        error: msg,
        mediaUrls: [],
        primaryUrl: null,
      });
      throw e;
    }
  },

  async refreshChapter(index?: number): Promise<void> {
    await mediaReaderStore.loadChapter(index ?? state.chapterIndex, { forceRefresh: true });
  },

  setChapterPos(pos: number): void {
    setState({ chapterPos: pos });
  },

  async saveProgress(): Promise<void> {
    const book = state.book;
    if (!book || state.guestReading) return;

    const chapter = state.catalog[state.chapterIndex];
    const now = Date.now();
    const updated: Book = {
      ...book,
      durChapterIndex: state.chapterIndex,
      durChapterPos: state.chapterPos,
      durChapterTime: now,
      durChapterTitle: chapter?.title ?? book.durChapterTitle,
    };
    setState({ book: updated });
    await booksDb.updateBook(updated);
  },

  async closeBook(): Promise<void> {
    await mediaReaderStore.saveProgress();
    setState({
      kind: null,
      book: null,
      catalog: [],
      chapterIndex: 0,
      chapterPos: 0,
      rawContent: '',
      mediaUrls: [],
      primaryUrl: null,
      loading: false,
      error: null,
      guestReading: false,
    });
  },
};
