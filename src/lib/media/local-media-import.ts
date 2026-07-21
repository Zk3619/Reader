/**
 * 本地音频/视频导入：复制 / 移动 / 无动作（对齐书籍 ImportBookAction）
 * 支持 path / OPFS / dir-handle / SAF（content URI）
 */

import { basename, join, normalize } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { androidWriteBookToTree } from '@/lib/platform/fs/android-bridge';
import { getFileSystem, toNativeFilesystemPath } from '@/lib/platform/filesystem';
import { removeHandle } from '@/lib/platform/fs/handle-store';
import {
  ensureManagedLocalLibraryRoot,
  getOpfsLocalDirName,
  type LocalLibraryModule,
  usesDirectoryHandleLocalRoot,
  usesSafTreeLocalRoot,
} from '@/lib/platform/fs/managed-local-library';
import { sanitizeManagedFileName } from '@/lib/platform/fs/managed-storage';
import {
  fileRefExists,
  listDirectory,
  readBytes,
  removeRef,
  writeBytes,
} from '@/lib/platform/fs/read-write';
import {
  formatStorageRef,
  normalizeUriStorageValue,
  parseStorageRef,
  type StorageRef,
} from '@/lib/platform/fs/storage-ref';
import { settingsStore } from '@/stores/settings';

export type ImportMediaAction = 'copy' | 'move' | 'none';

export function shouldPromptImportMediaAction(
  moduleKey: LocalLibraryModule,
  settings = settingsStore.state.app,
): boolean {
  if (moduleKey === 'music') {
    return !settings.rememberImportAudioAction || !settings.importAudioAction;
  }
  return !settings.rememberImportVideoAction || !settings.importVideoAction;
}

/** Tauri / Web 自定义 dir-handle / Android SAF 库时需要选择存放方式 */
export async function needsImportMediaActionSelection(
  moduleKey: LocalLibraryModule,
): Promise<boolean> {
  if (isTauri()) return true;
  if (await usesDirectoryHandleLocalRoot(moduleKey)) return true;
  if (await usesSafTreeLocalRoot(moduleKey)) return true;
  return false;
}

export async function needsImportMediaActionPrompt(
  moduleKey: LocalLibraryModule,
): Promise<boolean> {
  if (!(await needsImportMediaActionSelection(moduleKey))) return false;
  return shouldPromptImportMediaAction(moduleKey);
}

/**
 * 解析本次导入动作：
 * - 已记住 → 用偏好
 * - 需要弹窗 → null（由 UI 弹）
 * - Web 默认 OPFS → 隐式 copy（对齐书籍不弹窗直接写入托管库）
 */
export async function resolveImportMediaActionOrPrompt(
  moduleKey: LocalLibraryModule,
): Promise<ImportMediaAction | 'prompt'> {
  const remembered = resolveRememberedImportMediaAction(moduleKey);
  if (remembered) return remembered;
  if (await needsImportMediaActionSelection(moduleKey)) return 'prompt';
  return 'copy';
}

export function resolveRememberedImportMediaAction(
  moduleKey: LocalLibraryModule,
): ImportMediaAction | null {
  const settings = settingsStore.state.app;
  if (moduleKey === 'music') {
    if (settings.rememberImportAudioAction && settings.importAudioAction) {
      return settings.importAudioAction;
    }
    return null;
  }
  if (settings.rememberImportVideoAction && settings.importVideoAction) {
    return settings.importVideoAction;
  }
  return null;
}

export async function persistImportMediaAction(
  moduleKey: LocalLibraryModule,
  action: ImportMediaAction,
  remember: boolean,
): Promise<void> {
  if (moduleKey === 'music') {
    await settingsStore.updateAppSettings({
      importAudioAction: action,
      rememberImportAudioAction: remember,
    });
    return;
  }
  await settingsStore.updateAppSettings({
    importVideoAction: action,
    rememberImportVideoAction: remember,
  });
}

function sourceToRef(source: string): StorageRef {
  return parseStorageRef(source);
}

/** 登记用路径：path 保持裸路径；其余用 formatStorageRef */
function persistableLocation(ref: StorageRef): string {
  if (ref.kind === 'path') return ref.value;
  if (ref.kind === 'uri') return normalizeUriStorageValue(ref.value);
  return formatStorageRef(ref);
}

async function uniquePathTarget(dir: string, fileName: string): Promise<string> {
  const fs = await getFileSystem();
  let target = await join(dir, fileName);
  if (!(await fs.exists(target))) return target;

  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  for (let i = 1; i < 1000; i++) {
    target = await join(dir, `${base} (${i})${ext}`);
    if (!(await fs.exists(target))) return target;
  }
  return join(dir, `${base}-${Date.now()}${ext}`);
}

async function uniqueDirHandleName(rootId: string, fileName: string): Promise<string> {
  let name = fileName;
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? name : `${base} (${i})${ext}`;
    const targetRef: StorageRef = {
      kind: 'dir-handle',
      value: `${rootId}/${candidate}`,
    };
    if (!(await fileRefExists(targetRef))) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}

async function findSafTreeFileByName(
  treeUri: string,
  fileName: string,
): Promise<string | null> {
  const entries = await listDirectory({ kind: 'saf-tree', value: treeUri });
  const hit = entries.find((e) => !e.isDirectory && e.name === fileName);
  if (!hit) return null;
  return formatStorageRef({ kind: 'uri', value: hit.path });
}

async function copyToSafTree(
  root: StorageRef,
  source: string,
  fileName: string,
  content?: ArrayBuffer,
): Promise<string> {
  if (root.kind !== 'saf-tree') throw new Error('当前本地库不是 SAF 目录');
  const safeName = sanitizeManagedFileName(fileName);
  const existing = await findSafTreeFileByName(root.value, safeName);
  const srcRef = sourceToRef(source);
  const normalizedSrc =
    srcRef.kind === 'uri' ? formatStorageRef(srcRef) : source;
  if (existing && (existing === normalizedSrc || existing === source)) {
    return persistableLocation(parseStorageRef(existing));
  }
  const uniqueName = existing
    ? await (async () => {
        const dot = safeName.lastIndexOf('.');
        const base = dot > 0 ? safeName.slice(0, dot) : safeName;
        const ext = dot > 0 ? safeName.slice(dot) : '';
        for (let i = 1; i < 1000; i++) {
          const candidate = `${base} (${i})${ext}`;
          if (!(await findSafTreeFileByName(root.value, candidate))) return candidate;
        }
        return `${base}-${Date.now()}${ext}`;
      })()
    : safeName;

  const bytes = content ?? (await readBytes(srcRef));
  const writtenUri = await androidWriteBookToTree(root.value, uniqueName, bytes);
  return normalizeUriStorageValue(writtenUri);
}

async function copyToDirHandle(
  root: StorageRef,
  source: string,
  fileName: string,
  content?: ArrayBuffer,
): Promise<string> {
  if (root.kind !== 'dir-handle') throw new Error('当前本地库不是浏览器文件夹');
  const safeName = sanitizeManagedFileName(fileName);
  const uniqueName = await uniqueDirHandleName(root.value, safeName);
  const targetRef: StorageRef = {
    kind: 'dir-handle',
    value: `${root.value}/${uniqueName}`,
  };
  const bytes = content ?? (await readBytes(sourceToRef(source)));
  await writeBytes(targetRef, bytes);
  const src = sourceToRef(source);
  if (src.kind === 'handle') {
    await removeHandle(src.value).catch((e) => {
      console.warn('[local-media-import] 清理临时文件句柄失败', e);
    });
  }
  return formatStorageRef(targetRef);
}

async function copyToOpfs(
  moduleKey: LocalLibraryModule,
  fileName: string,
  content: ArrayBuffer,
): Promise<string> {
  await ensureManagedLocalLibraryRoot(moduleKey);
  const safeName = sanitizeManagedFileName(fileName);
  const opfsPath = `${getOpfsLocalDirName(moduleKey)}/${crypto.randomUUID()}_${safeName}`;
  await writeBytes({ kind: 'opfs', value: opfsPath }, content);
  return formatStorageRef({ kind: 'opfs', value: opfsPath });
}

async function copyToPath(
  root: StorageRef,
  source: string,
  fileName: string,
  content?: ArrayBuffer,
): Promise<string> {
  if (root.kind !== 'path') throw new Error('当前本地库不是路径目录');
  const fs = await getFileSystem();
  try {
    await fs.mkdir(root.value, true);
  } catch {
    /* 已存在 */
  }
  const safeName = sanitizeManagedFileName(fileName);
  const targetPath = await uniquePathTarget(root.value, safeName);
  const srcRef = sourceToRef(source);

  if (srcRef.kind === 'path') {
    try {
      const normalizedSource = await normalize(toNativeFilesystemPath(srcRef.value));
      const normalizedTarget = await normalize(targetPath);
      if (normalizedSource === normalizedTarget) return targetPath;
    } catch {
      /* ignore */
    }
  }

  const fileBytes =
    content ??
    (srcRef.kind === 'path'
      ? await fs.readFile(srcRef.value)
      : await readBytes(srcRef));
  await fs.writeFile(targetPath, fileBytes);
  return targetPath;
}

async function cleanupSourceAfterMove(source: string): Promise<void> {
  const src = sourceToRef(source);
  try {
    if (src.kind === 'path') {
      const fs = await getFileSystem();
      await fs.remove(src.value, false);
      return;
    }
    if (src.kind === 'uri' || src.kind === 'handle') {
      await removeRef(src, false);
    }
  } catch (error) {
    console.warn('[local-media-import] 删除源文件失败（已写入本地库）:', error);
  }
}

export interface MaterializeLocalMediaOptions {
  fileName?: string;
  content?: ArrayBuffer;
}

/**
 * 将单个文件按动作写入本地库，返回最终应登记的位置字符串。
 * action=none 时原样返回 source（Web OPFS 默认导入请传 copy）。
 */
export async function materializeFileToLocalLibrary(
  moduleKey: LocalLibraryModule,
  source: string,
  action: ImportMediaAction,
  options?: MaterializeLocalMediaOptions,
): Promise<string> {
  if (action === 'none') return source;

  const root = await ensureManagedLocalLibraryRoot(moduleKey);
  const rawName =
    options?.fileName ??
    (source.includes('/') || source.includes('\\')
      ? source.replace(/^.*[/\\]/, '')
      : await (async () => {
          try {
            return await basename(source);
          } catch {
            return 'media.bin';
          }
        })());
  const fileName = sanitizeManagedFileName(rawName || 'media.bin');

  let target: string;
  if (root.kind === 'saf-tree') {
    target = await copyToSafTree(root, source, fileName, options?.content);
  } else if (root.kind === 'dir-handle') {
    target = await copyToDirHandle(root, source, fileName, options?.content);
  } else if (root.kind === 'opfs') {
    const bytes = options?.content ?? (await readBytes(sourceToRef(source)));
    target = await copyToOpfs(moduleKey, fileName, bytes);
    const src = sourceToRef(source);
    if (src.kind === 'handle') {
      await removeHandle(src.value).catch(() => undefined);
    }
  } else {
    target = await copyToPath(root, source, fileName, options?.content);
  }

  if (action === 'move') {
    await cleanupSourceAfterMove(source);
  }
  return target;
}

/** 批量物化；返回与 sources 等长的目标路径列表 */
export async function materializeFilesToLocalLibrary(
  moduleKey: LocalLibraryModule,
  sourcePaths: string[],
  action: ImportMediaAction,
  onProgress?: (done: number, total: number, path: string) => void,
  contents?: ArrayBuffer[],
): Promise<string[]> {
  if (action === 'none' || sourcePaths.length === 0) {
    return [...sourcePaths];
  }
  const results: string[] = [];
  for (let i = 0; i < sourcePaths.length; i++) {
    const src = sourcePaths[i]!;
    onProgress?.(i, sourcePaths.length, src);
    results.push(
      await materializeFileToLocalLibrary(moduleKey, src, action, {
        content: contents?.[i],
      }),
    );
  }
  onProgress?.(sourcePaths.length, sourcePaths.length, sourcePaths[sourcePaths.length - 1] ?? '');
  return results;
}
