import { join } from '@tauri-apps/api/path';
import { isDesktopTauri, mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { isTauri } from '@/lib/platform/detect';
import { splitDirHandleRefValue } from '@/lib/platform/fs/dir-handle-file';
import { removeHandle } from '@/lib/platform/fs/handle-store';
import { formatStorageRef, parseStorageRef, type StorageRef } from '@/lib/platform/fs/storage-ref';
import { readBytes, writeBytes } from '@/lib/platform/fs/read-write';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';
import {
  LEGACY_BOOKS_SUBDIR,
  LOCAL_LIBRARY_SUBDIR,
} from '@/lib/platform/fs/managed-local-library';
import { settingsStore } from '@/stores/settings';
import type { PickResult } from '@/lib/platform/fs/pick-types';

const OPFS_BOOKS_DIR = 'books';
const BOOKS_SUBDIR = LOCAL_LIBRARY_SUBDIR;

function defaultWebBooksRoot(): StorageRef {
  return { kind: 'opfs', value: OPFS_BOOKS_DIR };
}

/** Web 无法访问 path:/uri:，统一回退到 OPFS 书籍库 */
function coerceBooksRootForPlatform(ref: StorageRef): StorageRef {
  if (isTauri()) return ref;
  if (ref.kind === 'opfs' || ref.kind === 'dir-handle' || ref.kind === 'saf-tree') {
    return ref;
  }
  return defaultWebBooksRoot();
}

async function getOpfsBooksRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_BOOKS_DIR, { create: true });
}

function booksFollowGlobalMediaRoot(): boolean {
  return settingsStore.state.app.booksUseGlobalMediaRoot !== false;
}

/** 旧 Books → Local：跟随时一次性迁入新默认子目录 */
async function migrateLegacyBooksSubdir(readerRoot: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { exists, mkdir, readDir, readFile, remove, rename, writeFile, stat } =
      await import('@tauri-apps/plugin-fs');
    const localPath = await join(readerRoot, BOOKS_SUBDIR);
    const legacyPath = await join(readerRoot, LEGACY_BOOKS_SUBDIR);
    if (!(await exists(legacyPath))) return;

    if (!(await exists(localPath))) {
      try {
        await rename(legacyPath, localPath);
        return;
      } catch {
        /* 跨卷等失败时改为复制 */
      }
    }

    await mkdir(localPath, { recursive: true });

    const copyTree = async (srcDir: string, dstDir: string): Promise<void> => {
      await mkdir(dstDir, { recursive: true });
      const entries = await readDir(srcDir);
      for (const entry of entries) {
        if (!entry?.name) continue;
        const src = await join(srcDir, entry.name);
        const dst = await join(dstDir, entry.name);
        const info = await stat(src);
        if (info.isDirectory) {
          await copyTree(src, dst);
          continue;
        }
        if (!(await exists(dst))) {
          const bytes = await readFile(src);
          await writeFile(dst, bytes);
        }
      }
    };

    await copyTree(legacyPath, localPath);
    try {
      await remove(legacyPath, { recursive: true });
    } catch {
      /* 占用时保留旧目录 */
    }
  } catch (e) {
    console.warn('[managed-storage] Books→Local 迁移失败', e);
  }
}

async function defaultTauriBooksPath(): Promise<string> {
  const readerRoot = await resolveModuleMediaRoot('reading');
  await migrateLegacyBooksSubdir(readerRoot);
  return join(readerRoot, BOOKS_SUBDIR);
}

/** 应用托管书籍目录（path: 或 opfs:books） */
export async function getManagedBooksRoot(): Promise<StorageRef> {
  const app = settingsStore.state.app;

  if (!booksFollowGlobalMediaRoot()) {
    const custom = app.booksMediaRootDirectory?.trim();
    if (custom) {
      return coerceBooksRootForPlatform({ kind: 'path', value: custom });
    }
    const stored = app.booksStorageRoot?.trim();
    if (stored) {
      return coerceBooksRootForPlatform(parseStorageRef(stored));
    }
    const legacy = app.booksDirectory?.trim();
    if (legacy) {
      return coerceBooksRootForPlatform(parseStorageRef(legacy));
    }
  }

  if (isTauri()) {
    const booksPath = await defaultTauriBooksPath();
    return { kind: 'path', value: booksPath };
  }
  return defaultWebBooksRoot();
}

export async function ensureManagedBooksRoot(): Promise<StorageRef> {
  const root = await getManagedBooksRoot();
  if (root.kind === 'path' && isTauri()) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    try {
      await mkdir(root.value, { recursive: true });
    } catch {
      /* 已存在 */
    }
  }
  if (root.kind === 'opfs') {
    await getOpfsBooksRoot();
  }
  return root;
}

export function hasBooksStorageRoot(): boolean {
  const app = settingsStore.state.app;
  if (booksFollowGlobalMediaRoot()) return false;
  return Boolean(
    app.booksMediaRootDirectory?.trim() ||
      app.booksStorageRoot?.trim() ||
      app.booksDirectorySet ||
      app.booksDirectory?.trim(),
  );
}

/** Web：更换书籍库根目录时释放旧的 handle:dir 目录句柄 */
async function releasePreviousWebBooksDirHandle(previousRoot?: string): Promise<void> {
  if (isTauri() || !previousRoot?.trim()) return;
  const ref = parseStorageRef(previousRoot.trim());
  if (ref.kind !== 'dir-handle') return;
  const { dirId } = splitDirHandleRefValue(ref.value);
  if (!dirId) return;
  try {
    await removeHandle(dirId);
  } catch (e) {
    console.warn('[managed-storage] 释放旧书籍目录句柄失败', e);
  }
}

export async function setBooksStorageRoot(ref: StorageRef): Promise<void> {
  const previous = settingsStore.state.app.booksStorageRoot?.trim();
  const formatted = formatStorageRef(ref);
  if (previous && previous !== formatted) {
    await releasePreviousWebBooksDirHandle(previous);
  }
  await settingsStore.updateAppSettings({
    booksUseGlobalMediaRoot: false,
    booksMediaRootDirectory: ref.kind === 'path' ? ref.value : undefined,
    booksStorageRoot: formatted,
    booksDirectory: ref.kind === 'path' ? ref.value : undefined,
    booksDirectorySet: true,
  });
}

export async function applyDefaultBooksStorageRoot(): Promise<StorageRef> {
  await settingsStore.updateAppSettings({
    booksUseGlobalMediaRoot: true,
    booksMediaRootDirectory: undefined,
    booksStorageRoot: undefined,
    booksDirectory: undefined,
    booksDirectorySet: false,
  });
  return ensureManagedBooksRoot();
}

export function sanitizeManagedFileName(name: string): string {
  return name.replace(/[/\\?*:|"<>]/g, '_') || 'book.dat';
}

/** Web 端用户通过 File System Access API 指定的书籍库根目录 */
export async function usesDirectoryHandleBooksRoot(): Promise<boolean> {
  if (isTauri()) return false;
  const root = await getManagedBooksRoot();
  return root.kind === 'dir-handle';
}

export async function usesSafTreeBooksRoot(): Promise<boolean> {
  if (!mayUseAndroidFsLayer()) return false;
  const root = await getManagedBooksRoot();
  return root.kind === 'saf-tree';
}

/** 将选取结果物化到托管库，返回稳定 StorageRef 作为 bookUrl */
export async function materializeToManaged(
  pick: PickResult,
  options?: { fileName?: string },
): Promise<StorageRef> {
  const fileName = sanitizeManagedFileName(options?.fileName ?? pick.fileName);
  const root = await ensureManagedBooksRoot();
  let bytes = pick.bytes;

  if (!bytes) {
    bytes = await readBytes(pick.ref);
  }

  if (root.kind === 'path' && isTauri()) {
    const targetPath = await join(root.value, fileName);
    await writeBytes({ kind: 'path', value: targetPath }, bytes);
    return { kind: 'path', value: targetPath };
  }

  if (root.kind === 'dir-handle') {
    const relativePath = `${root.value}/${fileName}`;
    await writeBytes({ kind: 'dir-handle', value: relativePath }, bytes);
    return { kind: 'dir-handle', value: relativePath };
  }

  const opfsPath = `${OPFS_BOOKS_DIR}/${crypto.randomUUID()}_${fileName}`;
  await writeBytes({ kind: 'opfs', value: opfsPath }, bytes);
  return { kind: 'opfs', value: opfsPath };
}

export async function resolveBooksDirectoryPath(): Promise<string> {
  const root = await getManagedBooksRoot();
  if (root.kind === 'path') return root.value;
  if (isDesktopTauri()) {
    return defaultTauriBooksPath();
  }
  return LOCAL_LIBRARY_SUBDIR;
}

export async function resolveDefaultBooksDirectoryPath(): Promise<string> {
  if (isTauri()) return defaultTauriBooksPath();
  return LOCAL_LIBRARY_SUBDIR;
}
