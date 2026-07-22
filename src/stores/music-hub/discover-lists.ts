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

type DiscoverKind = 'singer' | 'album';

type DiscoverState = {
  source: AudioTrackSource;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  singers: SingerListItem[];
  albums: AlbumListItem[];
};

const initial = (): DiscoverState => ({
  source: 'wy',
  loading: false,
  loadingMore: false,
  error: null,
  page: 1,
  hasMore: false,
  singers: [],
  albums: [],
});

const [singerState, setSingerState] = createStore<DiscoverState>(initial());
const [albumState, setAlbumState] = createStore<DiscoverState>(initial());

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

async function loadPage(kind: DiscoverKind, page: number, append: boolean): Promise<void> {
  const { state, set } = storeOf(kind);
  if (append) {
    if (state.loadingMore || !state.hasMore) return;
    set('loadingMore', true);
  } else {
    set({ loading: true, error: null, page: 1 });
  }
  try {
    if (kind === 'singer') {
      const res = await fetchSingerList(state.source, page);
      set({
        singers: append ? [...state.singers, ...res.items] : res.items,
        page: res.page,
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
  if (source !== 'wy' && source !== 'kg') source = 'wy';
  if (source === singerState.source && singerState.singers.length) return;
  setSingerState('source', source);
  await loadPage('singer', 1, false);
}

export async function setAlbumListSource(source: AudioTrackSource): Promise<void> {
  if (source !== 'wy' && source !== 'kg') source = 'wy';
  if (source === albumState.source && albumState.albums.length) return;
  setAlbumState('source', source);
  await loadPage('album', 1, false);
}

export async function refreshSingerList(): Promise<void> {
  await loadPage('singer', 1, false);
}

export async function refreshAlbumList(): Promise<void> {
  await loadPage('album', 1, false);
}

export async function loadMoreSingerList(): Promise<void> {
  await loadPage('singer', singerState.page + 1, true);
}

export async function loadMoreAlbumList(): Promise<void> {
  await loadPage('album', albumState.page + 1, true);
}

export async function ensureSingerListLoaded(): Promise<void> {
  if (singerState.singers.length || singerState.loading) return;
  await loadPage('singer', 1, false);
}

export async function ensureAlbumListLoaded(): Promise<void> {
  if (albumState.albums.length || albumState.loading) return;
  await loadPage('album', 1, false);
}
