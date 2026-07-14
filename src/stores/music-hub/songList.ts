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
import { getMusicSongListUi } from '@/stores/music-hub/music-songlist-ui';

const DEFAULT_LIMIT = 30;

export interface MusicHubSongListState {
  source: MusicSdkSource;
  sortId: string;
  tagId: string | null;
  page: number;
  limit: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  tags: SongListTagGroup[];
  hotTags: SongListTag[];
  playlists: OnlinePlaylistSummary[];
  total: number;
  hasMore: boolean;
  detail: OnlinePlaylistDetail | null;
  detailLoading: boolean;
}

const [songListState, setSongListState] = createStore<MusicHubSongListState>({
  source: 'wy',
  sortId: 'hot',
  tagId: null,
  page: 1,
  limit: DEFAULT_LIMIT,
  loading: false,
  loadingMore: false,
  error: null,
  tags: [],
  hotTags: [],
  playlists: [],
  total: 0,
  hasMore: false,
  detail: null,
  detailLoading: false,
});

/** 对齐 lx / 搜索：有 total 用 total；否则页满则估算还可翻页 */
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

export function getSongListState(): MusicHubSongListState {
  return songListState;
}

export function songListPageCount(): number {
  const limit = Math.max(1, songListState.limit);
  return Math.max(1, Math.ceil(Math.max(songListState.total, 1) / limit));
}

export function setSongListSource(source: MusicSdkSource): void {
  const sorts = getSongListSorts(source);
  setSongListState({
    source,
    sortId: sorts[0]?.id ?? 'hot',
    tagId: null,
    page: 1,
    detail: null,
    error: null,
    hasMore: false,
  });
  void loadSongListTags();
  void loadSongListPage(1);
}

export function setSongListTag(tagId: string | null): void {
  setSongListState({ tagId, page: 1, hasMore: false });
  void loadSongListPage(1);
}

export function setSongListSort(sortId: string): void {
  setSongListState({ sortId, page: 1, hasMore: false });
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

/** 分页模式：跳转到指定页（替换列表） */
export async function goToSongListPage(page: number): Promise<void> {
  if (songListState.loading || songListState.loadingMore) return;
  const next = Math.max(1, Math.floor(page));
  if (next === songListState.page && songListState.playlists.length > 0) return;
  await loadSongListPage(next, { append: false });
}

/** 滚动模式：追加下一页 */
export async function loadMoreSongList(): Promise<void> {
  if (
    songListState.loading ||
    songListState.loadingMore ||
    !songListState.hasMore
  ) {
    return;
  }
  if (getMusicSongListUi().paginationPreference !== 'scroll') return;
  await loadSongListPage(songListState.page + 1, { append: true });
}

export async function loadSongListPage(
  page = songListState.page,
  options?: { append?: boolean },
): Promise<void> {
  const append = options?.append === true;
  if (append) {
    setSongListState({ loadingMore: true, error: null, page });
  } else {
    setSongListState({ loading: true, loadingMore: false, error: null, page });
  }
  try {
    const result = await browseSongLists(
      songListState.source,
      songListState.sortId,
      songListState.tagId,
      page,
    );
    const limit = result.limit > 0 ? result.limit : songListState.limit || DEFAULT_LIMIT;
    const list = result.list;
    const total = resolvePagingTotal(page, limit, list.length, result.total);
    const merged = append ? [...songListState.playlists, ...list] : list;
    const nextTotal = append
      ? Math.max(songListState.total, total, merged.length)
      : Math.max(total, list.length);
    setSongListState({
      playlists: merged,
      total: nextTotal,
      limit,
      loading: false,
      loadingMore: false,
      hasMore: resolveHasMore(page, limit, list.length, nextTotal),
    });
  } catch (err) {
    setSongListState({
      loading: false,
      loadingMore: false,
      error: err instanceof Error ? err.message : '歌单加载失败',
      ...(append ? {} : { playlists: [], hasMore: false }),
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
