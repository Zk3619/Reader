/**
 * 弹幕离线缓存：DB 索引 + 落盘 JSON
 * 路径：{videoRoot}/video-cache/danmaku/{hash}.json
 */

import type { Danmu } from 'artplayer-plugin-danmuku';
import { join } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';
import {
  mergeVideoCacheTier,
  normalizeVideoCacheTier,
  type VideoCacheTier,
} from '@/lib/media/video/cache/video-cache-tier';
import {
  clearVideoDanmakuCacheIndexByTier,
  deleteVideoDanmakuCacheIndex,
  getVideoDanmakuCacheIndex,
  getVideoDanmakuCacheIndexStats,
  listVideoDanmakuCacheIndex,
  upsertVideoDanmakuCacheIndex,
} from '@/lib/database/video-danmaku-cache';

const CACHE_SUBDIR = 'video-cache';
const DANMAKU_SUBDIR = 'danmaku';

export type CachedDanmakuPayload = {
  vodKey: string;
  episode: number;
  searchTitle: string;
  source: string;
  label: string;
  danmu: Danmu[];
  cachedAt: number;
  cacheTier: VideoCacheTier;
};

let cachedRoot: string | null = null;

async function danmakuRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const videoRoot = await resolveModuleMediaRoot('video');
  const root = await join(videoRoot, CACHE_SUBDIR, DANMAKU_SUBDIR);
  const fs = await getFileSystem();
  if (!(await fs.exists(root))) {
    await fs.mkdir(root, true);
  }
  cachedRoot = root;
  return root;
}

function hashKey(vodKey: string, episode: number): string {
  const raw = `${vodKey}|${episode}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `d${(h >>> 0).toString(16)}`;
}

async function filePathFor(vodKey: string, episode: number): Promise<string> {
  return join(await danmakuRoot(), `${hashKey(vodKey, episode)}.json`);
}

export async function hasCachedDanmaku(
  vodKey: string,
  episode: number,
): Promise<boolean> {
  if (!vodKey || episode <= 0) return false;
  try {
    const row = await getVideoDanmakuCacheIndex(vodKey, episode);
    if (!row?.filePath) return false;
    if (!isTauri()) return true;
    const fs = await getFileSystem();
    return fs.exists(row.filePath);
  } catch {
    return false;
  }
}

export async function readCachedDanmaku(
  vodKey: string,
  episode: number,
): Promise<CachedDanmakuPayload | null> {
  if (!vodKey || episode <= 0) return null;
  const row = await getVideoDanmakuCacheIndex(vodKey, episode);
  if (!row?.filePath) return null;

  try {
    if (isTauri()) {
      const fs = await getFileSystem();
      if (!(await fs.exists(row.filePath))) return null;
      const text = await fs.readTextFile(row.filePath);
      const parsed = JSON.parse(text) as { danmu?: Danmu[] };
      if (!Array.isArray(parsed.danmu) || !parsed.danmu.length) return null;
      return {
        vodKey: row.vodKey,
        episode: row.episode,
        searchTitle: row.searchTitle,
        source: row.source,
        label: row.label,
        danmu: parsed.danmu,
        cachedAt: row.cachedAt,
        cacheTier: row.cacheTier,
      };
    }
    // Web：尝试 localStorage 兜底（小体积）
    const raw = localStorage.getItem(`reader.danmaku.cache.${hashKey(vodKey, episode)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDanmakuPayload;
    if (!Array.isArray(parsed.danmu) || !parsed.danmu.length) return null;
    return { ...parsed, cachedAt: row.cachedAt, cacheTier: row.cacheTier };
  } catch {
    return null;
  }
}

export async function writeCachedDanmaku(input: {
  vodKey: string;
  episode: number;
  searchTitle: string;
  source: string;
  label: string;
  danmu: Danmu[];
  tier?: VideoCacheTier;
}): Promise<void> {
  if (!input.vodKey || input.episode <= 0 || !input.danmu.length) return;

  const existing = await getVideoDanmakuCacheIndex(input.vodKey, input.episode);
  const requested = input.tier ?? 'auto';
  const tier = mergeVideoCacheTier(
    existing ? existing.cacheTier : undefined,
    requested,
  );

  // manual 不被 auto 覆盖内容时：仍允许刷新时间戳，但若请求 auto 且已有 manual，保留 manual
  const body = JSON.stringify({ danmu: input.danmu, v: 1 });
  const bytes = new TextEncoder().encode(body).length;
  let path: string | null = existing?.filePath ?? null;

  if (isTauri()) {
    path = await filePathFor(input.vodKey, input.episode);
    const fs = await getFileSystem();
    await fs.writeTextFile(path, body);
  } else {
    try {
      localStorage.setItem(
        `reader.danmaku.cache.${hashKey(input.vodKey, input.episode)}`,
        JSON.stringify({
          vodKey: input.vodKey,
          episode: input.episode,
          searchTitle: input.searchTitle,
          source: input.source,
          label: input.label,
          danmu: input.danmu,
          cachedAt: Date.now(),
          cacheTier: tier,
        } satisfies CachedDanmakuPayload),
      );
      path = `ls:${hashKey(input.vodKey, input.episode)}`;
    } catch {
      path = null;
    }
  }

  await upsertVideoDanmakuCacheIndex({
    vodKey: input.vodKey,
    episode: input.episode,
    searchTitle: input.searchTitle,
    source: input.source,
    label: input.label,
    filePath: path,
    cacheBytes: bytes,
    cacheTier: tier,
    cachedAt: Date.now(),
  });
}

export async function promoteDanmakuCacheToManual(
  vodKey: string,
  episode: number,
): Promise<boolean> {
  const hit = await readCachedDanmaku(vodKey, episode);
  if (!hit) return false;
  await writeCachedDanmaku({
    vodKey,
    episode,
    searchTitle: hit.searchTitle,
    source: hit.source,
    label: hit.label,
    danmu: hit.danmu,
    tier: 'manual',
  });
  return true;
}

export async function clearDanmakuCachesByTier(
  tier: VideoCacheTier | 'all',
): Promise<number> {
  const rows = await listVideoDanmakuCacheIndex();
  const targets =
    tier === 'all'
      ? rows
      : rows.filter((r) => normalizeVideoCacheTier(r.cacheTier) === tier);

  if (isTauri()) {
    const fs = await getFileSystem();
    for (const r of targets) {
      if (r.filePath && (await fs.exists(r.filePath))) {
        try {
          await fs.remove(r.filePath);
        } catch {
          /* */
        }
      }
    }
  } else {
    for (const r of targets) {
      try {
        localStorage.removeItem(
          `reader.danmaku.cache.${hashKey(r.vodKey, r.episode)}`,
        );
      } catch {
        /* */
      }
    }
  }

  return clearVideoDanmakuCacheIndexByTier(tier);
}

export async function getDanmakuCacheStats(): Promise<{
  count: number;
  autoCount: number;
  manualCount: number;
  totalBytes: number;
}> {
  try {
    return await getVideoDanmakuCacheIndexStats();
  } catch {
    return { count: 0, autoCount: 0, manualCount: 0, totalBytes: 0 };
  }
}

export async function deleteDanmakuCache(
  vodKey: string,
  episode: number,
): Promise<void> {
  const row = await getVideoDanmakuCacheIndex(vodKey, episode);
  if (row?.filePath && isTauri()) {
    try {
      const fs = await getFileSystem();
      if (await fs.exists(row.filePath)) await fs.remove(row.filePath);
    } catch {
      /* */
    }
  }
  await deleteVideoDanmakuCacheIndex(vodKey, episode);
}

export function invalidateDanmakuCacheDir(): void {
  cachedRoot = null;
}
