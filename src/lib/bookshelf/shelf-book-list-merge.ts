/**
 * 书架列表更新：尽量保留 Book 对象引用，避免整表替换导致封面/卡片闪烁
 */

import type { Book } from '@/types';

/** 书架卡片展示与排序相关字段（与 Legado DiffUtil 粒度接近） */
const SHELF_ROW_FIELDS: (keyof Book)[] = [
  'name',
  'author',
  'coverUrl',
  'customCoverUrl',
  'durChapterTime',
  'durChapterIndex',
  'durChapterTitle',
  'durChapterPos',
  'latestChapterTime',
  'latestChapterTitle',
  'lastCheckTime',
  'lastCheckCount',
  'order',
  'canUpdate',
  'origin',
];

export function shelfBookRowEqual(a: Book, b: Book): boolean {
  return SHELF_ROW_FIELDS.every((key) => a[key] === b[key]);
}

/** 按 next 的顺序合并；数据未变的项沿用 prev 中的同一引用 */
export function mergeShelfBookList(prev: Book[], next: Book[]): Book[] {
  const prevByUrl = new Map(prev.map((b) => [b.bookUrl, b]));
  return next.map((b) => {
    const old = prevByUrl.get(b.bookUrl);
    return old && shelfBookRowEqual(old, b) ? old : b;
  });
}

/**
 * 将 DB 行合并进书架已有项（保持引用），避免排序后封面/卡片整项重挂载
 */
export function applyShelfBookInPlace(target: Book, source: Book): Book {
  if (target.bookUrl !== source.bookUrl) return source;
  for (const key of SHELF_ROW_FIELDS) {
    if (target[key] !== source[key]) {
      Object.assign(target, { [key]: source[key] });
    }
  }
  return target;
}

export function shelfListOrderSignature(books: Book[]): string {
  return books.map((b) => b.bookUrl).join('\0');
}

export function shelfListsSameOrderAndRefs(a: Book[], b: Book[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((book, i) => book === b[i]);
}
