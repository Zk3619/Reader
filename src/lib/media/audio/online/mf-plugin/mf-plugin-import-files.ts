/**
 * MusicFree 插件本地导入：扩展名与文件识别
 */

export const MF_PLUGIN_IMPORT_EXTENSIONS = ['js', 'json'] as const;

export const MF_PLUGIN_FILE_PICKER_FILTERS = [
  { name: 'MusicFree Plugin', extensions: ['js'] },
  { name: 'MusicFree Subscribe JSON', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
];

export function isMfPluginImportFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return MF_PLUGIN_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function mimeForMfPluginFileName(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}
