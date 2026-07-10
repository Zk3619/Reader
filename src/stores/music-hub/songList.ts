/**
 * Music Hub 在线歌单状态
 */

import { createStore } from 'solid-js/store';
import {
  browseSongLists,
  getSongListDetail,
  getSongListHotTags,
  getSongListSorts,
  getSongListTags,
  MUSIC_SDK_SOURCE_LABELS,
  MUSIC_SDK_SOURCES,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import type {
  OnlinePlaylistDetail,
  OnlinePlaylistSummary,
  SongListTag,
  SongListTagGroup,
} from '@/lib/media/audio/music-sdk/types';

export interface MusicHubSongListState {
  source: MusicSdkSource;
  sortId: string;
  tagId: string | null;
  page: number;
  loading: boolean;
  error: string | null;
  tags: SongListTagGroup[];
  hotTags: SongListTag[];
  playlists: OnlinePlaylistSummary[];
  total: number;
  detail: OnlinePlaylistDetail | null;
  detailLoading: boolean;
}

const [songListState, setSongListState] = createStore<MusicHubSongListState>({
  source: 'wy',
  sortId: 'hot',
  tagId: null,
  page: 1,
  loading: false,
  error: null,
  tags: [],
  hotTags: [],
  playlists: [],
  total: 0,
  detail: null,
  detailLoading: false,
});

export function getSongListState(): MusicHubSongListState {
  return songListState;
}

export function setSongListSource(source: MusicSdkSource): void {
  const sorts = getSongListSorts(source);
  setSongListState({
    source,
    sortId: sorts[0]?.id ?? 'hot',
    tagId: null,
    page: 1,
    playlists: [],
    detail: null,
    error: null,
  });
  void loadSongListTags();
  void loadSongListPage(1);
}

export function setSongListTag(tagId: string | null): void {
  setSongListState({ tagId, page: 1 });
  void loadSongListPage(1);
}

export function setSongListSort(sortId: string): void {
  setSongListState({ sortId, page: 1 });
  void loadSongListPage(1);
}

export async function loadSongListTags(): Promise<void> {
  try {
    const [tags, hotTags] = await Promise.all([
      getSongListTags(songListState.source),
      getSongListHotTags(songListState.source),
    ]);
    setSongListState({ tags, hotTags });
  } catch {
    setSongListState({ tags: [], hotTags: [] });
  }
}

export async function loadSongListPage(page = songListState.page): Promise<void> {
  setSongListState({ loading: true, error: null, page });
  try {
    const result = await browseSongLists(
      songListState.source,
      songListState.sortId,
      songListState.tagId,
      page,
    );
    setSongListState({
      playlists: result.list,
      total: result.total,
      loading: false,
    });
  } catch (err) {
    setSongListState({
      loading: false,
      error: err instanceof Error ? err.message : '歌单加载失败',
      playlists: [],
    });
  }
}

export async function openSongListDetail(id: string, page = 1): Promise<void> {
  setSongListState({ detailLoading: true, error: null });
  try {
    const detail = await getSongListDetail(songListState.source, id, page);
    setSongListState({ detail, detailLoading: false });
  } catch (err) {
    setSongListState({
      detailLoading: false,
      error: err instanceof Error ? err.message : '歌单详情加载失败',
      detail: null,
    });
  }
}

export function closeSongListDetail(): void {
  setSongListState('detail', null);
}

export async function openListFromUrlInput(
  url: string,
  preferredSource?: MusicSdkSource,
): Promise<boolean> {
  const { openListFromUrl } = await import('@/lib/media/audio/music-sdk');
  const parsed = await openListFromUrl(url, preferredSource);
  if (!parsed) return false;
  setSongListSource(parsed.source);
  await openSongListDetail(parsed.id);
  return true;
}

export { MUSIC_SDK_SOURCES, MUSIC_SDK_SOURCE_LABELS };
