import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  mayUseAndroidFsLayer,
  resolveFsPlatform,
  supportsAndroidFsPlugin,
  supportsFsAccessDirectoryPicker,
  supportsLegacyDirectoryInput,
  supportsTauriDialogDirectoryPicker,
  type FsLayer,
} from '@/lib/platform/fs/capabilities';
import { FsUserCancelledError, FsUnsupportedError, isUserCancelled } from '@/lib/platform/fs/errors';
import { logFsBridge } from '@/lib/platform/fs/fs-log';
import {
  androidPersistDirPermission,
  androidPickDir,
} from '@/lib/platform/fs/android-bridge';
import { newHandleId, putHandle } from '@/lib/platform/fs/handle-store';
import { putLegacyDirectory } from '@/lib/platform/fs/legacy-dir-store';
import { ensureManagedBooksRoot, setBooksStorageRoot } from '@/lib/platform/fs/managed-storage';
import type { PickDirectoryOptions, PickDirectoryResult } from '@/lib/platform/fs/pick-types';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';

async function tryL1PickDirectory(): Promise<PickDirectoryResult | null> {
  if (!supportsTauriDialogDirectoryPicker()) return null;
  const selected = await openDialog({ directory: true, multiple: false });
  if (selected === null) throw new FsUserCancelledError();
  if (typeof selected !== 'string') return null;
  return {
    ref: { kind: 'path', value: selected },
    sourceLayer: 'L1',
  };
}

async function tryL2PickDirectory(): Promise<PickDirectoryResult | null> {
  // Android WebView 上 showDirectoryPicker 可能挂起，阻塞后续 L3 原生选目录
  if (mayUseAndroidFsLayer()) return null;
  if (!supportsFsAccessDirectoryPicker()) return null;
  const handle = await window.showDirectoryPicker!();
  const id = newHandleId();
  await putHandle(id, handle);
  return {
    ref: { kind: 'dir-handle', value: id },
    sourceLayer: 'L2',
  };
}

async function tryL3PickDirectory(): Promise<PickDirectoryResult | null> {
  if (!mayUseAndroidFsLayer() || !(await supportsAndroidFsPlugin())) return null;
  const uri = await androidPickDir();
  if (!uri) throw new FsUserCancelledError();
  await androidPersistDirPermission(uri);
  return {
    ref: { kind: 'saf-tree', value: uri },
    sourceLayer: 'L3',
  };
}

async function tryL4PickDirectory(): Promise<PickDirectoryResult | null> {
  if (!supportsLegacyDirectoryInput()) return null;
  const files = await new Promise<FileList | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => resolve(input.files);
    input.click();
  });
  if (!files?.length) throw new FsUserCancelledError();
  const id = newHandleId();
  putLegacyDirectory(id, Array.from(files));
  return {
    ref: { kind: 'dir-handle', value: id },
    sourceLayer: 'L4',
  };
}

async function tryL5PickDirectory(): Promise<PickDirectoryResult> {
  const root = await ensureManagedBooksRoot();
  return { ref: root, sourceLayer: 'L5' };
}

export async function pickDirectory(
  options: PickDirectoryOptions = {},
): Promise<PickDirectoryResult> {
  const platform = resolveFsPlatform();
  const attempted: FsLayer[] = [];

  const layers: Array<{ layer: FsLayer; run: () => Promise<PickDirectoryResult | null> }> = [
    { layer: 'L1', run: tryL1PickDirectory },
    ...(mayUseAndroidFsLayer()
      ? [{ layer: 'L3' as const, run: tryL3PickDirectory }]
      : [{ layer: 'L2' as const, run: tryL2PickDirectory }]),
    { layer: 'L4', run: tryL4PickDirectory },
  ];

  for (const { layer, run } of layers) {
    attempted.push(layer);
    try {
      const result = await run();
      if (result) {
        logFsBridge('pickDirectory', { platform, attempted, winner: layer });
        if (options.forBooksStorage) {
          await setBooksStorageRoot(result.ref);
        }
        return result;
      }
    } catch (e) {
      if (isUserCancelled(e)) throw e;
      console.warn(`[fs-bridge] pickDirectory ${layer} failed`, e);
    }
  }

  // Android 上用户点击「选择目录」时不应静默落回默认路径，否则像按钮无反应
  if (mayUseAndroidFsLayer() && options.forBooksStorage) {
    const androidOk = await supportsAndroidFsPlugin();
    attempted.push('L6');
    throw new FsUnsupportedError(
      platform,
      'pickDirectory',
      attempted,
      androidOk
        ? '无法打开系统目录选择器，请检查应用存储权限或稍后重试'
        : 'Android 文件访问插件未就绪，请重新安装或更新应用',
    );
  }

  attempted.push('L5');
  try {
    const result = await tryL5PickDirectory();
    logFsBridge('pickDirectory', { platform, attempted, winner: 'L5' });
    if (options.forBooksStorage) {
      await setBooksStorageRoot(result.ref);
    }
    return result;
  } catch (e) {
    if (isUserCancelled(e)) throw e;
    console.warn('[fs-bridge] pickDirectory L5 failed', e);
  }

  attempted.push('L6');
  throw new FsUnsupportedError(platform, 'pickDirectory', attempted);
}

export function pickDirectoryAsString(
  options?: PickDirectoryOptions,
): Promise<string | null> {
  return pickDirectory(options)
    .then((r) => formatStorageRef(r.ref))
    .catch((e) => {
      if (isUserCancelled(e)) return null;
      throw e;
    });
}
