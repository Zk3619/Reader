/**
 * 选择目录并收集其中符合自定义音源导入条件的文件
 */

import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import { readBytes } from '@/lib/platform/fs/read-write';
import {
  isUserApiImportFileName,
  mimeForUserApiFileName,
} from '@/lib/media/audio/online/user-api-import-files';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

export interface PickedUserApiDirectory {
  ref: StorageRef;
  files: File[];
}

export async function collectUserApiFilesFromDirectory(
  rootRef: StorageRef,
): Promise<File[]> {
  const scanned = await collectEligibleFilesFromDirectory(rootRef, isUserApiImportFileName);
  const out: File[] = [];
  for (const item of scanned) {
    if (item.legacyFile) {
      out.push(item.legacyFile);
      continue;
    }
    const bytes = await readBytes(item.ref);
    out.push(
      new File([bytes], item.fileName, {
        type: mimeForUserApiFileName(item.fileName),
      }),
    );
  }
  return out;
}

export async function pickLocalUserApiDirectory(): Promise<PickedUserApiDirectory | null> {
  try {
    const picked = await pickDirectory();
    const files = await collectUserApiFilesFromDirectory(picked.ref);
    return { ref: picked.ref, files };
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
