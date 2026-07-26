/**
 * 专辑 / 歌手浏览详情状态（归属 artist / album 分区内详情）
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { fetchAlbumDetail, type AlbumDetail } from '@/lib/media/audio/music-sdk/album';
import { fetchSingerDetail, type SingerDetail } from '@/lib/media/audio/music-sdk/singer';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { isMfSourceKey, parseMfPluginId } from '@/lib/media/audio/online/mf-plugin/types';
import { browseMfAlbum, browseMfArtistWorks } from '@/lib/media/audio/online/mf-plugin/browse';
import { setMusicSection } from '@/stores/viewer/media/audio';
import {
  getMusicDiscoverPaginationPreference,
  type MusicDiscoverKind,
} from '@/stores/music-hub/music-discover-ui';

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
  limit?: number;
  total?: number;
  hasMore?: boolean;
};

type BrowseState = {
  open: boolean;
  kind: MusicBrowseKind | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  detail: MusicBrowseDetail | null;
};

const [browseState, setBrowseState] = createStore<BrowseState>({
  open: false,
  kind: null,
  loading: false,
  loadingMore: false,
  error: null,
  detail: null,
});

export function getMusicBrowseState() {
  return browseState;
}

function discoverKindOf(kind: MusicBrowseKind): MusicDiscoverKind {
  return kind === 'album' ? 'album' : 'singer';
}

function resolvePagingTotal(
  page: number,
  limit: number,
  listLength: number,
  reportedTotal?: number,
): number {
  if (typeof reportedTotal === 'number' && reportedTotal > 0) return reportedTotal;
  if (listLength <= 0) return Math.max(0, (page - 1) * limit);
  if (listLength < limit) return (page - 1) * limit + listLength;
  return page * limit + 1;
}

function resolveHasMore(
  page: number,
  limit: number,
  listLength: number,
  total: number,
): boolean {
  if (listLength <= 0) return false;
  if (listLength < limit) return false;
  return page * limit < total;
}

function toBrowseFromAlbum(album: AlbumDetail): MusicBrowseDetail {
  const page = album.page ?? 1;
  const limit = Math.max(1, album.limit ?? (album.tracks.length || 1));
  const total = resolvePagingTotal(page, limit, album.tracks.length, album.total);
  return {
    kind: 'album',
    id: album.id,
    name: album.name,
    subtitle: album.artist,
    coverUrl: album.coverUrl,
    intro: album.intro,
    tracks: album.tracks,
    source: album.source,
    page,
    limit,
    total,
    hasMore: album.hasMore === true || resolveHasMore(page, limit, album.tracks.length, total),
  };
}

function toBrowseFromSinger(singer: SingerDetail): MusicBrowseDetail {
  const page = singer.page ?? 1;
  const limit = Math.max(1, singer.limit ?? (singer.tracks.length || 1));
  const total = resolvePagingTotal(page, limit, singer.tracks.length, singer.total);
  return {
    kind: 'singer',
    id: singer.id,
    name: singer.name,
    coverUrl: singer.coverUrl,
    intro: singer.intro,
    tracks: singer.tracks,
    source: singer.source,
    page,
    limit,
    total,
    hasMore: singer.hasMore === true || resolveHasMore(page, limit, singer.tracks.length, total),
  };
}

export function musicBrowsePageCount(): number {
  const detail = browseState.detail;
  if (!detail) return 1;
  const limit = Math.max(1, detail.limit ?? 100);
  return Math.max(1, Math.ceil(Math.max(detail.total ?? detail.tracks.length, 1) / limit));
}

export async function openAlbumBrowse(
  source: AudioTrackSource,
  albumId: string,
  options?: {
    mfAlbumItem?: Record<string, unknown>;
    /** 列表页已有的名称/封面/歌手，详情接口缺字段时兜底 */
    name?: string;
    artist?: string;
    coverUrl?: string;
  },
): Promise<void> {
  if (!albumId && !options?.mfAlbumItem) return;
  setMusicSection('album');
  setBrowseState({
    open: true,
    kind: 'album',
    loading: true,
    loadingMore: false,
    error: null,
    detail: null,
  });
  try {
    if (isMfSourceKey(String(source))) {
      const pluginId = parseMfPluginId(String(source));
      if (!pluginId) throw new Error('无效 MF 源');
      const albumItem = (options?.mfAlbumItem ?? { id: albumId }) as {
        id: string;
        platform?: string;
      };
      const result = await browseMfAlbum(pluginId, albumItem, 1);
      const albumItemMeta = result.albumItem;
      const tracks = result.tracks;
      const limit = Math.max(50, tracks.length || 1);
      setBrowseState({
        loading: false,
        detail: {
          kind: 'album',
          id: String(albumItemMeta?.id ?? albumId),
          name: String(albumItemMeta?.title ?? options?.name ?? albumId),
          subtitle:
            typeof albumItemMeta?.artist === 'string'
              ? albumItemMeta.artist
              : options?.artist,
          coverUrl:
            typeof albumItemMeta?.artwork === 'string'
              ? albumItemMeta.artwork
              : options?.coverUrl,
          tracks,
          source,
          page: 1,
          limit,
          total: resolvePagingTotal(1, limit, tracks.length, undefined),
          hasMore: !result.isEnd,
        },
      });
      return;
    }
    const album = await fetchAlbumDetail(source, albumId, 1);
    if (!album) {
      setBrowseState({
        loading: false,
        error: '未找到专辑详情',
      });
      return;
    }
    const mapped = toBrowseFromAlbum(album);
    setBrowseState({
      loading: false,
      detail: {
        ...mapped,
        name: mapped.name.trim() || options?.name?.trim() || mapped.id,
        subtitle: mapped.subtitle?.trim() || options?.artist?.trim() || undefined,
        coverUrl: mapped.coverUrl || options?.coverUrl,
      },
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
  options?: {
    mfArtistItem?: Record<string, unknown>;
    coverUrl?: string;
  },
): Promise<void> {
  if (!singerId && !singerName?.trim() && !options?.mfArtistItem) return;
  setMusicSection('artist');
  setBrowseState({
    open: true,
    kind: 'singer',
    loading: true,
    loadingMore: false,
    error: null,
    detail: null,
  });
  try {
    if (isMfSourceKey(String(source))) {
      const pluginId = parseMfPluginId(String(source));
      if (!pluginId) throw new Error('无效 MF 源');
      const artistItem = (options?.mfArtistItem ??
        ({ id: singerId || singerName || '', name: singerName } as Record<string, unknown>)) as {
        id: string;
        platform?: string;
        name?: string;
        artwork?: string;
        avatar?: string;
        description?: string;
      };
      const result = await browseMfArtistWorks(pluginId, artistItem, 1);
      const tracks = result.tracks;
      const limit = Math.max(50, tracks.length || 1);
      const coverUrl =
        (typeof artistItem.artwork === 'string' && artistItem.artwork) ||
        (typeof artistItem.avatar === 'string' && artistItem.avatar) ||
        options?.coverUrl ||
        undefined;
      const intro =
        typeof artistItem.description === 'string' ? artistItem.description : undefined;
      setBrowseState({
        loading: false,
        detail: {
          kind: 'singer',
          id: String(artistItem.id ?? singerId),
          name: String(singerName ?? artistItem.name ?? singerId),
          coverUrl,
          intro,
          tracks,
          source,
          page: 1,
          limit,
          total: resolvePagingTotal(1, limit, tracks.length, undefined),
          hasMore: !result.isEnd,
        },
      });
      return;
    }
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
    const mapped = toBrowseFromSinger(singer);
    setBrowseState({
      loading: false,
      detail: {
        ...mapped,
        name: mapped.name.trim() || singerName?.trim() || mapped.id,
        coverUrl: mapped.coverUrl || options?.coverUrl,
      },
    });
  } catch (error) {
    setBrowseState({
      loading: false,
      error: toUserFacingMusicError(error),
    });
  }
}

async function fetchBrowsePage(
  detail: MusicBrowseDetail,
  page: number,
): Promise<MusicBrowseDetail | null> {
  if (detail.kind === 'album') {
    if (isMfSourceKey(String(detail.source))) {
      const pluginId = parseMfPluginId(String(detail.source));
      if (!pluginId) return null;
      const result = await browseMfAlbum(pluginId, { id: detail.id }, page);
      const limit = Math.max(1, detail.limit ?? (result.tracks.length || 50));
      const total = resolvePagingTotal(page, limit, result.tracks.length, detail.total);
      return {
        ...detail,
        tracks: result.tracks,
        page,
        limit,
        total,
        hasMore: !result.isEnd,
      };
    }
    const album = await fetchAlbumDetail(detail.source, detail.id, page);
    if (!album) return null;
    return {
      ...toBrowseFromAlbum(album),
      // 保留首屏已拿到的元信息（名称/封面/简介），避免分页接口缺字段时被清空
      name: album.name || detail.name,
      subtitle: album.artist || detail.subtitle,
      coverUrl: album.coverUrl || detail.coverUrl,
      intro: album.intro || detail.intro,
    };
  }

  if (isMfSourceKey(String(detail.source))) {
    const pluginId = parseMfPluginId(String(detail.source));
    if (!pluginId) return null;
    const result = await browseMfArtistWorks(
      pluginId,
      { id: detail.id, name: detail.name },
      page,
    );
    const limit = Math.max(1, detail.limit ?? (result.tracks.length || 50));
    const total = resolvePagingTotal(page, limit, result.tracks.length, detail.total);
    return {
      ...detail,
      tracks: result.tracks,
      page,
      limit,
      total,
      hasMore: !result.isEnd,
    };
  }

  const singer = await fetchSingerDetail(detail.source, detail.id, detail.name, page);
  if (!singer) return null;
  const next = toBrowseFromSinger(singer);
  return {
    ...next,
    name: next.name || detail.name,
    coverUrl: next.coverUrl || detail.coverUrl,
    intro: next.intro || detail.intro,
  };
}

export async function loadMoreMusicBrowse(): Promise<void> {
  const detail = browseState.detail;
  if (!detail?.hasMore || browseState.loadingMore || browseState.loading) return;
  const pref = getMusicDiscoverPaginationPreference(discoverKindOf(detail.kind));
  if (pref !== 'scroll') return;

  const nextPage = (detail.page ?? 1) + 1;
  setBrowseState({ loadingMore: true, error: null });
  try {
    const pageDetail = await fetchBrowsePage(detail, nextPage);
    if (!pageDetail || pageDetail.tracks.length === 0) {
      setBrowseState({
        loadingMore: false,
        detail: { ...detail, hasMore: false },
      });
      return;
    }
    const mergedTracks = [...detail.tracks, ...pageDetail.tracks];
    const limit = Math.max(1, pageDetail.limit ?? detail.limit ?? 100);
    const total = Math.max(
      pageDetail.total ?? 0,
      detail.total ?? 0,
      mergedTracks.length,
    );
    setBrowseState({
      loadingMore: false,
      detail: {
        ...detail,
        ...pageDetail,
        tracks: mergedTracks,
        page: nextPage,
        limit,
        total,
        hasMore: pageDetail.hasMore === true || resolveHasMore(nextPage, limit, pageDetail.tracks.length, total),
        // 滚动追加时保留首屏资料
        name: pageDetail.name || detail.name,
        coverUrl: pageDetail.coverUrl || detail.coverUrl,
        intro: pageDetail.intro || detail.intro,
        subtitle: pageDetail.subtitle || detail.subtitle,
      },
    });
  } catch (error) {
    setBrowseState({
      loadingMore: false,
      error: toUserFacingMusicError(error),
    });
  }
}

export async function goToMusicBrowsePage(page: number): Promise<void> {
  const detail = browseState.detail;
  if (!detail || browseState.loading || browseState.loadingMore) return;
  const target = Math.max(1, Math.floor(page));
  if (target === (detail.page ?? 1) && detail.tracks.length > 0) return;

  setBrowseState({ loadingMore: true, error: null });
  try {
    const pageDetail = await fetchBrowsePage(detail, target);
    if (!pageDetail) {
      setBrowseState({
        loadingMore: false,
        detail: { ...detail, hasMore: false },
      });
      return;
    }
    setBrowseState({
      loadingMore: false,
      detail: {
        ...detail,
        ...pageDetail,
        name: pageDetail.name || detail.name,
        coverUrl: pageDetail.coverUrl || detail.coverUrl,
        intro: pageDetail.intro || detail.intro,
        subtitle: pageDetail.subtitle || detail.subtitle,
      },
    });
  } catch (error) {
    setBrowseState({
      loadingMore: false,
      error: toUserFacingMusicError(error),
    });
  }
}

/** 切回第 1 页（分页方式切换时） */
export async function reloadMusicBrowseFirstPage(): Promise<void> {
  const detail = browseState.detail;
  if (!detail || browseState.loading || browseState.loadingMore) return;

  setBrowseState({ loadingMore: true, error: null });
  try {
    const pageDetail = await fetchBrowsePage(detail, 1);
    if (!pageDetail) {
      setBrowseState({
        loadingMore: false,
        detail: { ...detail, page: 1, hasMore: false },
      });
      return;
    }
    setBrowseState({
      loadingMore: false,
      detail: {
        ...detail,
        ...pageDetail,
        page: 1,
        // 强制替换为第 1 页，丢掉滚动追加的后续页
        tracks: pageDetail.tracks,
        name: pageDetail.name || detail.name,
        coverUrl: pageDetail.coverUrl || detail.coverUrl,
        intro: pageDetail.intro || detail.intro,
        subtitle: pageDetail.subtitle || detail.subtitle,
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
    kind: null,
    loading: false,
    loadingMore: false,
    error: null,
    detail: null,
  });
}
