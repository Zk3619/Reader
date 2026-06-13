import { resolveBookType } from '@/lib/book-source/book-type';
import type { Book, BookInfo, SearchBook } from '@/types';

/** 将详情 API 结果转为 SearchBook，供书架元信息合并使用 */
export function bookInfoToSearchBook(
  info: BookInfo,
  base: Pick<Book, 'bookUrl' | 'origin' | 'originName' | 'type' | 'originOrder' | 'variable'>,
): SearchBook {
  return {
    bookUrl: info.bookUrl || base.bookUrl,
    tocUrl: info.tocUrl || base.bookUrl,
    name: info.name,
    author: info.author,
    kind: info.kind,
    intro: info.intro,
    coverUrl: info.coverUrl,
    wordCount: info.wordCount,
    latestChapterTitle: info.latestChapterTitle,
    latestChapterUpdateTime: info.latestChapterUpdateTime,
    origin: info.origin || base.origin,
    originName: info.originName || base.originName,
    source: info.source,
    status: info.status,
    tab: info.tab,
    category: info.category,
    tags: info.tags,
    score: info.score,
    type: resolveBookType(base.type, info.tab),
    variable: base.variable,
    time: Date.now(),
    originOrder: base.originOrder,
    chapterWordCount: 0,
    respondTime: 0,
  };
}
