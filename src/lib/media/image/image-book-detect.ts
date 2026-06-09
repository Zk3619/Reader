/**
 * 漫画书判定：书源/类型元数据 + 章节正文形态（HTML img 列表）
 * 书架书 type 常为 0b1000（文本），图库书源 sourceType=2 或正文几乎纯图片时需兜底。
 */

import {
  isBookImage,
  MediaKind,
  resolveMediaKindWithSource,
} from '@/lib/book-source/book-type';
import { countFlowImages } from '@/lib/media/image/flow-images';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import type { Book, BookSource } from '@/types';

const MANGA_PLAIN_TEXT_MAX = 160;

/** 章节正文是否以图片为主（漫画章） */
export function isMangaChapterContent(raw: string, chapterUrl = ''): boolean {
  if (!raw?.trim()) return false;
  const imgCount = countFlowImages(raw, chapterUrl);
  if (imgCount < 1) return false;
  const plain = raw
    .replace(/<img[\s\S]*?>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length <= MANGA_PLAIN_TEXT_MAX;
}

/** 元数据判定：book.type / 书源 sourceType / tab */
export function isMangaBookByMeta(
  book: Pick<Book, 'type' | 'origin' | 'bookUrl' | 'tocUrl'>,
  source?: Pick<BookSource, 'sourceType'> | null,
): boolean {
  if (isBookImage(book.type)) return true;
  if (source && isBookImage(source.sourceType)) return true;
  return resolveMediaKindWithSource(book, source?.sourceType) === MediaKind.image;
}

/** 抽样已缓存章节正文判定漫画 */
export async function isMangaBookFromCachedChapters(
  bookUrl: string,
  maxSamples = 5,
): Promise<boolean> {
  const rows = await chapterCacheDb.listChapterCacheByBook(bookUrl);
  const indices = rows
    .map((r) => r.chapterIndex)
    .sort((a, b) => a - b)
    .slice(0, maxSamples);
  let checked = 0;
  let mangaLike = 0;
  for (const i of indices) {
    const raw = await readCachedChapterRaw(bookUrl, i);
    if (!raw?.trim()) continue;
    checked += 1;
    if (isMangaChapterContent(raw)) mangaLike += 1;
  }
  return checked > 0 && mangaLike >= Math.ceil(checked * 0.5);
}

export async function resolveMangaBookFlag(
  book: Book,
  source?: BookSource | null,
): Promise<boolean> {
  if (isMangaBookByMeta(book, source)) return true;
  return isMangaBookFromCachedChapters(book.bookUrl);
}
