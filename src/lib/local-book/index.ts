/**
 * 本地书籍管理器
 * 对应 legado 项目的 LocalBook.kt
 * 
 * 功能：
 * 1. 导入本地书籍文件
 * 2. 获取章节列表
 * 3. 获取章节内容
 * 4. 解析文件名提取书名和作者
 */

import type { Book, BookChapter } from '@/types';
import { parseStorageRef } from '@/lib/platform/fs/storage-ref';
import { getTxtChapterList, getTxtContent } from '@/lib/local-book/txt-parser';
import { getEpubChapterList, getEpubContent } from '@/lib/local-book/epub-parser';

/**
 * 本地书籍文件类型
 */
export type LocalBookType = 'txt' | 'epub' | 'umd' | 'pdf' | 'mobi';

/**
 * 检测文件类型（通过文件名扩展名）
 */
export function detectFileType(fileName: string): LocalBookType | null {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'txt':
      return 'txt';
    case 'epub':
      return 'epub';
    case 'umd':
      return 'umd';
    case 'pdf':
      return 'pdf';
    case 'mobi':
    case 'azw3':
      return 'mobi';
    default:
      return null;
  }
}

/**
 * 通过文件内容魔数（magic bytes）检测文件类型
 * 用于 Android Content URI 等无法从路径获取扩展名的情况
 * 
 * @param content 文件内容
 * @returns 检测到的文件类型，如果无法识别则返回 null
 */
export function detectFileTypeByContent(content: ArrayBuffer): LocalBookType | null {
  const header = new Uint8Array(content.slice(0, 8));

  // EPUB 是 ZIP 格式，以 PK (0x50 0x4B 0x03 0x04) 开头
  if (header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04) {
    return 'epub';
  }

  // PDF 以 %PDF 开头
  if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
    return 'pdf';
  }

  // MOBI/AZW 通常在偏移量 60-67 处有 "BOOKMOBI" 标识
  // 这里简化处理，需要读取更多字节才能准确检测

  // 默认假设为 TXT（纯文本没有特定魔数）
  // 如果前几个字节看起来像文本（没有二进制控制字符），则认为是 TXT
  const textLike = Array.from(header.slice(0, 4)).every(
    byte => byte >= 0x09 && byte !== 0x7F || byte >= 0x80 // 允许 UTF-8 多字节
  );

  if (textLike) {
    return 'txt';
  }

  return null;
}

/**
 * 检查路径是否是 Android Content URI
 */
export function isAndroidContentUri(path: string): boolean {
  if (path.startsWith('content://')) return true;
  try {
    return parseStorageRef(path).kind === 'uri';
  } catch {
    return false;
  }
}

/**
 * 判断是否是本地书籍
 */
export function isLocalBook(book: Book): boolean {
  // 本地书籍的origin通常是 "local" 或 "local::文件名"
  return book.origin === 'local' || book.origin.startsWith('local::');
}

export {
  defaultDeleteStoredFileForLocalBook,
  deleteStoredFileCheckboxHint,
  deleteStoredFileCheckboxLabel,
  describeDeleteLocalBookToast,
  isWebPrivateStoredLocalBook,
  isWebUserFolderStoredLocalBook,
  localBookStorageKind,
  removeLocalBookStoredFile,
  resolveWebLocalDeleteStorageKind,
} from '@/lib/local-book/stored-file';

/**
 * 获取本地书籍的章节列表
 */
export async function getLocalChapterList(
  book: Book,
  fileContent: string | ArrayBuffer
): Promise<BookChapter[]> {
  const result = await getLocalChapterListWithMetadata(book, fileContent);
  return result.chapters;
}

/**
 * 获取本地书籍的章节列表及从正文解析的元数据（书名、作者、简介、封面）
 * 用于导入时覆盖文件名解析结果
 */
export async function getLocalChapterListWithMetadata(
  book: Book,
  fileContent: string | ArrayBuffer
): Promise<{ chapters: BookChapter[]; title?: string; author?: string; intro?: string; coverUrl?: string; charset?: string }> {
  // 首先尝试通过文件名检测类型
  let fileType = detectFileType(book.originName);

  // 如果无法通过文件名检测，且文件内容是 ArrayBuffer，尝试通过内容检测
  if (!fileType && fileContent instanceof ArrayBuffer) {
    fileType = detectFileTypeByContent(fileContent);
  }

  switch (fileType) {
    case 'txt': {
      const result = await getTxtChapterList(book, fileContent, book.charset);
      if (result.tocRule && !book.tocUrl) book.tocUrl = result.tocRule;
      return {
        chapters: result.chapters,
        title: result.title,
        author: result.author,
        intro: result.intro,
        charset: result.charset,
      };
    }

    case 'epub': {
      if (!(fileContent instanceof ArrayBuffer)) {
        throw new Error('EPUB文件必须是ArrayBuffer格式');
      }
      const result = await getEpubChapterList(book, fileContent);
      return {
        chapters: result.chapters,
        title: result.metadata?.title,
        author: result.metadata?.creator,
        intro: result.metadata?.description,
        coverUrl: result.coverUrl,
      };
    }

    case 'umd':
    case 'pdf':
    case 'mobi':
      console.warn(`暂不支持 ${fileType} 格式`);
      return { chapters: [] };

    default:
      throw new Error(`不支持的文件格式: ${fileType}`);
  }
}

/**
 * 获取本地书籍的章节内容
 */
export async function getLocalContent(
  book: Book,
  chapter: BookChapter,
  fileContent: string | ArrayBuffer
): Promise<string | null> {
  let typeHint = book.originName;
  if (
    !typeHint ||
    /primary[%_]/i.test(typeHint) ||
    typeHint.includes('_2F')
  ) {
    const { displayFileNameFromBookUrl } = await import('@/lib/platform/fs/storage-ref');
    const decoded = displayFileNameFromBookUrl(book.bookUrl);
    if (decoded && detectFileType(decoded)) typeHint = decoded;
  }

  let fileType = detectFileType(typeHint);

  if (!fileType && fileContent instanceof ArrayBuffer) {
    fileType = detectFileTypeByContent(fileContent);
  }

  switch (fileType) {
    case 'txt':
      return await getTxtContent(book, chapter, fileContent, book.charset);

    case 'epub': {
      if (!(fileContent instanceof ArrayBuffer)) {
        throw new Error('EPUB文件必须是ArrayBuffer格式');
      }
      return await getEpubContent(book, chapter, fileContent);
    }

    case 'umd':
    case 'pdf':
    case 'mobi':
      console.warn(`暂不支持 ${fileType} 格式`);
      return null;

    default:
      throw new Error(`不支持的文件格式: ${fileType}`);
  }
}

/**
 * 清理书名用于显示（移除书名号等符号）
 * @param name 原始书名
 * @returns 清理后的书名
 */
export function cleanBookNameForDisplay(name: string): string {
  if (!name) return name;
  // 移除书名号《》，保留其他内容
  return name.replace(/[《》]/g, '').trim();
}

/**
 * 从文件名解析书名和作者
 * 对应 legado 的 analyzeNameAuthor
 */
export function parseNameAuthor(fileName: string): { name: string; author: string } {
  // 移除扩展名
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');

  // 常见模式
  const patterns = [
    // 《书名》作者：XXX
    /(.*?)《([^《》]+)》.*?作者[：:](.*)/,
    // 《书名》XXX
    /(.*?)《([^《》]+)》(.*)/,
    // 书名 作者：XXX
    /^(.+?)\s+作者[：:](.+)$/,
    // 书名 by XXX
    /^(.+?)\s+by\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      const name = match[2] || match[1] || '';
      const author = match[3] || match[2] || '';
      if (name) {
        return {
          name: name.trim(),
          author: author.trim(),
        };
      }
    }
  }

  // 如果没有匹配到模式，尝试从文件名中提取
  // 假设格式：书名-作者 或 书名_作者
  const separators = ['-', '_', ' '];
  for (const sep of separators) {
    const parts = nameWithoutExt.split(sep);
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const author = parts.slice(1).join(sep).trim();
      // 如果作者部分太长，可能不是作者
      if (author.length < nameWithoutExt.length * 0.5) {
        return { name, author };
      }
    }
  }

  // 默认：整个文件名作为书名
  return {
    name: nameWithoutExt.trim(),
    author: '',
  };
}

/**
 * 格式化书名（移除特殊字符）
 */
export function formatBookName(name: string): string {
  return name
    .replace(/[《》【】\[\]()（）]/g, '')
    .trim();
}

/**
 * 格式化作者名
 */
export function formatBookAuthor(author: string): string {
  return author
    .replace(/[作者：:Author:]/gi, '')
    .trim();
}

// 导出解析器
export { getTxtChapterList, getTxtContent } from '@/lib/local-book/txt-parser';
export { getEpubChapterList, getEpubContent } from '@/lib/local-book/epub-parser';

// 导出导入能力
export {
  importLocalBook,
  importLocalBookFromContent,
  pickLocalBookFile,
  readLocalBookContent,
  resolveAndroidOriginFileName,
} from '@/lib/local-book/import';
export type { ImportResult } from '@/lib/local-book/import';
