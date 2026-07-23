/**
 * WebDAV 当前层封面（E2.3）：Range 前缀 + 本地抽帧缓存；限流手动触发
 */

import { join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';
import { createWebDavVideoClient } from '@/lib/media/video/library/webdav-video';
import { getLocalSeekThumbnail } from '@/lib/media/video/playback/local-thumb';
import type { VideoWebDavItem } from '@/lib/media/video/library/webdav-video';

const COVER_SUBDIR = 'covers-webdav';
const MAX_RANGE = 4 * 1024 * 1024;
const mem = new Map<string, string>();

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/\w+;base64,(.+)$/i.exec(dataUrl);
  if (!m?.[1]) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function coverDir(): Promise<string> {
  const root = await resolveModuleMediaRoot('video');
  return join(root, COVER_SUBDIR);
}

export function webdavCoverKey(item: VideoWebDavItem): string {
  return hashKey(`webdav|${item.path}|${item.href}`);
}

/** 单条：下载前缀 → 临时文件 → 抽帧 → 缓存 */
export async function getWebDavVideoCoverUrl(
  item: VideoWebDavItem,
): Promise<string | null> {
  if (item.isDir) return null;
  const key = webdavCoverKey(item);
  const hit = mem.get(key);
  if (hit) return hit;

  if (isTauri()) {
    try {
      const dir = await coverDir();
      const file = await join(dir, `${key}.jpg`);
      const fs = await getFileSystem();
      if (await fs.exists(file)) {
        const url = convertFileSrc(file);
        mem.set(key, url);
        return url;
      }
    } catch {
      /* */
    }
  }

  const ctx = await createWebDavVideoClient();
  if (!ctx) return null;

  let tempPath: string | null = null;
  try {
    const buf = await ctx.client.downloadRange(item.path, MAX_RANGE - 1);
    if (!buf.byteLength) return null;

    if (isTauri()) {
      const fs = await getFileSystem();
      const root = await resolveModuleMediaRoot('video');
      const tmpDir = await join(root, 'tmp-webdav');
      await fs.mkdir(tmpDir, true);
      const ext = item.name.includes('.') ? item.name.split('.').pop() : 'mp4';
      tempPath = await join(tmpDir, `${key}.${ext}`);
      const bytes = new Uint8Array(buf);
      await fs.writeFile(
        tempPath,
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      const thumb = await getLocalSeekThumbnail(tempPath, 2);
      if (!thumb) return null;

      try {
        const dir = await coverDir();
        await fs.mkdir(dir, true);
        const out = await join(dir, `${key}.jpg`);
        const jpeg = dataUrlToBytes(thumb);
        if (jpeg) {
          await fs.writeFile(
            out,
            jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
          );
          const url = convertFileSrc(out);
          mem.set(key, url);
          return url;
        }
      } catch {
        mem.set(key, thumb);
        return thumb;
      }
      mem.set(key, thumb);
      return thumb;
    }

    // Web：blob + canvas
    const blob = new Blob([buf], { type: 'video/mp4' });
    const obj = URL.createObjectURL(blob);
    try {
      const thumb = await grabBlobFrame(obj, 2);
      if (thumb) {
        try {
          localStorage.setItem(`reader.video.webdavCover.${key}`, thumb);
        } catch {
          /* */
        }
        mem.set(key, thumb);
        return thumb;
      }
    } finally {
      URL.revokeObjectURL(obj);
    }
  } catch {
    return null;
  } finally {
    if (tempPath && isTauri()) {
      try {
        const fs = await getFileSystem();
        await fs.remove(tempPath);
      } catch {
        /* */
      }
    }
  }
  return null;
}

function grabBlobFrame(src: string, sec: number): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(v);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    video.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(sec, Math.max(0, (video.duration || sec) - 0.05));
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = Math.min(320, video.videoWidth || 320);
        const h = Math.round(
          ((video.videoHeight || 180) / Math.max(1, video.videoWidth || 320)) * w,
        );
        canvas.width = w;
        canvas.height = h || 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          window.clearTimeout(timer);
          done(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.clearTimeout(timer);
        done(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    video.src = src;
  });
}

/** 当前层视频限流生成封面（默认最多 8 个、并发 1） */
export async function warmupWebDavCovers(
  items: VideoWebDavItem[],
  opts?: {
    limit?: number;
    onOne?: (path: string, url: string | null) => void;
  },
): Promise<void> {
  const files = items.filter((i) => !i.isDir).slice(0, opts?.limit ?? 8);
  for (const it of files) {
    const url = await getWebDavVideoCoverUrl(it);
    opts?.onOne?.(it.path, url);
  }
}
