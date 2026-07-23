/**
 * E3：wyzie 字幕搜索 → 返回可挂载的 URL（调用方注入 Artplayer）
 */

import {
  isWyzieConfigured,
  searchWyzieSubtitles,
  type WyzieSubtitleHit,
} from '@/lib/media/video/subtitle/wyzie';

export async function trySearchWyzieSubtitle(
  query: string,
): Promise<WyzieSubtitleHit | null> {
  if (!isWyzieConfigured()) return null;
  const q = query.trim();
  if (!q) return null;
  try {
    const hits = await searchWyzieSubtitles(q);
    return hits[0] ?? null;
  } catch (e) {
    console.warn('[wyzie] search failed', e);
    return null;
  }
}
