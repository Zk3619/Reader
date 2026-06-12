/**
 * 导出时是否应用替换净化（对齐 Legado AppConfig.exportUseReplace，默认 true）
 */

const STORAGE_KEY = 'reader_export_use_replace';

export function getExportUseReplace(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return true;
}

export function setExportUseReplace(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }
}

/** 导出 TXT 是否省略章节名（对齐 Legado AppConfig.exportNoChapterName，默认 false） */
export function getExportNoChapterName(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('reader_export_no_chapter_name') === 'true';
}

export function setExportNoChapterName(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('reader_export_no_chapter_name', String(enabled));
  }
}

/** 导出正文是否走替换规则 */
export function isExportReplaceEnabledForBook(
  bookUseReplace: boolean,
): boolean {
  return getExportUseReplace() && bookUseReplace;
}
