/**
 * 常见视频扩展名判断（收藏入库 / 扫盘 / WebDAV 共用）
 */

const VIDEO_EXT = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'm4v',
  'ts',
  'm2ts',
  'mpg',
  'mpeg',
  'm3u8',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function isVideoFileName(name: string): boolean {
  return VIDEO_EXT.has(extOf(name));
}

export const VIDEO_FILE_EXTENSIONS = [...VIDEO_EXT];
