/**
 * 弹幕离线缓存 DB 索引
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';
import type { VideoCacheTier } from '@/lib/media/video/cache/video-cache-tier';
import { normalizeVideoCacheTier } from '@/lib/media/video/cache/video-cache-tier';

export type VideoDanmakuCacheRow = {
  vodKey: string;
  episode: number;
  searchTitle: string;
  source: string;
  label: string;
  filePath: string | null;
  cacheBytes: number;
  cacheTier: VideoCacheTier;
  cachedAt: number;
};

type DbRow = {
  vod_key: string;
  episode: number;
  search_title: string | null;
  source: string | null;
  label: string | null;
  file_path: string | null;
  cache_bytes: number | null;
  cache_tier: string | null;
  cached_at: number | null;
};

function mapRow(r: DbRow): VideoDanmakuCacheRow {
  return {
    vodKey: r.vod_key,
    episode: r.episode,
    searchTitle: r.search_title || '',
    source: r.source || '',
    label: r.label || '',
    filePath: r.file_path,
    cacheBytes: r.cache_bytes || 0,
    cacheTier: normalizeVideoCacheTier(r.cache_tier),
    cachedAt: r.cached_at || 0,
  };
}

export async function upsertVideoDanmakuCacheIndex(meta: {
  vodKey: string;
  episode: number;
  searchTitle: string;
  source: string;
  label: string;
  filePath?: string | null;
  cacheBytes: number;
  cacheTier: VideoCacheTier;
  cachedAt: number;
}): Promise<void> {
  const db = await getDatabase();
  const t = VideoTables.danmakuCache;
  await db.execute(
    `INSERT INTO ${t} (
      vod_key, episode, search_title, source, label, file_path,
      cache_bytes, cache_tier, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vod_key, episode) DO UPDATE SET
      search_title = excluded.search_title,
      source = excluded.source,
      label = excluded.label,
      file_path = excluded.file_path,
      cache_bytes = excluded.cache_bytes,
      cache_tier = excluded.cache_tier,
      cached_at = excluded.cached_at`,
    [
      meta.vodKey,
      meta.episode,
      meta.searchTitle,
      meta.source,
      meta.label,
      meta.filePath ?? null,
      meta.cacheBytes,
      meta.cacheTier,
      meta.cachedAt,
    ],
  );
}

export async function getVideoDanmakuCacheIndex(
  vodKey: string,
  episode: number,
): Promise<VideoDanmakuCacheRow | null> {
  const db = await getDatabase();
  const rows = await db.select<DbRow>(
    `SELECT * FROM ${VideoTables.danmakuCache} WHERE vod_key = ? AND episode = ? LIMIT 1`,
    [vodKey, episode],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteVideoDanmakuCacheIndex(
  vodKey: string,
  episode: number,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${VideoTables.danmakuCache} WHERE vod_key = ? AND episode = ?`,
    [vodKey, episode],
  );
}

export async function clearVideoDanmakuCacheIndexByTier(
  tier: VideoCacheTier | 'all',
): Promise<number> {
  const db = await getDatabase();
  const t = VideoTables.danmakuCache;
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

export async function listVideoDanmakuCacheIndex(): Promise<VideoDanmakuCacheRow[]> {
  const db = await getDatabase();
  const rows = await db.select<DbRow>(
    `SELECT * FROM ${VideoTables.danmakuCache} ORDER BY cached_at DESC`,
  );
  return rows.map(mapRow);
}

export async function getVideoDanmakuCacheIndexStats(): Promise<{
  count: number;
  autoCount: number;
  manualCount: number;
  totalBytes: number;
}> {
  const db = await getDatabase();
  const t = VideoTables.danmakuCache;
  const rows = await db.select<{
    count: number;
    auto_count: number;
    manual_count: number;
    total_bytes: number;
  }>(
    `SELECT
      COUNT(*) as count,
      SUM(CASE WHEN cache_tier = 'manual' THEN 1 ELSE 0 END) as manual_count,
      SUM(CASE WHEN cache_tier = 'auto' OR cache_tier IS NULL OR cache_tier = '' THEN 1 ELSE 0 END) as auto_count,
      COALESCE(SUM(cache_bytes), 0) as total_bytes
     FROM ${t}`,
  );
  const r = rows[0];
  return {
    count: r?.count ?? 0,
    autoCount: r?.auto_count ?? 0,
    manualCount: r?.manual_count ?? 0,
    totalBytes: r?.total_bytes ?? 0,
  };
}

/* ---- override 持久化 ---- */

export type VideoDanmakuOverrideRow = {
  vodKey: string;
  title: string;
  episodeNo: number | null;
  skipClean: boolean;
  updatedAt: number;
};

export async function upsertVideoDanmakuOverride(row: {
  vodKey: string;
  title: string;
  episodeNo?: number | null;
  skipClean?: boolean;
}): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO ${VideoTables.danmakuOverride} (
      vod_key, title, episode_no, skip_clean, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(vod_key) DO UPDATE SET
      title = excluded.title,
      episode_no = excluded.episode_no,
      skip_clean = excluded.skip_clean,
      updated_at = excluded.updated_at`,
    [
      row.vodKey,
      row.title.trim(),
      row.episodeNo ?? null,
      row.skipClean ? 1 : 0,
      Date.now(),
    ],
  );
}

export async function deleteVideoDanmakuOverride(vodKey: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${VideoTables.danmakuOverride} WHERE vod_key = ?`,
    [vodKey],
  );
}

export async function listVideoDanmakuOverrides(): Promise<VideoDanmakuOverrideRow[]> {
  const db = await getDatabase();
  const rows = await db.select<{
    vod_key: string;
    title: string;
    episode_no: number | null;
    skip_clean: number | null;
    updated_at: number | null;
  }>(`SELECT * FROM ${VideoTables.danmakuOverride}`);
  return rows.map((r) => ({
    vodKey: r.vod_key,
    title: r.title || '',
    episodeNo: r.episode_no,
    skipClean: (r.skip_clean || 0) === 1,
    updatedAt: r.updated_at || 0,
  }));
}
