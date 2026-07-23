/**
 * 影视 WebDAV 多账户（E2.E 深化）
 */

export type VideoWebDavAccount = {
  id: string;
  name: string;
  /** 相对根路径，如 video */
  rootPath: string;
  /** 可选：覆盖主程序 WebDAV 的备注 */
  note?: string;
};

const ACCOUNTS_KEY = 'reader.video.webdavAccounts.v1';
const ACTIVE_KEY = 'reader.video.webdavActiveId';

export function loadVideoWebDavAccounts(): VideoWebDavAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as VideoWebDavAccount[];
    return Array.isArray(arr) ? arr.filter((a) => a && a.id && a.rootPath) : [];
  } catch {
    return [];
  }
}

export function saveVideoWebDavAccounts(list: VideoWebDavAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
}

export function getActiveVideoWebDavAccountId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveVideoWebDavAccountId(id: string | null): void {
  try {
    if (!id) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* */
  }
}

export function upsertVideoWebDavAccount(
  account: Omit<VideoWebDavAccount, 'id'> & { id?: string },
): VideoWebDavAccount {
  const list = loadVideoWebDavAccounts();
  const id = account.id || `dav-${Date.now()}`;
  const next: VideoWebDavAccount = {
    id,
    name: account.name.trim() || id,
    rootPath: account.rootPath.trim().replace(/^\/+|\/+$/g, '') || 'video',
    note: account.note,
  };
  const idx = list.findIndex((a) => a.id === id);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveVideoWebDavAccounts(list);
  return next;
}

export function removeVideoWebDavAccount(id: string): void {
  saveVideoWebDavAccounts(loadVideoWebDavAccounts().filter((a) => a.id !== id));
  if (getActiveVideoWebDavAccountId() === id) setActiveVideoWebDavAccountId(null);
}
