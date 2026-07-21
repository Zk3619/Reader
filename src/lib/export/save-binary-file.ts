/**
 * 跨平台保存二进制文件
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import { SaveTextFileCancelledError } from '@/lib/export/save-text-file';
import {
  rememberExportFilePath,
  resolveExportDialogDefaultPath,
  resolveSilentExportFilePath,
} from '@/lib/export/export-location';
import type { MediaModuleKey } from '@/lib/media/media-root';

export { SaveTextFileCancelledError as SaveBinaryFileCancelledError };

export async function saveBinaryFile(
  defaultFileName: string,
  bytes: Uint8Array,
  filters?: { name: string; extensions: string[] }[],
  options?: { moduleKey?: MediaModuleKey },
): Promise<void> {
  if (isTauri()) {
    const silentPath =
      options?.moduleKey != null
        ? await resolveSilentExportFilePath(options.moduleKey, defaultFileName)
        : null;
    if (silentPath) {
      await writeFile(silentPath, bytes);
      await rememberExportFilePath(silentPath);
      return;
    }

    const defaultPath = await resolveExportDialogDefaultPath(defaultFileName);
    const path = await save({
      defaultPath,
      filters: filters ?? [{ name: 'File', extensions: ['*'] }],
    });
    if (!path) {
      throw new SaveTextFileCancelledError();
    }
    await writeFile(path, bytes);
    await rememberExportFilePath(path);
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
