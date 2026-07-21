/**
 * 模块本地媒体库目录：MediaRoot/<Module>/Local（可自定义）
 * 对齐书籍库 managed-storage：path / opfs / dir-handle / saf-tree
 */

import { join } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { splitDirHandleRefValue } from '@/lib/platform/fs/dir-handle-file';
import { removeHandle } from '@/lib/platform/fs/handle-store';
import {
  formatStorageRef,
  parseStorageRef,
  type StorageRef,
} from '@/lib/platform/fs/storage-ref';
import { resolveModuleMediaRoot, type MediaModuleKey } from '@/lib/media/media-root';
import { settingsStore } from '@/stores/settings';

export const LOCAL_LIBRARY_SUBDIR = 'Local';

/** 旧版阅读书籍库子目录名（迁移用） */
export const LEGACY_BOOKS_SUBDIR = 'Books';

export type LocalLibraryModule = Extract<MediaModuleKey, 'music' | 'video'>;

const OPFS_DIRS: Record<LocalLibraryModule, string> = {
  music: 'audio-local',
  video: 'video-local',
};

function normalizePath(input: string | undefined): string {
  return input?.trim() ?? '';
}

function followsModuleLocal(moduleKey: LocalLibraryModule): boolean {
  const app = settingsStore.state.app;
  if (moduleKey === 'music') return app.audioLocalUseGlobalMediaRoot !== false;
  return app.videoLocalUseGlobalMediaRoot !== false;
}

function customLocalPath(moduleKey: LocalLibraryModule): string {
  const app = settingsStore.state.app;
  if (moduleKey === 'music') return normalizePath(app.audioLocalMediaRootDirectory);
  return normalizePath(app.videoLocalMediaRootDirectory);
}

function storedLocalRoot(moduleKey: LocalLibraryModule): string {
  const app = settingsStore.state.app;
  if (moduleKey === 'music') return normalizePath(app.audioLocalStorageRoot);
  return normalizePath(app.videoLocalStorageRoot);
}

function defaultWebLocalRoot(moduleKey: LocalLibraryModule): StorageRef {
  return { kind: 'opfs', value: OPFS_DIRS[moduleKey] };
}

function coerceForModule(moduleKey: LocalLibraryModule, ref: StorageRef): StorageRef {
  if (isTauri()) return ref;
  if (ref.kind === 'opfs' || ref.kind === 'dir-handle' || ref.kind === 'saf-tree') {
    return ref;
  }
  return defaultWebLocalRoot(moduleKey);
}

export function getOpfsLocalDirName(moduleKey: LocalLibraryModule): string {
  return OPFS_DIRS[moduleKey];
}

export async function resolveDefaultLocalLibraryPath(
  moduleKey: LocalLibraryModule,
): Promise<string> {
  if (!isTauri()) {
    return `${moduleKey === 'music' ? 'Audio' : 'Video'}/${LOCAL_LIBRARY_SUBDIR}`;
  }
  const moduleRoot = await resolveModuleMediaRoot(moduleKey);
  return join(moduleRoot, LOCAL_LIBRARY_SUBDIR);
}

async function defaultTauriLocalPath(moduleKey: LocalLibraryModule): Promise<string> {
  return resolveDefaultLocalLibraryPath(moduleKey);
}

/** 应用托管本地库根（path: / opfs: / dir-handle: / saf-tree:） */
export async function getManagedLocalLibraryRoot(
  moduleKey: LocalLibraryModule,
): Promise<StorageRef> {
  if (!followsModuleLocal(moduleKey)) {
    const custom = customLocalPath(moduleKey);
    if (custom) {
      return coerceForModule(moduleKey, { kind: 'path', value: custom });
    }
    const stored = storedLocalRoot(moduleKey);
    if (stored) {
      return coerceForModule(moduleKey, parseStorageRef(stored));
    }
  }

  if (isTauri()) {
    const path = await defaultTauriLocalPath(moduleKey);
    return { kind: 'path', value: path };
  }
  return defaultWebLocalRoot(moduleKey);
}

export async function ensureManagedLocalLibraryRoot(
  moduleKey: LocalLibraryModule,
): Promise<StorageRef> {
  const root = await getManagedLocalLibraryRoot(moduleKey);
  if (root.kind === 'path' && isTauri()) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    try {
      await mkdir(root.value, { recursive: true });
    } catch {
      /* 已存在 */
    }
  }
  if (root.kind === 'opfs') {
    const rootHandle = await navigator.storage.getDirectory();
    await rootHandle.getDirectoryHandle(root.value, { create: true });
  }
  return root;
}

/** @deprecated 使用 getManagedLocalLibraryRoot；保留 path 字符串兼容 */
export async function resolveLocalLibraryPath(moduleKey: LocalLibraryModule): Promise<string> {
  const root = await getManagedLocalLibraryRoot(moduleKey);
  if (root.kind === 'path') return root.value;
  return formatStorageRef(root);
}

export async function ensureLocalLibraryDirectory(moduleKey: LocalLibraryModule): Promise<string> {
  const root = await ensureManagedLocalLibraryRoot(moduleKey);
  if (root.kind === 'path') return root.value;
  return formatStorageRef(root);
}

export function hasCustomLocalLibraryPath(moduleKey: LocalLibraryModule): boolean {
  if (followsModuleLocal(moduleKey)) return false;
  return Boolean(customLocalPath(moduleKey) || storedLocalRoot(moduleKey));
}

export async function usesDirectoryHandleLocalRoot(
  moduleKey: LocalLibraryModule,
): Promise<boolean> {
  if (isTauri()) return false;
  const root = await getManagedLocalLibraryRoot(moduleKey);
  return root.kind === 'dir-handle';
}

export async function usesSafTreeLocalRoot(moduleKey: LocalLibraryModule): Promise<boolean> {
  if (!mayUseAndroidFsLayer()) return false;
  const root = await getManagedLocalLibraryRoot(moduleKey);
  return root.kind === 'saf-tree';
}

async function releasePreviousWebDirHandle(previousRoot?: string): Promise<void> {
  if (isTauri() || !previousRoot?.trim()) return;
  const ref = parseStorageRef(previousRoot.trim());
  if (ref.kind !== 'dir-handle') return;
  const { dirId } = splitDirHandleRefValue(ref.value);
  if (!dirId) return;
  try {
    await removeHandle(dirId);
  } catch (e) {
    console.warn('[managed-local-library] 释放旧目录句柄失败', e);
  }
}

export async function setLocalLibraryStorageRoot(
  moduleKey: LocalLibraryModule,
  ref: StorageRef,
): Promise<void> {
  const previous = storedLocalRoot(moduleKey);
  const formatted = formatStorageRef(ref);
  if (previous && previous !== formatted) {
    await releasePreviousWebDirHandle(previous);
  }
  if (moduleKey === 'music') {
    await settingsStore.updateAppSettings({
      audioLocalUseGlobalMediaRoot: false,
      audioLocalMediaRootDirectory: ref.kind === 'path' ? ref.value : undefined,
      audioLocalStorageRoot: formatted,
    });
    return;
  }
  await settingsStore.updateAppSettings({
    videoLocalUseGlobalMediaRoot: false,
    videoLocalMediaRootDirectory: ref.kind === 'path' ? ref.value : undefined,
    videoLocalStorageRoot: formatted,
  });
}

/** @deprecated 请优先用 setLocalLibraryStorageRoot */
export async function setLocalLibraryCustomPath(
  moduleKey: LocalLibraryModule,
  path: string,
): Promise<void> {
  await setLocalLibraryStorageRoot(moduleKey, { kind: 'path', value: path.trim() });
}

export async function applyDefaultLocalLibraryPath(moduleKey: LocalLibraryModule): Promise<string> {
  const previous = storedLocalRoot(moduleKey);
  if (previous) await releasePreviousWebDirHandle(previous);
  if (moduleKey === 'music') {
    await settingsStore.updateAppSettings({
      audioLocalUseGlobalMediaRoot: true,
      audioLocalMediaRootDirectory: undefined,
      audioLocalStorageRoot: undefined,
    });
  } else {
    await settingsStore.updateAppSettings({
      videoLocalUseGlobalMediaRoot: true,
      videoLocalMediaRootDirectory: undefined,
      videoLocalStorageRoot: undefined,
    });
  }
  return ensureLocalLibraryDirectory(moduleKey);
}
