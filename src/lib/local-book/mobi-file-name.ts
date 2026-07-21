/** MOBI 源文件名 → 导入用 EPUB 文件名 */

export function mobiSourceToEpubFileName(fileName: string): string {
  const base = fileName.replace(/\.(mobi|azw3?)$/i, '') || 'book';
  return `${base}.epub`;
}
