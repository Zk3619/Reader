/**
 * 搜索联想：跟随当前搜索来源；当前源无结果时用酷我（kw）兜底
 */

import { tipSearchForSource } from '@/lib/media/audio/music-sdk/discovery';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { AGGREGATE_SEARCH_SOURCE, type SearchSource } from '@/lib/media/audio/online/source-router';

/** 酷我作为固定兜底源 */
export const TIP_FALLBACK_SOURCE: MusicSdkSource = 'kw';

export function resolveTipSearchSource(source?: SearchSource): MusicSdkSource {
  if (!source || source === AGGREGATE_SEARCH_SOURCE || source.startsWith('userApi:')) {
    return TIP_FALLBACK_SOURCE;
  }
  if (source === 'kw' || source === 'wy' || source === 'kg' || source === 'tx' || source === 'mg') {
    return source;
  }
  return TIP_FALLBACK_SOURCE;
}

/**
 * 先走当前平台 tipSearch；若为空或失败，再用酷我兜底（当前源已是酷我则不再重复请求）
 */
export async function tipSearchKeywordsWithFallback(
  source: SearchSource | AudioTrackSource | MusicSdkSource | undefined,
  keyword: string,
): Promise<string[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const preferred = resolveTipSearchSource(
    typeof source === 'string' ? (source as SearchSource) : undefined,
  );

  try {
    const words = await tipSearchForSource(preferred, trimmed);
    if (words.length > 0) return words;
  } catch {
    /* fall through to kw */
  }

  if (preferred === TIP_FALLBACK_SOURCE) return [];

  try {
    return await tipSearchForSource(TIP_FALLBACK_SOURCE, trimmed);
  } catch {
    return [];
  }
}
