/**
 * 换源（对齐 Legado ChangeBookSourceDialog）
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { getBookInfo } from '@/lib/book-source/detail';
import { fetchChapterListDeduped, toNewBookChapter } from '@/lib/book-source/chapters';
import { searchBook } from '@/lib/book-source/search';
import { isSameNameAndAuthor, migrateBookProgress } from '@/lib/bookshelf/book-migrate';
import { isLocalBook } from '@/lib/local-book';
import type { Book, BookSource, SearchBook } from '@/types';

export interface ChangeSourceCandidate {
  source: BookSource;
  searchBook: SearchBook;
}

export async function searchChangeSourceCandidates(
  book: Book,
  options?: { maxSources?: number },
): Promise<ChangeSourceCandidate[]> {
  if (isLocalBook(book)) return [];
  const maxSources = options?.maxSources ?? 12;
  const sources = (await sourcesDb.getAllSources())
    .filter((s) => s.enabled && s.bookSourceUrl !== book.origin)
    .slice(0, maxSources);

  const out: ChangeSourceCandidate[] = [];
  await Promise.all(
    sources.map(async (source) => {
      if (!source.searchUrl?.trim()) return;
      try {
        const hits = await searchBook(source, book.name, {
          filter: (name, author) =>
            isSameNameAndAuthor(
              { name, author },
              { name: book.name, author: book.author ?? '' },
            ),
        });
        for (const sb of hits.slice(0, 3)) {
          out.push({ source, searchBook: sb });
        }
      } catch (e) {
        console.warn('[change-source] search failed', source.sourceName, e);
      }
    }),
  );
  return out.sort((a, b) =>
    a.source.sourceName.localeCompare(b.source.sourceName, 'zh'),
  );
}

export async function applyChangeSource(
  oldBook: Book,
  candidate: ChangeSourceCandidate,
): Promise<Book> {
  if (isLocalBook(oldBook)) {
    throw new Error('本地书不支持换源');
  }
  const { source, searchBook: hit } = candidate;
  const info = await getBookInfo(source, hit.bookUrl, {
    book: hit as unknown as Record<string, unknown>,
    bookVariable: oldBook.variable,
  });
  if (!info) throw new Error('获取书籍信息失败');

  const tocUrl = info.tocUrl?.trim() || hit.tocUrl || hit.bookUrl;
  const chapters = await fetchChapterListDeduped(source, tocUrl, {
    reverseToc: oldBook.readConfig?.reverseToc === true,
    bookVariable: oldBook.variable,
  });
  if (chapters.length === 0) throw new Error('新源目录为空');

  const now = Date.now();
  let working: Book = {
    ...oldBook,
    bookUrl: hit.bookUrl,
    tocUrl,
    origin: source.bookSourceUrl ?? source.sourceUrl,
    originName: source.sourceName,
    name: info.name || hit.name,
    author: info.author ?? hit.author ?? oldBook.author,
    kind: info.kind ?? hit.kind ?? oldBook.kind,
    intro: info.intro ?? hit.intro ?? oldBook.intro,
    coverUrl: info.coverUrl ?? hit.coverUrl ?? oldBook.coverUrl,
    latestChapterTitle: info.latestChapterTitle ?? chapters[chapters.length - 1]?.title,
    lastCheckTime: now,
    totalChapterNum: chapters.length,
    type: hit.type ?? oldBook.type,
  };

  working = migrateBookProgress(working, oldBook, chapters);

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
