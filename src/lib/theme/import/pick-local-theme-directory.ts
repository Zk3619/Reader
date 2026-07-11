/**
 * 选择目录并收集其中符合主题导入条件的文件
 */

import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { collectThemeFilesFromDirectory } from '@/lib/theme/import/scan-theme-directory';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

export interface PickedThemeDirectory {
  ref: StorageRef;
  files: File[];
}

export async function pickLocalThemeDirectory(): Promise<PickedThemeDirectory | null> {
  try {
    const picked = await pickDirectory();
    const files = await collectThemeFilesFromDirectory(picked.ref);
    return { ref: picked.ref, files };
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
