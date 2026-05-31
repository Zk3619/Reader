/**
 * 书籍 type 位标志（与 Legado BookType 对齐）
 * 书源 bookSourceType 枚举 0=文本,1=音频,2=图片,3=文件,4=视频 也常直接写入 book.type
 */

import type { Book } from '@/types';
import { inferTabFromBook } from '@/lib/book-source/utils';

/** 更新目录失败 */
export const BOOK_TYPE_UPDATE_ERROR = 0b10000;

/** Legado BookType */
export const BookType = {
  video: 0b100,
  text: 0b1000,
  updateError: 0b10000,
  audio: 0b100000,
  image: 0b1000000,
  webFile: 0b10000000,
  local: 0b100000000,
  archive: 0b1000000000,
  notShelf: 0b100_0000_0000,
} as const;

/** 书源 sourceType / bookSourceType 枚举（BookSourceType） */
export const BookSourceType = {
  text: 0,
  audio: 1,
  image: 2,
  file: 3,
  video: 4,
} as const;

/** 与 BookSourceType 枚举键名对齐的媒体种类 */
export const MediaKind = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'file',
} as const;

export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

/** 聚合书源 tab 与 Legado 媒体类型的映射 */
const TAB_TO_BOOK_TYPE: Record<string, number> = {
  漫画: BookType.image,
  听书: BookType.audio,
  短剧: BookType.video,
};

export function hasBookType(type: number, flag: number): boolean {
  return (type & flag) > 0;
}

export function addBookType(type: number, flag: number): number {
  return type | flag;
}

export function removeBookType(type: number, flag: number): number {
  return type & ~flag;
}

export function isLocalOrigin(origin: string): boolean {
  return origin === 'local' || origin.startsWith('local::') || origin === 'loc_book';
}

/** 将书源类型转为 Legado 书籍 type 位（加入书架时推荐） */
export function bookTypeFromSourceType(sourceType: number): number {
  switch (sourceType) {
    case BookSourceType.audio:
      return BookType.audio;
    case BookSourceType.image:
      return BookType.image;
    case BookSourceType.video:
      return BookType.video;
    case BookSourceType.file:
      return BookType.text | BookType.webFile;
    default:
      return BookType.text;
  }
}

/** 结合 tab（漫画/听书/短剧）与书源 type 得到有效书籍 type */
export function resolveBookType(
  sourceType: number,
  tab?: string,
): number {
  const fromTab = tab?.trim() ? TAB_TO_BOOK_TYPE[tab.trim()] : undefined;
  if (fromTab != null) return fromTab;
  return bookTypeFromSourceType(sourceType);
}

export function isBookAudio(type: number): boolean {
  return type === BookSourceType.audio || hasBookType(type, BookType.audio);
}

export function isBookImage(type: number): boolean {
  return type === BookSourceType.image || hasBookType(type, BookType.image);
}

export function isBookVideo(type: number, origin: string): boolean {
  if (isLocalOrigin(origin)) return false;
  return type === BookSourceType.video || hasBookType(type, BookType.video);
}

export function isBookFile(type: number): boolean {
  return type === BookSourceType.file || hasBookType(type, BookType.webFile);
}

export function mediaKindFromSourceType(sourceType: number): MediaKind {
  switch (sourceType) {
    case BookSourceType.audio:
      return MediaKind.audio;
    case BookSourceType.image:
      return MediaKind.image;
    case BookSourceType.video:
      return MediaKind.video;
    case BookSourceType.file:
      return MediaKind.file;
    default:
      return MediaKind.text;
  }
}

/** 本地导入书在 Reader 中 type=4（与 Legado 的 local 位不同，靠 origin 区分） */
export function isReaderLocalBookType(_type: number, origin: string): boolean {
  return isLocalOrigin(origin);
}

/**
 * 根据书籍 type / tab / origin 决定媒体种类（对齐 Legado startActivityForBook）
 */
export function resolveMediaKind(
  book: Pick<Book, 'type' | 'origin' | 'bookUrl' | 'tocUrl'> & { tab?: string },
): MediaKind {
  const { type, origin } = book;
  if (isReaderLocalBookType(type, origin)) return MediaKind.text;

  const tab = book.tab?.trim() || inferTabFromBook(book);
  const effectiveType = tab ? resolveBookType(type, tab) : type;

  if (isBookVideo(effectiveType, origin)) return MediaKind.video;
  if (isBookAudio(effectiveType)) return MediaKind.audio;
  if (isBookImage(effectiveType)) return MediaKind.image;
  if (isBookFile(effectiveType)) return MediaKind.file;
  return MediaKind.text;
}

