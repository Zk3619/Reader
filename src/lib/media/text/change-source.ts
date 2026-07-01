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
import { getDurChapterIndex, migrateBookProgress } from '@/lib/bookshelf/book-migrate';
import { isLocalBook } from '@/lib/local-book';
import { writeCachedChapterRaw } from '@/lib/chapter-cache/storage';
import {
  loadChangeSourcePrefs,
  saveChangeSourcePrefs,
  type ChangeSourcePrefs,
} from '@/lib/media/text/change-source-prefs';
import { UNGROUPED_SOURCE_LABEL } from '@/lib/sources/source-list-filter';
import { getBookScore, getSourceScore } from '@/lib/sources/source-config';
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

export interface ChangeSourceSearchOptions {
  chapterIndex?: number;
  /** 阅读器内换源：字数取当前章；否则取目录末章 */
  fromReader?: boolean;
}

const SOURCE_TIMEOUT_MS = 45_000;
const DEFAULT_CONCURRENCY = 5;

function sourceMatchesGroupFilter(source: BookSource, groupNames: string[]): boolean {
  if (groupNames.length === 0) return true;
  const parts =
    source.sourceGroup?.split(/[,，;；]\s*/).map((s) => s.trim()).filter(Boolean) ?? [];
  if (parts.length === 0) {
    return groupNames.includes(UNGROUPED_SOURCE_LABEL);
  }
  return groupNames.some((g) => g !== UNGROUPED_SOURCE_LABEL && parts.includes(g));
}

function authorMatchesForChangeSource(
  hitAuthor: string | undefined,
  bookAuthor: string,
  checkAuthor: boolean,
): boolean {
  if (!checkAuthor) return true;
  const expected = bookAuthor.trim();
  if (!expected) return true;
  return (hitAuthor ?? '').includes(expected);
}

const CHANGE_SOURCE_CHAPTER_NUM_RE = /^\[(\d+)]/;

function chapterNumFromWordCountText(text?: string | null): number {
  if (!text) return -1;
  const match = CHANGE_SOURCE_CHAPTER_NUM_RE.exec(text);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function compareChangeSourceBooks(a: SearchBook, b: SearchBook, loadWordCount: boolean): number {
  const bookScoreA = getBookScore(a.origin, a.name, a.author ?? '', a.bookUrl);
  const bookScoreB = getBookScore(b.origin, b.name, b.author ?? '', b.bookUrl);
  if (bookScoreA !== bookScoreB) return bookScoreB - bookScoreA;

  const sourceScoreA = getSourceScore(a.origin);
  const sourceScoreB = getSourceScore(b.origin);
  if (sourceScoreA !== sourceScoreB) return sourceScoreB - sourceScoreA;

  if (loadWordCount) {
    const overA = a.chapterWordCount > 1000 ? 1 : 0;
    const overB = b.chapterWordCount > 1000 ? 1 : 0;
    if (overA !== overB) return overB - overA;

    const numA = chapterNumFromWordCountText(a.chapterWordCountText);
    const numB = chapterNumFromWordCountText(b.chapterWordCountText);
    if (numA !== numB) return numB - numA;

    const wordA = a.chapterWordCount > 0 ? a.chapterWordCount : -1;
    const wordB = b.chapterWordCount > 0 ? b.chapterWordCount : -1;
    if (wordA !== wordB) return wordB - wordA;
  }

  return (a.originOrder ?? 0) - (b.originOrder ?? 0);
}

export function sortChangeSourceBooks(books: SearchBook[], loadWordCount: boolean): SearchBook[] {
  return [...books].sort((a, b) => compareChangeSourceBooks(a, b, loadWordCount));
}

async function enrichChangeSourceHit(
  source: BookSource,
  book: Book,
  hit: SearchBook,
  prefs: ChangeSourcePrefs,
  options: ChangeSourceSearchOptions,
  signal: AbortSignal,
): Promise<SearchBook> {
  if (!prefs.loadInfo && !prefs.loadToc && !prefs.loadWordCount) {
    return hit;
  }
  if (signal.aborted) return hit;

  let working: SearchBook = { ...hit };
  let info: Awaited<ReturnType<typeof getBookInfo>> | null = null;

  const needsInfo =
    !working.tocUrl?.trim() || prefs.loadInfo || prefs.loadToc || prefs.loadWordCount;
  if (needsInfo) {
    info = await getBookInfo(source, working.bookUrl, {
      book: working as unknown as Record<string, unknown>,
      bookVariable: book.variable,
    });
    if (info) {
      working = {
        ...working,
        name: info.name || working.name,
        author: info.author ?? working.author,
        kind: info.kind ?? working.kind,
        intro: info.intro ?? working.intro,
        coverUrl: info.coverUrl ?? working.coverUrl,
        tocUrl: info.tocUrl?.trim() || working.tocUrl,
        latestChapterTitle: info.latestChapterTitle ?? working.latestChapterTitle,
      };
    }
  }

  if (prefs.loadToc || prefs.loadWordCount) {
    const tocUrl = working.tocUrl?.trim() || working.bookUrl;
    const chapters = await fetchChapterListDeduped(source, tocUrl, {
      bookVariable: book.variable,
      reverseToc: book.readConfig?.reverseToc === true,
    });
    if (chapters.length > 0) {
      working.latestChapterTitle =
        chapters[chapters.length - 1]?.title ?? working.latestChapterTitle;
    }

    if (prefs.loadWordCount && chapters.length > 0) {
      const idx = options.fromReader
        ? matchChapterIndexForChangeSource(
            options.chapterIndex ?? 0,
            book.durChapterTitle ?? '',
            chapters,
          )
        : chapters.length - 1;
      const safeIdx = Math.min(Math.max(idx, 0), chapters.length - 1);
      const ch = chapters[safeIdx]!;
      const nextUrl = chapters[safeIdx + 1]?.url;
      const rawTitle = ch.title.trim();
      const title = rawTitle.length > 20 ? `${rawTitle.slice(0, 20)}…` : rawTitle;
      const start = Date.now();
      try {
        const tempBook = searchBookToTempBook(book, working, source, info ?? undefined);
        const raw = await getContent(source, ch, nextUrl, tempBook);
        const respondTime = Date.now() - start;
        const len = raw?.length ?? 0;
        working = {
          ...working,
          chapterWordCount: len > 0 ? len : -1,
          chapterWordCountText: `[${safeIdx + 1}] ${title}\n字数：${len}`,
          respondTime,
        };
      } catch (e) {
        if (!isAbortError(e) && !signal.aborted) {
          working = {
            ...working,
            chapterWordCount: -1,
            chapterWordCountText: `[${safeIdx + 1}] ${title}\n获取字数失败：${e instanceof Error ? e.message : '未知错误'}`,
            respondTime: Date.now() - start,
          };
        }
      }
    }
  } else if (prefs.loadInfo && info?.latestChapterTitle) {
    working.latestChapterTitle = info.latestChapterTitle;
  }

  await insertSearchBook(working);
  return working;
}

async function searchOneSourceForChange(
  source: BookSource,
  book: Book,
  prefs: ChangeSourcePrefs,
  options: ChangeSourceSearchOptions,
  signal: AbortSignal,
): Promise<SearchBook[]> {
  if (signal.aborted || !source.searchUrl?.trim()) return [];
  try {
    const hits = await Promise.race([
      searchBook(source, book.name, {
        filter: (name, author) => {
          if (name !== book.name) return false;
          return authorMatchesForChangeSource(author, book.author ?? '', prefs.checkAuthor);
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
    const enriched: SearchBook[] = [];
    for (const hit of hits) {
      if (signal.aborted) break;
      const next =
        prefs.loadInfo || prefs.loadToc || prefs.loadWordCount
          ? await enrichChangeSourceHit(source, book, hit, prefs, options, signal)
          : hit;
      await insertSearchBook(next);
      enriched.push(next);
    }
    return enriched;
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
  private searchOptions: ChangeSourceSearchOptions = {};

  setCallbacks(cb: ChangeSourceSearchCallbacks): void {
    this.callbacks = cb;
  }

  setSearchOptions(options: ChangeSourceSearchOptions): void {
    this.searchOptions = options;
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
      groupNames: prefs.groupNames,
      screenKey,
    });
    this.results = sortChangeSourceBooks(this.results, prefs.loadWordCount);
    this.callbacks.onResults?.(this.results);
    return this.results;
  }

  async startSearch(
    book: Book,
    prefs: ChangeSourcePrefs,
    screenKey = '',
    forceRefresh = false,
  ): Promise<void> {
    this.stop();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.searching = true;

    try {
      if (!forceRefresh) {
        const cached = await this.loadCached(book, prefs, screenKey);
        if (cached.length > 0) {
          this.callbacks.onFinish?.(false);
          return;
        }
      } else {
        this.results = [];
        this.callbacks.onResults?.([]);
      }

      const sources = (await sourcesDb.getEnabledSources()).filter(
        (s) => s.sourceUrl !== book.origin && sourceMatchesGroupFilter(s, prefs.groupNames),
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
          const hits = await searchOneSourceForChange(
            source,
            book,
            prefs,
            this.searchOptions,
            signal,
          );
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

  async refreshMissingWordCounts(
    book: Book,
    prefs: ChangeSourcePrefs,
    screenKey = '',
  ): Promise<void> {
    if (!prefs.loadWordCount) return;
    this.stop();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.searching = true;

    const missing = this.results.filter((item) => !item.chapterWordCountText?.trim());
    if (missing.length === 0) {
      this.searching = false;
      this.abort = null;
      return;
    }

    const total = missing.length;
    let done = 0;
    try {
      await runPool(
        missing,
        DEFAULT_CONCURRENCY,
        async (item) => {
          if (signal.aborted) return;
          const source = await sourcesDb.getSource(item.origin);
          if (!source) {
            done += 1;
            return;
          }
          this.callbacks.onProgress?.(done, total, source.sourceName);
          const enriched = await enrichChangeSourceHit(
            source,
            book,
            item,
            prefs,
            this.searchOptions,
            signal,
          );
          const idx = this.results.findIndex((r) => r.bookUrl === enriched.bookUrl);
          if (idx >= 0) {
            this.results[idx] = enriched;
          }
          this.results = sortChangeSourceBooks(this.results, prefs.loadWordCount);
          this.callbacks.onResults?.(this.results);
          done += 1;
          this.callbacks.onProgress?.(done, total, source.sourceName);
        },
        signal,
      );
      if (!signal.aborted) {
        await this.loadCached(book, prefs, screenKey);
      }
    } finally {
      this.searching = false;
      this.abort = null;
    }
  }
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
