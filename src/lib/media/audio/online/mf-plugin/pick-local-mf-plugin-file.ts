/**
 * 打开文件选择器，选取本地 MusicFree 插件（.js / .json，支持多选）
 */

import { pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import {
  MF_PLUGIN_FILE_PICKER_FILTERS,
  mimeForMfPluginFileName,
} from '@/lib/media/audio/online/mf-plugin/mf-plugin-import-files';
import type { PickResult } from '@/lib/platform/fs/pick-types';

async function pickResultToFile(picked: PickResult): Promise<File> {
  if (picked.legacyFile) return picked.legacyFile;
  const bytes = picked.bytes ?? (await readBytes(picked.ref));
  if (!bytes.byteLength) {
    throw new Error('所选文件为空');
  }
  return new File([bytes], picked.fileName, {
    type: mimeForMfPluginFileName(picked.fileName),
  });
}

export async function pickLocalMfPluginFiles(): Promise<File[] | null> {
  try {
    const pickedList = await pickFiles({
      filters: MF_PLUGIN_FILE_PICKER_FILTERS,
      multiple: true,
    });
    if (pickedList.length === 0) return null;
    return Promise.all(pickedList.map((p) => pickResultToFile(p)));
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
