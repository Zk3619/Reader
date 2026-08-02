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

/** 本地 PDF 书籍：origin 本地 + 文件名/URL 以 .pdf 结尾（阅读器需路由到 PDF 专用页而非文本页） */
export function isLocalPdfBook(
  book: Pick<Book, 'origin' | 'bookUrl'> & { originName?: string },
): boolean {
  if (!isLocalOrigin(book.origin)) return false;
  const lowerName = book.originName?.toLowerCase();
  if (lowerName) return lowerName.endsWith('.pdf');
  return book.bookUrl.toLowerCase().endsWith('.pdf');
}

/** 数据库 WHERE：本地书（勿用 type&4，type=4 亦为 Legado 短剧/视频） */
export const SQL_LOCAL_BOOK_CONDITION =
  `(origin = 'local' OR origin LIKE 'local::%' OR origin = 'loc_book')`;

/** 数据库 WHERE：非本地书 */
export const SQL_NETWORK_BOOK_CONDITION =
  `(origin <> 'local' AND origin NOT LIKE 'local::%' AND origin <> 'loc_book')`;

/** 与 isBookAudio() 对齐的 SQL 条件 */
export const SQL_AUDIO_BOOK_CONDITION = `(type & ${BookType.audio} > 0 OR type = 1)`;

/** 书源 sourceType / bookSourceType 枚举（0–4），与 Legado BookType 位标志区分 */
export function isBookSourceTypeEnum(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= BookSourceType.video;
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
  typeOrSourceType: number,
  tab?: string,
): number {
  const fromTab = tab?.trim() ? TAB_TO_BOOK_TYPE[tab.trim()] : undefined;
  if (fromTab != null) return fromTab;
  if (!isBookSourceTypeEnum(typeOrSourceType)) {
    return typeOrSourceType;
  }
  return bookTypeFromSourceType(typeOrSourceType);
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

  // 已带 Legado 媒体位标志时优先采用，避免 data: URL / 详情 tab（如「小说」）把漫画降成文本
  if (isBookVideo(type, origin)) return MediaKind.video;
  if (isBookAudio(type)) return MediaKind.audio;
  if (isBookImage(type)) return MediaKind.image;
  if (isBookFile(type)) return MediaKind.file;

  const tab = book.tab?.trim() || inferTabFromBook(book);
  const effectiveType = tab ? resolveBookType(type, tab) : type;

  if (isBookVideo(effectiveType, origin)) return MediaKind.video;
  if (isBookAudio(effectiveType)) return MediaKind.audio;
  if (isBookImage(effectiveType)) return MediaKind.image;
  if (isBookFile(effectiveType)) return MediaKind.file;
  return MediaKind.text;
}

/**
 * 结合书源 sourceType 解析阅读器种类（搜索书 type 常为 0b1000=8，图库 sourceType=2 时应进 image-viewer）
 */
export function resolveMediaKindWithSource(
  book: Pick<Book, 'type' | 'origin' | 'bookUrl' | 'tocUrl'> & { tab?: string },
  sourceType?: number,
): MediaKind {
  const fromBook = resolveMediaKind(book);
  if (sourceType == null || !isBookSourceTypeEnum(sourceType)) {
    return fromBook;
  }
  const fromSource = mediaKindFromSourceType(sourceType);
  if (fromBook === MediaKind.text && fromSource !== MediaKind.text) {
    return fromSource;
  }
  return fromBook;
}

