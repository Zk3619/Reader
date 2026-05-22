/**
 * 打开文件选择器，选取本地书源文件（.json / .txt）
 */

import { pickFile } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';

export async function pickLocalBookSourceFile(): Promise<File | null> {
  try {
    const picked = await pickFile({
      filters: [
        { name: '书源', extensions: ['json', 'txt'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'TXT', extensions: ['txt'] },
      ],
    });
    if (picked.legacyFile) return picked.legacyFile;
    if (picked.bytes) {
      return new File([picked.bytes], picked.fileName, {
        type: picked.fileName.endsWith('.json')
          ? 'application/json'
          : 'text/plain',
      });
    }
    const blob = new Blob([]);
    return new File([blob], picked.fileName);
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
