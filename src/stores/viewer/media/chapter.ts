/**
 * media 公用章节能力：目录持久化、raw 拉取、非 text 打开/加载流水线
 */

import * as chaptersDb from '@/lib/database/chapters';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook, getLocalContent, readLocalBookContent } from '@/lib/local-book';
import {
  fetchAndCacheChapterContent,
  readCachedChapterRaw,
  deleteCachedChapter,
} from '@/lib/chapter-cache/storage';
import { fetchChapterListDeduped, toNewBookChapter } from '@/lib/book-source/chapters';
import { updateBookChapterMeta } from '@/lib/bookshelf/save-book-to-shelf';
import { MediaKind } from '@/lib/book-source/book-type';
import {
  warnChapterCacheHit,
  logChapterForceRefresh,
} from '@/lib/book-source/content-fetch-trace';
import { state, setState } from '@/stores/viewer/media/state';
import type { Book, BookChapter } from '@/types';

export type ApplyMediaFromRawFn = (
  raw: string,
  chapterIndex: number,
  chapter: BookChapter | undefined,
  options: { allowTextFallback: boolean },
) => void | Promise<void>;

let chapterLoadSeq = 0;
let allowMediaTextFallback = false;

export function resetMediaChapterSession(): void {
  chapterLoadSeq = 0;
  allowMediaTextFallback = false;
  void import('@/stores/viewer/media/audio').then((m) => m.revokeAudioPlaybackUrls());
  void import('@/stores/viewer/media/video').then((m) => m.revokeVideoPlaybackUrls());
  void import('@/lib/media/video/video-chapter-cache').then((m) => m.clearVideoChapterCache());
}

export function beginMediaChapterSession(): void {
  chapterLoadSeq = 0;
  allowMediaTextFallback = true;
}

export function clampChapterIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

export async function persistCatalogToDb(
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

export async function loadChapterRaw(
  book: Book,
  chapter: BookChapter,
  catalog: BookChapter[],
  index: number,
  forceRefresh: boolean,
): Promise<string> {
  if (forceRefresh) {
    logChapterForceRefresh(index, chapter.title);
    await deleteCachedChapter(book.bookUrl, index);
  }

  if (!forceRefresh) {
    const cached = await readCachedChapterRaw(book.bookUrl, index);
    if (cached?.trim()) {
      warnChapterCacheHit(index, cached, chapter.title);
      return cached;
    }
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

export async function openMediaBookWithKind(
  kind: MediaKind,
  book: Book,
  options: { initialCatalog?: BookChapter[] } | undefined,
  loadChapter: (index: number) => Promise<void>,
): Promise<void> {
  if (kind === MediaKind.text) {
    throw new Error('文本书籍请使用文本阅读器');
  }

  const guestReading =
    !isLocalBook(book) && !(await booksDb.hasBook(book.bookUrl));

  beginMediaChapterSession();
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
          await loadChapter(idx);
        }
        if (partial.isComplete) {
          await persistCatalogToDb(book, partial.chapters, guestReading);
        }
      },
    });
    if (state.catalog.length > 0 && !state.primaryUrl && !state.error) {
      const idx = clampChapterIndex(rawIndex, state.catalog.length);
      await loadChapter(idx);
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
  await loadChapter(chapterIndex);
}

export async function loadMediaChapterWithApply(
  applyFromRaw: ApplyMediaFromRawFn,
  index: number,
  options?: { forceRefresh?: boolean },
  saveProgressFn?: () => Promise<void>,
): Promise<void> {
  const book = state.book;
  const kind = state.kind;
  if (!book || !kind) throw new Error('未打开书籍');
  if (kind === MediaKind.text) throw new Error('文本书籍请使用文本阅读器');

  if (index < 0 || index >= state.catalog.length) {
    throw new Error('章节索引超出范围');
  }

  const chapter = state.catalog[index];
  if (!chapter) throw new Error('章节不存在');

  const seq = ++chapterLoadSeq;
  const allowTextFallback = allowMediaTextFallback;
  setState({ loading: true, chapterIndex: index, error: null });

  try {
    const raw = await loadChapterRaw(
      book,
      chapter,
      state.catalog,
      index,
      options?.forceRefresh === true,
    );
    if (seq !== chapterLoadSeq) return;
    await applyFromRaw(raw, index, chapter, { allowTextFallback });
    if (seq !== chapterLoadSeq) return;
    setState({ loading: false });
    allowMediaTextFallback = false;
    if (saveProgressFn) {
      await saveProgressFn();
    }
  } catch (e) {
    if (seq !== chapterLoadSeq) return;
    const msg = e instanceof Error ? e.message : '加载失败';
    setState({
      loading: false,
      error: msg,
      mediaUrls: [],
      primaryUrl: null,
    });
    throw e;
  }
}

export async function saveMediaProgress(): Promise<void> {
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
  window.dispatchEvent(
    new CustomEvent('bookshelf-book-updated', {
      detail: { bookUrl: book.bookUrl },
    }),
  );
}

export function setMediaBookInitialState(book: Book, kind: MediaKind): void {
  if (kind === MediaKind.text) return;
  beginMediaChapterSession();
  setState({
    kind,
    book,
    loading: true,
    error: null,
  });
}
