/**
 * 影视 WebDAV 直连列表 / 目录树（E4 / E2.1c）——复用主程序 WebDAV 配置
 */

import { WebDavClient, type WebDavFileInfo } from '@/lib/remote-book/webdav-client';
import {
  buildRootWebDavUrl,
  loadWebDavConfig,
} from '@/lib/remote-book/webdav-config-storage';
import { isVideoFileName } from '@/lib/media/video/library/local-scan';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';
import {
  getActiveVideoWebDavAccountId,
  loadVideoWebDavAccounts,
} from '@/lib/media/video/library/webdav-accounts';

export type VideoWebDavItem = {
  path: string;
  name: string;
  href: string;
  isDir?: boolean;
};

const DEFAULT_VIDEO_ROOT = 'video';
const ROOT_KEY = 'reader.video.webdavRoot';

export async function createWebDavVideoClient(): Promise<{
  client: WebDavClient;
  rootVideoPath: string;
} | null> {
  const config = await loadWebDavConfig();
  if (!config) return null;
  const client = new WebDavClient(
    buildRootWebDavUrl(config),
    config.username,
    config.password,
  );
  const rootVideoPath = getVideoWebDavRoot();
  return { client, rootVideoPath };
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

async function walkVideos(
  client: WebDavClient,
  path: string,
  depth: number,
  maxDepth: number,
  out: WebDavFileInfo[],
): Promise<void> {
  if (depth > maxDepth) return;
  let entries: WebDavFileInfo[] = [];
  try {
    entries = await client.listFiles(path);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDir) {
      await walkVideos(client, entry.path, depth + 1, maxDepth, out);
    } else if (isVideoFileName(entry.displayName || entry.path)) {
      out.push(entry);
    }
  }
}

export async function listWebDavVideos(maxDepth = 3): Promise<VideoWebDavItem[]> {
  const ctx = await createWebDavVideoClient();
  if (!ctx) return [];
  const { client, rootVideoPath } = ctx;
  const files: WebDavFileInfo[] = [];
  await walkVideos(client, rootVideoPath || '/', 0, maxDepth, files);
  return files.map((f) => ({
    path: f.path,
    name: f.displayName || f.path.split('/').pop() || f.path,
    href: f.path,
  }));
}

/** 单层目录浏览（目录树） */
export async function listWebDavDir(path?: string): Promise<VideoWebDavItem[]> {
  const ctx = await createWebDavVideoClient();
  if (!ctx) return [];
  const { client, rootVideoPath } = ctx;
  const target = (path ?? (rootVideoPath || '/')).replace(/\/+$/, '') || '/';
  let entries: WebDavFileInfo[] = [];
  try {
    entries = await client.listFiles(target);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  return entries
    .map((f) => ({
      path: f.path,
      name: f.displayName || f.path.split('/').pop() || f.path,
      href: f.path,
      isDir: f.isDir,
    }))
    .filter((f) => f.isDir || isVideoFileName(f.name))
    .sort((a, b) => {
      if (!!a.isDir !== !!b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function parentWebDavPath(path: string, root: string): string | null {
  const norm = path.replace(/\/+$/, '');
  const r = (root || '').replace(/\/+$/, '');
  if (!norm || norm === r || norm === '/' || norm === r + '/') return null;
  const i = norm.lastIndexOf('/');
  if (i <= 0) return r || '/';
  const parent = norm.slice(0, i);
  if (r && !parent.startsWith(r) && parent !== r) return r || '/';
  return parent || r || '/';
}

/** 建议播放引擎：WebDAV 文件默认 libmpv */
export function engineForWebDavItem(href: string) {
  return resolvePlaybackEngine({ url: href, sourceKind: 'webdav' });
}
