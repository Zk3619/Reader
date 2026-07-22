/**
 * 五源并行搜索（对齐 lx searchMusic Promise.all + setLists + handleSortList）
 * 另并入已启用的 MusicFree 插件源（辅源，失败不影响 LX）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  BUILTIN_SOURCES,
  BUILTIN_SOURCE_LABELS,
  MUSIC_SEARCH_PAGE_LIMIT,
  searchOnline,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import { listMfSearchPlugins } from '@/lib/media/audio/online/mf-plugin';
import { mfSourceKey } from '@/lib/media/audio/online/mf-plugin/types';
import {
  aggregateSongSortText,
  sortByKeywordSimilarity,
} from '@/lib/media/audio/music-sdk/search-similarity';

export interface ParallelSearchHit {
  source: AudioTrackSource | SearchSource;
  tracks: AudioTrack[];
  total: number;
  /** 对齐 lx SearchResult.allPage */
  allPage: number;
  limit: number;
}

export interface ParallelSearchResult {
  keyword: string;
  results: ParallelSearchHit[];
  merged: AudioTrack[];
  /** 各源 total 最大值（对齐 lx setLists） */
  total: number;
  /** 各源 allPage 最大值（对齐 lx listInfo.maxPage） */
  maxPage: number;
}

/** 对齐 lx deduplicationList：仅按 id 去重 */
function dedupeTracks(tracks: AudioTrack[]): AudioTrack[] {
  const seen = new Set<string>();
  const out: AudioTrack[] = [];
  for (const t of tracks) {
    if (!t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

function sourceAllPage(total: number, limit: number, listLength: number): number {
  if (total > 0 && limit > 0) return Math.max(1, Math.ceil(total / limit));
  if (listLength >= limit && limit > 0) return Math.max(1, 2);
  return listLength > 0 ? 1 : 0;
}

function defaultAggregateSources(): SearchSource[] {
  const mfs = listMfSearchPlugins().map((p) => mfSourceKey(p.id) as SearchSource);
  return [...BUILTIN_SOURCES, ...mfs];
}

export async function searchAllSources(
  keyword: string,
  page = 1,
  sources: SearchSource[] = defaultAggregateSources(),
  limit = MUSIC_SEARCH_PAGE_LIMIT,
): Promise<ParallelSearchResult> {
  const tasks = sources.map(async (source): Promise<ParallelSearchHit> => {
    try {
      const { tracks, total: reportedTotal } = await searchOnline(source, keyword, page, limit);
      const total = reportedTotal || tracks.length;
      return {
        source,
        tracks,
        total,
        allPage: sourceAllPage(total, limit, tracks.length),
        limit,
      };
    } catch {
      // 对齐 lx aggregate catch：失败源仍占位 allPage=1，本页并入空列表
      return { source, tracks: [], total: 0, allPage: 1, limit };
    }
  });
  const results = await Promise.all(tasks);

  // 单源本页明显少于 limit、且 total 表明还有数据时重试一次（避免瞬时丢页导致聚合少约 limit 条）
  for (let i = 0; i < results.length; i++) {
    const hit = results[i]!;
    if (hit.tracks.length >= limit) continue;
    if (hit.total > 0 && hit.total <= (page - 1) * limit + hit.tracks.length) continue;
    if (hit.tracks.length === 0 && hit.total === 0) continue;
    try {
      const { tracks, total: reportedTotal } = await searchOnline(hit.source, keyword, page, limit);
      if (tracks.length > hit.tracks.length) {
        const total = reportedTotal || tracks.length;
        results[i] = {
          source: hit.source,
          tracks,
          total,
          allPage: sourceAllPage(total, limit, tracks.length),
          limit,
        };
      }
    } catch {
      /* keep first hit */
    }
  }

  // 对齐 lx setLists：按源结果顺序合并；allPage < page 的源本页不入列表
  const mergedRaw: AudioTrack[] = [];
  const totals: number[] = [];
  const pages: number[] = [];
  let pageLimit = 0;
  for (const hit of results) {
    pageLimit = Math.max(hit.limit, pageLimit);
    if (hit.allPage < page) continue;
    mergedRaw.push(...hit.tracks);
    pages.push(hit.allPage);
    totals.push(hit.total);
  }

  const deduped = dedupeTracks(mergedRaw);
  // 对齐 lx setLists → handleSortList：按「歌名 歌手」与关键词相似度重排
  const merged = sortByKeywordSimilarity(deduped, keyword, (t) =>
    aggregateSongSortText(t.name, t.artist),
  );

  const maxPage = Math.max(0, ...pages);
  // 对齐 lx：total 取各源最大值；缺省时用 limit * page
  let total = Math.max(0, ...totals);
  if (!(page === 1 || (total > 0 && merged.length > 0))) {
    total = pageLimit * page;
  }

  return { keyword, results, merged, total, maxPage };
}

export function sourceLabel(source: AudioTrackSource): string {
  return BUILTIN_SOURCE_LABELS[source] ?? source;
}
