/**
 * 影视 WebDAV 直连列表（E4）——复用主程序 WebDAV 配置
 */

import { WebDavClient, type WebDavFileInfo } from '@/lib/remote-book/webdav-client';
import {
  buildRootWebDavUrl,
  loadWebDavConfig,
} from '@/lib/remote-book/webdav-config-storage';
import { isVideoFileName } from '@/lib/media/video/library/local-scan';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';

export type VideoWebDavItem = {
  path: string;
  name: string;
  href: string;
};

const DEFAULT_VIDEO_ROOT = 'video';

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
  const rootVideoPath = (
    localStorage.getItem('reader.video.webdavRoot') || DEFAULT_VIDEO_ROOT
  )
    .trim()
    .replace(/^\/+|\/+$/g, '');
  return { client, rootVideoPath };
}

export function setVideoWebDavRoot(path: string): void {
  try {
    localStorage.setItem('reader.video.webdavRoot', path.trim());
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

/** 建议播放引擎：WebDAV 文件默认 libmpv */
export function engineForWebDavItem(href: string) {
  return resolvePlaybackEngine({ url: href, sourceKind: 'webdav' });
}
