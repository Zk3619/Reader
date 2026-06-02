/**
 * 书源调试（进程内，对齐 Legado Debug.startDebug 书源分支）
 */

import {
  searchBook,
  exploreBook,
  getBookInfo,
  getChapterList,
  getContent,
} from '@/lib/book-source';
import { searchBookToEphemeralBook } from '@/lib/bookshelf/book-to-search-book';
import type { BookSource } from '@/types';
import type { BookChapter } from '@/types';

export type BookSourceDebugCallback = (state: number, message: string) => void;

export interface BookSourceDebugSnapshots {
  searchHtml?: string;
  bookHtml?: string;
  tocHtml?: string;
  contentHtml?: string;
}

let debugCancelled = false;

export function cancelBookSourceDebug(): void {
  debugCancelled = true;
}

function isAbsUrl(key: string): boolean {
  return /^https?:\/\//i.test(key.trim());
}

function formatElapsed(start: number): string {
  const ms = Date.now() - start;
  const s = Math.floor(ms / 1000);
  const frac = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `[${String(s).padStart(2, '0')}:${frac}]`;
}

function log(
  onLog: BookSourceDebugCallback,
  start: number,
  msg: string,
  state = 1,
  showTime = true,
): void {
  if (debugCancelled) return;
  const line = showTime ? `${formatElapsed(start)} ${msg}` : msg;
  onLog(state, line);
}

function mergeBookInfo(book: ReturnType<typeof searchBookToEphemeralBook>, info: Awaited<ReturnType<typeof getBookInfo>>) {
  if (!info) return book;
  return {
    ...book,
    name: info.name || book.name,
    author: info.author || book.author,
    kind: info.kind ?? book.kind,
    intro: info.intro ?? book.intro,
    coverUrl: info.coverUrl ?? book.coverUrl,
    tocUrl: info.tocUrl || book.tocUrl,
    latestChapterTitle: info.latestChapterTitle ?? book.latestChapterTitle,
  };
}

async function contentDebug(
  source: BookSource,
  bookUrl: string,
  tocUrl: string,
  chapter: BookChapter,
  nextUrl: string | undefined,
  onLog: BookSourceDebugCallback,
  start: number,
  snapshots: BookSourceDebugSnapshots,
): Promise<void> {
  log(onLog, start, '︾开始解析正文页');
  const text = await getContent(source, chapter, nextUrl, {
    bookUrl,
    tocUrl,
    origin: source.sourceUrl,
    originName: source.sourceName,
    name: '调试',
    author: '',
    type: source.sourceType,
    group: 0,
    latestChapterTime: Date.now(),
    lastCheckTime: Date.now(),
    lastCheckCount: 0,
    totalChapterNum: 0,
    durChapterIndex: 0,
    durChapterPos: 0,
    durVolumeIndex: 0,
    chapterInVolumeIndex: 0,
    durChapterTime: 0,
    canUpdate: true,
    order: 0,
    originOrder: 0,
    syncTime: 0,
  });
  if (debugCancelled) return;
  if (text) {
    snapshots.contentHtml = text.slice(0, 8000);
    const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    log(onLog, start, preview);
    log(onLog, start, '︽正文页解析完成', 1000);
  } else {
    log(onLog, start, '︽正文页解析失败', -1);
  }
}

async function tocDebug(
  source: BookSource,
  book: ReturnType<typeof searchBookToEphemeralBook>,
  onLog: BookSourceDebugCallback,
  start: number,
  snapshots: BookSourceDebugSnapshots,
): Promise<void> {
  if (book.tocUrl?.trim()) {
    log(onLog, start, '≡已获取目录链接,跳过详情页');
    log(onLog, start, '', 1, false);
  } else {
    log(onLog, start, '︾开始解析详情页');
    const info = await getBookInfo(source, book.bookUrl, {
      book: book as unknown as Record<string, unknown>,
      bookVariable: book.variable,
    });
    if (debugCancelled) return;
    if (!info) {
      log(onLog, start, '︽详情页解析失败', -1);
      return;
    }
    snapshots.bookHtml = info.infoHtml;
    book = mergeBookInfo(book, info);
    log(onLog, start, '︽详情页解析完成');
    log(onLog, start, '', 1, false);
  }

  log(onLog, start, '︾开始解析目录页');
  const tocUrl = book.tocUrl || book.bookUrl;
  const chapters = await getChapterList(source, tocUrl);
  if (debugCancelled) return;
  if (chapters.length === 0) {
    log(onLog, start, '≡没有正文章节', -1);
    return;
  }
  snapshots.tocHtml = chapters[0]?.title;
  log(onLog, start, '︽目录页解析完成');
  log(onLog, start, '', 1, false);

  const real = chapters.filter((c) => !(c.isVolume && c.url.startsWith(c.title)));
  const list = real.length > 0 ? real : chapters;
  const first = list[0];
  const nextUrl = list[1]?.url ?? first.url;
  await contentDebug(source, book.bookUrl, tocUrl, first, nextUrl, onLog, start, snapshots);
}

async function exploreDebug(
  source: BookSource,
  url: string,
  onLog: BookSourceDebugCallback,
  start: number,
  snapshots: BookSourceDebugSnapshots,
): Promise<void> {
  log(onLog, start, '︾开始解析发现页');
  const books = await exploreBook(source, 1, url);
  if (debugCancelled) return;
  if (books.length === 0) {
    log(onLog, start, '︽未获取到书籍', -1);
    return;
  }
  log(onLog, start, '︽发现页解析完成');
  log(onLog, start, '', 1, false);
  await tocDebug(source, searchBookToEphemeralBook(books[0]), onLog, start, snapshots);
}

async function searchDebug(
  source: BookSource,
  key: string,
  onLog: BookSourceDebugCallback,
  start: number,
  snapshots: BookSourceDebugSnapshots,
): Promise<void> {
  log(onLog, start, '︾开始解析搜索页');
  const books = await searchBook(source, key);
  if (debugCancelled) return;
  if (books.length === 0) {
    log(onLog, start, '︽未获取到书籍', -1);
    return;
  }
  snapshots.searchHtml = books[0].intro;
  log(onLog, start, '︽搜索页解析完成');
  log(onLog, start, '', 1, false);
  await tocDebug(source, searchBookToEphemeralBook(books[0]), onLog, start, snapshots);
}

/**
 * 启动书源调试
 * key 格式：关键字 | URL | 分类::URL | ++目录URL | --正文URL
 */
export async function startBookSourceDebug(
  source: BookSource,
  key: string,
  onLog: BookSourceDebugCallback,
): Promise<BookSourceDebugSnapshots> {
  debugCancelled = false;
  const start = Date.now();
  const snapshots: BookSourceDebugSnapshots = {};
  const trimmed = key.trim();

  try {
    if (trimmed.startsWith('--')) {
      const url = trimmed.slice(2).trim();
      log(onLog, start, `⇒开始访问正文页:${url}`);
      const chapter: BookChapter = {
        title: '调试',
        url,
        index: 0,
        baseUrl: source.sourceUrl,
        bookUrl: url,
        isVolume: false,
        isVip: false,
        isPay: false,
      };
      await contentDebug(
        source,
        url,
        url,
        chapter,
        undefined,
        onLog,
        start,
        snapshots,
      );
      return snapshots;
    }

    if (trimmed.startsWith('++')) {
      const url = trimmed.slice(2).trim();
      log(onLog, start, `⇒开始访问目录页:${url}`);
      const book = searchBookToEphemeralBook({
        bookUrl: url,
        tocUrl: url,
        name: '调试',
        author: '',
        origin: source.sourceUrl,
        originName: source.sourceName,
        type: source.sourceType,
        time: Date.now(),
        originOrder: 0,
        chapterWordCount: -1,
        respondTime: 0,
      });
      await tocDebug(source, book, onLog, start, snapshots);
      return snapshots;
    }

    if (trimmed.includes('::')) {
      const url = trimmed.substring(trimmed.indexOf('::') + 2).trim();
      log(onLog, start, `⇒开始访问发现页:${url}`);
      await exploreDebug(source, url, onLog, start, snapshots);
      return snapshots;
    }

    if (isAbsUrl(trimmed)) {
      log(onLog, start, `⇒开始访问详情页:${trimmed}`);
      const book = searchBookToEphemeralBook({
        bookUrl: trimmed,
        tocUrl: '',
        name: '调试',
        author: '',
        origin: source.sourceUrl,
        originName: source.sourceName,
        type: source.sourceType,
        time: Date.now(),
        originOrder: 0,
        chapterWordCount: -1,
        respondTime: 0,
      });
      await tocDebug(source, book, onLog, start, snapshots);
      return snapshots;
    }

    log(onLog, start, `⇒开始搜索关键字:${trimmed}`);
    await searchDebug(source, trimmed, onLog, start, snapshots);
    return snapshots;
  } catch (e) {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e);
    log(onLog, start, msg, -1);
    return snapshots;
  }
}
