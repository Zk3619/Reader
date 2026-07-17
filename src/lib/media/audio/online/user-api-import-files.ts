/**
 * 自定义音源本地导入：扩展名与文件识别
 */

export const USER_API_IMPORT_EXTENSIONS = ['js', 'txt'] as const;

export const USER_API_FILE_PICKER_FILTERS = [
  { name: 'LX API File', extensions: ['js'] },
  { name: 'Text', extensions: ['txt'] },
  { name: 'All Files', extensions: ['*'] },
];

export function isUserApiImportFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return USER_API_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function mimeForUserApiFileName(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}
