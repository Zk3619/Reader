/**
 * 本地书籍导入：扩展名
 */

/** mobi/azw3 已列入选择器，导入时自动尝试转为 EPUB；umd 未列入，仍完全不支持 */
export const LOCAL_BOOK_IMPORT_EXTENSIONS = ['txt', 'epub', 'pdf', 'mobi', 'azw3'] as const;

export function isLocalBookImportFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return LOCAL_BOOK_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export const LOCAL_BOOK_FILE_PICKER_FILTERS = [
  { name: '支持的类型', extensions: [...LOCAL_BOOK_IMPORT_EXTENSIONS] },
  { name: 'TXT', extensions: ['txt'] },
  { name: 'EPUB', extensions: ['epub'] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'MOBI', extensions: ['mobi', 'azw3'] },
];
