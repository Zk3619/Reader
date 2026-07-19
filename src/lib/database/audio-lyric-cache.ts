/**
 * 在线歌词持久化缓存（按 track_id）
 */

import { getDatabase } from '@/lib/database/database-core';
import { AudioTables } from '@/lib/database/table-names';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import { hasLxWordTags, hasLyricContent } from '@/lib/media/audio/lyric-types';

export type AudioLyricCacheRow = {
  trackId: string;
  bundle: LyricBundle;
  hasLx: boolean;
  createdAt: number;
};

function parseBundle(raw: string): LyricBundle | null {
  try {
    const parsed = JSON.parse(raw) as LyricBundle;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      lyric: typeof parsed.lyric === 'string' ? parsed.lyric : parsed.lyric ?? null,
      tlyric: typeof parsed.tlyric === 'string' ? parsed.tlyric : parsed.tlyric ?? null,
      rlyric: typeof parsed.rlyric === 'string' ? parsed.rlyric : parsed.rlyric ?? null,
      lxlyric: typeof parsed.lxlyric === 'string' ? parsed.lxlyric : parsed.lxlyric ?? null,
    };
  } catch {
    return null;
  }
}

export async function getCachedLyricBundle(trackId: string): Promise<LyricBundle | null> {
  const id = trackId.trim();
  if (!id) return null;
  const db = await getDatabase();
  const rows = await db.select<{ lyric_json: string }>(
    `SELECT lyric_json FROM ${AudioTables.lyricCache} WHERE track_id = ?`,
    [id],
  );
  const raw = rows[0]?.lyric_json;
  if (typeof raw !== 'string') return null;
  return parseBundle(raw);
}

export async function upsertCachedLyricBundle(
  trackId: string,
  bundle: LyricBundle | null,
): Promise<void> {
  const id = trackId.trim();
  if (!id) return;
  const normalized: LyricBundle = bundle ?? {};
  const hasLx = hasLxWordTags(normalized.lxlyric) ? 1 : 0;
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO ${AudioTables.lyricCache}
      (track_id, lyric_json, has_lx, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, JSON.stringify(normalized), hasLx, Date.now()],
  );
}

/** 仅缓存已解析结果（含空歌词），避免无歌词曲目反复跨源搜索 */
export async function cacheResolvedLyricBundle(
  trackId: string,
  bundle: LyricBundle | null,
): Promise<void> {
  if (!trackId.trim()) return;
  if (bundle && !hasLyricContent(bundle) && !bundle.rlyric?.trim()) {
    await upsertCachedLyricBundle(trackId, {});
    return;
  }
  await upsertCachedLyricBundle(trackId, bundle);
}

export async function clearCachedLyric(trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${AudioTables.lyricCache} WHERE track_id = ?`, [
    trackId.trim(),
  ]);
}

export async function clearAllLyricCache(): Promise<number> {
  const db = await getDatabase();
  const before = await db.select<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM ${AudioTables.lyricCache}`,
  );
  await db.execute(`DELETE FROM ${AudioTables.lyricCache}`);
  return before[0]?.cnt ?? 0;
}

export async function getLyricCacheStats(): Promise<{ count: number }> {
  const db = await getDatabase();
  const rows = await db.select<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM ${AudioTables.lyricCache}`,
  );
  return { count: rows[0]?.cnt ?? 0 };
}
