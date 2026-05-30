/**
 * 统一「加入书架」入口：同 URL 跳过、同名同作者迁移（legado migrateTo）
 *
 * 对齐 legado BookInfoViewModel.addToBookshelf：先写入书籍记录并立即返回，
 * 目录默认后台拉取（详情页打开时也可预加载后传入 chapters）。
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { fetchChapterListDeduped, isChapterListFetchInFlight, toNewBookChapter, type PartialChapterList } from '@/lib/book-source/chapters';
import { resolveBookType } from '@/lib/book-source/book-type';
import { isLocalBook } from '@/lib/local-book';
import { migrateBookProgress } from '@/lib/bookshelf/book-migrate';
import {
  mergeShelfReadingProgress,
  type ShelfReadingProgressInput,
} from '@/lib/bookshelf/reading-progress-snapshot';
import type { Book, BookChapter, NewBook, SearchBook } from '@/types';

/** true=阻塞拉目录；false=不拉；'background'=先上架再后台拉（默认，对齐 legado） */
export type ChapterFetchMode = boolean | 'background';

export type SaveBookToShelfOptions = {
  groupId?: number;
  /** 已拉取的目录，传入则不再请求书源 */
  chapters?: BookChapter[];
  fetchChapters?: ChapterFetchMode;
  /** 带着进度加入书架（阅读器/详情页中途上架） */
  readingProgress?: ShelfReadingProgressInput | null;
};

function resolveFetchMode(options?: SaveBookToShelfOptions): 'none' | 'blocking' | 'background' {
  const mode = options?.fetchChapters;
  if (mode === false) return 'none';
  if (mode === true) return 'blocking';
  return 'background';
}

function searchBookToNewBook(sb: SearchBook): NewBook {
  return {
    bookUrl: sb.bookUrl,
    tocUrl: sb.tocUrl,
    name: sb.name,
    author: sb.author ?? '',
    kind: sb.kind,
    intro: sb.intro,
    coverUrl: sb.coverUrl,
    origin: sb.origin,
    originName: sb.originName,
    type: resolveBookType(sb.type, sb.tab),
  };
}

function newBookToBook(nb: NewBook): Book {
  const now = Date.now();
  return {
    bookUrl: nb.bookUrl,
    tocUrl: nb.tocUrl ?? nb.bookUrl,
    origin: nb.origin,
    originName: nb.originName ?? '',
    name: nb.name,
    author: nb.author ?? '',
    kind: nb.kind,
    intro: nb.intro,
    coverUrl: nb.coverUrl,
    charset: nb.charset,
    type: nb.type ?? 0,
    group: 0,
    latestChapterTime: now,
    lastCheckTime: now,
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
  };
}

function isOnlineBook(origin: string): boolean {
  return origin !== 'local' && !origin.startsWith('local::');
}

async function fetchChaptersForBook(
  incoming: NewBook,
  bookUrl: string
): Promise<BookChapter[]> {
  const source = await sourcesDb.getSource(incoming.origin);
  if (!source) return [];
  const tocUrl = incoming.tocUrl || bookUrl;
  return fetchChapterListDeduped(source, tocUrl);
}

async function applyGroupMask(bookUrl: string, groupId?: number): Promise<void> {
  if (groupId !== undefined && groupId > 0) {
    await booksDb.addBooksToGroupMask([bookUrl], groupId);
  }
}

async function persistChapters(bookUrl: string, chapters: BookChapter[]): Promise<void> {
  if (chapters.length === 0) return;
  await chaptersDb.deleteChaptersByBook(bookUrl);
  await chaptersDb.insertChapters(chapters.map((ch) => toNewBookChapter(ch, bookUrl)));
}

/** 目录写入后同步 totalChapterNum / latestChapterTitle（本地导入、在线拉目录共用） */
export async function updateBookChapterMeta(bookUrl: string, chapters: BookChapter[]): Promise<void> {
  if (chapters.length === 0) return;
  const saved = await booksDb.getBook(bookUrl);
  if (!saved) return;
  const latest = chapters[chapters.length - 1];
  const hadChapters = (saved.totalChapterNum ?? 0) > 0;
  const now = Date.now();
  await booksDb.updateBook({
    ...saved,
    totalChapterNum: chapters.length,
    latestChapterTitle: latest?.title ?? saved.latestChapterTitle,
    latestChapterTime:
      !hadChapters && latest?.title
        ? now
        : chapters.length > (saved.totalChapterNum ?? 0)
          ? now
          : saved.latestChapterTime,
  });
}

function shelfBookNeedsChapterMeta(book: Book): boolean {
  return (book.totalChapterNum ?? 0) <= 0 || !book.latestChapterTitle?.trim();
}

function notifyShelfBookMeta(bookUrl: string): void {
  window.dispatchEvent(
    new CustomEvent('bookshelf-book-updated', { detail: { bookUrl } }),
  );
}

export type BookChaptersUpdatedDetail = {
  bookUrl: string;
  chapters: BookChapter[];
  /** false=渐进中间页（对齐 Legado isIncremental） */
  isComplete: boolean;
};

export function notifyChaptersUpdated(
  bookUrl: string,
  chapters: BookChapter[],
  isComplete: boolean,
): void {
  window.dispatchEvent(
    new CustomEvent<BookChaptersUpdatedDetail>('book-chapters-updated', {
      detail: { bookUrl, chapters, isComplete },
    }),
  );
}

/** 拉取并写入目录：分页过程中仅更新书籍元数据，完成后一次性写入章节表 */
export async function fetchAndPersistChaptersForBook(book: Book): Promise<void> {
  if (isLocalBook(book) || !book.tocUrl || !book.origin) return;

  const source = await sourcesDb.getSource(book.origin);
  if (!source) return;

  const count = await chaptersDb.getChapterCount(book.bookUrl);
  const tocInFlight = isChapterListFetchInFlight(source, book.tocUrl);
  if (count > 0 && !tocInFlight) {
    const saved = await booksDb.getBook(book.bookUrl);
    if (saved && !shelfBookNeedsChapterMeta(saved)) {
      return;
    }
    if (saved && shelfBookNeedsChapterMeta(saved)) {
      const chapters = await chaptersDb.getChapterList(book.bookUrl);
      if (chapters.length > 0) {
        await updateBookChapterMeta(book.bookUrl, chapters);
        notifyShelfBookMeta(book.bookUrl);
      }
    }
  }

  let lastMetaPersistAt = 0;

  const onPartial = async (partial: PartialChapterList) => {
    if (partial.chapters.length === 0) return;

    // 对齐 Legado savePartialBookChapters：仅 INSERT OR REPLACE，不每页 delete
    await chaptersDb.insertChapters(
      partial.chapters.map((ch) => toNewBookChapter(ch, book.bookUrl)),
    );

    const now = Date.now();
    if (!partial.isComplete && now - lastMetaPersistAt < 2000) {
      notifyChaptersUpdated(book.bookUrl, partial.chapters, false);
      return;
    }
    lastMetaPersistAt = now;

    const saved = await booksDb.getBook(book.bookUrl);
    if (saved) {
      const latest = partial.chapters[partial.chapters.length - 1];
      await booksDb.updateBook({
        ...saved,
        totalChapterNum: partial.chapters.length,
        latestChapterTitle: latest?.title ?? saved.latestChapterTitle,
      });
    }
    notifyShelfBookMeta(book.bookUrl);
    notifyChaptersUpdated(book.bookUrl, partial.chapters, partial.isComplete);
  };

  try {
    const chapters = await fetchChapterListDeduped(source, book.tocUrl, {
      reverseToc: book.readConfig?.reverseToc === true,
      onPartial,
      bookVariable: book.variable,
    });
    if (chapters.length === 0) return;
    await persistChapters(book.bookUrl, chapters);
    await updateBookChapterMeta(book.bookUrl, chapters);
    notifyShelfBookMeta(book.bookUrl);
    notifyChaptersUpdated(book.bookUrl, chapters, true);
  } catch (e) {
    console.warn('[saveBookToShelf] 后台拉取目录失败:', e);
  }
}

function scheduleBackgroundChapterFetch(book: Book): void {
  void fetchAndPersistChaptersForBook(book);
}

/** 在线书架书是否仍缺目录或 latestChapterTitle / totalChapterNum 元数据 */
export function onlineBookNeedsChapterRepair(book: Book): boolean {
  if (isLocalBook(book) || !book.tocUrl || !book.origin) return false;
  return (book.totalChapterNum ?? 0) <= 0 || !book.latestChapterTitle?.trim();
}

/** 书架加载后后台补救（加入书架时拉目录中断、进程退出等） */
export function scheduleShelfChapterRepairs(books: Book[]): void {
  for (const book of books) {
    if (onlineBookNeedsChapterRepair(book)) {
      scheduleBackgroundChapterFetch(book);
    }
  }
}

/**
 * 将书籍写入书架（发现/搜索/添加网址/书籍详情等统一走此入口）
 */
export async function saveBookToShelf(
  incoming: NewBook,
  options?: SaveBookToShelfOptions
): Promise<Book | null> {
  const bookUrl = incoming.bookUrl.trim();
  if (!bookUrl) return null;

  const fetchMode = resolveFetchMode(options);
  const isOnline = isOnlineBook(incoming.origin);

  const existingByUrl = await booksDb.getBook(bookUrl);
  if (existingByUrl) {
    if (fetchMode === 'blocking') {
      const chapters = options?.chapters ?? (await fetchChaptersForBook(incoming, bookUrl));
      if (chapters.length > 0) {
        await persistChapters(bookUrl, chapters);
        await updateBookChapterMeta(bookUrl, chapters);
      }
    } else if (fetchMode === 'background') {
      scheduleBackgroundChapterFetch(existingByUrl);
    }
    await applyGroupMask(bookUrl, options?.groupId);
    return existingByUrl;
  }

  const author = incoming.author ?? '';
  const existingByName =
    incoming.name && author
      ? await booksDb.getBookByNameAndAuthor(incoming.name, author)
      : null;

  let chapters = options?.chapters;
  if (isOnline && !chapters && fetchMode === 'blocking') {
    if (!await sourcesDb.getSource(incoming.origin)) {
      console.warn('[saveBookToShelf] 未找到书源:', incoming.origin);
      return null;
    }
    try {
      chapters = await fetchChaptersForBook(incoming, bookUrl);
    } catch (e) {
      console.warn('[saveBookToShelf] 拉取章节列表失败:', e);
      chapters = [];
    }
  }

  let targetBook = newBookToBook({ ...incoming, bookUrl });

  if (existingByName && existingByName.bookUrl !== bookUrl) {
    const chaptersForMigrate = fetchMode === 'blocking' ? chapters : undefined;
    targetBook = migrateBookProgress(targetBook, existingByName, chaptersForMigrate);
    const oldUrl = existingByName.bookUrl;
    await booksDb.replaceBookUrl(oldUrl, targetBook);
    if (chapters && chapters.length > 0) {
      await persistChapters(targetBook.bookUrl, chapters);
      if (fetchMode === 'blocking') {
        await updateBookChapterMeta(targetBook.bookUrl, chapters);
      }
    }
  } else if (isOnline) {
    if (!(await sourcesDb.getSource(incoming.origin))) {
      console.warn('[saveBookToShelf] 未找到书源:', incoming.origin);
      return null;
    }
    await booksDb.insertBook(incoming);
    if (chapters && chapters.length > 0) {
      await persistChapters(bookUrl, chapters);
      if (fetchMode === 'blocking') {
        await updateBookChapterMeta(bookUrl, chapters);
      }
    }
  } else {
    await booksDb.insertBook(incoming);
  }

  await applyGroupMask(bookUrl, options?.groupId);
  let saved = await booksDb.getBook(bookUrl);
  if (saved && options?.readingProgress) {
    saved = mergeShelfReadingProgress(saved, options.readingProgress);
    await booksDb.updateBook(saved);
  }
  if (saved && fetchMode === 'background' && isOnline) {
    scheduleBackgroundChapterFetch(saved);
  }
  return saved;
}

/**
 * 发现/搜索书籍加入书架
 */
export async function addSearchBookToShelf(
  sb: SearchBook,
  options?: SaveBookToShelfOptions
): Promise<Book | null> {
  return saveBookToShelf(searchBookToNewBook(sb), options);
}
