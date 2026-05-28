/**
 * WebJs / 登录后 Cookie 回写（统一走 source-cookie-pool）
 */

import type { BookSource } from '@/types';
import { syncSourceCookiePool } from '@/lib/book-source/source-cookie-pool';

/** 从 backstage / inner-web / 代理会话 拉取并双向同步书源 Cookie 表 */
export async function syncBackstageWebViewCookies(
  source: BookSource,
  pageUrl: string,
): Promise<void> {
  await syncSourceCookiePool(source, pageUrl);
}
