import type { Book, SearchBook } from '@/types';
import { mergeBookContentVariable, readBookContentSource } from '@/lib/book-source/utils';

/** 未上架书籍进入阅读器用的临时 Book（不写库） */
export function searchBookToEphemeralBook(sb: SearchBook): Book {
  const now = Date.now();
  return {
    bookUrl: sb.bookUrl,
    tocUrl: sb.tocUrl ?? sb.bookUrl,
    origin: sb.origin,
    originName: sb.originName ?? '',
    name: sb.name,
    author: sb.author ?? '',
    kind: sb.kind,
    intro: sb.intro,
    coverUrl: sb.coverUrl,
    charset: undefined,
    type: sb.type ?? 0,
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
    originOrder: sb.originOrder ?? 0,
    syncTime: 0,
    variable: mergeBookContentVariable(sb.variable, { source: sb.source }),
  };
}

/** 将书架书籍转为书籍信息页所需的 SearchBook */
export function bookToSearchBook(book: Book): SearchBook {
  const contentSource = readBookContentSource(book);
  return {
    bookUrl: book.bookUrl,
    name: book.name,
    author: book.author,
    kind: book.kind,
    wordCount: book.wordCount,
    origin: book.origin,
    originName: book.originName,
    type: book.type,
    coverUrl: book.customCoverUrl || book.coverUrl,
    intro: book.customIntro || book.intro,
    latestChapterTitle: book.latestChapterTitle,
    tocUrl: book.tocUrl,
    time: book.lastCheckTime ?? 0,
    originOrder: book.originOrder ?? 0,
    chapterWordCount: -1,
    respondTime: 0,
    source: contentSource || undefined,
    variable: book.variable,
  };
}
