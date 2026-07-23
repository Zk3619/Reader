/**
 * 本地片库封面缓存（E2.2）：mtime+size 作键，落盘 JPEG
 */

import { join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';
import { getLocalSeekThumbnail } from '@/lib/media/video/playback/local-thumb';
import type { LocalVideoItem } from '@/lib/media/video/library/local-scan';

const COVER_SUBDIR = 'covers';
const META_NAME = 'meta.json';
const mem = new Map<string, string>();

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function coverCacheKey(item: Pick<LocalVideoItem, 'path' | 'size' | 'mtime'>): string {
  return hashKey(`${item.path}|${item.size ?? 0}|${item.mtime ?? 0}`);
}

async function coverDir(): Promise<string> {
  const root = await resolveModuleMediaRoot('video');
  return join(root, COVER_SUBDIR);
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/\w+;base64,(.+)$/i.exec(dataUrl);
  if (!m?.[1]) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 返回可给 <img src> 的 URL；失败 null */
export async function getLocalVideoCoverUrl(
  item: LocalVideoItem,
  opts?: { force?: boolean },
): Promise<string | null> {
  const key = coverCacheKey(item);
  if (!opts?.force) {
    const hit = mem.get(key);
    if (hit) return hit;
  } else {
    mem.delete(key);
  }

  if (isTauri()) {
    try {
      const dir = await coverDir();
      const file = await join(dir, `${key}.jpg`);
      const fs = await getFileSystem();
      if (opts?.force && (await fs.exists(file))) {
        await fs.remove(file);
      } else if (!opts?.force && (await fs.exists(file))) {
        const url = convertFileSrc(file);
        mem.set(key, url);
        return url;
      }
    } catch {
      /* fall through */
    }
  } else {
    try {
      if (opts?.force) {
        localStorage.removeItem(`reader.video.cover.${key}`);
      } else {
        const raw = localStorage.getItem(`reader.video.cover.${key}`);
        if (raw) {
          mem.set(key, raw);
          return raw;
        }
      }
    } catch {
      /* */
    }
  }

  const thumb = await getLocalSeekThumbnail(item.path, 5);
  if (!thumb) return null;

  if (isTauri()) {
    try {
      const bytes = dataUrlToBytes(thumb);
      if (bytes) {
        const dir = await coverDir();
        const fs = await getFileSystem();
        await fs.mkdir(dir, true);
        const file = await join(dir, `${key}.jpg`);
        await fs.writeFile(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        const meta = await join(dir, META_NAME);
        try {
          await fs.writeTextFile(
            meta,
            JSON.stringify({ updatedAt: Date.now(), key, path: item.path }),
          );
        } catch {
          /* */
        }
        const url = convertFileSrc(file);
        mem.set(key, url);
        return url;
      }
    } catch {
      /* use data url */
    }
  } else {
    try {
      localStorage.setItem(`reader.video.cover.${key}`, thumb);
    } catch {
      /* quota */
    }
  }

  mem.set(key, thumb);
  return thumb;
}

/** 后台为列表预热封面（限并发） */
export async function warmupLocalCovers(
  items: LocalVideoItem[],
  opts?: {
    concurrency?: number;
    force?: boolean;
    onOne?: (path: string, url: string | null) => void;
  },
): Promise<void> {
  const concurrency = opts?.concurrency ?? 2;
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      const it = items[idx];
      if (!it) break;
      const url = await getLocalVideoCoverUrl(it, { force: opts?.force });
      opts?.onOne?.(it.path, url);
    }
  });
  await Promise.all(workers);
}
