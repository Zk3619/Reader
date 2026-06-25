/**
 * Cookie 管理（对外兼容层，实现见 cookie-jar.ts）
 */

import {
  removeJarCookies,
  saveSetCookieLines,
} from '@/lib/http/cookie-jar';

export { getSubDomain, getJarCookie, replacePersistentCookie, saveSetCookieLines } from '@/lib/http/cookie-jar';

/**
 * 单条 Set-Cookie 写入（兼容旧调用）
 */
export async function saveCookie(url: string, setCookieHeader: string): Promise<void> {
  if (!setCookieHeader?.trim()) return;
  await saveSetCookieLines(url, [setCookieHeader]);
}

export async function deleteCookie(url: string): Promise<void> {
  await removeJarCookies(url);
}

export async function clearAllCookies(): Promise<void> {
  try {
    const { getDatabase } = await import('@/lib/database/database-core');
    const { clearSessionCookies } = await import('@/lib/http/cookie-jar');
    const db = await getDatabase();
    await db.execute('DELETE FROM cookies');
    clearSessionCookies();
  } catch (error) {
    console.error('清空Cookie失败:', error);
  }
}
