/**
 * 本地书籍导入：扩展名
 */

export const LOCAL_BOOK_IMPORT_EXTENSIONS = ['txt', 'epub'] as const;

export function isLocalBookImportFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return LOCAL_BOOK_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export const LOCAL_BOOK_FILE_PICKER_FILTERS = [
  { name: '支持的类型', extensions: [...LOCAL_BOOK_IMPORT_EXTENSIONS] },
  { name: 'TXT', extensions: ['txt'] },
  { name: 'EPUB', extensions: ['epub'] },
];
