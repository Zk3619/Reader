/**
 * PDF 本地书籍：最小实现（P1）
 * 目录仅一章「全文」；正文不走文本管线渲染，由 PdfViewerPage 直接读取原始文件展示
 */

import type { Book, BookChapter } from '@/types';

/** PDF 本地书唯一章节标题 */
export const PDF_FULL_CHAPTER_TITLE = '全文';

/** getPdfContent 返回的占位标记：仅表示「该章已就绪」，阅读器不使用此字符串渲染 */
export const PDF_CONTENT_MARKER = '__PDF_LOCAL_CONTENT__';

export interface PdfChapterListResult {
  chapters: BookChapter[];
}

/**
 * PDF 目录：固定单章「全文」
 */
export async function getPdfChapterList(book: Book): Promise<PdfChapterListResult> {
  const chapter: BookChapter = {
    url: book.bookUrl,
    title: PDF_FULL_CHAPTER_TITLE,
    isVolume: false,
    baseUrl: book.bookUrl,
    bookUrl: book.bookUrl,
    index: 0,
    isVip: false,
    isPay: false,
  };
  return { chapters: [chapter] };
}

/**
 * PDF 正文：返回占位标记，实际渲染由 PdfViewerPage 通过 readLocalBookContent 直接读原始文件
 */
export async function getPdfContent(
  _book: Book,
  _chapter: BookChapter,
  _fileContent: string | ArrayBuffer,
): Promise<string | null> {
  return PDF_CONTENT_MARKER;
}
