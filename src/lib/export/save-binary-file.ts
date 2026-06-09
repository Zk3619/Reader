/**
 * 跨平台保存二进制文件
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import { SaveTextFileCancelledError } from '@/lib/export/save-text-file';

export { SaveTextFileCancelledError as SaveBinaryFileCancelledError };

export async function saveBinaryFile(
  defaultFileName: string,
  bytes: Uint8Array,
  filters?: { name: string; extensions: string[] }[],
): Promise<void> {
  if (isTauri()) {
    const path = await save({
      defaultPath: defaultFileName,
      filters: filters ?? [{ name: 'File', extensions: ['*'] }],
    });
    if (!path) {
      throw new SaveTextFileCancelledError();
    }
    await writeFile(path, bytes);
    return;
  }

  const ext = defaultFileName.split('.').pop()?.toLowerCase() ?? 'bin';
  const mime =
    ext === 'epub'
      ? 'application/epub+zip'
      : ext === 'zip'
        ? 'application/zip'
        : 'application/octet-stream';
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultFileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
