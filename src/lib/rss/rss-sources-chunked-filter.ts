import {
  buildRssManageFilterGroupOptions,
  hasEffectiveRssSourceListFilter,
  rssSourceMatchesCriteria,
  type RssSourceListFilterCriteria,
} from '@/lib/rss/rss-source-list-filter';
import { getSourceDomain } from '@/lib/sources/source-sort';
import { rssSourceMatchesSearch } from '@/lib/search/search-filters';
import {
  assertChunkedFilterNotAborted,
  isChunkedFilterAbortError,
  runChunkedListFilter,
  yieldFilterChunk,
} from '@/lib/list/chunked-list-filter';
import type { SearchMode } from '@/lib/search/search-prefs';
import type { RssSource } from '@/types';

export type RssSourcesChunkedFilterPhase = 'meta' | 'filter' | 'done';

export interface RssSourcesChunkedFilterProgress {
  phase: RssSourcesChunkedFilterPhase;
  processed: number;
  total: number;
  matched: number;
}

export interface RssSourcesFilterMeta {
  groupNames: string[];
  domainNames: string[];
}

export interface ChunkedFilterRssPageSourcesInput {
  sources: RssSource[];
  criteria: RssSourceListFilterCriteria;
  searchQuery: string;
  searchMode: SearchMode;
  chunkSize?: number;
  meta?: RssSourcesFilterMeta;
  shouldAbort?: () => boolean;
  onProgress?: (progress: RssSourcesChunkedFilterProgress) => void;
  onPartialResult?: (matched: RssSource[]) => void;
}

export interface ChunkedFilterRssPageSourcesResult {
  filtered: RssSource[];
  meta: RssSourcesFilterMeta;
}

export { isChunkedFilterAbortError, yieldFilterChunk };

async function buildRssSourcesFilterMetaChunked(
  sources: RssSource[],
  options?: {
    chunkSize?: number;
    shouldAbort?: () => boolean;
    onProgress?: (progress: RssSourcesChunkedFilterProgress) => void;
  },
): Promise<RssSourcesFilterMeta> {
  const chunkSize = options?.chunkSize ?? 400;
  const groupSet = new Set<string>();
  const domainSet = new Set<string>();

  for (let i = 0; i < sources.length; i += chunkSize) {
    assertChunkedFilterNotAborted(options?.shouldAbort);
    const end = Math.min(i + chunkSize, sources.length);
    for (let j = i; j < end; j++) {
      const source = sources[j]!;
      const group = source.sourceGroup?.trim();
      if (group) groupSet.add(group);
      domainSet.add(getSourceDomain(source.sourceUrl));
    }
    options?.onProgress?.({
      phase: 'meta',
      processed: end,
      total: sources.length,
      matched: 0,
    });
    if (end < sources.length) {
      await yieldFilterChunk();
    }
  }

  return {
    groupNames: buildRssManageFilterGroupOptions([...groupSet]),
    domainNames: [...domainSet].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  };
}

export async function filterRssPageSourcesChunked(
  input: ChunkedFilterRssPageSourcesInput,
): Promise<ChunkedFilterRssPageSourcesResult> {
  const searchQuery = input.searchQuery.trim();
  const meta =
    input.meta ??
    (await buildRssSourcesFilterMetaChunked(input.sources, {
      chunkSize: input.chunkSize,
      shouldAbort: input.shouldAbort,
      onProgress: input.onProgress,
    }));

  assertChunkedFilterNotAborted(input.shouldAbort);

  const criteriaActive = hasEffectiveRssSourceListFilter(
    input.criteria,
    meta.groupNames,
    meta.domainNames,
  );
  const searchActive = searchQuery.length > 0;

  if (!criteriaActive && !searchActive) {
    input.onProgress?.({
      phase: 'done',
      processed: input.sources.length,
      total: input.sources.length,
      matched: input.sources.length,
    });
    return { filtered: input.sources, meta };
  }

  const matched = await runChunkedListFilter(input.sources, {
    chunkSize: input.chunkSize,
    shouldAbort: input.shouldAbort,
    match: (source) =>
      rssSourceMatchesCriteria(source, input.criteria, meta.groupNames, meta.domainNames) &&
      rssSourceMatchesSearch(source, searchQuery, input.searchMode),
    onProgress: (progress) => {
      input.onProgress?.({
        phase: 'filter',
        processed: progress.processed,
        total: progress.total,
        matched: progress.matched,
      });
    },
    onPartialResult: input.onPartialResult,
  });

  input.onProgress?.({
    phase: 'done',
    processed: input.sources.length,
    total: input.sources.length,
    matched: matched.length,
  });
  return { filtered: matched, meta };
}
