/**
 * 扫描目录内符合书源导入条件的文件（递归）
 */

import { isBookSourceImportFileName, mimeForBookSourceFileName } from '@/lib/book-source/book-source-import-files';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import { readBytes } from '@/lib/platform/fs/read-write';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

/** 从已选目录收集全部可导入书源文件 */
export async function collectBookSourceFilesFromDirectory(
  rootRef: StorageRef
): Promise<File[]> {
  const scanned = await collectEligibleFilesFromDirectory(rootRef, isBookSourceImportFileName);
  const out: File[] = [];
  for (const item of scanned) {
    if (item.legacyFile) {
      out.push(item.legacyFile);
      continue;
    }
    const bytes = await readBytes(item.ref);
    out.push(new File([bytes], item.fileName, { type: mimeForBookSourceFileName(item.fileName) }));
  }
  return out;
}
