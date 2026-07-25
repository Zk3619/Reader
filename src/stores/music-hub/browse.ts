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
  options?: { mfAlbumItem?: Record<string, unknown> },
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
      setBrowseState({
        loading: false,
        detail: {
          kind: 'album',
          id: String(albumItemMeta?.id ?? albumId),
          name: String(albumItemMeta?.title ?? albumId),
          subtitle:
            typeof albumItemMeta?.artist === 'string' ? albumItemMeta.artist : undefined,
          coverUrl:
            typeof albumItemMeta?.artwork === 'string' ? albumItemMeta.artwork : undefined,
          tracks: result.tracks,
          source,
          page: 1,
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
  options?: { mfArtistItem?: Record<string, unknown> },
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
      };
      const result = await browseMfArtistWorks(pluginId, artistItem, 1);
      setBrowseState({
        loading: false,
        detail: {
          kind: 'singer',
          id: String(artistItem.id ?? singerId),
          name: String(singerName ?? artistItem.name ?? singerId),
          tracks: result.tracks,
          source,
          page: 1,
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
      if (isMfSourceKey(String(detail.source))) {
        const pluginId = parseMfPluginId(String(detail.source));
        if (!pluginId) return;
        const result = await browseMfAlbum(pluginId, { id: detail.id }, nextPage);
        if (!result.tracks.length && result.isEnd) {
          setBrowseState({ loadingMore: false, detail: { ...detail, hasMore: false } });
          return;
        }
        setBrowseState({
          loadingMore: false,
          detail: {
            ...detail,
            tracks: [...detail.tracks, ...result.tracks],
            page: nextPage,
            hasMore: !result.isEnd,
          },
        });
        return;
      }
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
    if (isMfSourceKey(String(detail.source))) {
      const pluginId = parseMfPluginId(String(detail.source));
      if (!pluginId) return;
      const result = await browseMfArtistWorks(
        pluginId,
        { id: detail.id, name: detail.name },
        nextPage,
      );
      if (!result.tracks.length && result.isEnd) {
        setBrowseState({ loadingMore: false, detail: { ...detail, hasMore: false } });
        return;
      }
      setBrowseState({
        loadingMore: false,
        detail: {
          ...detail,
          tracks: [...detail.tracks, ...result.tracks],
          page: nextPage,
          hasMore: !result.isEnd,
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
    kind: null,
    loading: false,
    loadingMore: false,
    error: null,
    detail: null,
  });
}
