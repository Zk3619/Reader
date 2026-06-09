/**
 * 漫画图片磁盘路径：按书分桶 + URL 全局索引
 */

import { join } from '@tauri-apps/api/path';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';

const INDEX_DIR = '_url';
const LEGACY_FLAT = '_legacy';

export async function getMangaBookFolderKey(bookUrl: string): Promise<string> {
  const trimmed = bookUrl.trim();
  const enc = new TextEncoder().encode(trimmed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function getMangaImageUrlKey(
  imageUrl: string,
  sourceId?: string,
): Promise<string> {
  const normalized = normalizeImageUrl(imageUrl.trim());
  const payload = `${normalized}\0${sourceId ?? ''}`;
  const enc = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function mangaImageIndexDir(root: string): string {
  return `${root}/${INDEX_DIR}`;
}

export function mangaImageUrlIndexPath(root: string, urlKey: string): string {
  return `${mangaImageIndexDir(root)}/${urlKey}.json`;
}

export async function mangaImageBucketDir(
  root: string,
  bookKey: string,
  urlKey: string,
): Promise<string> {
  return join(root, bookKey, urlKey);
}

export function mangaImageLegacyDir(root: string, urlKey: string): string {
  return `${root}/${LEGACY_FLAT}/${urlKey}`;
}

export type MangaImageUrlIndexEntry = {
  bookKey: string;
  urlKey: string;
};
