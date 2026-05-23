import type { Book, SearchBook } from '@/types';

/** 将书架书籍转为书籍信息页所需的 SearchBook */
export function bookToSearchBook(book: Book): SearchBook {
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
  };
}
