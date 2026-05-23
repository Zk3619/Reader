/**
 * 书架「添加网址」统一入口：书源书籍 URL（legado）+ 文件直链（Reader 增强）
 */

import { addOnlineBookByUrl, isLikelyDirectFileUrl } from '@/lib/book-source/add-by-url';
import { parseBookUrlWithOption } from '@/lib/book-source/url-option';
import { importBookFromUrl } from '@/lib/remote-book/url-importer';
import * as booksDb from '@/lib/database/books';

export type AddBooksByUrlResult = {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
};

export type AddBooksByUrlProgress = {
  current: number;
  total: number;
};

/**
 * 批量添加（每行一个 URL）
 */
export async function addBooksByUrl(
  urlsText: string,
  options?: {
    groupId?: number;
    onProgress?: (progress: AddBooksByUrlProgress) => void;
  }
): Promise<AddBooksByUrlResult> {
  const urlList = urlsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const total = urlList.length;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < urlList.length; i++) {
    const raw = urlList[i];
    options?.onProgress?.({ current: i + 1, total });

    const { bookUrl } = parseBookUrlWithOption(raw);
    const existing = await booksDb.getBook(bookUrl);
    if (existing) {
      success++;
      skipped++;
      continue;
    }

    let result: { success: boolean; error?: string; skipped?: boolean };

    if (isLikelyDirectFileUrl(bookUrl)) {
      result = await importBookFromUrl(raw, {
        groupId: options?.groupId,
        quiet: true,
      });
    } else {
      const online = await addOnlineBookByUrl(raw, { groupId: options?.groupId });
      if (online.success) {
        result = online;
      } else {
        const fileFallback = await importBookFromUrl(raw, {
          groupId: options?.groupId,
          quiet: true,
        });
        result = fileFallback.success
          ? fileFallback
          : { success: false, error: online.error ?? fileFallback.error };
      }
    }

    if (result.success) {
      success++;
      if (result.skipped) skipped++;
    } else {
      failed++;
      if (result.error) {
        errors.push(`${bookUrl}: ${result.error}`);
      }
    }
  }

  return { success, failed, skipped, errors };
}
