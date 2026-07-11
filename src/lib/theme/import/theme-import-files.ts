/**
 * 主题包本地导入：扩展名与 MIME
 */

export const THEME_IMPORT_EXTENSIONS = ['json', 'zip'] as const;

export function isThemeImportFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.reader-theme.json') || lower.endsWith('.reader-theme.zip')) {
    return true;
  }
  return THEME_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function mimeForThemeFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip') || lower.endsWith('.reader-theme.zip')) {
    return 'application/zip';
  }
  return 'application/json';
}

export const THEME_FILE_PICKER_FILTERS = [
  { name: '主题包', extensions: [...THEME_IMPORT_EXTENSIONS] },
  { name: 'JSON', extensions: ['json'] },
  { name: 'ZIP', extensions: ['zip'] },
];
