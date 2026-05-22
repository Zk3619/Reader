/** Chromium File System Access API：目录句柄异步迭代 */
export type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};

export async function forEachDirectoryEntry(
  handle: FileSystemDirectoryHandle,
  fn: (entry: FileSystemHandle) => void | Promise<void>,
): Promise<void> {
  const iterable = handle as IterableDirectoryHandle;
  for await (const entry of iterable.values()) {
    await fn(entry);
  }
}
