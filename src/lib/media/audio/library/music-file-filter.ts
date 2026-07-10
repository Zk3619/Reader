/** 支持的本地音频扩展名 */

export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.ogg',
  '.oga',
  '.wav',
  '.m4a',
  '.aac',
  '.opus',
  '.wma',
]);

export function isMusicFileName(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return AUDIO_EXTENSIONS.has(lower.slice(dot));
}

export function extFromFileName(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot + 1) : '';
}
