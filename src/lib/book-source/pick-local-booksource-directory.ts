/**
 * 选择目录并收集其中符合书源导入条件的文件
 */

import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { collectBookSourceFilesFromDirectory } from '@/lib/book-source/scan-booksource-directory';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

export interface PickedBookSourceDirectory {
  ref: StorageRef;
  files: File[];
}

export async function pickLocalBookSourceDirectory(): Promise<PickedBookSourceDirectory | null> {
  try {
    const picked = await pickDirectory();
    const files = await collectBookSourceFilesFromDirectory(picked.ref);
    return { ref: picked.ref, files };
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
