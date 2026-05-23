/**
 * 递归扫描目录中符合条件的文件（书源 / 本地书等共用）
 */

import { forEachDirectoryEntry } from '@/lib/platform/fs/dir-iterate';
import { getHandle } from '@/lib/platform/fs/handle-store';
import { getLegacyDirectory } from '@/lib/platform/fs/legacy-dir-store';
import { listDirectory } from '@/lib/platform/fs/read-write';
import { parseStorageRef, type StorageRef } from '@/lib/platform/fs/storage-ref';

export interface ScannedDirectoryFile {
  ref: StorageRef;
  fileName: string;
  /** webkitdirectory 降级：原始 File，无需再读 StorageRef */
  legacyFile?: File;
}

function entryToChildRef(parent: StorageRef, entryPath: string): StorageRef {
  if (
    entryPath.startsWith('handle:dir:') ||
    entryPath.startsWith('path:') ||
    entryPath.startsWith('opfs:') ||
    entryPath.startsWith('uri:') ||
    entryPath.startsWith('content://')
  ) {
    return parseStorageRef(entryPath);
  }
  if (parent.kind === 'path') {
    return { kind: 'path', value: entryPath };
  }
  if (parent.kind === 'saf-tree' || entryPath.startsWith('content://')) {
    return { kind: 'uri', value: entryPath };
  }
  if (parent.kind === 'opfs') {
    const base = parent.value.replace(/\/$/, '');
    return { kind: 'opfs', value: `${base}/${entryPath.split('/').pop() ?? entryPath}` };
  }
  return parseStorageRef(entryPath);
}

async function walkFsDirectoryHandle(
  dirId: string,
  handle: FileSystemDirectoryHandle,
  isEligible: (fileName: string) => boolean,
  relativePath = ''
): Promise<ScannedDirectoryFile[]> {
  const out: ScannedDirectoryFile[] = [];
  await forEachDirectoryEntry(handle, async (entry) => {
    if (entry.kind === 'directory') {
      const subPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const subHandle = await handle.getDirectoryHandle(entry.name);
      out.push(...(await walkFsDirectoryHandle(dirId, subHandle, isEligible, subPath)));
      return;
    }
    if (!isEligible(entry.name)) return;
    const rel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    out.push({
      ref: { kind: 'dir-handle', value: `${dirId}/${rel}` },
      fileName: entry.name,
    });
  });
  return out;
}

async function walkStorageDirectory(
  ref: StorageRef,
  isEligible: (fileName: string) => boolean
): Promise<ScannedDirectoryFile[]> {
  const entries = await listDirectory(ref);
  const out: ScannedDirectoryFile[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const childRef = entryToChildRef(ref, entry.path);
      out.push(...(await walkStorageDirectory(childRef, isEligible)));
      continue;
    }
    if (!isEligible(entry.name)) continue;
    const childRef = entryToChildRef(ref, entry.path);
    out.push({ ref: childRef, fileName: entry.name });
  }
  return out;
}

function collectLegacyDirectory(
  dirId: string,
  isEligible: (fileName: string) => boolean
): ScannedDirectoryFile[] {
  const dir = getLegacyDirectory(dirId);
  if (!dir) return [];
  return dir.files
    .filter((f) => isEligible(f.name))
    .map((f) => ({
      ref: { kind: 'dir-handle', value: dirId },
      fileName: f.name,
      legacyFile: f,
    }));
}

export async function collectEligibleFilesFromDirectory(
  rootRef: StorageRef,
  isEligible: (fileName: string) => boolean
): Promise<ScannedDirectoryFile[]> {
  if (rootRef.kind === 'dir-handle') {
    const dirId = rootRef.value.split('/')[0] ?? rootRef.value;
    const legacy = getLegacyDirectory(dirId);
    if (legacy) {
      return collectLegacyDirectory(dirId, isEligible);
    }
    const handle = await getHandle(dirId);
    if (handle?.kind === 'directory') {
      return walkFsDirectoryHandle(dirId, handle as FileSystemDirectoryHandle, isEligible);
    }
    return walkStorageDirectory(rootRef, isEligible);
  }

  return walkStorageDirectory(rootRef, isEligible);
}
