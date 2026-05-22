import { getHandle } from '@/lib/platform/fs/handle-store';

export function splitDirHandleRefValue(value: string): {
  dirId: string;
  relativePath: string;
} {
  const slash = value.indexOf('/');
  if (slash === -1) {
    return { dirId: value, relativePath: '' };
  }
  return {
    dirId: value.slice(0, slash),
    relativePath: value.slice(slash + 1),
  };
}

export async function getDirHandleRoot(
  dirId: string,
): Promise<FileSystemDirectoryHandle> {
  const handle = await getHandle(dirId);
  if (!handle || handle.kind !== 'directory') {
    throw new Error(`书籍目录句柄无效或已失效: ${dirId}`);
  }
  return handle as FileSystemDirectoryHandle;
}

export async function getFileInDirHandle(
  dirId: string,
  relativePath: string,
): Promise<FileSystemFileHandle> {
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length) {
    throw new Error('缺少书籍文件名');
  }
  let dir = await getDirHandleRoot(dirId);
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }
  return dir.getFileHandle(parts[parts.length - 1]);
}

export async function writeFileInDirHandle(
  dirId: string,
  relativePath: string,
  data: ArrayBuffer,
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length) {
    throw new Error('缺少书籍文件名');
  }
  const fileName = parts.pop()!;
  let dir = await getDirHandleRoot(dirId);
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function removeFileInDirHandle(
  dirId: string,
  relativePath: string,
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length) return;
  const fileName = parts.pop()!;
  let dir = await getDirHandleRoot(dirId);
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  await dir.removeEntry(fileName);
}
