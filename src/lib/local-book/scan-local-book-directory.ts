/**
 * 扫描目录内可导入的本地书籍（txt / epub）
 */

import { isTauri } from '@/lib/platform/detect';
import { isLocalBookImportFileName } from '@/lib/local-book/local-book-import-files';
import type { LocalBookPickResult } from '@/lib/local-book/import';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import { readBytes, writeBytes } from '@/lib/platform/fs/read-write';
import { formatStorageRef, type StorageRef } from '@/lib/platform/fs/storage-ref';

async function toPickResult(
  ref: StorageRef,
  fileName: string,
  legacyFile?: File
): Promise<LocalBookPickResult> {
  if (legacyFile) {
    const bytes = await legacyFile.arrayBuffer();
    const id = crypto.randomUUID();
    await writeBytes({ kind: 'virtual', value: id }, bytes);
    return {
      bookUrl: formatStorageRef({ kind: 'virtual', value: id }),
      fileName,
      content: bytes,
    };
  }

  const needEagerRead =
    !isTauri() ||
    ref.kind === 'virtual' ||
    ref.kind === 'handle' ||
    ref.kind === 'dir-handle';

  if (needEagerRead) {
    const content = await readBytes(ref);
    return {
      bookUrl: formatStorageRef(ref),
      fileName,
      content,
    };
  }

  return {
    bookUrl: formatStorageRef(ref),
    fileName,
    content: undefined,
  };
}

export async function collectLocalBooksFromDirectory(
  rootRef: StorageRef
): Promise<LocalBookPickResult[]> {
  const scanned = await collectEligibleFilesFromDirectory(rootRef, isLocalBookImportFileName);
  const out: LocalBookPickResult[] = [];
  for (const item of scanned) {
    out.push(await toPickResult(item.ref, item.fileName, item.legacyFile));
  }
  return out;
}
