/**
 * 番剧 Hub UI 状态（浏览 / 搜索 / 详情 / 选源）
 */

import { createStore } from 'solid-js/store';
import type { BangumiSubject } from '@/lib/media/video/bangumi/meta/types';
import type { BangumiSearchHit } from '@/lib/media/video/bangumi/engine';
import {
  DEFAULT_BANGUMI_SEARCH_FILTER,
  filterBangumiSearchByMatchMode,
  normalizeBangumiSearchFilter,
  type BangumiSearchFilterState,
  type BangumiSearchMatchMode,
} from '@/lib/media/video/bangumi/meta/search-filter';

export type BangumiUiView = 'browse' | 'search' | 'detail' | 'sources';

type BangumiUiState = {
  view: BangumiUiView;
  subjectId: number | null;
  subject: BangumiSubject | null;
  /** 选源阶段：规则搜索结果 */
  sourceHits: BangumiSearchHit[];
  sourceKeyword: string;
  resumeEpisodeUrl?: string;
  resumeRuleId?: string;
  /** 番剧搜索页关键词 / 结果 */
  searchKeyword: string;
  /** 接口原始结果（未做匹配模式过滤） */
  searchRawHits: BangumiSubject[];
  /** 展示结果 */
  searchHits: BangumiSubject[];
  searchLoading: boolean;
  searchLoadingMore: boolean;
  searchOffset: number;
  searchHasMore: boolean;
  searchMatchMode: BangumiSearchMatchMode;
  searchFilter: BangumiSearchFilterState;
  /** 从详情返回时落点 */
  returnView: 'browse' | 'search';
};

const SEARCH_PAGE_SIZE = 20;

function applyClientSearchFilters(
  raw: BangumiSubject[],
  keyword: string,
  mode: BangumiSearchMatchMode,
  _filter: BangumiSearchFilterState,
): BangumiSubject[] {
  // hideWatched / hideAbandoned：收藏分型未就绪，仅保留开关状态
  return filterBangumiSearchByMatchMode(raw, keyword, mode);
}

const [state, setState] = createStore<BangumiUiState>({
  view: 'browse',
  subjectId: null,
  subject: null,
  sourceHits: [],
  sourceKeyword: '',
  searchKeyword: '',
  searchRawHits: [],
  searchHits: [],
  searchLoading: false,
  searchLoadingMore: false,
  searchOffset: 0,
  searchHasMore: true,
  searchMatchMode: 'normal',
  searchFilter: { ...DEFAULT_BANGUMI_SEARCH_FILTER },
  returnView: 'browse',
});

export function getBangumiUi() {
  return state;
}

export function getBangumiSearchPageSize() {
  return SEARCH_PAGE_SIZE;
}

export function openBangumiSubject(
  subject: BangumiSubject,
  opts?: { resumeEpisodeUrl?: string; resumeRuleId?: string; from?: 'browse' | 'search' },
): void {
  setState({
    view: 'detail',
    subjectId: subject.id,
    subject,
    sourceHits: [],
    sourceKeyword: '',
    resumeEpisodeUrl: opts?.resumeEpisodeUrl,
    resumeRuleId: opts?.resumeRuleId,
    returnView: opts?.from ?? (state.view === 'search' ? 'search' : 'browse'),
  });
}

export async function openBangumiById(
  id: number,
  opts?: { resumeEpisodeUrl?: string; resumeRuleId?: string; from?: 'browse' | 'search' },
): Promise<void> {
  const { fetchBangumiSubject } = await import('@/lib/media/video/bangumi/meta/api');
  const subject = await fetchBangumiSubject(id);
  openBangumiSubject(subject, opts);
}

export function openBangumiSearch(keyword?: string): void {
  const kw = (keyword ?? state.searchKeyword).trim();
  setState({
    view: 'search',
    returnView: 'search',
    searchKeyword: kw,
    subjectId: null,
    subject: null,
    sourceHits: [],
  });
}

export function setBangumiSearchKeyword(keyword: string): void {
  setState({ searchKeyword: keyword });
}

export function setBangumiSearchMatchMode(mode: BangumiSearchMatchMode): void {
  if (state.searchMatchMode === mode) return;
  setState({
    searchMatchMode: mode,
    searchHits: applyClientSearchFilters(
      state.searchRawHits,
      state.searchKeyword,
      mode,
      state.searchFilter,
    ),
  });
}

export function setBangumiSearchFilter(
  patch: Partial<BangumiSearchFilterState>,
  opts?: { replace?: boolean },
): void {
  const next = normalizeBangumiSearchFilter(
    opts?.replace ? patch : { ...state.searchFilter, ...patch },
  );
  setState({
    searchFilter: next,
    searchHits: applyClientSearchFilters(
      state.searchRawHits,
      state.searchKeyword,
      state.searchMatchMode,
      next,
    ),
  });
}

export function resetBangumiSearchFilter(): void {
  setBangumiSearchFilter({ ...DEFAULT_BANGUMI_SEARCH_FILTER }, { replace: true });
}

export function setBangumiSearchResults(
  hits: BangumiSubject[],
  opts?: {
    loading?: boolean;
    keyword?: string;
    append?: boolean;
    rawCount?: number;
    offset?: number;
    hasMore?: boolean;
  },
): void {
  const kw = opts?.keyword ?? state.searchKeyword;
  const raw = opts?.append ? [...state.searchRawHits, ...hits] : hits;
  // 去重
  const seen = new Set<number>();
  const deduped: BangumiSubject[] = [];
  for (const s of raw) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    deduped.push(s);
  }
  const mode = state.searchMatchMode;
  const filter = state.searchFilter;
  setState({
    searchRawHits: deduped,
    searchHits: applyClientSearchFilters(deduped, kw, mode, filter),
    searchKeyword: kw,
    ...(opts?.loading !== undefined ? { searchLoading: opts.loading } : {}),
    ...(opts?.offset !== undefined ? { searchOffset: opts.offset } : {}),
    ...(opts?.hasMore !== undefined ? { searchHasMore: opts.hasMore } : {}),
  });
}

export function setBangumiSearchLoading(loading: boolean): void {
  setState({ searchLoading: loading });
}

export function setBangumiSearchLoadingMore(loading: boolean): void {
  setState({ searchLoadingMore: loading });
}

export function backBangumiBrowse(): void {
  setState({
    view: 'browse',
    subjectId: null,
    subject: null,
    sourceHits: [],
    resumeEpisodeUrl: undefined,
    resumeRuleId: undefined,
    returnView: 'browse',
  });
}

/** 详情 / 选源返回：回到搜索页或浏览页 */
export function backBangumiList(): void {
  if (state.returnView === 'search' || state.view === 'search') {
    setState({
      view: 'search',
      subjectId: null,
      subject: null,
      sourceHits: [],
      resumeEpisodeUrl: undefined,
      resumeRuleId: undefined,
    });
    return;
  }
  backBangumiBrowse();
}

export function setBangumiSourceHits(hits: BangumiSearchHit[], keyword: string): void {
  setState({ view: 'sources', sourceHits: hits, sourceKeyword: keyword });
}

export function setBangumiView(view: BangumiUiView): void {
  setState({ view });
}
