/**
 * 书源 / Legado 备份本地导入：扩展名与 MIME
 */

export const BOOK_SOURCE_IMPORT_EXTENSIONS = [
  'json',
  'txt',
  'zip',
  'db',
  'sqlite',
  'sqlite3',
] as const;

export function isBookSourceImportFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return BOOK_SOURCE_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function mimeForBookSourceFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (
    lower.endsWith('.db') ||
    lower.endsWith('.sqlite') ||
    lower.endsWith('.sqlite3')
  ) {
    return 'application/octet-stream';
  }
  return 'text/plain';
}

export const BOOK_SOURCE_FILE_PICKER_FILTERS = [
  { name: '书源与备份', extensions: [...BOOK_SOURCE_IMPORT_EXTENSIONS] },
  { name: 'JSON', extensions: ['json'] },
  { name: 'ZIP 备份', extensions: ['zip'] },
  { name: '数据库备份', extensions: ['db', 'sqlite', 'sqlite3'] },
];
