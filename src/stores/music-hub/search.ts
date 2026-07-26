/**
 * Music Hub 搜索状态（歌曲 + 歌单）
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  filterPlaylistsByMusicQuery,
  filterTracksByMusicQuery,
} from '@/lib/media/audio/music-query-prefs';
import {
  AGGREGATE_SEARCH_SOURCE,
  BUILTIN_SOURCES,
  BUILTIN_SOURCE_LABELS,
  listHubSearchSources,
  MUSIC_PLAYLIST_SEARCH_AGGREGATE_LIMIT,
  MUSIC_PLAYLIST_SEARCH_SOURCE_LIMIT,
  MUSIC_SEARCH_PAGE_LIMIT,
  searchOnline,
  searchSourceLabel,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import {
  hotSearchKeywords,
  searchSongLists,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import { tipSearchKeywordsWithFallback, resolveTipSearchSource } from '@/lib/media/audio/music-sdk/tip-search';
import { searchAllSources } from '@/lib/media/audio/music-sdk/search-all';
import {
  hubTabToMfType,
  isMfOnlySearchTab,
  searchMfSourceTyped,
  type MfAlbumSearchHit,
  type MfArtistSearchHit,
} from '@/lib/media/audio/online/mf-plugin/mf-search-hub';
import { isMfSourceKey } from '@/lib/media/audio/online/mf-plugin/types';
import { isPlatformSource } from '@/lib/media/audio/platform/platform-sources';
import { sortByKeywordSimilarity } from '@/lib/media/audio/music-sdk/search-similarity';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import { notifyPageError, notifyPageWarning } from '@/lib/ui/page-notify';
import { getMusicSearchUi } from '@/stores/music-hub/music-search-ui';
import {
  getMusicUiSnapshot,
  patchMusicUiSnapshot,
} from '@/lib/persistence/domains/music-ui';

export type SearchTab = 'song' | 'album' | 'artist' | 'sheet' | 'lyric' | 'playlist';

/**
 * 各来源支持的搜索类型：
 * - LX 五源（kw/wy/kg/tx/mg）：歌曲 + 歌单(LX)
 * - MF 辅源：歌曲 + 专辑 + 歌手 + 歌单(MF) + 歌词（album/artist/sheet/lyric 均为 MF 专有渲染）
 * - 平台三源（netease/bili/ytm）：仅歌曲（暂无 artist/album 等平台侧检索）
 * - UserApi：仅歌曲
 * - 聚合：全部
 */
const LX_SEARCH_TABS: readonly SearchTab[] = ['song', 'playlist'];
const MF_SEARCH_TABS: readonly SearchTab[] = ['song', 'album', 'artist', 'sheet', 'lyric'];
const PLATFORM_SEARCH_TABS: readonly SearchTab[] = ['song'];
const USERAPI_SEARCH_TABS: readonly SearchTab[] = ['song'];
const AGGREGATE_SEARCH_TABS: readonly SearchTab[] = [
  'song',
  'album',
  'artist',
  'sheet',
  'lyric',
  'playlist',
];

/** 返回指定来源当前支持的搜索类型（顺序即展示顺序） */
export function listSearchTabsForSource(source: SearchSource): readonly SearchTab[] {
  if (source === AGGREGATE_SEARCH_SOURCE) return AGGREGATE_SEARCH_TABS;
  if (isMfSourceKey(source)) return MF_SEARCH_TABS;
  if (typeof source === 'string' && source.startsWith('userApi:')) return USERAPI_SEARCH_TABS;
  if (isPlatformSource(source)) return PLATFORM_SEARCH_TABS;
  return LX_SEARCH_TABS;
}

/** 指定来源是否支持某搜索类型 */
export function isSearchTabSupported(source: SearchSource, tab: SearchTab): boolean {
  return listSearchTabsForSource(source).includes(tab);
}

function resolvePersistedSearchSource(raw: unknown): SearchSource {
  const available = new Set<string>(listHubSearchSources());
  if (typeof raw === 'string' && available.has(raw)) {
    return raw as SearchSource;
  }
  return 'wy';
}

function resolvePersistedSearchTab(source: SearchSource, raw: unknown): SearchTab {
  if (
    typeof raw === 'string' &&
    isSearchTabSupported(source, raw as SearchTab)
  ) {
    return raw as SearchTab;
  }
  return listSearchTabsForSource(source)[0];
}

const MAX_HISTORY = 20;
const initialSearchSettings = getMusicSettings();
const initialSearchSource = resolvePersistedSearchSource(initialSearchSettings.defaultSource);
const initialSearchTab = resolvePersistedSearchTab(
  initialSearchSource,
  initialSearchSettings.defaultSearchTab,
);

export interface MusicHubSearchState {
  tab: SearchTab;
  source: SearchSource;
  keyword: string;
  page: number;
  limit: number;
  loading: boolean;
  /** 滚动加载下一页中 */
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  tracks: AudioTrack[];
  trackTotal: number;
  playlists: OnlinePlaylistSummary[];
  playlistTotal: number;
  mfAlbums: MfAlbumSearchHit[];
  mfArtists: MfArtistSearchHit[];
  hotKeywords: string[];
  tipKeywords: string[];
  /** 联想请求进行中（用于确认触发链是否执行） */
  tipLoading: boolean;
  history: string[];
  /** 是否已确认搜索（回车后为 true，展示联网结果） */
  submitted: boolean;
  /** 是否展示空态/历史/本地匹配面板 */
  helpVisible: boolean;
}

const [searchState, setSearchState] = createStore<MusicHubSearchState>({
  tab: initialSearchTab,
  source: initialSearchSource,
  keyword: '',
  page: 1,
  limit: MUSIC_SEARCH_PAGE_LIMIT,
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: null,
  tracks: [],
  trackTotal: 0,
  playlists: [],
  playlistTotal: 0,
  mfAlbums: [],
  mfArtists: [],
  hotKeywords: [],
  tipKeywords: [],
  tipLoading: false,
  history: loadHistory(),
  submitted: false,
  helpVisible: true,
});

function loadHistory(): string[] {
  return getMusicUiSnapshot().searchHistory.slice(0, MAX_HISTORY);
}

function saveHistory(items: string[]): void {
  patchMusicUiSnapshot({ searchHistory: items });
}

/** music.ui hydrate 后同步到内存 store */
export function syncSearchHistoryFromPersist(items: string[]): void {
  setSearchState('history', items.slice(0, MAX_HISTORY));
}

function decodeKeywordList(words: string[]): string[] {
  return words.map((w) => decodeHtmlEntities(w)).filter(Boolean);
}

function decodePlaylists(list: OnlinePlaylistSummary[]): OnlinePlaylistSummary[] {
  return list.map((p) => ({
    ...p,
    name: decodeHtmlEntities(p.name),
    author: decodeHtmlEntities(p.author ?? ''),
  }));
}

/** 按搜索配置过滤曲目（常规模式原样返回） */
export function applyMusicQueryTrackFilter(tracks: AudioTrack[], keyword: string): AudioTrack[] {
  return filterTracksByMusicQuery(tracks, keyword);
}

export function applyMusicQueryPlaylistFilter<T extends { name: string; creator?: string; author?: string }>(
  playlists: T[],
  keyword: string,
): T[] {
  return filterPlaylistsByMusicQuery(
    playlists.map((p) => ({
      ...p,
      creator: p.creator ?? p.author ?? '',
    })),
    keyword,
  );
}

/** 对齐 lx：有 total 用 total；否则页满则估算还可翻页 */
function resolvePagingTotal(
  page: number,
  limit: number,
  listLength: number,
  reportedTotal: number,
): number {
  if (page === 1 || (reportedTotal > 0 && listLength > 0)) {
    if (reportedTotal > 0) return reportedTotal;
  }
  if (reportedTotal > 0) return reportedTotal;
  if (listLength >= limit) return limit * page + 1;
  return Math.max(0, limit * (page - 1) + listLength);
}

function resolveHasMore(page: number, limit: number, listLength: number, total: number): boolean {
  if (listLength >= limit) return true;
  if (total > 0) return page * limit < total;
  return false;
}

/** 对齐 lx listInfo.key：按「类型 + 来源 + 关键词 + 页」缓存已触发的搜索结果 */
interface SearchResultCacheEntry {
  tab: SearchTab;
  source: SearchSource;
  keyword: string;
  page: number;
  limit: number;
  tracks: AudioTrack[];
  trackTotal: number;
  playlists: OnlinePlaylistSummary[];
  playlistTotal: number;
  hasMore: boolean;
}

const SEARCH_RESULT_CACHE_MAX = 40;
const searchResultCache = new Map<string, SearchResultCacheEntry>();

function searchResultCacheKey(
  tab: SearchTab,
  source: SearchSource,
  keyword: string,
  page: number,
): string {
  return `${tab}__${source}__${page}__${keyword}`;
}

function rememberSearchResult(entry: SearchResultCacheEntry): void {
  const key = searchResultCacheKey(entry.tab, entry.source, entry.keyword, entry.page);
  if (searchResultCache.has(key)) searchResultCache.delete(key);
  searchResultCache.set(key, entry);
  while (searchResultCache.size > SEARCH_RESULT_CACHE_MAX) {
    const oldest = searchResultCache.keys().next().value;
    if (oldest == null) break;
    searchResultCache.delete(oldest);
  }
}

/** 主动提交搜索时清掉同关键词缓存，避免沿用旧条数/排序 */
function invalidateSearchResultCache(keyword: string): void {
  const needle = `__${keyword}`;
  for (const key of [...searchResultCache.keys()]) {
    if (key.endsWith(needle)) searchResultCache.delete(key);
  }
}

function applyCachedSearchResult(entry: SearchResultCacheEntry): void {
  setSearchState({
    tab: entry.tab,
    source: entry.source,
    keyword: entry.keyword,
    page: entry.page,
    limit: entry.limit,
    tracks: entry.tracks,
    trackTotal: entry.trackTotal,
    playlists: entry.playlists,
    playlistTotal: entry.playlistTotal,
    hasMore: entry.hasMore,
    loading: false,
    loadingMore: false,
    error: null,
    submitted: true,
    helpVisible: false,
  });
}

/** 已提交搜索后切换来源/类型：优先缓存，否则同关键词重新请求 */
async function resyncAfterScopeChange(): Promise<void> {
  if (!searchState.submitted) return;
  const keyword = searchState.keyword.trim();
  if (!keyword) return;

  const page = 1;
  const key = searchResultCacheKey(searchState.tab, searchState.source, keyword, page);
  const cached = searchResultCache.get(key);
  if (cached) {
    applyCachedSearchResult(cached);
    return;
  }

  setSearchState({
    page,
    tracks: [],
    playlists: [],
    trackTotal: 0,
    playlistTotal: 0,
    loading: true,
    loadingMore: false,
    error: null,
    helpVisible: false,
  });
  await runSearch(page, { append: false });
}

export function getSearchState(): MusicHubSearchState {
  return searchState;
}

export function searchPageCount(): number {
  const total =
    searchState.tab === 'song' ? searchState.trackTotal : searchState.playlistTotal;
  return Math.max(1, Math.ceil(Math.max(total, 1) / searchState.limit));
}

export function setSearchTab(tab: SearchTab): void {
  if (tab === searchState.tab) return;
  setSearchState({ tab, page: 1, error: null, hasMore: false });
  setMusicSettings({ defaultSearchTab: tab }, { persistImmediate: true });
  void resyncAfterScopeChange();
}

export function setSearchSource(source: SearchSource): void {
  if (source === searchState.source) return;
  const allowedTabs = listSearchTabsForSource(source);
  const nextTab = allowedTabs.includes(searchState.tab) ? searchState.tab : allowedTabs[0];
  setSearchState({ source, tab: nextTab, page: 1, error: null, hasMore: false });
  setMusicSettings(
    {
      defaultSource: source,
      defaultSearchTab: nextTab,
    },
    { persistImmediate: true },
  );
  if (source === AGGREGATE_SEARCH_SOURCE) {
    void refreshHotKeywords('wy');
  } else if (!source.startsWith('userApi:') && !source.startsWith('mf:')) {
    void refreshHotKeywords(source as AudioTrackSource);
  } else {
    setSearchState('hotKeywords', []);
  }
  void resyncAfterScopeChange();
}

/** 配置 hydrate 后：用持久化的默认来源/类型回填搜索 scope（不触发重新搜索） */
export function syncSearchScopeFromSettings(): void {
  const settings = getMusicSettings();
  const source = resolvePersistedSearchSource(settings.defaultSource);
  const tab = resolvePersistedSearchTab(source, settings.defaultSearchTab);
  if (source === searchState.source && tab === searchState.tab) return;
  setSearchState({ source, tab });
}

export function setSearchKeyword(keyword: string): void {
  const wasSubmitted = searchState.submitted;
  setSearchState({
    keyword,
    helpVisible: true,
    submitted: false,
    ...(wasSubmitted
      ? {
          tracks: [],
          playlists: [],
          loading: false,
          loadingMore: false,
          error: null,
          trackTotal: 0,
          playlistTotal: 0,
          hasMore: false,
          page: 1,
        }
      : {}),
  });
}

/** 热搜/历史/联想：写入关键词并直接提交（避免先 setSearchKeyword 打断已提交态） */
export async function searchByKeyword(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    setSearchState({ error: '请输入关键词', submitted: false, helpVisible: true });
    notifyPageWarning('请输入关键词');
    return;
  }
  setSearchState({ keyword: trimmed });
  await submitSearch(1);
}

export function setSearchHelpVisible(visible: boolean): void {
  setSearchState('helpVisible', visible);
}

export function setSearchSubmitted(submitted: boolean): void {
  setSearchState('submitted', submitted);
}

export function clearSearchResults(): void {
  searchRequestId += 1;
  setSearchState({
    page: 1,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    tracks: [],
    trackTotal: 0,
    playlists: [],
    playlistTotal: 0,
    submitted: false,
    helpVisible: true,
  });
}

let tipTimer: ReturnType<typeof setTimeout> | null = null;
let tipSearchRequestId = 0;
let searchRequestId = 0;

export function cancelTipSearch(): void {
  if (tipTimer) {
    clearTimeout(tipTimer);
    tipTimer = null;
  }
  tipSearchRequestId += 1;
  setSearchState({ tipKeywords: [], tipLoading: false });
}

/**
 * 跟随当前搜索来源请求联想；失败/空结果时由 tip-search 用酷我兜底。
 */
export function scheduleTipSearch(keyword: string, source?: SearchSource): void {
  if (tipTimer) clearTimeout(tipTimer);
  const trimmed = keyword.trim();
  if (!trimmed) {
    cancelTipSearch();
    return;
  }
  setSearchState('tipLoading', true);
  tipTimer = setTimeout(() => {
    const requestId = ++tipSearchRequestId;
    void tipSearchKeywordsWithFallback(source ?? searchState.source, trimmed)
      .then((words) => {
        if (requestId !== tipSearchRequestId) return;
        setSearchState({ tipKeywords: decodeKeywordList(words), tipLoading: false });
      })
      .catch(() => {
        if (requestId !== tipSearchRequestId) return;
        setSearchState({ tipKeywords: [], tipLoading: false });
      });
  }, 50);
}

export { resolveTipSearchSource };

export async function refreshHotKeywords(source: AudioTrackSource): Promise<void> {
  try {
    const words = await hotSearchKeywords(source);
    setSearchState('hotKeywords', decodeKeywordList(words));
  } catch {
    setSearchState('hotKeywords', []);
  }
}

export function addSearchHistory(keyword: string): void {
  if (!getMusicSettings().searchHistoryEnabled) return;
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const next = [trimmed, ...searchState.history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
  setSearchState('history', next);
  saveHistory(next);
  void import('@/lib/database/module-search-keywords')
    .then((m) => m.upsertAudioSearchKeyword(trimmed))
    .catch(() => undefined);
}

export function removeSearchHistoryItem(word: string): void {
  const next = searchState.history.filter((h) => h !== word);
  setSearchState('history', next);
  saveHistory(next);
  void import('@/lib/database/module-search-keywords')
    .then((m) => m.deleteAudioSearchKeyword(word))
    .catch(() => undefined);
}

export function clearSearchHistory(): void {
  setSearchState('history', []);
  saveHistory([]);
  void import('@/lib/database/module-search-keywords')
    .then((m) => m.clearAudioSearchKeywords())
    .catch(() => undefined);
}

async function searchPlaylistsAggregate(
  keyword: string,
  page: number,
): Promise<{ list: OnlinePlaylistSummary[]; total: number; limit: number }> {
  const limit = MUSIC_PLAYLIST_SEARCH_AGGREGATE_LIMIT;
  // 对齐 lx：源顺序 kw → kg → tx → wy → mg；每源取 listInfos.all.limit=15
  const results = await Promise.all(
    BUILTIN_SOURCES.map((source) =>
      searchSongLists(source as MusicSdkSource, keyword, page, limit).catch(() => ({
        list: [] as OnlinePlaylistSummary[],
        total: 0,
        limit,
      })),
    ),
  );
  // 对齐 lx songlist setLists：不跨源去重，按源顺序拼接后排序
  const merged: OnlinePlaylistSummary[] = [];
  const totals: number[] = [];
  for (const result of results) {
    totals.push(result.total || result.list.length);
    merged.push(...result.list);
  }
  // 必须先 decode 再算 similar（lx 在各源 parser 里 decodeName）；否则 &#32; 等会扭曲分数
  const decoded = decodePlaylists(merged);
  return {
    list: sortByKeywordSimilarity(decoded, keyword, (p) => p.name),
    total: Math.max(0, ...totals, decoded.length),
    limit,
  };
}

export async function submitSearch(page = 1): Promise<void> {
  const keyword = searchState.keyword.trim();
  if (!keyword) {
    setSearchState({ error: '请输入关键词', submitted: false, helpVisible: true });
    notifyPageWarning('请输入关键词');
    return;
  }
  cancelTipSearch();
  setSearchState({
    submitted: true,
    helpVisible: false,
    loading: true,
    loadingMore: false,
    error: null,
    page,
    tracks: page === 1 ? [] : searchState.tracks,
    playlists: page === 1 ? [] : searchState.playlists,
  });
  addSearchHistory(keyword);
  invalidateSearchResultCache(keyword);
  await runSearch(page, { append: false });
}

/** 分页模式：跳转到指定页（替换列表） */
export async function goToSearchPage(page: number): Promise<void> {
  if (!searchState.submitted || searchState.loading || searchState.loadingMore) return;
  const next = Math.max(1, Math.floor(page));
  if (next === searchState.page) return;
  const keyword = searchState.keyword.trim();
  if (!keyword) return;
  const key = searchResultCacheKey(searchState.tab, searchState.source, keyword, next);
  const cached = searchResultCache.get(key);
  if (cached) {
    applyCachedSearchResult(cached);
    return;
  }
  await runSearch(next, { append: false });
}

/** 滚动模式：追加下一页 */
export async function loadMoreSearch(): Promise<void> {
  if (
    !searchState.submitted ||
    searchState.loading ||
    searchState.loadingMore ||
    !searchState.hasMore
  ) {
    return;
  }
  if (getMusicSearchUi().paginationPreference !== 'scroll') return;
  await runSearch(searchState.page + 1, { append: true });
}

export async function runSearch(
  page = 1,
  options?: { append?: boolean },
): Promise<void> {
  const keyword = searchState.keyword.trim();
  if (!keyword) {
    setSearchState({ error: '请输入关键词', tracks: [], playlists: [], hasMore: false });
    notifyPageWarning('请输入关键词');
    return;
  }
  const append = options?.append === true;

  if (!append) {
    const cached = searchResultCache.get(
      searchResultCacheKey(searchState.tab, searchState.source, keyword, page),
    );
    if (cached) {
      applyCachedSearchResult(cached);
      return;
    }
  }

  const requestId = ++searchRequestId;
  const tab = searchState.tab;
  const source = searchState.source;

  if (append) {
    setSearchState({ loadingMore: true, error: null, page });
  } else {
    setSearchState({ loading: true, loadingMore: false, error: null, page });
  }

  try {
    const mfType = hubTabToMfType(tab);
    if (mfType && (isMfOnlySearchTab(tab) || tab === 'lyric')) {
      if (
        source !== AGGREGATE_SEARCH_SOURCE &&
        !isMfSourceKey(String(source))
      ) {
        setSearchState({
          loading: false,
          loadingMore: false,
          error: '该搜索类型仅支持 MusicFree 插件源或聚合',
          tracks: [],
          playlists: [],
          mfAlbums: [],
          mfArtists: [],
          hasMore: false,
        });
        return;
      }
      const limit = MUSIC_SEARCH_PAGE_LIMIT;
      const hit = await searchMfSourceTyped(source, keyword, page, mfType);
      if (requestId !== searchRequestId) return;
      const mergedTracks = append ? [...searchState.tracks, ...hit.tracks] : hit.tracks;
      const mergedAlbums = append ? [...searchState.mfAlbums, ...hit.albums] : hit.albums;
      const mergedArtists = append ? [...searchState.mfArtists, ...hit.artists] : hit.artists;
      const mergedSheets = append ? [...searchState.playlists, ...hit.sheets] : hit.sheets;
      const listLen =
        tab === 'album'
          ? mergedAlbums.length
          : tab === 'artist'
            ? mergedArtists.length
            : tab === 'sheet'
              ? mergedSheets.length
              : mergedTracks.length;
      const hasMore = !hit.isEnd && listLen > 0;
      setSearchState({
        tracks: tab === 'lyric' || tab === 'song' ? mergedTracks : [],
        trackTotal: tab === 'lyric' ? listLen : 0,
        playlists: tab === 'sheet' ? mergedSheets : [],
        playlistTotal: tab === 'sheet' ? listLen : 0,
        mfAlbums: tab === 'album' ? mergedAlbums : [],
        mfArtists: tab === 'artist' ? mergedArtists : [],
        limit,
        loading: false,
        loadingMore: false,
        hasMore,
      });
      return;
    }
    if (tab === 'song') {
      const limit = MUSIC_SEARCH_PAGE_LIMIT;
      let tracks: AudioTrack[] = [];
      let reportedTotal = 0;
      if (source === AGGREGATE_SEARCH_SOURCE) {
        const result = await searchAllSources(keyword, page, undefined, limit);
        tracks = result.merged;
        reportedTotal = result.total;
        if (requestId !== searchRequestId) return;
        const total = resolvePagingTotal(page, limit, tracks.length, reportedTotal);
        const merged = append ? [...searchState.tracks, ...tracks] : tracks;
        const trackTotal = append
          ? Math.max(searchState.trackTotal, total, merged.length)
          : Math.max(total, tracks.length);
        // 聚合翻页对齐 lx maxPage：优先用各源 allPage 最大值
        const hasMore =
          result.maxPage > 0
            ? page < result.maxPage
            : resolveHasMore(page, limit, tracks.length, total);
        setSearchState({
          tracks: merged,
          trackTotal,
          playlists: [],
          playlistTotal: 0,
          limit,
          loading: false,
          loadingMore: false,
          hasMore,
        });
        if (!append) {
          rememberSearchResult({
            tab,
            source,
            keyword,
            page,
            limit,
            tracks: merged,
            trackTotal,
            playlists: [],
            playlistTotal: 0,
            hasMore,
          });
        }
        return;
      } else {
        const result = await searchOnline(source, keyword, page, limit);
        tracks = result.tracks;
        reportedTotal = result.total || result.tracks.length;
      }
      if (requestId !== searchRequestId) return;
      const total = resolvePagingTotal(page, limit, tracks.length, reportedTotal);
      const merged = append ? [...searchState.tracks, ...tracks] : tracks;
      const trackTotal = append
        ? Math.max(searchState.trackTotal, total, merged.length)
        : Math.max(total, tracks.length);
      const hasMore = resolveHasMore(page, limit, tracks.length, total);
      setSearchState({
        tracks: merged,
        trackTotal,
        playlists: [],
        playlistTotal: 0,
        limit,
        loading: false,
        loadingMore: false,
        hasMore,
      });
      if (!append) {
        rememberSearchResult({
          tab,
          source,
          keyword,
          page,
          limit,
          tracks: merged,
          trackTotal,
          playlists: [],
          playlistTotal: 0,
          hasMore,
        });
      }
    } else if (tab === 'sheet' && isMfSourceKey(String(source))) {
      const limit = MUSIC_SEARCH_PAGE_LIMIT;
      const hit = await searchMfSourceTyped(source, keyword, page, 'sheet');
      if (requestId !== searchRequestId) return;
      const list = append ? [...searchState.playlists, ...hit.sheets] : hit.sheets;
      setSearchState({
        playlists: list,
        playlistTotal: list.length,
        tracks: [],
        trackTotal: 0,
        mfAlbums: [],
        mfArtists: [],
        limit,
        loading: false,
        loadingMore: false,
        hasMore: !hit.isEnd,
      });
    } else if (source === AGGREGATE_SEARCH_SOURCE) {
      const result = await searchPlaylistsAggregate(keyword, page);
      if (requestId !== searchRequestId) return;
      const list = decodePlaylists(result.list);
      const pageLimit = result.limit;
      const total = resolvePagingTotal(page, pageLimit, list.length, result.total);
      const merged = append ? [...searchState.playlists, ...list] : list;
      const playlistTotal = append
        ? Math.max(searchState.playlistTotal, total, merged.length)
        : Math.max(total, list.length);
      const hasMore = resolveHasMore(page, pageLimit, list.length, total);
      setSearchState({
        playlists: merged,
        playlistTotal,
        tracks: [],
        trackTotal: 0,
        limit: pageLimit,
        loading: false,
        loadingMore: false,
        hasMore,
      });
      if (!append) {
        rememberSearchResult({
          tab,
          source,
          keyword,
          page,
          limit: pageLimit,
          tracks: [],
          trackTotal: 0,
          playlists: merged,
          playlistTotal,
          hasMore,
        });
      }
    } else {
      const sdkSource = source as MusicSdkSource;
      const pageLimit = MUSIC_PLAYLIST_SEARCH_SOURCE_LIMIT;
      const result = await searchSongLists(sdkSource, keyword, page, pageLimit);
      if (requestId !== searchRequestId) return;
      const list = decodePlaylists(result.list);
      const total = resolvePagingTotal(page, pageLimit, list.length, result.total);
      const merged = append ? [...searchState.playlists, ...list] : list;
      const playlistTotal = append
        ? Math.max(searchState.playlistTotal, total, merged.length)
        : Math.max(total, list.length);
      const hasMore = resolveHasMore(page, pageLimit, list.length, total);
      setSearchState({
        playlists: merged,
        playlistTotal,
        tracks: [],
        trackTotal: 0,
        limit: pageLimit,
        loading: false,
        loadingMore: false,
        hasMore,
      });
      if (!append) {
        rememberSearchResult({
          tab,
          source,
          keyword,
          page,
          limit: pageLimit,
          tracks: [],
          trackTotal: 0,
          playlists: merged,
          playlistTotal,
          hasMore,
        });
      }
    }
  } catch (err) {
    if (requestId !== searchRequestId) return;
    const msg = err instanceof Error ? err.message : '搜索失败';
    setSearchState({
      loading: false,
      loadingMore: false,
      error: msg,
      ...(append
        ? {}
        : { tracks: [], playlists: [], trackTotal: 0, playlistTotal: 0, hasMore: false }),
    });
    notifyPageError('搜索失败', msg);
  }
}

export { listHubSearchSources, BUILTIN_SOURCE_LABELS, searchSourceLabel };
