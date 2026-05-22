import {
  exists as fsExists,
  mkdir as fsMkdir,
  readDir as fsReadDir,
  readFile as fsReadFile,
  remove as fsRemove,
  stat as fsStat,
  writeFile as fsWriteFile,
} from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import {
  androidDeleteUri,
  androidReadDir,
  androidReadUriBytes,
} from '@/lib/platform/fs/android-bridge';
import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { normalizeUriStorageValue } from '@/lib/platform/fs/storage-ref';
import {
  getFileInDirHandle,
  removeFileInDirHandle,
  splitDirHandleRefValue,
  writeFileInDirHandle,
} from '@/lib/platform/fs/dir-handle-file';
import { getHandle, removeHandle } from '@/lib/platform/fs/handle-store';
import { forEachDirectoryEntry } from '@/lib/platform/fs/dir-iterate';
import {
  getLegacyDirectory,
  listLegacyDirectoryEntries,
} from '@/lib/platform/fs/legacy-dir-store';
import { parseStorageRef, type StorageRef } from '@/lib/platform/fs/storage-ref';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

const VIRTUAL_DB = 'reader-filesystem';
const VIRTUAL_STORE = 'files';

async function openVirtualDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIRTUAL_DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VIRTUAL_STORE)) {
        db.createObjectStore(VIRTUAL_STORE);
      }
    };
  });
}

async function readVirtual(id: string): Promise<ArrayBuffer | null> {
  const db = await openVirtualDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIRTUAL_STORE, 'readonly');
    const req = tx.objectStore(VIRTUAL_STORE).get(`virtual:${id}`);
    req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeVirtual(id: string, data: ArrayBuffer): Promise<void> {
  const db = await openVirtualDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIRTUAL_STORE, 'readwrite');
    tx.objectStore(VIRTUAL_STORE).put(data, `virtual:${id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function resolveOpfsFile(relativePath: string): Promise<FileSystemFileHandle> {
  const parts = relativePath.split('/').filter(Boolean);
  let dir = await getOpfsRoot();
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create: true });
}

export async function readBytes(ref: StorageRef): Promise<ArrayBuffer> {
  const parsed = ref.kind ? ref : parseStorageRef(ref.value);

  if (parsed.kind === 'uri') {
    const uri = normalizeUriStorageValue(parsed.value);
    if (isTauri() && mayUseAndroidFsLayer()) {
      return androidReadUriBytes(uri);
    }
    const data = await fsReadFile(uri);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return buf as ArrayBuffer;
  }

  if (parsed.kind === 'path') {
    const data = await fsReadFile(parsed.value);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return buf as ArrayBuffer;
  }

  if (parsed.kind === 'opfs') {
    const handle = await resolveOpfsFile(parsed.value);
    const file = await handle.getFile();
    return file.arrayBuffer();
  }

  if (parsed.kind === 'handle') {
    const handle = await getHandle(parsed.value);
    if (!handle || handle.kind !== 'file') {
      throw new Error(`句柄不存在或不是文件: ${parsed.value}`);
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    return file.arrayBuffer();
  }

  if (parsed.kind === 'dir-handle') {
    const { dirId, relativePath } = splitDirHandleRefValue(parsed.value);
    if (!relativePath) {
      throw new Error('无法读取目录句柄根路径，请使用具体书籍文件路径');
    }
    const fileHandle = await getFileInDirHandle(dirId, relativePath);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  if (parsed.kind === 'virtual') {
    const cached = await readVirtual(parsed.value);
    if (!cached) throw new Error(`虚拟文件不存在: ${parsed.value}`);
    return cached;
  }

  throw new Error(`无法读取 StorageRef: ${parsed.kind}`);
}

export async function writeBytes(ref: StorageRef, data: ArrayBuffer): Promise<void> {
  const parsed = ref;

  if (parsed.kind === 'path' || parsed.kind === 'uri') {
    await fsWriteFile(parsed.value, new Uint8Array(data));
    return;
  }

  if (parsed.kind === 'opfs') {
    const handle = await resolveOpfsFile(parsed.value);
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return;
  }

  if (parsed.kind === 'handle') {
    const handle = await getHandle(parsed.value);
    if (!handle || handle.kind !== 'file') {
      throw new Error(`句柄不存在或不是文件: ${parsed.value}`);
    }
    const writable = await (handle as FileSystemFileHandle).createWritable();
    await writable.write(data);
    await writable.close();
    return;
  }

  if (parsed.kind === 'dir-handle') {
    const { dirId, relativePath } = splitDirHandleRefValue(parsed.value);
    if (!relativePath) {
      throw new Error('无法写入目录句柄根路径，请指定书籍文件名');
    }
    await writeFileInDirHandle(dirId, relativePath, data);
    return;
  }

  if (parsed.kind === 'virtual') {
    await writeVirtual(parsed.value, data);
    return;
  }

  throw new Error(`无法写入 StorageRef: ${parsed.kind}`);
}

export async function fileRefExists(ref: StorageRef): Promise<boolean> {
  try {
    if (ref.kind === 'path' || ref.kind === 'uri') {
      return fsExists(ref.value);
    }
    if (ref.kind === 'opfs') {
      await resolveOpfsFile(ref.value);
      return true;
    }
    if (ref.kind === 'handle') {
      return (await getHandle(ref.value)) != null;
    }
    if (ref.kind === 'dir-handle') {
      const { dirId, relativePath } = splitDirHandleRefValue(ref.value);
      if (!relativePath) {
        return (await getHandle(dirId)) != null;
      }
      await getFileInDirHandle(dirId, relativePath);
      return true;
    }
    if (ref.kind === 'virtual') {
      return (await readVirtual(ref.value)) != null;
    }
    if (ref.kind === 'saf-tree') {
      return isTauri();
    }
    return false;
  } catch {
    return false;
  }
}

export async function removeRef(ref: StorageRef, recursive = false): Promise<void> {
  if (ref.kind === 'uri') {
    const uri = normalizeUriStorageValue(ref.value);
    if (isTauri() && mayUseAndroidFsLayer()) {
      await androidDeleteUri(uri);
      return;
    }
    await fsRemove(uri, { recursive });
    return;
  }
  if (ref.kind === 'path') {
    await fsRemove(ref.value, { recursive });
    return;
  }
  if (ref.kind === 'opfs') {
    const parts = ref.value.split('/');
    const fileName = parts.pop();
    if (!fileName) return;
    let dir = await getOpfsRoot();
    for (const p of parts.filter(Boolean)) {
      dir = await dir.getDirectoryHandle(p);
    }
    await dir.removeEntry(fileName);
    return;
  }
  if (ref.kind === 'virtual') {
    const db = await openVirtualDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIRTUAL_STORE, 'readwrite');
      tx.objectStore(VIRTUAL_STORE).delete(`virtual:${ref.value}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  if (ref.kind === 'handle') {
    await removeHandle(ref.value);
    return;
  }
  if (ref.kind === 'dir-handle') {
    const { dirId, relativePath } = splitDirHandleRefValue(ref.value);
    if (!relativePath) {
      await removeHandle(dirId);
      return;
    }
    await removeFileInDirHandle(dirId, relativePath);
  }
}

export async function getFileSize(ref: StorageRef): Promise<number> {
  if (ref.kind === 'uri' && isTauri() && mayUseAndroidFsLayer()) {
    const buf = await readBytes(ref);
    return buf.byteLength;
  }
  if (ref.kind === 'path' || ref.kind === 'uri') {
    const meta = await fsStat(
      ref.kind === 'uri' ? normalizeUriStorageValue(ref.value) : ref.value,
    );
    return meta.size ?? 0;
  }
  const buf = await readBytes(ref);
  return buf.byteLength;
}

export async function listDirectory(ref: StorageRef): Promise<DirEntry[]> {
  if (ref.kind === 'path') {
    if (!isTauri()) {
      throw new Error(
        '纯 Web 环境无法访问磁盘路径，请在设置中将书籍存储目录设为浏览器内置库（OPFS）',
      );
    }
    const entries = await fsReadDir(ref.value);
    const out: DirEntry[] = [];
    for (const entry of entries) {
      const name =
        typeof entry === 'string'
          ? entry
          : String((entry as { name?: string }).name ?? '');
      if (!name) continue;
      const childPath = `${ref.value.replace(/[/\\]$/, '')}/${name}`;
      let isDirectory = false;
      if (typeof entry === 'object' && entry && 'isDirectory' in entry) {
        isDirectory = Boolean((entry as { isDirectory?: boolean }).isDirectory);
      } else {
        try {
          await fsReadDir(childPath);
          isDirectory = true;
        } catch {
          isDirectory = false;
        }
      }
      out.push({ name, path: childPath, isDirectory });
    }
    return out;
  }

  if (ref.kind === 'saf-tree') {
    const rows = await androidReadDir(ref.value);
    return rows.map((r) => ({
      name: r.name,
      path: r.uri,
      isDirectory: r.is_dir,
    }));
  }

  if (ref.kind === 'dir-handle') {
    const legacy = getLegacyDirectory(ref.value);
    if (legacy) {
      return listLegacyDirectoryEntries(ref.value, '').map((e) => ({
        name: e.name,
        path: `handle:dir:${ref.value}/${e.path}`,
        isDirectory: e.isDirectory,
      }));
    }
    const handle = await getHandle(ref.value);
    if (!handle || handle.kind !== 'directory') return [];
    const out: DirEntry[] = [];
    await forEachDirectoryEntry(handle as FileSystemDirectoryHandle, (entry) => {
      out.push({
        name: entry.name,
        path: `handle:dir:${ref.value}/${entry.name}`,
        isDirectory: entry.kind === 'directory',
      });
    });
    return out;
  }

  if (ref.kind === 'opfs') {
    let dir = await getOpfsRoot();
    const parts = ref.value.split('/').filter(Boolean);
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part);
    }
    const out: DirEntry[] = [];
    await forEachDirectoryEntry(dir, (entry) => {
      out.push({
        name: entry.name,
        path: `opfs:${ref.value}/${entry.name}`,
        isDirectory: entry.kind === 'directory',
      });
    });
    return out;
  }

  return [];
}

export async function mkdirRef(ref: StorageRef, recursive = true): Promise<void> {
  if (ref.kind === 'path') {
    await fsMkdir(ref.value, { recursive });
  }
}

/** @deprecated 使用 readBytes(StorageRef) */
export async function readPath(pathOrRef: string): Promise<ArrayBuffer> {
  return readBytes(parseStorageRef(pathOrRef));
}
