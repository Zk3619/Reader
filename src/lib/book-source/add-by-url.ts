/**
 * 通过 URL 添加书籍（书源在线书籍，对齐 legado BookshelfViewModel.addBookByUrl）
 */

import * as booksDb from '@/lib/database/books';
import {
  getBookSourceForAddBook,
  getEnabledSourcesWithBookUrlPattern,
  getSource,
} from '@/lib/database/sources';
import { getBookInfo } from '@/lib/book-source/detail';
import { addSearchBookToShelf } from '@/lib/bookshelf/save-book-to-shelf';
import { parseBookUrlWithOption, getNetworkBaseUrl } from '@/lib/book-source/url-option';
import type { BookSource } from '@/types';
import type { BookInfo } from '@/types';
import type { SearchBook } from '@/types';

const FILE_URL_EXT = /\.(txt|epub|pdf|mobi|umd|azw3)(\?|#|$)/i;

export function isLikelyDirectFileUrl(url: string): boolean {
  try {
    return FILE_URL_EXT.test(new URL(url).pathname);
  } catch {
    return FILE_URL_EXT.test(url);
  }
}

function bookInfoToSearchBook(info: BookInfo): SearchBook {
  return {
    bookUrl: info.bookUrl,
    tocUrl: info.tocUrl,
    name: info.name,
    author: info.author,
    kind: info.kind,
    intro: info.intro,
    coverUrl: info.coverUrl,
    origin: info.origin,
    originName: info.originName,
    type: 0,
    latestChapterTitle: info.latestChapterTitle,
    latestChapterUpdateTime: info.latestChapterUpdateTime,
    time: Date.now(),
    originOrder: 0,
    chapterWordCount: 0,
    respondTime: 0,
  };
}

/**
 * 为书籍 URL 解析书源（顺序对齐 legado / AddToBookshelfDialog）：
 * 1. UrlOption 指定 origin
 * 2. 站点根 URL 匹配 bookSourceUrl
 * 3. bookUrlPattern 正则匹配
 */
export async function resolveSourceForBookUrl(bookUrl: string): Promise<BookSource | null> {
  const { bookUrl: cleanUrl, specifiedOrigin } = parseBookUrlWithOption(bookUrl);

  if (specifiedOrigin) {
    const source = await getSource(specifiedOrigin);
    if (source?.enabled && source.ruleBookInfo) {
      if (!source.bookUrlPattern) {
        return source;
      }
      try {
        if (new RegExp(source.bookUrlPattern).test(cleanUrl)) {
          return source;
        }
      } catch {
        /* 无效正则，继续 */
      }
    }
  }

  const baseUrl = getNetworkBaseUrl(cleanUrl);
  if (baseUrl) {
    const bySite = await getBookSourceForAddBook(baseUrl);
    if (bySite?.ruleBookInfo) {
      return bySite;
    }
  }

  const patternSources = await getEnabledSourcesWithBookUrlPattern();
  for (const source of patternSources) {
    if (!source.bookUrlPattern || !source.ruleBookInfo) continue;
    try {
      if (new RegExp(source.bookUrlPattern).test(cleanUrl)) {
        return source;
      }
    } catch {
      /* 跳过无效正则 */
    }
  }

  return null;
}

export type AddOnlineBookByUrlResult = {
  success: boolean;
  bookName?: string;
  /** 已在书架，视为成功 */
  skipped?: boolean;
  error?: string;
};

/**
 * 通过书源详情页 URL 加入书架
 */
export async function addOnlineBookByUrl(
  rawUrl: string,
  options?: { groupId?: number }
): Promise<AddOnlineBookByUrlResult> {
  const { bookUrl } = parseBookUrlWithOption(rawUrl.trim());
  if (!bookUrl) {
    return { success: false, error: 'URL 不能为空' };
  }
  if (!bookUrl.startsWith('http://') && !bookUrl.startsWith('https://')) {
    return { success: false, error: '书籍地址格式不对，请使用 http/https 链接' };
  }

  const existing = await booksDb.getBook(bookUrl);
  if (existing) {
    return { success: true, bookName: existing.name, skipped: true };
  }

  const source = await resolveSourceForBookUrl(bookUrl);
  if (!source) {
    return { success: false, error: '未找到匹配书源' };
  }

  const info = await getBookInfo(source, bookUrl);
  if (!info?.name) {
    return { success: false, error: '获取书籍信息失败' };
  }

  const book = await addSearchBookToShelf(bookInfoToSearchBook(info), {
    groupId: options?.groupId,
    fetchChapters: true,
  });
  if (!book) {
    return { success: false, error: '加入书架失败' };
  }

  return { success: true, bookName: book.name };
}
