/**
 * 跨平台保存文本文件
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';

export class SaveTextFileCancelledError extends Error {
  constructor() {
    super('用户取消保存');
    this.name = 'SaveTextFileCancelledError';
  }
}

export async function saveTextFile(
  defaultFileName: string,
  content: string,
): Promise<void> {
  if (isTauri()) {
    const path = await save({
      defaultPath: defaultFileName,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (!path) {
      throw new SaveTextFileCancelledError();
    }
    const encoder = new TextEncoder();
    await writeFile(path, encoder.encode(content));
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
