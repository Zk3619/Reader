/**
 * 专辑 / 歌手浏览详情状态（Hub 叠加层）
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { fetchAlbumDetail, type AlbumDetail } from '@/lib/media/audio/music-sdk/album';
import { fetchSingerDetail, type SingerDetail } from '@/lib/media/audio/music-sdk/singer';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';

export type MusicBrowseKind = 'album' | 'singer';

export type MusicBrowseDetail = {
  kind: MusicBrowseKind;
  id: string;
  name: string;
  subtitle?: string;
  coverUrl?: string;
  intro?: string;
  tracks: AudioTrack[];
  source: AudioTrackSource;
  page?: number;
  hasMore?: boolean;
};

type BrowseState = {
  open: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  detail: MusicBrowseDetail | null;
};

const [browseState, setBrowseState] = createStore<BrowseState>({
  open: false,
  loading: false,
  loadingMore: false,
  error: null,
  detail: null,
});

export function getMusicBrowseState() {
  return browseState;
}

function toBrowseFromAlbum(album: AlbumDetail): MusicBrowseDetail {
  return {
    kind: 'album',
    id: album.id,
    name: album.name,
    subtitle: album.artist,
    coverUrl: album.coverUrl,
    tracks: album.tracks,
    source: album.source,
    page: album.page ?? 1,
    hasMore: album.hasMore === true,
  };
}

function toBrowseFromSinger(singer: SingerDetail): MusicBrowseDetail {
  return {
    kind: 'singer',
    id: singer.id,
    name: singer.name,
    coverUrl: singer.coverUrl,
    intro: singer.intro,
    tracks: singer.tracks,
    source: singer.source,
    page: singer.page ?? 1,
    hasMore: singer.hasMore === true,
  };
}

export async function openAlbumBrowse(
  source: AudioTrackSource,
  albumId: string,
): Promise<void> {
  if (!albumId) return;
  setBrowseState({
    open: true,
    loading: true,
    loadingMore: false,
    error: null,
    detail: null,
  });
  try {
    const album = await fetchAlbumDetail(source, albumId, 1);
    if (!album) {
      setBrowseState({
        loading: false,
        error: '未找到专辑详情',
      });
      return;
    }
    setBrowseState({
      loading: false,
      detail: toBrowseFromAlbum(album),
    });
  } catch (error) {
    setBrowseState({
      loading: false,
      error: toUserFacingMusicError(error),
    });
  }
}

export async function openSingerBrowse(
  source: AudioTrackSource,
  singerId: string,
  singerName?: string,
): Promise<void> {
  if (!singerId && !singerName?.trim()) return;
  setBrowseState({
    open: true,
    loading: true,
    loadingMore: false,
    error: null,
    detail: null,
  });
  try {
    const singer = await fetchSingerDetail(
      source,
      singerId || singerName || '',
      singerName,
      1,
    );
    if (!singer) {
      setBrowseState({
        loading: false,
        error: '未找到歌手详情',
      });
      return;
    }
    setBrowseState({
      loading: false,
      detail: toBrowseFromSinger(singer),
    });
  } catch (error) {
    setBrowseState({
      loading: false,
      error: toUserFacingMusicError(error),
    });
  }
}

export async function loadMoreMusicBrowse(): Promise<void> {
  const detail = browseState.detail;
  if (!detail?.hasMore || browseState.loadingMore) return;
  const nextPage = (detail.page ?? 1) + 1;
  setBrowseState({ loadingMore: true, error: null });
  try {
    if (detail.kind === 'album') {
      const album = await fetchAlbumDetail(detail.source, detail.id, nextPage);
      if (!album) {
        setBrowseState({ loadingMore: false, detail: { ...detail, hasMore: false } });
        return;
      }
      setBrowseState({
        loadingMore: false,
        detail: {
          ...toBrowseFromAlbum(album),
          tracks: [...detail.tracks, ...album.tracks],
          page: nextPage,
        },
      });
      return;
    }
    const singer = await fetchSingerDetail(
      detail.source,
      detail.id,
      detail.name,
      nextPage,
    );
    if (!singer) {
      setBrowseState({ loadingMore: false, detail: { ...detail, hasMore: false } });
      return;
    }
    setBrowseState({
      loadingMore: false,
      detail: {
        ...toBrowseFromSinger(singer),
        tracks: [...detail.tracks, ...singer.tracks],
        page: nextPage,
      },
    });
  } catch (error) {
    setBrowseState({
      loadingMore: false,
      error: toUserFacingMusicError(error),
    });
  }
}

export function closeMusicBrowse(): void {
  setBrowseState({
    open: false,
    loading: false,
    loadingMore: false,
    error: null,
    detail: null,
  });
}
