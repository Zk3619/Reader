/**
 * 多书源并发搜索（对齐 Legado SearchModel）
 */

import { searchBook } from '@/lib/book-source/search';
import { isAbortError } from '@/lib/http';
import type { BookSource } from '@/types';
import type { SearchBook } from '@/types';
import type { SearchMode } from '@/lib/search/search-prefs';
import { isPrecisionSearchMode } from '@/lib/search/search-prefs';

const DEFAULT_CONCURRENCY = 5;
const SOURCE_TIMEOUT_MS = 30_000;

export interface MergedSearchBook extends SearchBook {
  /** 合并后的书源名（多源命中同名书） */
  mergedOriginNames: string[];
  mergedOriginUrls: string[];
}

export interface MultiSourceSearchCallbacks {
  onStart?: () => void;
  onResults?: (books: MergedSearchBook[]) => void;
  onFinish?: (empty: boolean, hasMore: boolean) => void;
  onError?: (message: string) => void;
}

function bookKey(name: string, author: string): string {
  return `${name}\0${author}`;
}

function passesSourceFilter(
  book: SearchBook,
  searchKey: string,
  precision: boolean,
): boolean {
  if (!precision) return true;
  return (
    book.name.includes(searchKey) ||
    book.author.includes(searchKey) ||
    (book.kind?.includes(searchKey) ?? false)
  );
}

function classifyBook(
  book: SearchBook,
  searchKey: string,
): 'equal' | 'tags' | 'contains' | 'other' {
  if (book.name === searchKey || book.author === searchKey) return 'equal';
  if (book.kind?.includes(searchKey)) return 'tags';
  if (book.name.includes(searchKey) || book.author.includes(searchKey)) return 'contains';
  return 'other';
}

function mergeOrigin(existing: MergedSearchBook, incoming: SearchBook): void {
  if (incoming.originName && !existing.mergedOriginNames.includes(incoming.originName)) {
    existing.mergedOriginNames.push(incoming.originName);
  }
  if (incoming.origin && !existing.mergedOriginUrls.includes(incoming.origin)) {
    existing.mergedOriginUrls.push(incoming.origin);
  }
}

function toMerged(book: SearchBook): MergedSearchBook {
  return {
    ...book,
    mergedOriginNames: book.originName ? [book.originName] : [],
    mergedOriginUrls: book.origin ? [book.origin] : [],
  };
}

function mergeSearchResults(
  existing: MergedSearchBook[],
  incoming: SearchBook[],
  searchKey: string,
  precision: boolean,
): MergedSearchBook[] {
  const buckets: Record<'equal' | 'tags' | 'contains' | 'other', MergedSearchBook[]> = {
    equal: [],
    tags: [],
    contains: [],
    other: [],
  };
  const index = new Map<string, MergedSearchBook>();

  const place = (book: MergedSearchBook) => {
    const bucket = classifyBook(book, searchKey);
    const key = bookKey(book.name, book.author);
    index.set(key, book);
    buckets[bucket].push(book);
  };

  for (const b of existing) {
    place(b);
  }

  for (const raw of incoming) {
    if (!passesSourceFilter(raw, searchKey, precision)) continue;
    const key = bookKey(raw.name, raw.author);
    const found = index.get(key);
    if (found) {
      mergeOrigin(found, raw);
      continue;
    }
    const merged = toMerged(raw);
    place(merged);
  }

  const sortByOrigins = (a: MergedSearchBook, b: MergedSearchBook) =>
    b.mergedOriginNames.length - a.mergedOriginNames.length;

  const out: MergedSearchBook[] = [];
  out.push(...buckets.equal.sort(sortByOrigins));
  out.push(...buckets.tags.sort(sortByOrigins));
  out.push(...buckets.contains.sort(sortByOrigins));
  if (!precision) {
    out.push(...buckets.other);
  }
  return out;
}

async function searchOneSource(
  source: BookSource,
  keyword: string,
  signal: AbortSignal,
): Promise<SearchBook[]> {
  if (signal.aborted) return [];
  try {
    const result = await Promise.race([
      searchBook(source, keyword),
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
    return result;
  } catch (e) {
    if (isAbortError(e) || signal.aborted) return [];
    console.warn(`[search] ${source.sourceName}:`, e);
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

export class MultiSourceSearchSession {
  private sources: BookSource[] = [];
  private searchKey = '';
  private searchId = 0;
  private page = 1;
  private results: MergedSearchBook[] = [];
  private hasMore = false;
  private searching = false;
  private paused = false;
  private abort: AbortController | null = null;
  private mode: SearchMode = 'name';
  private callbacks: MultiSourceSearchCallbacks = {};

  setCallbacks(cb: MultiSourceSearchCallbacks): void {
    this.callbacks = cb;
  }

  setSearchMode(mode: SearchMode): void {
    this.mode = mode;
  }

  getResults(): MergedSearchBook[] {
    return this.results;
  }

  isSearching(): boolean {
    return this.searching;
  }

  getHasMore(): boolean {
    return this.hasMore;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
    this.searching = false;
    this.searchId = 0;
  }

  close(): void {
    this.stop();
    this.results = [];
    this.searchKey = '';
    this.page = 1;
    this.hasMore = false;
  }

  /**
   * @param key 新关键词，或空字符串表示加载下一页（对齐 Legado search("")）
   */
  async search(key: string, sources: BookSource[]): Promise<void> {
    const trimmed = key.trim();
    if (trimmed) {
      this.abort?.abort();
      this.searchId = Date.now();
      this.searchKey = trimmed;
      this.page = 1;
      this.results = [];
      this.hasMore = true;
      this.sources = sources.filter((s) => s.enabled && s.searchUrl && s.ruleSearch);
    } else if (!this.searchKey || !this.hasMore) {
      return;
    } else {
      this.page += 1;
    }

    if (this.sources.length === 0) {
      this.callbacks.onError?.('没有可搜索的启用书源');
      this.callbacks.onFinish?.(true, false);
      return;
    }

    const currentId = this.searchId;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.searching = true;
    this.callbacks.onStart?.();

    const precision = isPrecisionSearchMode(this.mode);
    let roundHasResults = false;

    await runPool(
      this.sources,
      DEFAULT_CONCURRENCY,
      async (source) => {
        if (signal.aborted || currentId !== this.searchId) return;
        while (this.paused && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 80));
        }
        const items = await searchOneSource(source, this.searchKey, signal);
        if (signal.aborted || currentId !== this.searchId) return;
        if (items.length > 0) roundHasResults = true;
        this.results = mergeSearchResults(this.results, items, this.searchKey, precision);
        this.callbacks.onResults?.([...this.results]);
      },
      signal,
    );

    if (currentId !== this.searchId) return;

    this.hasMore = roundHasResults;
    this.searching = false;
    this.callbacks.onFinish?.(this.results.length === 0, this.hasMore);
  }
}
