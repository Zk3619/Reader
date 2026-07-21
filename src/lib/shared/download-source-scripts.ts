/**
 * 下载源脚本文本或批量 ZIP 导出
 */

import { strToU8, zipSync } from 'fflate';

export function sanitizeExportFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'source';
}

export function downloadTextFile(
  content: string,
  fileName: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFilesZip(
  files: Array<{ name: string; content: string }>,
  zipName: string,
): void {
  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const file of files) {
    let name = file.name;
    let i = 2;
    while (used.has(name)) {
      const dot = file.name.lastIndexOf('.');
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      const ext = dot > 0 ? file.name.slice(dot) : '';
      name = `${base}_${i}${ext}`;
      i += 1;
    }
    used.add(name);
    entries[name] = strToU8(file.content);
  }
  const zipped = zipSync(entries);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = zipName;
  anchor.click();
  URL.revokeObjectURL(url);
}
