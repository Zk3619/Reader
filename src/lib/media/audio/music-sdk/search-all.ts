/**
 * 五源并行搜索（对齐 lx searchMusic Promise.all）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  BUILTIN_SOURCES,
  BUILTIN_SOURCE_LABELS,
  searchOnline,
} from '@/lib/media/audio/online/source-router';

export interface ParallelSearchHit {
  source: AudioTrackSource;
  tracks: AudioTrack[];
  total: number;
}

export interface ParallelSearchResult {
  keyword: string;
  results: ParallelSearchHit[];
  merged: AudioTrack[];
}

export async function searchAllSources(
  keyword: string,
  _page = 1,
  sources: AudioTrackSource[] = BUILTIN_SOURCES,
): Promise<ParallelSearchResult> {
  const tasks = sources.map(async (source) => {
    try {
      const { tracks, total } = await searchOnline(source, keyword);
      return { source, tracks, total: total || tracks.length };
    } catch {
      return { source, tracks: [], total: 0 };
    }
  });
  const results = await Promise.all(tasks);
  const seen = new Set<string>();
  const merged: AudioTrack[] = [];
  for (const hit of results) {
    for (const t of hit.tracks) {
      const key = `${t.name}|${t.artist}|${t.duration}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
  }
  return { keyword, results, merged };
}

export function sourceLabel(source: AudioTrackSource): string {
  return BUILTIN_SOURCE_LABELS[source] ?? source;
}
