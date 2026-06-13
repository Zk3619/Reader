/**
 * WiFi 传书：接收上传文件并导入本地书籍
 */

import { join } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { writeFile } from '@/lib/platform/filesystem';
import { sanitizeManagedFileName } from '@/lib/platform/fs/managed-storage';
import {
  getBooksDirectory,
  importLocalBookFromContent,
} from '@/lib/local-book/import';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function saveUploadedBytes(fileName: string, content: ArrayBuffer): Promise<string> {
  const safeName = sanitizeManagedFileName(fileName);

  if (isTauri()) {
    const booksDir = await getBooksDirectory();
    const fs = await getFileSystem();
    try {
      await fs.mkdir(booksDir, true);
    } catch {
      /* 目录可能已存在 */
    }
    const bookUrl = await join(booksDir, safeName);
    await fs.writeFile(bookUrl, content);
    return bookUrl;
  }

  const bookUrl = `local::${crypto.randomUUID()}`;
  await writeFile(bookUrl, content);
  return bookUrl;
}

export async function addLocalBookApi(
  postData: string | null,
): Promise<LegadoReturnData<boolean>> {
  if (!postData?.trim()) return legadoErr('fileData 不能为空');

  let payload: { fileName?: string; fileDataBase64?: string };
  try {
    payload = JSON.parse(postData) as { fileName?: string; fileDataBase64?: string };
  } catch {
    return legadoErr('格式不对');
  }

  const fileName = payload.fileName?.trim();
  const fileDataBase64 = payload.fileDataBase64?.trim();
  if (!fileName) return legadoErr('fileName 不能为空');
  if (!fileDataBase64) return legadoErr('fileData 不能为空');

  try {
    const content = decodeBase64ToArrayBuffer(fileDataBase64);
    const bookUrl = await saveUploadedBytes(fileName, content);
    await importLocalBookFromContent(bookUrl, fileName, content);
    return legadoOk(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('书籍库') || msg.includes('目录')) {
      return legadoErr('需先在 Reader 中设置书籍保存位置');
    }
    return legadoErr(`保存书籍错误\n${msg}`);
  }
}
