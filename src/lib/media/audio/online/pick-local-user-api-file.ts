/**
 * 打开文件选择器，选取本地自定义音源脚本（支持多选）
 */

import { pickFile, pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import {
  USER_API_FILE_PICKER_FILTERS,
  mimeForUserApiFileName,
} from '@/lib/media/audio/online/user-api-import-files';
import type { PickResult } from '@/lib/platform/fs/pick-types';

async function pickResultToFile(picked: PickResult): Promise<File> {
  if (picked.legacyFile) return picked.legacyFile;

  const bytes = picked.bytes ?? (await readBytes(picked.ref));
  if (!bytes.byteLength) {
    throw new Error('所选文件为空');
  }
  return new File([bytes], picked.fileName, {
    type: mimeForUserApiFileName(picked.fileName),
  });
}

export async function pickLocalUserApiFiles(): Promise<File[] | null> {
  try {
    const pickedList = await pickFiles({
      filters: USER_API_FILE_PICKER_FILTERS,
      multiple: true,
    });
    if (pickedList.length === 0) return null;
    return Promise.all(pickedList.map((p) => pickResultToFile(p)));
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}

export async function pickLocalUserApiFile(): Promise<File | null> {
  try {
    const picked = await pickFile({
      filters: USER_API_FILE_PICKER_FILTERS,
      multiple: false,
    });
    return pickResultToFile(picked);
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
