import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isDesktopTauri, mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { isTauri } from '@/lib/platform/detect';
import { splitDirHandleRefValue } from '@/lib/platform/fs/dir-handle-file';
import { removeHandle } from '@/lib/platform/fs/handle-store';
import { formatStorageRef, parseStorageRef, type StorageRef } from '@/lib/platform/fs/storage-ref';
import { readBytes, writeBytes } from '@/lib/platform/fs/read-write';
import { settingsStore } from '@/stores/settings';
import type { PickResult } from '@/lib/platform/fs/pick-types';

const OPFS_BOOKS_DIR = 'books';

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

/** 应用托管书籍目录（path: 或 opfs:books） */
export async function getManagedBooksRoot(): Promise<StorageRef> {
  const stored = settingsStore.state.app.booksStorageRoot;
  if (stored) {
    return coerceBooksRootForPlatform(parseStorageRef(stored));
  }
  const legacy = settingsStore.state.app.booksDirectory?.trim();
  if (legacy) {
    return coerceBooksRootForPlatform(parseStorageRef(legacy));
  }
  if (isTauri()) {
    const appDir = await getAppDataDir();
    const booksPath = await join(appDir, 'Books');
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
  return Boolean(
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
    booksStorageRoot: formatted,
    booksDirectory: ref.kind === 'path' ? ref.value : undefined,
    booksDirectorySet: true,
  });
}

export async function applyDefaultBooksStorageRoot(): Promise<StorageRef> {
  const root = await ensureManagedBooksRoot();
  await setBooksStorageRoot(root);
  return root;
}

export function sanitizeManagedFileName(name: string): string {
  // 勿替换 %：SAF documentId 常含 %3A/%2F，误替换会导致 primary_3ADownload_2F_… 乱码名
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
    const appDir = await getAppDataDir();
    return join(appDir, 'Books');
  }
  return 'Books';
}
