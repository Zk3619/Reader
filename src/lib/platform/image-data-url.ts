/**
 * 将本地图片字节转为 data URL（分块 base64，避免大文件栈溢出）
 */

import { pickFile } from '@/lib/platform/fs/pick-file';
import type { FilePickerFilter } from '@/lib/platform/fs/pick-types';
import { readBytes } from '@/lib/platform/fs/read-write';
import { isUserCancelled } from '@/lib/platform/fs/errors';

const BASE64_CHUNK_SIZE = 0x8000;

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

export function mimeTypeForImageFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || 'png';
  const subtype = extension === 'jpg' ? 'jpeg' : extension === 'svg' ? 'svg+xml' : extension;
  return `image/${subtype}`;
}

export function bytesToImageDataUrl(bytes: Uint8Array, fileName: string): string {
  const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return `data:${mimeTypeForImageFileName(fileName)};base64,${uint8ArrayToBase64(normalized)}`;
}

const IMAGE_PICKER_FILTERS: FilePickerFilter[] = [
  {
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
  },
];

/** 打开文件选择器并读取为 data URL；用户取消返回 null */
export async function pickLocalImageAsDataUrl(): Promise<string | null> {
  try {
    const picked = await pickFile({ filters: IMAGE_PICKER_FILTERS });
    const fileData = await readBytes(picked.ref);
    const uint8Array = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
    return bytesToImageDataUrl(uint8Array, picked.fileName);
  } catch (error) {
    if (isUserCancelled(error)) return null;
    throw error;
  }
}
