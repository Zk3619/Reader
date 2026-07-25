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

export type CollectDirectoryOptions = {
  /** 跳过子目录；默认跳过点目录与 node_modules */
  skipDirectory?: (name: string) => boolean;
  /** 0=仅根目录文件；未设置则无限递归 */
  maxDepth?: number;
};

const DEFAULT_SKIP_DIR = (name: string) => {
  const n = name.trim();
  if (!n || n === '.' || n === '..') return true;
  if (n.startsWith('.')) return true;
  const lower = n.toLowerCase();
  return lower === 'node_modules' || lower === '__macosx';
};

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
  opts: { skipDirectory: (name: string) => boolean; maxDepth?: number },
  relativePath = '',
  depth = 0,
): Promise<ScannedDirectoryFile[]> {
  const out: ScannedDirectoryFile[] = [];
  await forEachDirectoryEntry(handle, async (entry) => {
    if (entry.kind === 'directory') {
      if (opts.skipDirectory(entry.name)) return;
      if (opts.maxDepth != null && depth >= opts.maxDepth) return;
      const subPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const subHandle = await handle.getDirectoryHandle(entry.name);
      out.push(
        ...(await walkFsDirectoryHandle(
          dirId,
          subHandle,
          isEligible,
          opts,
          subPath,
          depth + 1,
        )),
      );
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
  isEligible: (fileName: string) => boolean,
  opts: { skipDirectory: (name: string) => boolean; maxDepth?: number },
  depth = 0,
): Promise<ScannedDirectoryFile[]> {
  const entries = await listDirectory(ref);
  const out: ScannedDirectoryFile[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      if (opts.skipDirectory(entry.name)) continue;
      if (opts.maxDepth != null && depth >= opts.maxDepth) continue;
      const childRef = entryToChildRef(ref, entry.path);
      out.push(...(await walkStorageDirectory(childRef, isEligible, opts, depth + 1)));
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
  isEligible: (fileName: string) => boolean,
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
  isEligible: (fileName: string) => boolean,
  options?: CollectDirectoryOptions,
): Promise<ScannedDirectoryFile[]> {
  const opts = {
    skipDirectory: options?.skipDirectory ?? DEFAULT_SKIP_DIR,
    maxDepth: options?.maxDepth,
  };

  if (rootRef.kind === 'dir-handle') {
    const dirId = rootRef.value.split('/')[0] ?? rootRef.value;
    const legacy = getLegacyDirectory(dirId);
    if (legacy) {
      return collectLegacyDirectory(dirId, isEligible);
    }
    const handle = await getHandle(dirId);
    if (handle?.kind === 'directory') {
      return walkFsDirectoryHandle(
        dirId,
        handle as FileSystemDirectoryHandle,
        isEligible,
        opts,
      );
    }
    return walkStorageDirectory(rootRef, isEligible, opts);
  }

  return walkStorageDirectory(rootRef, isEligible, opts);
}
