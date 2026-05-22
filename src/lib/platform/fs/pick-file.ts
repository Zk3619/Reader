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
import { normalizeUriStorageValue, parseStorageRef } from '@/lib/platform/fs/storage-ref';
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

async function tryL1PickFile(options: PickFileOptions): Promise<PickResult | null> {
  if (!supportsTauriDialogFilePicker()) return null;
  const filters = options.filters ?? DEFAULT_BOOK_FILTERS;
  const path = await openDialog({
    multiple: options.multiple ?? false,
    directory: false,
    filters,
  });
  if (path === null) throw new FsUserCancelledError();
  const paths = Array.isArray(path) ? path : [path];
  const first = paths[0];
  if (typeof first !== 'string') return null;

  const isUri = first.startsWith('content://');
  const ref = isUri
    ? { kind: 'uri' as const, value: first }
    : { kind: 'path' as const, value: first };

  let bytes: ArrayBuffer | undefined;
  if (isUri) {
    const data = await fsReadFile(first);
    bytes = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }

  const fileName = first.split(/[/\\]/).pop() || 'book.dat';
  return { ref, fileName, bytes, sourceLayer: 'L1' };
}

async function tryL2PickFile(options: PickFileOptions): Promise<PickResult | null> {
  if (mayUseAndroidFsLayer()) return null;
  if (!supportsFsAccessOpenFilePicker()) return null;
  const accept = filtersToAccept(options.filters);
  const handles = await window.showOpenFilePicker!({
    multiple: options.multiple ?? false,
    types: Object.keys(accept).length
      ? [{ accept }]
      : undefined,
  });
  if (!handles.length) throw new FsUserCancelledError();
  const handle = handles[0];
  const id = newHandleId();
  await putHandle(id, handle);
  const file = await handle.getFile();
  return {
    ref: { kind: 'handle', value: id },
    fileName: file.name,
    bytes: await file.arrayBuffer(),
    sourceLayer: 'L2',
  };
}

async function tryL3PickFile(): Promise<PickResult | null> {
  if (!mayUseAndroidFsLayer() || !(await supportsAndroidFsPlugin())) return null;
  const picked = await androidPickFiles(['*/*'], false);
  if (!picked.length) throw new FsUserCancelledError();
  const { uri, name } = picked[0];
  const bareUri = normalizeUriStorageValue(uri);
  const bytes = await androidReadUriBytes(bareUri);
  const fileName = name.trim() || 'book.dat';
  return {
    ref: { kind: 'uri', value: bareUri },
    fileName,
    bytes,
    sourceLayer: 'L3',
  };
}

async function tryL4PickFile(): Promise<PickResult | null> {
  if (!supportsLegacyFileInput()) return null;
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.epub,text/plain,application/epub+zip';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  if (!file) throw new FsUserCancelledError();
  return {
    ref: { kind: 'virtual', value: crypto.randomUUID() },
    fileName: file.name,
    bytes: await file.arrayBuffer(),
    sourceLayer: 'L4',
    legacyFile: file,
  };
}

export async function pickFile(options: PickFileOptions = {}): Promise<PickResult> {
  const platform = resolveFsPlatform();
  const attempted: FsLayer[] = [];

  if (options.managedOnly) {
    attempted.push('L5');
    throw new FsUnsupportedError(platform, 'pickFile', attempted, 'managedOnly 无法选择单个文件');
  }

  const layers: Array<{ layer: FsLayer; run: () => Promise<PickResult | null> }> = [
    { layer: 'L1', run: () => tryL1PickFile(options) },
    ...(mayUseAndroidFsLayer()
      ? [{ layer: 'L3' as const, run: () => tryL3PickFile() }]
      : [{ layer: 'L2' as const, run: () => tryL2PickFile(options) }]),
    { layer: 'L4', run: () => tryL4PickFile() },
  ];

  for (const { layer, run } of layers) {
    attempted.push(layer);
    try {
      const result = await run();
      if (result) {
        logFsBridge('pickFile', { platform, attempted, winner: layer });
        return result;
      }
    } catch (e) {
      if (isUserCancelled(e)) throw e;
      console.warn(`[fs-bridge] pickFile ${layer} failed`, e);
    }
  }

  attempted.push('L6');
  logFsBridge('pickFile', { platform, attempted, message: 'unsupported' });
  throw new FsUnsupportedError(platform, 'pickFile', attempted);
}

/** 兼容旧 API：返回 bookUrl 字符串 */
export async function pickFileAsBookUrl(
  options?: PickFileOptions,
): Promise<{ bookUrl: string; fileName: string; content?: ArrayBuffer } | null> {
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
