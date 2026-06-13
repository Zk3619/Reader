/**
 * 统一「加入书架」入口：同 URL 跳过、同名同作者迁移（legado migrateTo）
 *
 * 对齐 legado BookInfoViewModel.addToBookshelf：先写入书籍记录并立即返回，
 * 目录默认后台拉取（详情页打开时也可预加载后传入 chapters）。
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import {
  fetchChapterListDeduped,
  isChapterListFetchInFlight,
  shelfCachedChapterListLooksStale,
  toNewBookChapter,
  type PartialChapterList,
} from '@/lib/book-source/chapters';
import { resolveBookType } from '@/lib/book-source/book-type';
import {
  mergeShelfBookFromNewBook,
  shelfBookInfoMetadataChanged,
  syncShelfBookFromSearchBook,
} from '@/lib/bookshelf/merge-shelf-book-info';
import { ensureShelfBookMetadataForReading } from '@/lib/bookshelf/ensure-shelf-book-for-reading';
import { mergeBookContentVariable } from '@/lib/book-source/utils';
import { isLocalBook } from '@/lib/local-book';
import { migrateBookProgress } from '@/lib/bookshelf/book-migrate';
import {
  mergeShelfReadingProgress,
  type ShelfReadingProgressInput,
} from '@/lib/bookshelf/reading-progress-snapshot';
import type { Book, BookChapter, NewBook, SearchBook } from '@/types';
import { withIgnoredPageNavigationAbort } from '@/lib/navigation/page-navigation-scope';

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
    variable: mergeBookContentVariable(sb.variable, { source: sb.source }),
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
    variable: nb.variable,
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
  return fetchChapterListDeduped(source, tocUrl, { persistTocFetch: true });
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

/** 书架/分组页监听：新书上架或迁移后刷新列表与计数 */
export function notifyBookshelfRefresh(): void {
  window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
}

function schedulePersistChaptersToShelf(bookUrl: string, chapters: BookChapter[]): void {
  if (chapters.length === 0) return;
  void (async () => {
    try {
      await persistChapters(bookUrl, chapters);
      await updateBookChapterMeta(bookUrl, chapters);
      notifyShelfBookMeta(bookUrl);
      notifyChaptersUpdated(bookUrl, chapters, true);
    } catch (e) {
      console.warn('[saveBookToShelf] 后台写入目录失败:', e);
    }
  })();
}

async function persistChaptersForSave(
  bookUrl: string,
  chapters: BookChapter[],
  fetchMode: 'none' | 'blocking' | 'background',
): Promise<void> {
  if (chapters.length === 0) return;
  if (fetchMode === 'blocking') {
    await persistChapters(bookUrl, chapters);
    await updateBookChapterMeta(bookUrl, chapters);
    return;
  }
  schedulePersistChaptersToShelf(bookUrl, chapters);
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
  return withIgnoredPageNavigationAbort(async () => {
    if (isLocalBook(book) || !book.origin) return;

    book = await ensureShelfBookMetadataForReading(book);
    if (!book.tocUrl) return;

    const source = await sourcesDb.getSource(book.origin);
    if (!source) return;

    const count = await chaptersDb.getChapterCount(book.bookUrl);
    const persistTocInFlight = isChapterListFetchInFlight(source, book.tocUrl, 'persist');
    if (count > 0) {
      const saved = await booksDb.getBook(book.bookUrl);
      if (saved) {
        const existing = await chaptersDb.getChapterList(book.bookUrl);
        if (existing.length > 0 && shelfBookNeedsChapterMeta(saved)) {
          await updateBookChapterMeta(book.bookUrl, existing);
          notifyShelfBookMeta(book.bookUrl);
        }
        const afterMeta = await booksDb.getBook(book.bookUrl);
        if (
          afterMeta &&
          !shelfBookNeedsChapterMeta(afterMeta) &&
          !persistTocInFlight &&
          !shelfCachedChapterListLooksStale(existing, afterMeta)
        ) {
          return;
        }
        if (existing.length > 0 && shelfCachedChapterListLooksStale(existing, book)) {
          console.log('[saveBookToShelf] 本地目录不完整，重新拉取', {
            cached: existing.length,
            expected: book.totalChapterNum ?? 0,
          });
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
      persistTocFetch: true,
      reverseToc: book.readConfig?.reverseToc === true,
      onPartial,
      bookUrl: book.bookUrl,
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
  });
}

function scheduleBackgroundChapterFetch(book: Book): void {
  void fetchAndPersistChaptersForBook(book);
}

/** 打开阅读器前：补全详情元数据并在无目录时阻塞拉取写入 DB */
export async function ensureShelfBookReadyForReading(book: Book): Promise<Book> {
  if (isLocalBook(book) || !book.origin) return book;

  let saved = await ensureShelfBookMetadataForReading(book);
  saved = (await booksDb.getBook(saved.bookUrl)) ?? saved;

  const count = await chaptersDb.getChapterCount(saved.bookUrl);
  let needFetch = false;

  if (count === 0) {
    needFetch = onlineBookNeedsChapterRepair(saved) || Boolean(saved.tocUrl?.trim());
  } else {
    const existing = await chaptersDb.getChapterList(saved.bookUrl);
    if (shelfCachedChapterListLooksStale(existing, saved)) {
      needFetch = true;
    }
  }

  if (needFetch) {
    await fetchAndPersistChaptersForBook(saved);
    saved = (await booksDb.getBook(saved.bookUrl)) ?? saved;
  }

  return saved;
}

/**
 * 打开阅读器前：是否仍缺目录或 tocUrl / latestChapterTitle 等元数据。
 * 勿用于书架被动拉取——缺元数据不等于需要重新请求目录接口。
 */
export function onlineBookNeedsChapterRepair(book: Book): boolean {
  if (isLocalBook(book) || !book.origin) return false;
  const tocUrl = book.tocUrl?.trim();
  if (!tocUrl || tocUrl === book.bookUrl) return true;
  return (book.totalChapterNum ?? 0) <= 0 || !book.latestChapterTitle?.trim();
}

const CHAPTER_REPAIR_MAX_CONCURRENT = 2;
let chapterRepairActive = 0;
const chapterRepairQueue: Book[] = [];
/** 本会话已入队的被动补救，避免每次 loadBooks 重复拉取 */
const passiveChapterRepairEnqueued = new Set<string>();

function pumpChapterRepairQueue(): void {
  while (chapterRepairActive < CHAPTER_REPAIR_MAX_CONCURRENT && chapterRepairQueue.length > 0) {
    const book = chapterRepairQueue.shift()!;
    chapterRepairActive += 1;
    void fetchAndPersistChaptersForBook(book).finally(() => {
      chapterRepairActive -= 1;
      pumpChapterRepairQueue();
    });
  }
}

/**
 * 书架加载后后台补救：仅 DB 尚无章节（入架时后台拉取中断等）。
 * 已有章节的元数据缺口由 fetchAndPersistChaptersForBook 本地同步，不重复请求目录。
 */
export async function scheduleShelfChapterRepairs(books: Book[]): Promise<void> {
  for (const book of books) {
    if (isLocalBook(book) || !book.origin) continue;
    if (passiveChapterRepairEnqueued.has(book.bookUrl)) continue;
    if (chapterRepairQueue.some((b) => b.bookUrl === book.bookUrl)) continue;

    const count = await chaptersDb.getChapterCount(book.bookUrl);
    if (count > 0) continue;

    passiveChapterRepairEnqueued.add(book.bookUrl);
    chapterRepairQueue.push(book);
  }
  pumpChapterRepairQueue();
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
    const patched = mergeShelfBookFromNewBook(existingByUrl, incoming);
    if (shelfBookInfoMetadataChanged(existingByUrl, patched)) {
      await booksDb.updateBook(patched);
      notifyShelfBookMeta(bookUrl);
    }
    if (fetchMode === 'blocking') {
      const chapters = options?.chapters ?? (await fetchChaptersForBook(incoming, bookUrl));
      await persistChaptersForSave(bookUrl, chapters, 'blocking');
    } else if (fetchMode === 'background') {
      scheduleBackgroundChapterFetch(patched);
    } else if (options?.chapters && options.chapters.length > 0) {
      schedulePersistChaptersToShelf(bookUrl, options.chapters);
    }
    await applyGroupMask(bookUrl, options?.groupId);
    return patched;
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
      await persistChaptersForSave(targetBook.bookUrl, chapters, fetchMode);
    }
  } else if (isOnline) {
    if (!(await sourcesDb.getSource(incoming.origin))) {
      console.warn('[saveBookToShelf] 未找到书源:', incoming.origin);
      return null;
    }
    await booksDb.insertBook(incoming);
    if (chapters && chapters.length > 0) {
      await persistChaptersForSave(bookUrl, chapters, fetchMode);
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
  notifyBookshelfRefresh();

  let skipBackgroundFetch = false;
  if ((options?.chapters?.length ?? 0) > 0 && isOnline) {
    const source = await sourcesDb.getSource(incoming.origin);
    const tocUrl = incoming.tocUrl || bookUrl;
    skipBackgroundFetch = !source || !isChapterListFetchInFlight(source, tocUrl);
  }
  if (saved && fetchMode === 'background' && isOnline && !skipBackgroundFetch) {
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
  const wantsBackgroundFetch =
    resolveFetchMode(options) === 'background' && !(options?.chapters?.length);
  const saved = await saveBookToShelf(searchBookToNewBook(sb), {
    ...options,
    fetchChapters: wantsBackgroundFetch ? false : options?.fetchChapters,
  });
  if (!saved) return null;

  const book = (await syncShelfBookFromSearchBook(sb)) ?? saved;

  if (wantsBackgroundFetch && isOnlineBook(book.origin)) {
    scheduleBackgroundChapterFetch(book);
  }

  return book;
}

export { syncShelfBookFromSearchBook };
