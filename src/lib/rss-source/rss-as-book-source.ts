/**
 * RSS 源复用书源 HTTP / Cookie / AnalyzeUrl 栈时的类型桥接
 */

import type { BookSource, RssSource } from '@/types';

/** 将 RssSource 映射为 BookSource 形态，供 fetchByAnalyzeUrl / Cookie 池使用 */
export function rssAsBookSource(source: RssSource): BookSource {
  const s = source as RssSource & Partial<BookSource>;
  return {
    ...s,
    bookSourceUrl: s.bookSourceUrl ?? source.sourceUrl,
    bookSourceName: s.bookSourceName ?? source.sourceName,
    sourceType: s.sourceType ?? source.type ?? 0,
    enableExplore: s.enableExplore ?? false,
    respondTime: s.respondTime ?? 0,
    weight: s.weight ?? 0,
    exploreUrl: s.exploreUrl,
    ruleSearch: s.ruleSearch,
    ruleExplore: s.ruleExplore,
    ruleBookInfo: s.ruleBookInfo,
    ruleToc: s.ruleToc,
    ruleContent: s.ruleContent ?? source.ruleContent,
  } as BookSource;
}
