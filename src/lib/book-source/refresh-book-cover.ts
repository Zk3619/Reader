import { isSignedImageUrlExpired } from '@/lib/http/signed-cover-url';
import { getBookInfo } from '@/lib/book-source/detail';
import type { BookSource } from '@/types';

/**
 * 从书源重新拉取 thumb_url（签名过期时书架封面 403）。
 */
export async function refreshBookCoverUrl(
  source: BookSource,
  bookUrl: string,
): Promise<string | null> {
  const info = await getBookInfo(source, bookUrl.trim());
  const cover = info?.coverUrl?.trim();
  if (!cover || isSignedImageUrlExpired(cover)) {
    return null;
  }
  return cover;
}
