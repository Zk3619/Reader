/**
 * Cookie管理模块
 * 对应 legado 项目的 CookieManager.kt
 * 
 * 功能：
 * 1. 从数据库读取Cookie
 * 2. 保存Cookie到数据库
 * 3. 解析Set-Cookie响应头
 * 4. 合并多个Cookie
 */

import { getDatabase } from '@/lib/database/database-core';

/**
 * 从数据库获取Cookie
 */
export async function getCookie(url: string): Promise<string | null> {
  try {
    const db = await getDatabase();
    const domain = getDomain(url);

    // 从cookies表查询
    const rows = await db.select<{ cookie: string }>(
      'SELECT cookie FROM cookies WHERE url = ?',
      [domain]
    );

    return rows.length > 0 ? rows[0].cookie : null;
  } catch (error) {
    console.error('获取Cookie失败:', error);
    return null;
  }
}

/**
 * 保存Cookie到数据库
 */
export async function saveCookie(url: string, setCookieHeader: string): Promise<void> {
  try {
    const db = await getDatabase();
    const domain = getDomain(url);

    // 解析Set-Cookie头
    const cookies = parseSetCookie(setCookieHeader);

    if (cookies.length === 0) return;

    // 获取现有Cookie
    const existingCookie = await getCookie(url);
    const existingCookies = existingCookie ? parseCookieString(existingCookie) : {};

    // 合并新Cookie
    cookies.forEach(cookie => {
      existingCookies[cookie.name] = cookie.value;
    });

    // 转换为Cookie字符串
    const cookieString = Object.entries(existingCookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    // 保存到数据库
    await db.execute(
      'INSERT OR REPLACE INTO cookies (url, cookie) VALUES (?, ?)',
      [domain, cookieString]
    );
  } catch (error) {
    console.error('保存Cookie失败:', error);
  }
}

/**
 * 删除Cookie
 */
export async function deleteCookie(url: string): Promise<void> {
  try {
    const db = await getDatabase();
    const domain = getDomain(url);

    await db.execute('DELETE FROM cookies WHERE url = ?', [domain]);
  } catch (error) {
    console.error('删除Cookie失败:', error);
  }
}

/**
 * 清空所有Cookie
 */
export async function clearAllCookies(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute('DELETE FROM cookies');
  } catch (error) {
    console.error('清空Cookie失败:', error);
  }
}

/**
 * 获取URL的域名
 */
function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // 如果URL解析失败，尝试简单提取
    const match = url.match(/https?:\/\/([^\/]+)/);
    return match ? match[1] : url;
  }
}

/**
 * 解析Set-Cookie响应头
 */
function parseSetCookie(setCookieHeader: string): Array<{ name: string; value: string }> {
  const cookies: Array<{ name: string; value: string }> = [];

  // Set-Cookie可能包含多个Cookie，用逗号分隔（但要注意日期中的逗号）
  // 简单处理：按分号分割，取第一个作为name=value
  const parts = setCookieHeader.split(';');
  if (parts.length > 0) {
    const nameValue = parts[0].trim();
    const equalIndex = nameValue.indexOf('=');
    if (equalIndex > 0) {
      cookies.push({
        name: nameValue.substring(0, equalIndex).trim(),
        value: nameValue.substring(equalIndex + 1).trim(),
      });
    }
  }

  return cookies;
}

/**
 * 解析Cookie字符串（name1=value1; name2=value2）
 */
function parseCookieString(cookieString: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieString.split(';').forEach(part => {
    const trimmed = part.trim();
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const name = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      cookies[name] = value;
    }
  });

  return cookies;
}
