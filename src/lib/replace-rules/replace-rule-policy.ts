/**
 * 替换净化开关策略（对齐 Legado Book.getUseReplaceRule + AppConfig.replaceEnableDefault）
 */

import { isBookImage } from '@/lib/book-source/book-type';
import { detectFileType, isLocalBook } from '@/lib/local-book';
import type { Book } from '@/types';

/** 替换净化策略所需的书籍字段（书架 Book 与 SearchBook 均满足） */
export type ReplacePolicyBook = Pick<Book, 'name' | 'origin' | 'type'> &
  Partial<Pick<Book, 'readConfig' | 'originName' | 'bookUrl'>>;

const STORAGE_KEY = 'reader_replace_enable_default';

/** 全局替换净化开关：书籍未显式设置 useReplaceRule 时生效（Legado replaceEnableDefault，默认 true） */
export function getReplaceEnableDefault(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return true;
}

export function setReplaceEnableDefault(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }
}

function isLocalEpubBook(book: ReplacePolicyBook): boolean {
  if (!isLocalBook(book)) return false;
  const hint = book.originName || book.name || book.bookUrl || '';
  return detectFileType(hint) === 'epub';
}

/** 是否对该书应用替换规则 */
export function isReplaceRuleEnabledForBook(book: ReplacePolicyBook): boolean {
  const explicit = book.readConfig?.useReplaceRule;
  if (explicit != null) return explicit;
  // 图片书、本地 EPUB：Legado 默认关闭净化
  if (isBookImage(book.type) || isLocalEpubBook(book)) return false;
  return getReplaceEnableDefault();
}

export function isReSegmentEnabledForBook(book: Book): boolean {
  return book.readConfig?.reSegment === true;
}
