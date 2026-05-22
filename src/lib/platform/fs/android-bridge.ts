import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';

export interface AndroidDirEntry {
  name: string;
  is_dir: boolean;
  uri: string;
}

export async function androidFsProbe(): Promise<boolean> {
  if (!mayUseAndroidFsLayer()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('android_fs_probe');
  } catch {
    return false;
  }
}

export interface AndroidPickedFile {
  uri: string;
  name: string;
}

export async function androidPickFiles(
  mimeTypes: string[] = ['*/*'],
  multiple = false,
): Promise<AndroidPickedFile[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<AndroidPickedFile[]>('android_pick_files', { mimeTypes, multiple });
}

export async function androidUriDisplayName(uri: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('android_uri_display_name', { uri });
}

export async function androidDeleteUri(uri: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('android_delete_uri', { uri });
}

export async function androidReadUriBytes(uri: string): Promise<ArrayBuffer> {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = await invoke<number[]>('android_read_uri_bytes', { uri });
  const u8 = new Uint8Array(bytes);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

export async function androidPickDir(): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('android_pick_dir');
}

export async function androidPersistDirPermission(uri: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('android_persist_dir_permission', { uri });
}

export async function androidReadDir(uri: string): Promise<AndroidDirEntry[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<AndroidDirEntry[]>('android_read_dir', { uri });
}

/** 将书籍字节写入 SAF 书籍库目录，返回目标文件 URI 字符串 */
export async function androidWriteBookToTree(
  treeUri: string,
  fileName: string,
  bytes: ArrayBuffer,
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('android_write_book_to_tree', {
    treeUri,
    fileName,
    bytes: Array.from(new Uint8Array(bytes)),
  });
}
