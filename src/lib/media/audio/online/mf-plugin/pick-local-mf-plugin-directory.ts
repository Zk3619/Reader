/**
 * 选择目录并收集其中符合 MusicFree 插件导入条件的文件
 */

import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import { readBytes } from '@/lib/platform/fs/read-write';
import {
  isMfPluginImportFileName,
  mimeForMfPluginFileName,
} from '@/lib/media/audio/online/mf-plugin/mf-plugin-import-files';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

export interface PickedMfPluginDirectory {
  ref: StorageRef;
  files: File[];
}

export async function collectMfPluginFilesFromDirectory(
  rootRef: StorageRef,
): Promise<File[]> {
  const scanned = await collectEligibleFilesFromDirectory(
    rootRef,
    isMfPluginImportFileName,
  );
  const out: File[] = [];
  for (const item of scanned) {
    if (item.legacyFile) {
      out.push(item.legacyFile);
      continue;
    }
    const bytes = await readBytes(item.ref);
    out.push(
      new File([bytes], item.fileName, {
        type: mimeForMfPluginFileName(item.fileName),
      }),
    );
  }
  return out;
}

export async function pickLocalMfPluginDirectory(): Promise<PickedMfPluginDirectory | null> {
  try {
    const picked = await pickDirectory();
    const files = await collectMfPluginFilesFromDirectory(picked.ref);
    return { ref: picked.ref, files };
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
