/**
 * 听书判定：书源/类型元数据 + 章节正文形态（音频 URL）
 */

import {
  isBookAudio,
  MediaKind,
  resolveMediaKindWithSource,
} from '@/lib/book-source/book-type';
import { parseParsedAudioUrls } from '@/lib/media/audio/parsed-audio-url';
import {
  isMangaChapterContent,
  resolveMangaBookFlag,
} from '@/lib/media/image/image-book-detect';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import type { Book, BookSource } from '@/types';

/** 章节正文是否含可解析音频地址（图片章 HTML 排除） */
export function isAudioChapterContent(raw: string, chapterUrl = ''): boolean {
  if (!raw?.trim()) return false;
  if (isMangaChapterContent(raw, chapterUrl)) return false;
  return parseParsedAudioUrls(raw).length > 0;
}

/** 元数据判定：book.type / 书源 sourceType / tab */
export function isAudioBookByMeta(
  book: Pick<Book, 'type' | 'origin' | 'bookUrl' | 'tocUrl'>,
  source?: Pick<BookSource, 'sourceType'> | null,
): boolean {
  if (isBookAudio(book.type)) return true;
  if (source && isBookAudio(source.sourceType)) return true;
  return resolveMediaKindWithSource(book, source?.sourceType) === MediaKind.audio;
}

/** 抽样已缓存章节正文判定听书 */
export async function isAudioBookFromCachedChapters(
  bookUrl: string,
  maxSamples = 5,
): Promise<boolean> {
  const rows = await chapterCacheDb.listChapterCacheByBook(bookUrl);
  const indices = rows
    .map((r) => r.chapterIndex)
    .sort((a, b) => a - b)
    .slice(0, maxSamples);
  let checked = 0;
  let audioLike = 0;
  for (const i of indices) {
    const raw = await readCachedChapterRaw(bookUrl, i);
    if (!raw?.trim()) continue;
    checked += 1;
    if (isAudioChapterContent(raw)) audioLike += 1;
  }
  return checked > 0 && audioLike >= Math.ceil(checked * 0.5);
}

export async function resolveAudioBookFlag(
  book: Book,
  source?: BookSource | null,
): Promise<boolean> {
  if (isAudioBookByMeta(book, source)) return true;
  if (await resolveMangaBookFlag(book, source)) return false;
  return isAudioBookFromCachedChapters(book.bookUrl);
}
