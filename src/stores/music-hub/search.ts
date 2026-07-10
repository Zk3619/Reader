/**
 * Music Hub 搜索状态（歌曲 + 歌单）
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  BUILTIN_SOURCE_LABELS,
  listSearchSources,
  searchOnline,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import {
  hotSearchKeywords,
  searchSongLists,
  tipSearchKeywords,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';

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
  void refreshHotKeywords(source as AudioTrackSource);
}

export function setSearchKeyword(keyword: string): void {
  setSearchState('keyword', keyword);
}

let tipTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleTipSearch(keyword: string, source: SearchSource): void {
  if (tipTimer) clearTimeout(tipTimer);
  const trimmed = keyword.trim();
  if (!trimmed || trimmed.length < 2 || source.startsWith('userApi:')) {
    setSearchState('tipKeywords', []);
    return;
  }
  tipTimer = setTimeout(() => {
    void tipSearchKeywords(source as AudioTrackSource, trimmed)
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
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const next = [trimmed, ...searchState.history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
  setSearchState('history', next);
  saveHistory(next);
}

export function clearSearchHistory(): void {
  setSearchState('history', []);
  saveHistory([]);
}

export async function runSearch(page = 1): Promise<void> {
  const keyword = searchState.keyword.trim();
  if (!keyword) {
    setSearchState({ error: '请输入关键词', tracks: [], playlists: [] });
    return;
  }
  setSearchState({ loading: true, error: null, page });
  addSearchHistory(keyword);
  try {
    if (searchState.tab === 'song') {
      const result = await searchOnline(searchState.source, keyword);
      setSearchState({
        tracks: result.tracks,
        trackTotal: result.total || result.tracks.length,
        playlists: [],
        playlistTotal: 0,
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

export { listSearchSources, BUILTIN_SOURCE_LABELS };
