/**
 * WebDAV 配置持久化（远程书籍 + 云备份共用）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import type { WebDavConfig } from '@/types/remote-book';

export const WEBDAV_CONFIG_KEY = 'webdav_config';
export const DEFAULT_WEBDAV_URL = 'https://dav.jianguoyun.com/dav/';
export const DEFAULT_WEBDAV_DIR = 'legado';
export const DEFAULT_ROOT_BOOK_PATH = 'books';

export function getDefaultDeviceName(): string {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) return 'Reader-Windows';
    if (/Mac/i.test(ua)) return 'Reader-macOS';
    if (/Android/i.test(ua)) return 'Reader-Android';
    if (/iPhone|iPad/i.test(ua)) return 'Reader-iOS';
    if (/Linux/i.test(ua)) return 'Reader-Linux';
  }
  return 'Reader-Web';
}

export function sanitizeDeviceName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'Reader';
}

export function normalizeWebDavConfig(raw: Partial<WebDavConfig> | null | undefined): WebDavConfig | null {
  const url = raw?.url?.trim();
  const username = raw?.username?.trim();
  const password = raw?.password ?? '';
  if (!url || !username || !password) return null;
  return {
    url,
    username,
    password,
    serverID: raw?.serverID,
    rootBookPath: raw?.rootBookPath?.trim() || DEFAULT_ROOT_BOOK_PATH,
    webDavDir: raw?.webDavDir?.trim() || DEFAULT_WEBDAV_DIR,
    deviceName: sanitizeDeviceName(raw?.deviceName?.trim() || getDefaultDeviceName()),
    autoBackupEnabled: raw?.autoBackupEnabled === true,
    autoCheckNewBackup: raw?.autoCheckNewBackup !== false,
    lastBackupTime: raw?.lastBackupTime,
    lastRemoteBackupName: raw?.lastRemoteBackupName,
  };
}

/** 构建 Legado 兼容的云同步根 URL：{baseUrl}/{webDavDir}/ */
export function buildRootWebDavUrl(config: WebDavConfig): string {
  let url = config.url.trim().replace(/\/+$/, '');
  if (!url.endsWith('/')) url += '/';
  const dir = (config.webDavDir?.trim() || DEFAULT_WEBDAV_DIR).replace(/^\/+|\/+$/g, '');
  if (dir) url += `${dir}/`;
  return url;
}

export async function loadWebDavConfig(): Promise<WebDavConfig | null> {
  try {
    const saved = await getStorage<WebDavConfig>(WEBDAV_CONFIG_KEY);
    return normalizeWebDavConfig(saved ?? undefined);
  } catch {
    return null;
  }
}

export async function saveWebDavConfig(config: WebDavConfig): Promise<WebDavConfig> {
  const normalized = normalizeWebDavConfig(config);
  if (!normalized) throw new Error('WebDAV 配置不完整');
  await setStorage(WEBDAV_CONFIG_KEY, normalized);
  return normalized;
}

export async function touchWebDavBackupMeta(
  patch: Pick<WebDavConfig, 'lastBackupTime' | 'lastRemoteBackupName'>,
): Promise<WebDavConfig | null> {
  const current = await loadWebDavConfig();
  if (!current) return null;
  return saveWebDavConfig({ ...current, ...patch });
}
