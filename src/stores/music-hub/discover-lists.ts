/**
 * Hub 歌手 / 专辑发现列表状态
 */

import { createStore } from 'solid-js/store';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  fetchSingerList,
  type SingerListItem,
} from '@/lib/media/audio/music-sdk/singer-list';
import {
  fetchAlbumList,
  type AlbumListItem,
} from '@/lib/media/audio/music-sdk/album-list';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { getMusicDiscoverPaginationPreference } from '@/stores/music-hub/music-discover-ui';

type DiscoverKind = 'singer' | 'album';
type DiscoverSource = 'wy' | 'kg';

type DiscoverState = {
  source: AudioTrackSource;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  page: number;
  limit: number;
  total: number;
  /** 接口是否返回了可靠 total（用于显示末页与跳转） */
  totalKnown: boolean;
  hasMore: boolean;
  singers: SingerListItem[];
  albums: AlbumListItem[];
};

function normalizeDiscoverSource(source: unknown): DiscoverSource {
  return source === 'kg' ? 'kg' : 'wy';
}

function readPersistedSource(kind: DiscoverKind): DiscoverSource {
  const settings = getMusicSettings();
  return normalizeDiscoverSource(
    kind === 'singer' ? settings.musicSingerListSource : settings.musicAlbumListSource,
  );
}

const initial = (kind: DiscoverKind): DiscoverState => ({
  source: readPersistedSource(kind),
  loading: false,
  loadingMore: false,
  error: null,
  page: 1,
  limit: 30,
  total: 0,
  totalKnown: false,
  hasMore: false,
  singers: [],
  albums: [],
});

const [singerState, setSingerState] = createStore<DiscoverState>(initial('singer'));
const [albumState, setAlbumState] = createStore<DiscoverState>(initial('album'));

function storeOf(kind: DiscoverKind) {
  return kind === 'singer'
    ? { state: singerState, set: setSingerState }
    : { state: albumState, set: setAlbumState };
}

export function getMusicSingerListState() {
  return singerState;
}

export function getMusicAlbumListState() {
  return albumState;
}

/** 配置 hydrate 后回填来源（不自动拉网，等页面 ensure* 触发） */
export function syncDiscoverListSourcesFromSettings(): void {
  const singerSource = readPersistedSource('singer');
  const albumSource = readPersistedSource('album');
  if (singerState.source !== singerSource) {
    setSingerState({
      source: singerSource,
      singers: [],
      page: 1,
      total: 0,
      totalKnown: false,
      hasMore: false,
      error: null,
    });
  }
  if (albumState.source !== albumSource) {
    setAlbumState({
      source: albumSource,
      albums: [],
      page: 1,
      total: 0,
      totalKnown: false,
      hasMore: false,
      error: null,
    });
  }
}

subscribeMusicSettings(() => {
  syncDiscoverListSourcesFromSettings();
});

async function loadPage(kind: DiscoverKind, page: number, append: boolean): Promise<void> {
  const { state, set } = storeOf(kind);
  if (append) {
    if (state.loadingMore || !state.hasMore) return;
    set('loadingMore', true);
  } else {
    set({ loading: true, loadingMore: false, error: null, page });
  }
  try {
    if (kind === 'singer') {
      const res = await fetchSingerList(state.source, page);
      set({
        singers: append ? [...state.singers, ...res.items] : res.items,
        page: res.page,
        limit: res.limit,
        total:
          res.total ??
          (res.hasMore
            ? res.page * res.limit + 1
            : (res.page - 1) * res.limit + res.items.length),
        totalKnown: res.total != null,
        hasMore: res.hasMore,
        loading: false,
        loadingMore: false,
        error: null,
      });
    } else {
      const res = await fetchAlbumList(state.source, page);
      set({
        albums: append ? [...state.albums, ...res.items] : res.items,
        page: res.page,
        limit: res.limit,
        total:
          res.total ??
          (res.hasMore
            ? res.page * res.limit + 1
            : (res.page - 1) * res.limit + res.items.length),
        totalKnown: res.total != null,
        hasMore: res.hasMore,
        loading: false,
        loadingMore: false,
        error: null,
      });
    }
  } catch (e) {
    set({
      loading: false,
      loadingMore: false,
      error: toUserFacingMusicError(e),
    });
  }
}

export async function setSingerListSource(source: AudioTrackSource): Promise<void> {
  const next = normalizeDiscoverSource(source);
  if (next === singerState.source && singerState.singers.length) return;
  setSingerState('source', next);
  setMusicSettings({ musicSingerListSource: next }, { persistImmediate: true });
  await loadPage('singer', 1, false);
}

export async function setAlbumListSource(source: AudioTrackSource): Promise<void> {
  const next = normalizeDiscoverSource(source);
  if (next === albumState.source && albumState.albums.length) return;
  setAlbumState('source', next);
  setMusicSettings({ musicAlbumListSource: next }, { persistImmediate: true });
  await loadPage('album', 1, false);
}

export async function refreshSingerList(): Promise<void> {
  await loadPage('singer', 1, false);
}

export async function refreshAlbumList(): Promise<void> {
  await loadPage('album', 1, false);
}

export async function loadMoreSingerList(): Promise<void> {
  if (getMusicDiscoverPaginationPreference('singer') !== 'scroll') return;
  await loadPage('singer', singerState.page + 1, true);
}

export async function loadMoreAlbumList(): Promise<void> {
  if (getMusicDiscoverPaginationPreference('album') !== 'scroll') return;
  await loadPage('album', albumState.page + 1, true);
}

export async function goToSingerListPage(page: number): Promise<void> {
  if (singerState.loading || singerState.loadingMore) return;
  const next = Math.max(1, Math.floor(page));
  if (next === singerState.page && singerState.singers.length > 0) return;
  await loadPage('singer', next, false);
}

export async function goToAlbumListPage(page: number): Promise<void> {
  if (albumState.loading || albumState.loadingMore) return;
  const next = Math.max(1, Math.floor(page));
  if (next === albumState.page && albumState.albums.length > 0) return;
  await loadPage('album', next, false);
}

function pageCountOf(state: DiscoverState): number {
  if (state.totalKnown) {
    return Math.max(1, Math.ceil(Math.max(0, state.total) / Math.max(1, state.limit)));
  }
  return Math.max(1, state.hasMore ? state.page + 1 : state.page);
}

export function singerListPageCount(): number {
  return pageCountOf(singerState);
}

export function albumListPageCount(): number {
  return pageCountOf(albumState);
}

export async function ensureSingerListLoaded(): Promise<void> {
  if (singerState.singers.length || singerState.loading) return;
  await loadPage('singer', 1, false);
}

export async function ensureAlbumListLoaded(): Promise<void> {
  if (albumState.albums.length || albumState.loading) return;
  await loadPage('album', 1, false);
}
