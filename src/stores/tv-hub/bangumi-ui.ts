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

/** 对齐 Kazumi PluginSearchStatus（pending/success/noResult/error） */
export type BangumiRuleSearchStatus = 'pending' | 'success' | 'empty' | 'error';

export type BangumiRuleSearchState = {
  ruleId: string;
  ruleName: string;
  status: BangumiRuleSearchStatus;
  hits: BangumiSearchHit[];
  error?: string;
};

type BangumiUiState = {
  view: BangumiUiView;
  subjectId: number | null;
  subject: BangumiSubject | null;
  /** 选源阶段：规则搜索结果 */
  sourceHits: BangumiSearchHit[];
  sourceKeyword: string;
  /** 选源：实际检索的全部关键词（语言名 + 原名） */
  sourceKeywords: string[];
  /** 选源：按规则渐进更新的搜索状态（对齐 Kazumi SourceSheet） */
  sourceSearches: BangumiRuleSearchState[];
  /** 选源搜索会话号：防止旧会话结果写回 */
  sourceSession: number;
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
  returnView: 'browse' | 'search' | 'history' | 'play';
};

const SEARCH_PAGE_SIZE = 20;

/** 选源搜索会话自增号 */
let sourceSessionCounter = 0;

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
  sourceKeywords: [],
  sourceSearches: [],
  sourceSession: 0,
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
  opts?: {
    resumeEpisodeUrl?: string;
    resumeRuleId?: string;
    from?: 'browse' | 'search' | 'history' | 'play';
  },
): void {
  setState({
    view: 'detail',
    subjectId: subject.id,
    subject,
    sourceHits: [],
    sourceKeyword: '',
    sourceKeywords: [],
    sourceSearches: [],
    sourceSession: ++sourceSessionCounter,
    resumeEpisodeUrl: opts?.resumeEpisodeUrl,
    resumeRuleId: opts?.resumeRuleId,
    returnView:
      opts?.from ?? (state.view === 'search' ? 'search' : 'browse'),
  });
}

/** 详情页补全条目（简介 / 标签 / 排名等） */
export function patchBangumiSubject(subject: BangumiSubject): void {
  if (state.subjectId !== subject.id) return;
  setState({ subject });
}

export async function openBangumiById(
  id: number,
  opts?: {
    resumeEpisodeUrl?: string;
    resumeRuleId?: string;
    from?: 'browse' | 'search' | 'history' | 'play';
  },
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
    sourceKeyword: '',
    sourceKeywords: [],
    sourceSearches: [],
    sourceSession: ++sourceSessionCounter,
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
    sourceKeyword: '',
    sourceKeywords: [],
    sourceSearches: [],
    sourceSession: ++sourceSessionCounter,
    resumeEpisodeUrl: undefined,
    resumeRuleId: undefined,
    returnView: 'browse',
  });
}

/** 详情 / 选源返回：回到搜索页、浏览页、历史，或播放页（从播放顶栏进详情时） */
export function backBangumiList(): void {
  if (state.returnView === 'history') {
    backBangumiBrowse();
    void import('@/stores/tv-hub/section').then((m) => m.setTvSection('history'));
    return;
  }
  if (state.returnView === 'play') {
    backBangumiBrowse();
    void import('@/stores/tv-hub/section').then((m) => m.setTvSection('play'));
    return;
  }
  if (state.returnView === 'search' || state.view === 'search') {
    setState({
      view: 'search',
      subjectId: null,
      subject: null,
      sourceHits: [],
      sourceKeyword: '',
      sourceKeywords: [],
      sourceSearches: [],
      sourceSession: ++sourceSessionCounter,
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

/**
 * 对齐 Kazumi：点击「开始观看」立即进入选源视图，
 * 所有启用规则先标 pending，由调用方并发逐个写回结果。
 * 返回会话号，写回时校验以丢弃过期结果。
 */
export function beginBangumiSourceSearch(
  rules: { id: string; name: string }[],
  keyword: string | string[],
): number {
  const keywords = (Array.isArray(keyword) ? keyword : [keyword])
    .map((k) => k.trim())
    .filter(Boolean);
  const primary = keywords[0] || '';
  const session = ++sourceSessionCounter;
  setState({
    view: 'sources',
    sourceKeyword: primary,
    sourceKeywords: keywords,
    sourceHits: [],
    sourceSession: session,
    sourceSearches: rules.map((r) => ({
      ruleId: r.id,
      ruleName: r.name,
      status: 'pending' as const,
      hits: [],
    })),
  });
  return session;
}

/** 单规则搜索结果写回（校验会话，过期丢弃） */
export function updateBangumiRuleSearch(
  session: number,
  ruleId: string,
  patch: Partial<Pick<BangumiRuleSearchState, 'status' | 'hits' | 'error'>>,
): void {
  if (state.sourceSession !== session) return;
  const next = state.sourceSearches.map((x) =>
    x.ruleId === ruleId ? { ...x, ...patch } : x,
  );
  setState({
    sourceSearches: next,
    // 聚合命中项由各规则结果推导，重试时不会重复累积
    sourceHits: next.flatMap((x) => x.hits),
  });
}

/** 单规则重试：重置为 pending（保持当前会话） */
export function resetBangumiRuleSearch(ruleId: string): number {
  updateBangumiRuleSearch(state.sourceSession, ruleId, {
    status: 'pending',
    hits: [],
    error: undefined,
  });
  return state.sourceSession;
}

/** 页内停止检索：熔断会话并把未完成规则标为已停止 */
export function stopBangumiSourceSearch(): void {
  const next = state.sourceSearches.map((x) =>
    x.status === 'pending'
      ? { ...x, status: 'error' as const, hits: [], error: '已停止' }
      : x,
  );
  setState({
    sourceSession: ++sourceSessionCounter,
    sourceSearches: next,
    sourceHits: next.flatMap((x) => x.hits),
  });
}

/** 离开选源页：使进行中的写回失效 */
export function cancelBangumiSourceSearch(): void {
  setState({ sourceSession: ++sourceSessionCounter });
}

export function setBangumiView(view: BangumiUiView): void {
  if (view !== 'sources' && state.view === 'sources') {
    cancelBangumiSourceSearch();
  }
  setState({ view });
}
