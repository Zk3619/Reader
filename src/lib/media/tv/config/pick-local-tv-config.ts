/**
 * 本地选择影视配置文件（json / txt）
 */

import { pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import type { PickResult } from '@/lib/platform/fs/pick-types';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

export const TV_CONFIG_IMPORT_EXTENSIONS = ['json', 'txt'] as const;

export const TV_CONFIG_FILE_PICKER_FILTERS = [
  { name: 'TV Config', extensions: ['json', 'txt'] },
  { name: 'All Files', extensions: ['*'] },
];

export function isTvConfigImportFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return TV_CONFIG_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

function mimeForName(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

async function pickResultToFile(picked: PickResult): Promise<File> {
  if (picked.legacyFile) return picked.legacyFile;
  const bytes = picked.bytes ?? (await readBytes(picked.ref));
  if (!bytes.byteLength) throw new Error('所选文件为空');
  return new File([bytes], picked.fileName, { type: mimeForName(picked.fileName) });
}

export async function pickLocalTvConfigFiles(): Promise<File[] | null> {
  try {
    const pickedList = await pickFiles({
      filters: TV_CONFIG_FILE_PICKER_FILTERS,
      multiple: true,
    });
    if (pickedList.length === 0) return null;
    return Promise.all(pickedList.map((p) => pickResultToFile(p)));
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}

export async function collectTvConfigFilesFromDirectory(
  rootRef: StorageRef,
): Promise<File[]> {
  const scanned = await collectEligibleFilesFromDirectory(rootRef, isTvConfigImportFileName);
  const out: File[] = [];
  for (const item of scanned) {
    if (item.legacyFile) {
      out.push(item.legacyFile);
      continue;
    }
    const bytes = await readBytes(item.ref);
    out.push(new File([bytes], item.fileName, { type: mimeForName(item.fileName) }));
  }
  return out;
}

export async function pickLocalTvConfigDirectory(): Promise<{
  ref: StorageRef;
  files: File[];
} | null> {
  try {
    const picked = await pickDirectory();
    const files = await collectTvConfigFilesFromDirectory(picked.ref);
    return { ref: picked.ref, files };
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
