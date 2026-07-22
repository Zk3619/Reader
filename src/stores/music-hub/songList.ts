/**
 * Music Hub 在线歌单状态（LX 五源 + MusicFree 推荐歌单）
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
  HubBrowseSource,
  OnlinePlaylistDetail,
  OnlinePlaylistSummary,
  SongListTag,
  SongListTagGroup,
} from '@/lib/media/audio/music-sdk/types';
import type { MfSheetItem } from '@/lib/media/audio/online/mf-plugin/types';
import {
  browseMfRecommendSheets,
  browseMfRecommendTags,
  browseMfSheetDetail,
  importMfSheetWithAnyPlugin,
} from '@/lib/media/audio/online/mf-plugin/browse';
import {
  hubMfPluginId,
  isHubMfSource,
  listHubSongListSources,
  hubBrowseSourceLabel,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import { notifyPageError } from '@/lib/ui/page-notify';
import { getMusicSongListUi } from '@/stores/music-hub/music-songlist-ui';

const DEFAULT_LIMIT = 30;

export interface MusicHubSongListState {
  source: HubBrowseSource;
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

/** MF 歌单详情需原始 sheet 对象 */
const mfSheetByKey = new Map<string, MfSheetItem>();

function mfSheetCacheKey(source: HubBrowseSource, id: string): string {
  return `${source}__${id}`;
}

function rememberMfSheets(source: HubBrowseSource, list: OnlinePlaylistSummary[]): void {
  for (const pl of list) {
    if (pl.mfSheetItem) {
      mfSheetByKey.set(mfSheetCacheKey(source, pl.id), pl.mfSheetItem);
    }
  }
}

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

function isMfSongListSource(source: HubBrowseSource): boolean {
  return isHubMfSource(source);
}

export function getSongListState(): MusicHubSongListState {
  return songListState;
}

export function songListPageCount(): number {
  const limit = Math.max(1, songListState.limit);
  return Math.max(1, Math.ceil(Math.max(songListState.total, 1) / limit));
}

export function setSongListSource(source: HubBrowseSource): void {
  const sorts = isMfSongListSource(source) ? [] : getSongListSorts(source as MusicSdkSource);
  setSongListState({
    source,
    sortId: sorts[0]?.id ?? 'hot',
    tagId: null,
    page: 1,
    detail: null,
    error: null,
    hasMore: false,
  });
  void (async () => {
    await loadSongListTags();
    await loadSongListPage(1);
  })();
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
  const source = songListState.source;
  try {
    if (isMfSongListSource(source)) {
      const pluginId = hubMfPluginId(source);
      if (!pluginId) {
        setSongListState({ tags: [], hotTags: [] });
        return;
      }
      const result = await browseMfRecommendTags(pluginId);
      const hotTags: SongListTag[] = (result.pinned ?? []).map((item) => ({
        id: String(item.id),
        name: String(item.title ?? item.id),
        source,
      }));
      const tags: SongListTagGroup[] = (result.data ?? []).map((group) => ({
        name: String(group.title ?? '分类'),
        list: (group.data ?? []).map((tag) => ({
          id: String(tag.id),
          name: String(tag.title ?? tag.id),
          source,
        })),
      }));
      setSongListState({ tags, hotTags });
      if (!songListState.tagId) {
        const first =
          hotTags[0]?.id ?? tags[0]?.list[0]?.id ?? null;
        if (first) setSongListState('tagId', first);
      }
      return;
    }
    const [tags, hotTags] = await Promise.all([
      getSongListTags(source as MusicSdkSource),
      getSongListHotTags(source as MusicSdkSource),
    ]);
    setSongListState({ tags, hotTags });
  } catch {
    setSongListState({ tags: [], hotTags: [] });
  }
}

export async function goToSongListPage(page: number): Promise<void> {
  if (songListState.loading || songListState.loadingMore) return;
  const next = Math.max(1, Math.floor(page));
  if (next === songListState.page && songListState.playlists.length > 0) return;
  await loadSongListPage(next, { append: false });
}

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
  const source = songListState.source;
  if (append) {
    setSongListState({ loadingMore: true, error: null, page });
  } else {
    setSongListState({ loading: true, loadingMore: false, error: null, page });
  }
  try {
    if (isMfSongListSource(source)) {
      const pluginId = hubMfPluginId(source);
      const tagId = songListState.tagId;
      if (!pluginId || !tagId) {
        setSongListState({
          playlists: [],
          total: 0,
          loading: false,
          loadingMore: false,
          hasMore: false,
        });
        return;
      }
      const result = await browseMfRecommendSheets(pluginId, tagId, page);
      const limit = songListState.limit || DEFAULT_LIMIT;
      const list: OnlinePlaylistSummary[] = result.list.map((item) => ({
        id: item.id,
        name: item.name,
        author: item.author,
        coverUrl: item.coverUrl,
        trackCount: item.trackCount,
        desc: item.desc,
        source,
        mfPluginId: item.mfPluginId,
        mfSheetItem: item.mfSheetItem,
      }));
      rememberMfSheets(source, list);
      const total = resolvePagingTotal(
        page,
        limit,
        list.length,
        result.isEnd ? (page - 1) * limit + list.length : page * limit + 1,
      );
      const merged = append ? [...songListState.playlists, ...list] : list;
      setSongListState({
        playlists: merged,
        total,
        limit,
        loading: false,
        loadingMore: false,
        hasMore: !result.isEnd,
      });
      return;
    }

    const result = await browseSongLists(
      source as MusicSdkSource,
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
    const msg = err instanceof Error ? err.message : '歌单加载失败';
    setSongListState({
      loading: false,
      loadingMore: false,
      error: msg,
      ...(append ? {} : { playlists: [], hasMore: false }),
    });
    notifyPageError('歌单加载失败', msg);
  }
}

export async function openSongListDetail(
  id: string,
  page = 1,
  summary?: OnlinePlaylistSummary,
): Promise<void> {
  const source = songListState.source;
  setSongListState({ detailLoading: true, error: null });
  try {
    if (isMfSongListSource(source)) {
      const pluginId = hubMfPluginId(source);
      const sheet =
        summary?.mfSheetItem ??
        mfSheetByKey.get(mfSheetCacheKey(source, id)) ??
        ({ id, platform: pluginId ?? '' } as MfSheetItem);
      if (!pluginId) throw new Error('插件源无效');
      const result = await browseMfSheetDetail(pluginId, sheet, page);
      const infoName =
        result.sheet?.title != null ? String(result.sheet.title) : summary?.name ?? id;
      const detail: OnlinePlaylistDetail = {
        info: {
          id,
          name: infoName,
          author: summary?.author,
          coverUrl: summary?.coverUrl ?? (result.sheet?.artwork as string | undefined),
          desc: summary?.desc,
          source,
          mfPluginId: pluginId,
          mfSheetItem: result.sheet ?? sheet,
        },
        tracks: result.tracks,
        total: result.tracks.length,
        page,
        limit: DEFAULT_LIMIT,
      };
      setSongListState({ detail, detailLoading: false });
      return;
    }
    const detail = await getSongListDetail(source as MusicSdkSource, id, page);
    setSongListState({ detail, detailLoading: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '歌单详情加载失败';
    setSongListState({
      detailLoading: false,
      error: msg,
      detail: null,
    });
    notifyPageError('歌单详情加载失败', msg);
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
  if (parsed) {
    setSongListSource(parsed.source);
    await openSongListDetail(parsed.id);
    return true;
  }
  const mfTracks = await importMfSheetWithAnyPlugin(url);
  if (mfTracks.length > 0) {
    const { playAsTemp } = await import('@/stores/viewer/media/audio');
    await playAsTemp(mfTracks, 0, { listName: '导入歌单', listKind: 'online-playlist' });
    return true;
  }
  return false;
}

export {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
  listHubSongListSources,
  hubBrowseSourceLabel,
};
