import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile as fsReadFile } from '@tauri-apps/plugin-fs';
import {
  mayUseAndroidFsLayer,
  resolveFsPlatform,
  supportsAndroidFsPlugin,
  supportsFsAccessOpenFilePicker,
  supportsLegacyFileInput,
  supportsTauriDialogFilePicker,
  type FsLayer,
} from '@/lib/platform/fs/capabilities';
import { FsUserCancelledError, FsUnsupportedError, isUserCancelled } from '@/lib/platform/fs/errors';
import { logFsBridge } from '@/lib/platform/fs/fs-log';
import {
  androidPickFiles,
  androidReadUriBytes,
} from '@/lib/platform/fs/android-bridge';
import { normalizeUriStorageValue } from '@/lib/platform/fs/storage-ref';
import { newHandleId, putHandle } from '@/lib/platform/fs/handle-store';
import {
  DEFAULT_BOOK_FILTERS,
  type PickFileOptions,
  type PickResult,
} from '@/lib/platform/fs/pick-types';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';

function filtersToAccept(
  filters: PickFileOptions['filters'],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const f of filters ?? DEFAULT_BOOK_FILTERS) {
    for (const ext of f.extensions) {
      const mime =
        ext === 'epub'
          ? 'application/epub+zip'
          : ext === 'txt'
            ? 'text/plain'
            : `application/${ext}`;
      if (!map[mime]) map[mime] = [];
      map[mime].push(`.${ext}`);
    }
  }
  return map;
}

function filtersToAcceptAttribute(filters: PickFileOptions['filters']): string {
  const exts = new Set<string>();
  for (const f of filters ?? DEFAULT_BOOK_FILTERS) {
    for (const ext of f.extensions) {
      exts.add(`.${ext}`);
    }
  }
  return [...exts].join(',');
}

async function l1PathToPickResult(path: string): Promise<PickResult> {
  const isUri = path.startsWith('content://');
  const ref = isUri
    ? { kind: 'uri' as const, value: path }
    : { kind: 'path' as const, value: path };

  let bytes: ArrayBuffer | undefined;
  if (isUri) {
    const data = await fsReadFile(path);
    bytes = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }

  const fileName = path.split(/[/\\]/).pop() || 'book.dat';
  return { ref, fileName, bytes, sourceLayer: 'L1' };
}

async function tryL1PickFiles(options: PickFileOptions): Promise<PickResult[] | null> {
  if (!supportsTauriDialogFilePicker()) return null;
  const filters = options.filters ?? DEFAULT_BOOK_FILTERS;
  const multiple = options.multiple ?? false;
  const path = await openDialog({
    multiple,
    directory: false,
    filters,
  });
  if (path === null) throw new FsUserCancelledError();
  const paths = (Array.isArray(path) ? path : [path]).filter(
    (p): p is string => typeof p === 'string',
  );
  if (paths.length === 0) return null;
  return Promise.all(paths.map((p) => l1PathToPickResult(p)));
}

async function tryL2PickFiles(options: PickFileOptions): Promise<PickResult[] | null> {
  if (mayUseAndroidFsLayer()) return null;
  if (!supportsFsAccessOpenFilePicker()) return null;
  const accept = filtersToAccept(options.filters);
  const multiple = options.multiple ?? false;
  const handles = await window.showOpenFilePicker!({
    multiple,
    types: Object.keys(accept).length
      ? [{ accept }]
      : undefined,
  });
  if (!handles.length) throw new FsUserCancelledError();

  const results: PickResult[] = [];
  for (const handle of handles) {
    const id = newHandleId();
    await putHandle(id, handle);
    const file = await handle.getFile();
    results.push({
      ref: { kind: 'handle', value: id },
      fileName: file.name,
      bytes: await file.arrayBuffer(),
      sourceLayer: 'L2',
    });
  }
  return results;
}

async function tryL3PickFiles(options: PickFileOptions): Promise<PickResult[] | null> {
  if (!mayUseAndroidFsLayer() || !(await supportsAndroidFsPlugin())) return null;
  const multiple = options.multiple ?? false;
  const picked = await androidPickFiles(['*/*'], multiple);
  if (!picked.length) throw new FsUserCancelledError();

  const results: PickResult[] = [];
  for (const { uri, name } of picked) {
    const bareUri = normalizeUriStorageValue(uri);
    const bytes = await androidReadUriBytes(bareUri);
    const fileName = name.trim() || 'book.dat';
    results.push({
      ref: { kind: 'uri', value: bareUri },
      fileName,
      bytes,
      sourceLayer: 'L3',
    });
  }
  return results;
}

async function tryL4PickFiles(options: PickFileOptions): Promise<PickResult[] | null> {
  if (!supportsLegacyFileInput()) return null;
  const multiple = options.multiple ?? false;
  const accept = filtersToAcceptAttribute(options.filters);
  const files = await new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.txt,.epub,text/plain,application/epub+zip';
    input.multiple = multiple;
    input.onchange = () => {
      const list = input.files;
      resolve(list ? Array.from(list) : []);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
  if (files.length === 0) throw new FsUserCancelledError();

  const results: PickResult[] = [];
  for (const file of files) {
    results.push({
      ref: { kind: 'virtual', value: crypto.randomUUID() },
      fileName: file.name,
      bytes: await file.arrayBuffer(),
      sourceLayer: 'L4',
      legacyFile: file,
    });
  }
  return results;
}

/** 选择一个或多个文件（默认允许多选） */
export async function pickFiles(options: PickFileOptions = {}): Promise<PickResult[]> {
  const platform = resolveFsPlatform();
  const attempted: FsLayer[] = [];
  const resolvedOptions: PickFileOptions = {
    ...options,
    multiple: options.multiple ?? true,
  };

  if (options.managedOnly) {
    attempted.push('L5');
    throw new FsUnsupportedError(platform, 'pickFile', attempted, 'managedOnly 无法选择文件');
  }

  const layers: Array<{ layer: FsLayer; run: () => Promise<PickResult[] | null> }> = [
    { layer: 'L1', run: () => tryL1PickFiles(resolvedOptions) },
    ...(mayUseAndroidFsLayer()
      ? [{ layer: 'L3' as const, run: () => tryL3PickFiles(resolvedOptions) }]
      : [{ layer: 'L2' as const, run: () => tryL2PickFiles(resolvedOptions) }]),
    { layer: 'L4', run: () => tryL4PickFiles(resolvedOptions) },
  ];

  for (const { layer, run } of layers) {
    attempted.push(layer);
    try {
      const result = await run();
      if (result && result.length > 0) {
        logFsBridge('pickFiles', {
          platform,
          attempted,
          winner: layer,
          count: result.length,
        });
        return result;
      }
    } catch (e) {
      if (isUserCancelled(e)) throw e;
      console.warn(`[fs-bridge] pickFiles ${layer} failed`, e);
    }
  }

  attempted.push('L6');
  logFsBridge('pickFiles', { platform, attempted, message: 'unsupported' });
  throw new FsUnsupportedError(platform, 'pickFile', attempted);
}

/** 选择单个文件 */
export async function pickFile(options: PickFileOptions = {}): Promise<PickResult> {
  const results = await pickFiles({ ...options, multiple: false });
  return results[0]!;
}

export type PickedFileUrl = {
  bookUrl: string;
  fileName: string;
  content?: ArrayBuffer;
};

/** 多选：返回 bookUrl 列表；取消时返回空数组 */
export async function pickFilesAsBookUrl(
  options?: PickFileOptions,
): Promise<PickedFileUrl[]> {
  try {
    const picks = await pickFiles(options);
    return picks.map((pick) => ({
      bookUrl: formatStorageRef(pick.ref),
      fileName: pick.fileName,
      content: pick.bytes,
    }));
  } catch (e) {
    if (isUserCancelled(e)) return [];
    throw e;
  }
}

/** 单选：兼容旧 API */
export async function pickFileAsBookUrl(
  options?: PickFileOptions,
): Promise<PickedFileUrl | null> {
  try {
    const pick = await pickFile(options);
    return {
      bookUrl: formatStorageRef(pick.ref),
      fileName: pick.fileName,
      content: pick.bytes,
    };
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
