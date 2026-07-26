/**
 * 影视剧集缓存 DB 索引
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';
import type { VideoCacheTier } from '@/lib/media/video/cache/video-cache-tier';
import { normalizeVideoCacheTier } from '@/lib/media/video/cache/video-cache-tier';

export type VideoEpisodeCacheRow = {
  id: string;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
  bgmId: number | null;
  cachePath: string | null;
  cacheTier: VideoCacheTier;
  cachedAt: number;
  cacheBytes: number;
  cacheMime: string | null;
  localPath: string | null;
  isHls: boolean;
  hasMedia: boolean;
};

type DbRow = {
  id: string;
  title: string;
  episode_url: string;
  media_url: string;
  bgm_id: number | null;
  cache_path: string | null;
  cache_tier: string | null;
  cached_at: number | null;
  cache_bytes: number | null;
  cache_mime: string | null;
  local_path: string | null;
  is_hls: number | null;
  has_media: number | null;
};

function mapRow(r: DbRow): VideoEpisodeCacheRow {
  return {
    id: r.id,
    title: r.title || '',
    episodeUrl: r.episode_url || '',
    mediaUrl: r.media_url || '',
    bgmId: r.bgm_id ?? null,
    cachePath: r.cache_path,
    cacheTier: normalizeVideoCacheTier(r.cache_tier),
    cachedAt: r.cached_at || 0,
    cacheBytes: r.cache_bytes || 0,
    cacheMime: r.cache_mime,
    localPath: r.local_path,
    isHls: (r.is_hls || 0) === 1,
    hasMedia: (r.has_media || 0) === 1,
  };
}

export async function upsertVideoEpisodeCacheIndex(meta: {
  id: string;
  title: string;
  episodeUrl: string;
  mediaUrl: string;
  bgmId?: number | null;
  cachePath?: string | null;
  cacheTier: VideoCacheTier;
  cachedAt: number;
  cacheBytes: number;
  cacheMime?: string | null;
  localPath?: string | null;
  isHls: boolean;
  hasMedia: boolean;
}): Promise<void> {
  const db = await getDatabase();
  const t = VideoTables.episodeCache;
  await db.execute(
    `INSERT INTO ${t} (
      id, title, episode_url, media_url, bgm_id, cache_path, cache_tier,
      cached_at, cache_bytes, cache_mime, local_path, is_hls, has_media
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      episode_url = excluded.episode_url,
      media_url = excluded.media_url,
      bgm_id = excluded.bgm_id,
      cache_path = excluded.cache_path,
      cache_tier = excluded.cache_tier,
      cached_at = excluded.cached_at,
      cache_bytes = excluded.cache_bytes,
      cache_mime = excluded.cache_mime,
      local_path = excluded.local_path,
      is_hls = excluded.is_hls,
      has_media = excluded.has_media`,
    [
      meta.id,
      meta.title,
      meta.episodeUrl,
      meta.mediaUrl,
      meta.bgmId ?? null,
      meta.cachePath ?? null,
      meta.cacheTier,
      meta.cachedAt,
      meta.cacheBytes,
      meta.cacheMime ?? null,
      meta.localPath ?? null,
      meta.isHls ? 1 : 0,
      meta.hasMedia ? 1 : 0,
    ],
  );
}

export async function deleteVideoEpisodeCacheIndex(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.episodeCache} WHERE id = ?`, [id]);
}

export async function clearVideoEpisodeCacheIndexByTier(
  tier: VideoCacheTier | 'all',
): Promise<number> {
  const db = await getDatabase();
  const t = VideoTables.episodeCache;
  if (tier === 'all') {
    const before = await db.select<{ c: number }>(`SELECT COUNT(*) as c FROM ${t}`);
    await db.execute(`DELETE FROM ${t}`);
    return before[0]?.c ?? 0;
  }
  const before = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${t} WHERE cache_tier = ?`,
    [tier],
  );
  await db.execute(`DELETE FROM ${t} WHERE cache_tier = ?`, [tier]);
  return before[0]?.c ?? 0;
}

export async function listVideoEpisodeCacheIndex(): Promise<VideoEpisodeCacheRow[]> {
  const db = await getDatabase();
  const rows = await db.select<DbRow>(
    `SELECT * FROM ${VideoTables.episodeCache} ORDER BY cached_at DESC`,
  );
  return rows.map(mapRow);
}

export async function getVideoEpisodeCacheIndexStats(): Promise<{
  count: number;
  autoCount: number;
  manualCount: number;
  totalBytes: number;
  mediaCount: number;
  hlsMetaCount: number;
}> {
  const db = await getDatabase();
  const t = VideoTables.episodeCache;
  const rows = await db.select<{
    count: number;
    auto_count: number;
    manual_count: number;
    total_bytes: number;
    media_count: number;
    hls_count: number;
  }>(
    `SELECT
      COUNT(*) as count,
      SUM(CASE WHEN cache_tier = 'manual' THEN 1 ELSE 0 END) as manual_count,
      SUM(CASE WHEN cache_tier = 'auto' OR cache_tier IS NULL OR cache_tier = '' THEN 1 ELSE 0 END) as auto_count,
      COALESCE(SUM(cache_bytes), 0) as total_bytes,
      SUM(CASE WHEN has_media = 1 THEN 1 ELSE 0 END) as media_count,
      SUM(CASE WHEN is_hls = 1 THEN 1 ELSE 0 END) as hls_count
     FROM ${t}`,
  );
  const r = rows[0];
  return {
    count: r?.count ?? 0,
    autoCount: r?.auto_count ?? 0,
    manualCount: r?.manual_count ?? 0,
    totalBytes: r?.total_bytes ?? 0,
    mediaCount: r?.media_count ?? 0,
    hlsMetaCount: r?.hls_count ?? 0,
  };
}
