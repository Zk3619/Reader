/**
 * Music Hub 搜索状态（歌曲 + 歌单）
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  AGGREGATE_SEARCH_SOURCE,
  BUILTIN_SOURCES,
  BUILTIN_SOURCE_LABELS,
  listHubSearchSources,
  searchOnline,
  searchSourceLabel,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import {
  hotSearchKeywords,
  searchSongLists,
  tipSearchKeywords,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import { searchAllSources } from '@/lib/media/audio/music-sdk/search-all';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';

export type SearchTab = 'song' | 'playlist';

const SEARCH_HISTORY_KEY = 'reader.music.searchHistory';
const MAX_HISTORY = 20;

export interface MusicHubSearchState {
  tab: SearchTab;
  source: SearchSource;
  keyword: string;
  page: number;
  loading: boolean;
  error: string | null;
  tracks: AudioTrack[];
  trackTotal: number;
  playlists: OnlinePlaylistSummary[];
  playlistTotal: number;
  hotKeywords: string[];
  tipKeywords: string[];
  history: string[];
  /** 是否已确认搜索（回车后为 true，展示联网结果） */
  submitted: boolean;
  /** 是否展示空态/历史/本地匹配面板 */
  helpVisible: boolean;
}

const [searchState, setSearchState] = createStore<MusicHubSearchState>({
  tab: 'song',
  source: 'wy',
  keyword: '',
  page: 1,
  loading: false,
  error: null,
  tracks: [],
  trackTotal: 0,
  playlists: [],
  playlistTotal: 0,
  hotKeywords: [],
  tipKeywords: [],
  history: loadHistory(),
  submitted: false,
  helpVisible: true,
});

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]): void {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function getSearchState(): MusicHubSearchState {
  return searchState;
}

export function setSearchTab(tab: SearchTab): void {
  setSearchState('tab', tab);
}

export function setSearchSource(source: SearchSource): void {
  setSearchState({ source, page: 1, error: null });
  if (source === AGGREGATE_SEARCH_SOURCE) {
    void refreshHotKeywords('wy');
    return;
  }
  if (!source.startsWith('userApi:')) {
    void refreshHotKeywords(source as AudioTrackSource);
    return;
  }
  setSearchState('hotKeywords', []);
}

function tipSearchSource(source: SearchSource): AudioTrackSource | null {
  if (source === AGGREGATE_SEARCH_SOURCE) return 'wy';
  if (source.startsWith('userApi:')) return null;
  return source as AudioTrackSource;
}

export function setSearchKeyword(keyword: string): void {
  const wasSubmitted = searchState.submitted;
  setSearchState({
    keyword,
    helpVisible: true,
    submitted: false,
    tipKeywords: [],
    ...(wasSubmitted
      ? { tracks: [], playlists: [], loading: false, error: null, trackTotal: 0, playlistTotal: 0 }
      : {}),
  });
}

export function setSearchHelpVisible(visible: boolean): void {
  setSearchState('helpVisible', visible);
}

export function setSearchSubmitted(submitted: boolean): void {
  setSearchState('submitted', submitted);
}

let tipTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleTipSearch(keyword: string, source: SearchSource): void {
  if (tipTimer) clearTimeout(tipTimer);
  const trimmed = keyword.trim();
  const tipSource = tipSearchSource(source);
  if (!trimmed || trimmed.length < 2 || !tipSource) {
    setSearchState('tipKeywords', []);
    return;
  }
  tipTimer = setTimeout(() => {
    void tipSearchKeywords(tipSource, trimmed)
      .then((words) => setSearchState('tipKeywords', words))
      .catch(() => setSearchState('tipKeywords', []));
  }, 300);
}

export async function refreshHotKeywords(source: AudioTrackSource): Promise<void> {
  try {
    const words = await hotSearchKeywords(source);
    setSearchState('hotKeywords', words);
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
}

export function removeSearchHistoryItem(word: string): void {
  const next = searchState.history.filter((h) => h !== word);
  setSearchState('history', next);
  saveHistory(next);
}

export function clearSearchHistory(): void {
  setSearchState('history', []);
  saveHistory([]);
}

async function searchPlaylistsAggregate(
  keyword: string,
  page: number,
): Promise<{ list: OnlinePlaylistSummary[]; total: number }> {
  const results = await Promise.all(
    BUILTIN_SOURCES.map((source) =>
      searchSongLists(source as MusicSdkSource, keyword, page).catch(() => ({
        list: [],
        total: 0,
      })),
    ),
  );
  const seen = new Set<string>();
  const merged: OnlinePlaylistSummary[] = [];
  for (const result of results) {
    for (const playlist of result.list) {
      const key = `${playlist.source}|${playlist.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(playlist);
    }
  }
  return { list: merged, total: merged.length };
}

export async function submitSearch(page = 1): Promise<void> {
  const keyword = searchState.keyword.trim();
  if (!keyword) {
    setSearchState({ error: '请输入关键词', submitted: false, helpVisible: true });
    return;
  }
  setSearchState({
    submitted: true,
    helpVisible: false,
    loading: true,
    error: null,
    page,
    tipKeywords: [],
  });
  addSearchHistory(keyword);
  await runSearch(page);
}

export async function runSearch(page = 1): Promise<void> {
  const keyword = searchState.keyword.trim();
  if (!keyword) {
    setSearchState({ error: '请输入关键词', tracks: [], playlists: [] });
    return;
  }
  setSearchState({ loading: true, error: null, page });
  try {
    if (searchState.tab === 'song') {
      if (searchState.source === AGGREGATE_SEARCH_SOURCE) {
        const result = await searchAllSources(keyword, page);
        setSearchState({
          tracks: result.merged,
          trackTotal: result.merged.length,
          playlists: [],
          playlistTotal: 0,
          loading: false,
        });
      } else {
        const result = await searchOnline(searchState.source, keyword);
        setSearchState({
          tracks: result.tracks,
          trackTotal: result.total || result.tracks.length,
          playlists: [],
          playlistTotal: 0,
          loading: false,
        });
      }
    } else if (searchState.source === AGGREGATE_SEARCH_SOURCE) {
      const result = await searchPlaylistsAggregate(keyword, page);
      setSearchState({
        playlists: result.list,
        playlistTotal: result.total,
        tracks: [],
        trackTotal: 0,
        loading: false,
      });
    } else {
      const sdkSource = searchState.source as MusicSdkSource;
      const result = await searchSongLists(sdkSource, keyword, page);
      setSearchState({
        playlists: result.list,
        playlistTotal: result.total,
        tracks: [],
        trackTotal: 0,
        loading: false,
      });
    }
  } catch (err) {
    setSearchState({
      loading: false,
      error: err instanceof Error ? err.message : '搜索失败',
      tracks: [],
      playlists: [],
    });
  }
}

export { listHubSearchSources, BUILTIN_SOURCE_LABELS, searchSourceLabel };
