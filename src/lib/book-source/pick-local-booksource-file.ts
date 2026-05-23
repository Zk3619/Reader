/**
 * 打开文件选择器，选取本地书源 / Legado 备份文件（支持多选）
 */

import { pickFile, pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import {
  BOOK_SOURCE_FILE_PICKER_FILTERS,
  mimeForBookSourceFileName,
} from '@/lib/book-source/book-source-import-files';
import type { PickResult } from '@/lib/platform/fs/pick-types';

async function pickResultToFile(picked: PickResult): Promise<File> {
  if (picked.legacyFile) return picked.legacyFile;

  const bytes = picked.bytes ?? (await readBytes(picked.ref));
  if (!bytes.byteLength) {
    throw new Error('所选文件为空');
  }
  return new File([bytes], picked.fileName, {
    type: mimeForBookSourceFileName(picked.fileName),
  });
}

export async function pickLocalBookSourceFiles(): Promise<File[] | null> {
  try {
    const pickedList = await pickFiles({
      filters: BOOK_SOURCE_FILE_PICKER_FILTERS,
      multiple: true,
    });
    if (pickedList.length === 0) return null;
    return Promise.all(pickedList.map((p) => pickResultToFile(p)));
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}

/** 单文件选择（兼容旧调用） */
export async function pickLocalBookSourceFile(): Promise<File | null> {
  try {
    const picked = await pickFile({
      filters: BOOK_SOURCE_FILE_PICKER_FILTERS,
      multiple: false,
    });
    return pickResultToFile(picked);
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
