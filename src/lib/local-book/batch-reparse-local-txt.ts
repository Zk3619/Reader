/**
 * 批量重解析书架中的本地 TXT（对齐 Legado 换规则后批量刷新目录）
 */

import { getBooksByGroup } from '@/lib/database/books';
import { isLocalTxtFileModified } from '@/lib/local-book/local-txt-file-meta';
import { reparseLocalTxtBook } from '@/lib/local-book/reparse-txt-book';
import { BookGroupId } from '@/types/book-group';
import type { Book } from '@/types';

export interface BatchReparseProgress {
  done: number;
  total: number;
  bookUrl: string;
  bookName: string;
  status: 'success' | 'failed' | 'skipped';
  chapterCount?: number;
  error?: string;
}

export interface BatchReparseLocalTxtOptions {
  /** 仅重解析检测到文件变更的书 */
  onlyModified?: boolean;
  /** 忽略变更检测，强制全部重解析 */
  force?: boolean;
  onProgress?: (progress: BatchReparseProgress) => void;
  signal?: AbortSignal;
}

export interface BatchReparseLocalTxtResult {
  success: number;
  failed: number;
  skipped: number;
  total: number;
}

function isTxtFileName(name: string): boolean {
  return name.toLowerCase().split('.').pop() === 'txt';
}

export function isLocalTxtBook(book: Book): boolean {
  const isLocal = book.origin === 'local' || book.origin.startsWith('local::');
  if (!isLocal) return false;
  if (isTxtFileName(book.originName)) return true;
  const urlName = book.bookUrl.replace(/^.*[/\\]/, '');
  return isTxtFileName(urlName);
}

export async function listLocalTxtBooks(): Promise<Book[]> {
  const books = await getBooksByGroup(BookGroupId.Local);
  return books.filter(isLocalTxtBook);
}

export async function batchReparseLocalTxtBooks(
  options: BatchReparseLocalTxtOptions = {},
): Promise<BatchReparseLocalTxtResult> {
  const { onlyModified = false, force = false, onProgress, signal } = options;
  const books = await listLocalTxtBooks();
  const total = books.length;
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < books.length; i++) {
    if (signal?.aborted) break;
    const book = books[i]!;
    const base: BatchReparseProgress = {
      done: i + 1,
      total,
      bookUrl: book.bookUrl,
      bookName: book.name || book.originName || book.bookUrl,
      status: 'skipped',
    };

    if (!force && onlyModified && !(await isLocalTxtFileModified(book))) {
      skipped++;
      onProgress?.(base);
      continue;
    }

    try {
      const result = await reparseLocalTxtBook(book.bookUrl);
      success++;
      onProgress?.({
        ...base,
        status: 'success',
        chapterCount: result.chapterCount,
      });
    } catch (e) {
      failed++;
      onProgress?.({
        ...base,
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { success, failed, skipped, total };
}
