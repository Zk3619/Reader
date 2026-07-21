/**
 * 跨平台保存文本文件
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import {
  rememberExportFilePath,
  resolveExportDialogDefaultPath,
  resolveSilentExportFilePath,
} from '@/lib/export/export-location';
import type { MediaModuleKey } from '@/lib/media/media-root';

export class SaveTextFileCancelledError extends Error {
  constructor() {
    super('用户取消保存');
    this.name = 'SaveTextFileCancelledError';
  }
}

export async function saveTextFile(
  defaultFileName: string,
  content: string,
  options?: { moduleKey?: MediaModuleKey },
): Promise<void> {
  if (isTauri()) {
    const silentPath =
      options?.moduleKey != null
        ? await resolveSilentExportFilePath(options.moduleKey, defaultFileName)
        : null;
    if (silentPath) {
      const encoder = new TextEncoder();
      await writeFile(silentPath, encoder.encode(content));
      await rememberExportFilePath(silentPath);
      return;
    }

    const defaultPath = await resolveExportDialogDefaultPath(defaultFileName);
    const path = await save({
      defaultPath,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (!path) {
      throw new SaveTextFileCancelledError();
    }
    const encoder = new TextEncoder();
    await writeFile(path, encoder.encode(content));
    await rememberExportFilePath(path);
    return;
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultFileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
