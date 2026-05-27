/**
 * 章节缓存目录名（对齐 Legado book.getFolderName 思路：短前缀 + URL 摘要）
 */

export function bookCacheFolderKey(bookUrl: string, bookName?: string): string {
  const prefix = (bookName ?? '')
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 9);
  let hash = 0;
  for (let i = 0; i < bookUrl.length; i++) {
    hash = (hash * 31 + bookUrl.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 16);
  return `${prefix || 'book'}_${hex}`;
}
