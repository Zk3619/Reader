/**
 * 换源（对齐 Legado ChangeBookSourceDialog / ChangeChapterSourceDialog）
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import {
  deleteChangeSourceBooksByOrigin,
  insertSearchBook,
  queryChangeSourceBooks,
} from '@/lib/database/search-books';
import { getBookInfo } from '@/lib/book-source/detail';
import { getContent } from '@/lib/book-source/content';
import { fetchChapterListDeduped, toNewBookChapter } from '@/lib/book-source/chapters';
import { searchBook } from '@/lib/book-source/search';
import { isAbortError } from '@/lib/http';
import {
  getDurChapterIndex,
  isSameNameAndAuthor,
  migrateBookProgress,
} from '@/lib/bookshelf/book-migrate';
import { isLocalBook } from '@/lib/local-book';
import { writeCachedChapterRaw } from '@/lib/chapter-cache/storage';
import {
  loadChangeSourcePrefs,
  saveChangeSourcePrefs,
  type ChangeSourcePrefs,
} from '@/lib/media/text/change-source-prefs';
import type { Book, BookChapter, BookSource, SearchBook } from '@/types';

export type { ChangeSourcePrefs };
export { loadChangeSourcePrefs, saveChangeSourcePrefs };

export interface ChangeSourceCandidate {
  source: BookSource;
  searchBook: SearchBook;
}

export interface ChangeSourceSearchCallbacks {
  onResults?: (books: SearchBook[]) => void;
  onProgress?: (done: number, total: number, sourceName: string) => void;
  onFinish?: (empty: boolean) => void;
  onError?: (message: string) => void;
}

const SOURCE_TIMEOUT_MS = 45_000;
const DEFAULT_CONCURRENCY = 5;

function sourceInGroup(source: BookSource, group: string): boolean {
  if (!group) return true;
  if (!source.sourceGroup?.trim()) return false;
  return source.sourceGroup.split(/[,，;；]\s*/).some((g) => g.trim() === group);
}

function sortChangeSourceBooks(books: SearchBook[], loadWordCount: boolean): SearchBook[] {
  return [...books].sort((a, b) => {
    if (loadWordCount) {
      const aw = a.chapterWordCount > 0 ? a.chapterWordCount : -1;
      const bw = b.chapterWordCount > 0 ? b.chapterWordCount : -1;
      if (aw !== bw) return bw - aw;
    }
    const rt = (a.respondTime ?? 0) - (b.respondTime ?? 0);
    if (rt !== 0) return rt;
    return (a.originOrder ?? 0) - (b.originOrder ?? 0);
  });
}

async function searchOneSourceForChange(
  source: BookSource,
  book: Book,
  prefs: ChangeSourcePrefs,
  signal: AbortSignal,
): Promise<SearchBook[]> {
  if (signal.aborted || !source.searchUrl?.trim()) return [];
  try {
    const hits = await Promise.race([
      searchBook(source, book.name, {
        filter: (name, author) => {
          if (name !== book.name) return false;
          if (!prefs.checkAuthor) return true;
          return isSameNameAndAuthor(
            { name, author },
            { name: book.name, author: book.author ?? '' },
          );
        },
      }),
      new Promise<SearchBook[]>((_, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), SOURCE_TIMEOUT_MS);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new Error('aborted'));
          },
          { once: true },
        );
      }),
    ]);
    for (const hit of hits) {
      await insertSearchBook(hit);
    }
    return hits;
  } catch (e) {
    if (isAbortError(e) || signal.aborted) return [];
    console.warn('[change-source] search failed', source.sourceName, e);
    return [];
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runWorker = async () => {
    while (next < items.length) {
      if (signal.aborted) return;
      const idx = next++;
      await worker(items[idx]!);
    }
  };
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => runWorker()));
}

export class ChangeSourceSearchSession {
  private abort: AbortController | null = null;
  private searching = false;
  private callbacks: ChangeSourceSearchCallbacks = {};
  private results: SearchBook[] = [];

  setCallbacks(cb: ChangeSourceSearchCallbacks): void {
    this.callbacks = cb;
  }

  getResults(): SearchBook[] {
    return this.results;
  }

  isSearching(): boolean {
    return this.searching;
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
    this.searching = false;
  }

  close(): void {
    this.stop();
    this.results = [];
  }

  async loadCached(book: Book, prefs: ChangeSourcePrefs, screenKey = ''): Promise<SearchBook[]> {
    this.results = await queryChangeSourceBooks({
      name: book.name,
      author: book.author ?? '',
      checkAuthor: prefs.checkAuthor,
      searchGroup: prefs.searchGroup,
      screenKey,
    });
    this.results = sortChangeSourceBooks(this.results, prefs.loadWordCount);
    this.callbacks.onResults?.(this.results);
    return this.results;
  }

  async startSearch(book: Book, prefs: ChangeSourcePrefs, screenKey = ''): Promise<void> {
    this.stop();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.searching = true;

    try {
      const cached = await this.loadCached(book, prefs, screenKey);
      if (cached.length > 0) {
        this.callbacks.onFinish?.(false);
        return;
      }

      const sources = (await sourcesDb.getEnabledSources()).filter(
        (s) => s.sourceUrl !== book.origin && sourceInGroup(s, prefs.searchGroup),
      );
      const total = sources.length;
      let done = 0;
      const collected = new Map<string, SearchBook>();

      await runPool(
        sources,
        DEFAULT_CONCURRENCY,
        async (source) => {
          if (signal.aborted) return;
          this.callbacks.onProgress?.(done, total, source.sourceName);
          const hits = await searchOneSourceForChange(source, book, prefs, signal);
          for (const hit of hits) {
            collected.set(hit.bookUrl, hit);
          }
          done += 1;
          this.results = sortChangeSourceBooks(
            [...collected.values()],
            prefs.loadWordCount,
          );
          this.callbacks.onResults?.(this.results);
          this.callbacks.onProgress?.(done, total, source.sourceName);
        },
        signal,
      );

      if (!signal.aborted) {
        await this.loadCached(book, prefs, screenKey);
        this.callbacks.onFinish?.(this.results.length === 0);
      }
    } catch (e) {
      if (!signal.aborted) {
        this.callbacks.onError?.(e instanceof Error ? e.message : '搜索失败');
      }
    } finally {
      this.searching = false;
      this.abort = null;
    }
  }
}

/** @deprecated 使用 ChangeSourceSearchSession */
export async function searchChangeSourceCandidates(
  book: Book,
  options?: { maxSources?: number },
): Promise<ChangeSourceCandidate[]> {
  const session = new ChangeSourceSearchSession();
  const prefs = loadChangeSourcePrefs();
  await session.startSearch(book, prefs);
  const sources = await sourcesDb.getAllSources();
  const byUrl = new Map(sources.map((s) => [s.sourceUrl, s]));
  return session
    .getResults()
    .slice(0, options?.maxSources ?? 48)
    .map((searchBook) => {
      const source = byUrl.get(searchBook.origin);
      if (!source) return null;
      return { source, searchBook };
    })
    .filter((x): x is ChangeSourceCandidate => x != null);
}

export async function resolveChangeSource(
  oldBook: Book,
  searchBook: SearchBook,
  source?: BookSource,
): Promise<{ book: Book; chapters: BookChapter[] }> {
  if (isLocalBook(oldBook)) {
    throw new Error('本地书不支持换源');
  }
  const src =
    source ?? (await sourcesDb.getSource(searchBook.origin));
  if (!src) throw new Error('书源不存在');

  const info = await getBookInfo(src, searchBook.bookUrl, {
    book: searchBook as unknown as Record<string, unknown>,
    bookVariable: oldBook.variable,
  });
  if (!info) throw new Error('获取书籍信息失败');

  const tocUrl = info.tocUrl?.trim() || searchBook.tocUrl || searchBook.bookUrl;
  const chapters = await fetchChapterListDeduped(src, tocUrl, {
    persistTocFetch: true,
    reverseToc: oldBook.readConfig?.reverseToc === true,
    bookVariable: oldBook.variable,
  });
  if (chapters.length === 0) throw new Error('新源目录为空');

  const now = Date.now();
  let working: Book = {
    ...oldBook,
    bookUrl: searchBook.bookUrl,
    tocUrl,
    origin: src.bookSourceUrl ?? src.sourceUrl,
    originName: src.sourceName,
    name: info.name || searchBook.name,
    author: info.author ?? searchBook.author ?? oldBook.author,
    kind: info.kind ?? searchBook.kind ?? oldBook.kind,
    intro: info.intro ?? searchBook.intro ?? oldBook.intro,
    coverUrl: info.coverUrl ?? searchBook.coverUrl ?? oldBook.coverUrl,
    latestChapterTitle:
      info.latestChapterTitle ?? chapters[chapters.length - 1]?.title,
    lastCheckTime: now,
    totalChapterNum: chapters.length,
    type: searchBook.type ?? oldBook.type,
  };

  working = migrateBookProgress(working, oldBook, chapters);
  return { book: working, chapters };
}

export async function applyChangeSource(
  oldBook: Book,
  searchBook: SearchBook,
  source?: BookSource,
): Promise<Book> {
  const { book: working, chapters } = await resolveChangeSource(oldBook, searchBook, source);

  const originalUrl = oldBook.bookUrl;
  if (working.bookUrl !== originalUrl) {
    await booksDb.replaceBookUrl(originalUrl, working);
    await chaptersDb.deleteChaptersByBook(working.bookUrl);
  } else {
    await booksDb.updateBook(working);
    await chaptersDb.deleteChaptersByBook(originalUrl);
  }

  await chaptersDb.insertChapters(
    chapters.map((ch) => toNewBookChapter(ch, working.bookUrl)),
  );

  return working;
}

export function searchBookToTempBook(
  currentBook: Book,
  searchBook: SearchBook,
  source: BookSource,
  info?: Awaited<ReturnType<typeof getBookInfo>>,
): Book {
  return {
    ...currentBook,
    bookUrl: searchBook.bookUrl,
    tocUrl: info?.tocUrl?.trim() || searchBook.tocUrl || searchBook.bookUrl,
    origin: source.sourceUrl,
    originName: source.sourceName,
    name: info?.name || searchBook.name,
    author: info?.author ?? searchBook.author ?? currentBook.author,
    kind: info?.kind ?? searchBook.kind ?? currentBook.kind,
    coverUrl: info?.coverUrl ?? searchBook.coverUrl ?? currentBook.coverUrl,
    intro: info?.intro ?? searchBook.intro ?? currentBook.intro,
  };
}

export async function loadChangeSourceToc(
  currentBook: Book,
  searchBook: SearchBook,
  source: BookSource,
): Promise<BookChapter[]> {
  const info = await getBookInfo(source, searchBook.bookUrl, {
    book: searchBook as unknown as Record<string, unknown>,
    bookVariable: currentBook.variable,
  });
  const tempBook = searchBookToTempBook(currentBook, searchBook, source, info ?? undefined);
  const tocUrl = tempBook.tocUrl;
  return fetchChapterListDeduped(source, tocUrl, {
    bookVariable: currentBook.variable,
    reverseToc: currentBook.readConfig?.reverseToc === true,
  });
}

export function matchChapterIndexForChangeSource(
  chapterIndex: number,
  chapterTitle: string,
  toc: BookChapter[],
): number {
  return getDurChapterIndex(chapterIndex, chapterTitle, toc);
}

export async function fetchChapterContentForChangeSource(
  currentBook: Book,
  source: BookSource,
  searchBook: SearchBook,
  chapter: BookChapter,
  nextChapterUrl?: string,
): Promise<string> {
  const tempBook = searchBookToTempBook(currentBook, searchBook, source);
  const raw = await getContent(source, chapter, nextChapterUrl, tempBook);
  if (!raw?.trim()) throw new Error('获取正文失败');
  return raw;
}

export async function applyChapterChangeSource(
  currentBook: Book,
  chapterIndex: number,
  rawContent: string,
): Promise<void> {
  if (isLocalBook(currentBook)) {
    throw new Error('本地书不支持换源');
  }
  await writeCachedChapterRaw(currentBook, chapterIndex, rawContent);
}

export async function disableChangeSourceOrigin(origin: string): Promise<void> {
  await sourcesDb.enableSource(origin, false);
  await deleteChangeSourceBooksByOrigin(origin);
}
