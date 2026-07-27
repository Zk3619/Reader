/**
 * 影视 WebDAV 账户与根路径（原片库配置，现由收藏「远程影视」使用）
 */

export type VideoWebDavAccount = {
  id: string;
  name: string;
  /** 相对根路径，如 video */
  rootPath: string;
  note?: string;
};

const ACCOUNTS_KEY = 'reader.video.webdavAccounts.v1';
const ACTIVE_KEY = 'reader.video.webdavActiveId';
const ROOT_KEY = 'reader.video.webdavRoot';
const DEFAULT_VIDEO_ROOT = 'video';

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
    rootPath: account.rootPath.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_VIDEO_ROOT,
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

export function getVideoWebDavRoot(): string {
  try {
    const activeId = getActiveVideoWebDavAccountId();
    if (activeId) {
      const acc = loadVideoWebDavAccounts().find((a) => a.id === activeId);
      if (acc?.rootPath) return acc.rootPath;
    }
    return (localStorage.getItem(ROOT_KEY) || DEFAULT_VIDEO_ROOT)
      .trim()
      .replace(/^\/+|\/+$/g, '');
  } catch {
    return DEFAULT_VIDEO_ROOT;
  }
}

export function setVideoWebDavRoot(path: string): void {
  try {
    localStorage.setItem(ROOT_KEY, path.trim().replace(/^\/+|\/+$/g, ''));
  } catch {
    /* */
  }
}
