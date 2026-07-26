/**
 * 影视剧集磁盘缓存
 * Tauri：{videoRoot}/video-cache/episodes/{id}/video.bin + meta.json
 * HLS VOD：边播边缓存写 hls/seg_*.ts + index.m3u8（见 video-progressive-cache）
 * 直播 HLS：仅写 meta + DB
 */

import { join } from '@tauri-apps/api/path';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';
import {
  mergeVideoCacheTier,
  normalizeVideoCacheTier,
  type VideoCacheTier,
} from '@/lib/media/video/cache/video-cache-tier';

const CACHE_SUBDIR = 'video-cache';
const EPISODES_SUBDIR = 'episodes';
const LEGACY_SUBDIR = 'video-episode-cache';
const BIN_FILE = 'video.bin';
const META_FILE = 'meta.json';

/** auto 级容量上限（仅淘汰 auto；manual 保留） */
export const MAX_VIDEO_AUTO_CACHE_BYTES = 2 * 1024 * 1024 * 1024;

export type VideoEpisodeCacheMeta = {
  id: string;
  bgmId?: number;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
  savedAt: number;
  byteSize: number;
  localPath?: string;
  cacheTier?: VideoCacheTier;
  mime?: string;
  isHls?: boolean;
  hasMedia?: boolean;
};

/** @deprecated 兼容旧名 */
export type EpisodeCacheMeta = VideoEpisodeCacheMeta;

export type VideoCacheStats = {
  count: number;
  autoCount: number;
  manualCount: number;
  totalBytes: number;
  mediaCount: number;
  hlsMetaCount: number;
  seekThumbBytes: number;
  seekThumbSheets: number;
};

let cachedRoot: string | null = null;

export function invalidateVideoCacheDir(): void {
  cachedRoot = null;
}

export function formatVideoCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function isHlsMediaUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url.trim());
}

/** 去掉 CDN 签名等易变参数，避免同一视频因 token 换目录 */
export function normalizeMediaUrlForCacheKey(url: string): string {
  const u = url.trim();
  if (!u) return '';
  try {
    const parsed = new URL(u);
    const keys = [...parsed.searchParams.keys()];
    for (const k of keys) {
      if (
        /^(token|sign|signature|auth|auth_key|key|expires?|expire|e|t|ts|timestamp|nonce|utm_|x-amz-|x-oss-|sig|pwd|us|ue)/i.test(
          k,
        ) ||
        /sign|token|auth|expir|policy/i.test(k)
      ) {
        parsed.searchParams.delete(k);
      }
    }
    // pathname 已含对象身份；残留 query 若仍很长则丢弃
    const q = parsed.searchParams.toString();
    const base = `${parsed.origin}${parsed.pathname}`.toLowerCase();
    if (!q || q.length > 120) return base;
    return `${base}?${q}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function isLikelyMediaFileUrl(url: string): boolean {
  return /\.(mp4|mkv|webm|m3u8|ts|flv|mov|m4v)(\?|$)/i.test(url.trim());
}

/**
 * 稳定缓存 id：优先 bgmId+剧集页 URL；否则用去签名后的 mediaUrl。
 * 前缀 v2，与旧「含完整签名 mediaUrl」的目录隔离，并可通过 findExisting… 复用旧盘。
 */
export function buildVideoEpisodeCacheId(
  bgmId: number | undefined,
  episodeUrl: string,
  mediaUrl: string,
): string {
  const ep = episodeUrl.trim();
  const media = normalizeMediaUrlForCacheKey(mediaUrl);
  const epStable = Boolean(ep) && ep !== mediaUrl.trim() && !isLikelyMediaFileUrl(ep);
  const raw = epStable
    ? `v2|${bgmId ?? 0}|${ep}`
    : `v2|${bgmId ?? 0}|${ep}|${media}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `ep_${Math.abs(h).toString(16)}`;
}

/** @internal */
function cacheId(bgmId: number | undefined, episodeUrl: string, mediaUrl: string): string {
  return buildVideoEpisodeCacheId(bgmId, episodeUrl, mediaUrl);
}

/**
 * 按剧集键解析已有缓存：先新 id，再扫盘匹配 episodeUrl / 规范化 mediaUrl，
 * 避免同一集因签名 URL 变更反复落到新目录。
 */
export async function resolveVideoEpisodeCacheHit(input: {
  bgmId?: number;
  episodeUrl: string;
  mediaUrl: string;
}): Promise<{ meta: VideoEpisodeCacheMeta; localPath: string; id: string } | null> {
  if (!isTauri()) return null;
  const id = cacheId(input.bgmId, input.episodeUrl, input.mediaUrl);
  const direct = await getCachedVideoEpisode(id);
  if (direct?.meta.hasMedia && direct.localPath) {
    return { ...direct, id };
  }
  const ep = input.episodeUrl.trim();
  const mediaNorm = normalizeMediaUrlForCacheKey(input.mediaUrl);
  const bgm = input.bgmId ?? 0;
  try {
    const list = await listVideoEpisodeCache();
    for (const meta of list) {
      if (!meta.hasMedia) continue;
      const sameEp =
        ep &&
        meta.episodeUrl?.trim() === ep &&
        (meta.bgmId ?? 0) === bgm;
      const sameMedia =
        mediaNorm &&
        normalizeMediaUrlForCacheKey(meta.mediaUrl || '') === mediaNorm &&
        (meta.bgmId ?? 0) === bgm;
      if (!sameEp && !sameMedia) continue;
      const hit = await getCachedVideoEpisode(meta.id);
      if (hit?.meta.hasMedia && hit.localPath) {
        return { ...hit, id: meta.id };
      }
    }
  } catch {
    /* */
  }
  return null;
}

export async function resolveVideoEpisodeCacheDir(id: string): Promise<string> {
  return episodeDir(id);
}

/** 供边播边缓存完成后写 meta / DB */
export async function finalizeVideoEpisodeCacheMeta(
  meta: VideoEpisodeCacheMeta,
): Promise<void> {
  if (!isTauri()) return;
  const dir = await episodeDir(meta.id);
  await writeMetaToDir(dir, meta);
  await syncDb(meta);
  void evictAutoVideoCachesIfNeeded().catch(() => undefined);
}


async function ensureCacheRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const moduleRoot = await resolveModuleMediaRoot('video');
  const dir = await join(moduleRoot, CACHE_SUBDIR);
  const fs = await getFileSystem();
  if (!(await fs.exists(dir))) await fs.mkdir(dir, true);
  const episodes = await join(dir, EPISODES_SUBDIR);
  if (!(await fs.exists(episodes))) await fs.mkdir(episodes, true);
  cachedRoot = dir;
  return dir;
}

async function episodeDir(id: string): Promise<string> {
  const root = await ensureCacheRoot();
  return join(root, EPISODES_SUBDIR, id);
}

async function syncDb(meta: VideoEpisodeCacheMeta): Promise<void> {
  try {
    const { upsertVideoEpisodeCacheIndex } = await import(
      '@/lib/database/video-episode-cache'
    );
    await upsertVideoEpisodeCacheIndex({
      id: meta.id,
      title: meta.title,
      episodeUrl: meta.episodeUrl,
      mediaUrl: meta.mediaUrl,
      bgmId: meta.bgmId ?? null,
      cachePath: `episodes/${meta.id}`,
      cacheTier: normalizeVideoCacheTier(meta.cacheTier),
      cachedAt: meta.savedAt,
      cacheBytes: meta.byteSize || 0,
      cacheMime: meta.mime ?? null,
      localPath: meta.localPath ?? null,
      isHls: !!meta.isHls,
      hasMedia: !!meta.hasMedia,
    });
  } catch (e) {
    console.warn('[video-cache] db sync', e);
  }
}

async function readMetaFromDir(dir: string): Promise<VideoEpisodeCacheMeta | null> {
  try {
    const fs = await getFileSystem();
    const metaPath = await join(dir, META_FILE);
    if (!(await fs.exists(metaPath))) return null;
    const text = await fs.readTextFile(metaPath);
    return JSON.parse(text) as VideoEpisodeCacheMeta;
  } catch {
    return null;
  }
}

async function writeMetaToDir(dir: string, meta: VideoEpisodeCacheMeta): Promise<void> {
  const fs = await getFileSystem();
  await fs.mkdir(dir, true);
  await fs.writeTextFile(await join(dir, META_FILE), JSON.stringify(meta, null, 2));
}

/** 迁移旧版扁平 video-episode-cache/{id}.json|.bin */
async function migrateLegacyFlatCache(): Promise<void> {
  if (!isTauri()) return;
  try {
    const fs = await getFileSystem();
    const moduleRoot = await resolveModuleMediaRoot('video');
    const legacy = await join(moduleRoot, LEGACY_SUBDIR);
    if (!(await fs.exists(legacy))) return;
    const names = await fs.readDir(legacy);
    for (const name of names || []) {
      if (!name.endsWith('.json')) continue;
      const id = name.replace(/\.json$/i, '');
      const dest = await episodeDir(id);
      if (await fs.exists(await join(dest, META_FILE))) continue;
      try {
        const text = await fs.readTextFile(await join(legacy, name));
        const meta = JSON.parse(text) as VideoEpisodeCacheMeta;
        meta.id = meta.id || id;
        meta.cacheTier = normalizeVideoCacheTier(meta.cacheTier);
        const binSrc = await join(legacy, `${id}.bin`);
        await fs.mkdir(dest, true);
        if (await fs.exists(binSrc)) {
          const bytes = await fs.readFile(binSrc);
          await fs.writeFile(await join(dest, BIN_FILE), bytes);
          meta.localPath = await join(dest, BIN_FILE);
          meta.byteSize = bytes.byteLength;
          meta.hasMedia = true;
        }
        await writeMetaToDir(dest, meta);
        await syncDb(meta);
      } catch {
        /* continue */
      }
    }
  } catch {
    /* ignore */
  }
}

export async function getCachedVideoEpisode(
  id: string,
): Promise<{ meta: VideoEpisodeCacheMeta; localPath: string } | null> {
  if (!isTauri()) return null;
  await migrateLegacyFlatCache();
  const dir = await episodeDir(id);
  const meta = await readMetaFromDir(dir);
  if (!meta) return null;
  const bin = await join(dir, BIN_FILE);
  const fs = await getFileSystem();
  if (await fs.exists(bin)) {
    return { meta, localPath: bin };
  }
  if (meta.localPath && (await fs.exists(meta.localPath))) {
    return { meta, localPath: meta.localPath };
  }
  return null;
}

export async function getCachedVideoEpisodeByKeys(input: {
  bgmId?: number;
  episodeUrl: string;
  mediaUrl: string;
}): Promise<{ meta: VideoEpisodeCacheMeta; localPath: string } | null> {
  const hit = await resolveVideoEpisodeCacheHit(input);
  if (!hit) return null;
  return { meta: hit.meta, localPath: hit.localPath };
}

/**
 * 尽力缓存直链整文件；HLS 仅记录 meta。
 * 本地路径不复制，只记索引。
 */
export async function cacheVideoEpisode(input: {
  bgmId?: number;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
  tier?: VideoCacheTier;
  headers?: Record<string, string>;
}): Promise<VideoEpisodeCacheMeta | null> {
  if (!isTauri()) return null;
  const hit = await resolveVideoEpisodeCacheHit({
    bgmId: input.bgmId,
    episodeUrl: input.episodeUrl,
    mediaUrl: input.mediaUrl,
  });
  const id = hit?.id || cacheId(input.bgmId, input.episodeUrl, input.mediaUrl);
  const mediaUrl = input.mediaUrl.trim();
  const isHls = isHlsMediaUrl(mediaUrl);
  const requested = input.tier ?? 'auto';

  try {
    const dir = await episodeDir(id);
    const existing = hit?.meta || (await readMetaFromDir(dir));
    const tier = mergeVideoCacheTier(
      existing?.cacheTier ? normalizeVideoCacheTier(existing.cacheTier) : undefined,
      requested,
    );

    // 已有 manual 媒体时，auto 不覆盖文件体
    if (
      existing &&
      normalizeVideoCacheTier(existing.cacheTier) === 'manual' &&
      requested === 'auto' &&
      existing.hasMedia
    ) {
      const keep = { ...existing, cacheTier: 'manual' as const };
      await writeMetaToDir(dir, keep);
      await syncDb(keep);
      return keep;
    }

    const meta: VideoEpisodeCacheMeta = {
      id,
      bgmId: input.bgmId,
      title: input.title,
      episodeUrl: input.episodeUrl,
      mediaUrl,
      savedAt: Date.now(),
      byteSize: existing?.byteSize || 0,
      cacheTier: tier,
      isHls,
      hasMedia: false,
      localPath: existing?.localPath,
      mime: existing?.mime,
    };

    if (isHls) {
      await writeMetaToDir(dir, meta);
      await syncDb(meta);
      void syncDanmakuCacheForEpisode(input, tier).catch(() => undefined);
      return meta;
    }

    // 本地路径：不复制大文件
    if (!/^https?:\/\//i.test(mediaUrl)) {
      meta.localPath = mediaUrl.replace(/^file:\/\//i, '');
      meta.hasMedia = true;
      meta.byteSize = 0;
      await writeMetaToDir(dir, meta);
      await syncDb(meta);
      void syncDanmakuCacheForEpisode(input, tier).catch(() => undefined);
      return meta;
    }

    const res = await fetch(mediaUrl, {
      headers: input.headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const fs = await getFileSystem();
    await fs.mkdir(dir, true);
    const binPath = await join(dir, BIN_FILE);
    await fs.writeFile(binPath, buf);
    meta.byteSize = buf.byteLength;
    meta.localPath = binPath;
    meta.hasMedia = true;
    meta.mime = res.headers.get('content-type') || 'video/mp4';
    await writeMetaToDir(dir, meta);
    await syncDb(meta);
    void evictAutoVideoCachesIfNeeded().catch(() => undefined);
    void syncDanmakuCacheForEpisode(input, tier).catch(() => undefined);
    return meta;
  } catch (e) {
    console.warn('[video-cache]', e);
    return null;
  }
}

/** 剧集缓存成功后，按偏好同步拉取并缓存弹幕 */
async function syncDanmakuCacheForEpisode(
  input: {
    bgmId?: number;
    title: string;
    episodeUrl: string;
    mediaUrl: string;
  },
  tier: VideoCacheTier,
): Promise<void> {
  try {
    const { getBangumiModulePrefs } = await import(
      '@/lib/media/video/bangumi/prefs'
    );
    if (!getBangumiModulePrefs().downloadDanmaku) return;
    const { tryMatchDanmaku } = await import('@/lib/media/video/danmaku/match');
    await tryMatchDanmaku({
      fileNameHint: input.title,
      animeTitle: input.title,
      playUrl: input.mediaUrl || input.episodeUrl,
      bgmSubjectId: input.bgmId && input.bgmId > 0 ? input.bgmId : null,
      vodId: input.bgmId ? `bangumi:${input.bgmId}` : input.episodeUrl,
      siteKey: 'cache',
      cacheTier: tier,
    });
  } catch (e) {
    console.warn('[video-cache] danmaku sync', e);
  }
}

/** @deprecated 兼容旧 API */
export async function cacheBangumiEpisode(input: {
  bgmId?: number;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
}): Promise<VideoEpisodeCacheMeta | null> {
  return cacheVideoEpisode({ ...input, tier: 'auto' });
}

export async function listVideoEpisodeCache(): Promise<VideoEpisodeCacheMeta[]> {
  if (!isTauri()) return [];
  await migrateLegacyFlatCache();
  try {
    const fs = await getFileSystem();
    const root = await ensureCacheRoot();
    const epRoot = await join(root, EPISODES_SUBDIR);
    if (!(await fs.exists(epRoot))) return [];
    const out: VideoEpisodeCacheMeta[] = [];
    for (const name of (await fs.readDir(epRoot)) || []) {
      const meta = await readMetaFromDir(await join(epRoot, name));
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** @deprecated */
export async function listEpisodeCache(): Promise<VideoEpisodeCacheMeta[]> {
  return listVideoEpisodeCache();
}

export async function exportVideoCacheManifest(): Promise<string> {
  const [list, stats] = await Promise.all([
    listVideoEpisodeCache(),
    getVideoCacheStats(),
  ]);
  return JSON.stringify(
    {
      version: 2,
      exportedAt: Date.now(),
      stats,
      items: list,
    },
    null,
    2,
  );
}

/** @deprecated */
export async function exportEpisodeCacheManifest(): Promise<string> {
  return exportVideoCacheManifest();
}

export async function getVideoCacheStats(): Promise<VideoCacheStats> {
  await migrateLegacyFlatCache();
  let disk: VideoCacheStats = {
    count: 0,
    autoCount: 0,
    manualCount: 0,
    totalBytes: 0,
    mediaCount: 0,
    hlsMetaCount: 0,
    seekThumbBytes: 0,
    seekThumbSheets: 0,
  };
  try {
    const list = await listVideoEpisodeCache();
    for (const m of list) {
      disk.count += 1;
      if (normalizeVideoCacheTier(m.cacheTier) === 'manual') disk.manualCount += 1;
      else disk.autoCount += 1;
      disk.totalBytes += m.byteSize || 0;
      if (m.hasMedia || (m.byteSize || 0) > 0 || m.localPath) disk.mediaCount += 1;
      if (m.isHls) disk.hlsMetaCount += 1;
    }
  } catch {
    /* */
  }
  try {
    const { getSeekThumbCacheStats } = await import(
      '@/lib/media/video/playback/sprite-store'
    );
    const thumb = await getSeekThumbCacheStats();
    disk.seekThumbBytes = thumb.totalBytes;
    disk.seekThumbSheets = thumb.sheetCount;
  } catch {
    /* */
  }
  try {
    const { getVideoEpisodeCacheIndexStats } = await import(
      '@/lib/database/video-episode-cache'
    );
    const dbStats = await getVideoEpisodeCacheIndexStats();
    // 以磁盘为准；DB 仅作交叉参考，若磁盘为空则用 DB
    if (disk.count === 0 && dbStats.count > 0) {
      disk.count = dbStats.count;
      disk.autoCount = dbStats.autoCount;
      disk.manualCount = dbStats.manualCount;
      disk.totalBytes = dbStats.totalBytes;
      disk.mediaCount = dbStats.mediaCount;
      disk.hlsMetaCount = dbStats.hlsMetaCount;
    }
  } catch {
    /* */
  }
  return disk;
}

async function removeEpisodeDir(id: string): Promise<void> {
  const fs = await getFileSystem();
  const dir = await episodeDir(id);
  if (await fs.exists(dir)) await fs.remove(dir, true);
  try {
    const { deleteVideoEpisodeCacheIndex } = await import(
      '@/lib/database/video-episode-cache'
    );
    await deleteVideoEpisodeCacheIndex(id);
  } catch {
    /* */
  }
}

/** 仅清除 auto；manual 保留 */
export async function clearAutoVideoCaches(): Promise<number> {
  if (!isTauri()) return 0;
  const list = await listVideoEpisodeCache();
  let n = 0;
  for (const m of list) {
    if (normalizeVideoCacheTier(m.cacheTier) === 'manual') continue;
    await removeEpisodeDir(m.id);
    n += 1;
  }
  return n;
}

export async function clearAllVideoCaches(): Promise<number> {
  if (!isTauri()) return 0;
  const list = await listVideoEpisodeCache();
  let n = 0;
  for (const m of list) {
    await removeEpisodeDir(m.id);
    n += 1;
  }
  try {
    const { clearVideoEpisodeCacheIndexByTier } = await import(
      '@/lib/database/video-episode-cache'
    );
    await clearVideoEpisodeCacheIndexByTier('all');
  } catch {
    /* */
  }
  return n;
}

/** @deprecated 清空全部（含 manual） */
export async function clearEpisodeCache(): Promise<number> {
  return clearAllVideoCaches();
}

export async function evictAutoVideoCachesIfNeeded(
  maxBytes = MAX_VIDEO_AUTO_CACHE_BYTES,
): Promise<number> {
  if (!isTauri()) return 0;
  const list = await listVideoEpisodeCache();
  const autos = list
    .filter((m) => normalizeVideoCacheTier(m.cacheTier) === 'auto' && (m.byteSize || 0) > 0)
    .sort((a, b) => a.savedAt - b.savedAt);
  let total = autos.reduce((s, m) => s + (m.byteSize || 0), 0);
  let removed = 0;
  for (const m of autos) {
    if (total <= maxBytes) break;
    await removeEpisodeDir(m.id);
    total -= m.byteSize || 0;
    removed += 1;
  }
  return removed;
}

/** 扫描磁盘回填 DB */
export async function reconcileVideoEpisodeCacheIndex(): Promise<{
  scanned: number;
  updated: number;
}> {
  const list = await listVideoEpisodeCache();
  let updated = 0;
  for (const m of list) {
    await syncDb(m);
    updated += 1;
  }
  return { scanned: list.length, updated };
}
