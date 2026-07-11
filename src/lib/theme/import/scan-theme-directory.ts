/**
 * 扫描目录内符合主题导入条件的文件（递归）
 */

import { isThemeImportFileName, mimeForThemeFileName } from '@/lib/theme/import/theme-import-files';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import { readBytes } from '@/lib/platform/fs/read-write';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

/** 从已选目录收集全部可导入主题文件 */
export async function collectThemeFilesFromDirectory(rootRef: StorageRef): Promise<File[]> {
  const scanned = await collectEligibleFilesFromDirectory(rootRef, isThemeImportFileName);
  const out: File[] = [];
  for (const item of scanned) {
    if (item.legacyFile) {
      out.push(item.legacyFile);
      continue;
    }
    const bytes = await readBytes(item.ref);
    out.push(new File([bytes], item.fileName, { type: mimeForThemeFileName(item.fileName) }));
  }
  return out;
}
