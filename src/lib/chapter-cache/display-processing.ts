/**
 * 缓存正文读出后的展示处理（替换规则等）
 */

import { processContent } from '@/lib/book-source/content-processor';
import type { Book, BookSource } from '@/types';

/** 是否对该书应用替换规则（Legado Book.useReplaceRule / readConfig.useReplaceRule，默认开启） */
export function isReplaceRuleEnabledForBook(book: Book): boolean {
  const flag = book.readConfig?.useReplaceRule;
  return flag !== false;
}

export async function applyChapterDisplayProcessing(
  rawContent: string,
  book: Book,
  source?: BookSource | null,
): Promise<string> {
  if (!rawContent) return rawContent;
  if (!isReplaceRuleEnabledForBook(book)) {
    return rawContent;
  }
  const sourceUrl = source?.sourceUrl ?? book.origin;
  return processContent(rawContent, book.name, sourceUrl);
}
