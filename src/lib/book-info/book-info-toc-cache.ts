/**
 * 书籍详情页目录会话缓存（进程内，与 pageCache 互补）
 * 用于重进详情时首帧即有目录文案，避免等 IndexedDB / 网络。
 */

import type { BookChapter } from '@/types';

const sessionTocByBookUrl = new Map<string, BookChapter[]>();

export function getBookInfoTocSessionCache(bookUrl: string): BookChapter[] | null {
  const hit = sessionTocByBookUrl.get(bookUrl);
  return hit && hit.length > 0 ? hit : null;
}

export function setBookInfoTocSessionCache(bookUrl: string, chapters: BookChapter[]): void {
  if (chapters.length > 0) {
    sessionTocByBookUrl.set(bookUrl, chapters);
  }
}

export function clearBookInfoTocSessionCache(bookUrl?: string): void {
  if (bookUrl) sessionTocByBookUrl.delete(bookUrl);
  else sessionTocByBookUrl.clear();
}
