/**
 * 平台源 Hub 歌单浏览（网易推荐/精品/我的 · B 站收藏夹 · YTM Home/曲库）
 */

import type {
  OnlinePlaylistDetail,
  OnlinePlaylistSummary,
  SongListTag,
  SongListTagGroup,
} from '@/lib/media/audio/music-sdk/types';
import type { PlatformSourceId } from '@/lib/media/audio/platform/platform-sources';
import { PLATFORM_SOURCE_LABELS } from '@/lib/media/audio/platform/platform-sources';

export function isHubPlatformSource(source: string): source is PlatformSourceId {
  return source === 'netease' || source === 'bili' || source === 'ytm';
}

/** 平台源歌单标签 id */
export const PLATFORM_SONG_LIST_TAGS = {
  neteaseRecommend: 'recommend',
  neteaseMine: 'mine',
  neteaseHighQuality: 'highquality',
  biliCreated: 'created',
  biliCollected: 'collected',
  ytmHome: 'home',
  ytmLibrary: 'library',
} as const;

export function platformBrowseTags(source: PlatformSourceId): SongListTagGroup[] {
  const label = PLATFORM_SOURCE_LABELS[source];
  if (source === 'netease') {
    return [
      {
        name: label,
        list: [
          { id: PLATFORM_SONG_LIST_TAGS.neteaseRecommend, name: '推荐歌单', source },
          { id: PLATFORM_SONG_LIST_TAGS.neteaseMine, name: '我的歌单', source },
          { id: PLATFORM_SONG_LIST_TAGS.neteaseHighQuality, name: '精品歌单', source },
        ],
      },
    ];
  }
  if (source === 'bili') {
    return [
      {
        name: label,
        list: [
          { id: PLATFORM_SONG_LIST_TAGS.biliCreated, name: '我的收藏夹', source },
          { id: PLATFORM_SONG_LIST_TAGS.biliCollected, name: '订阅收藏夹', source },
        ],
      },
    ];
  }
  return [
    {
      name: label,
      list: [
        { id: PLATFORM_SONG_LIST_TAGS.ytmHome, name: '推荐歌单', source },
        { id: PLATFORM_SONG_LIST_TAGS.ytmLibrary, name: '曲库歌单', source },
      ],
    },
  ];
}

export function platformBrowseHotTags(source: PlatformSourceId): SongListTag[] {
  return platformBrowseTags(source)[0]?.list ?? [];
}

export function platformDefaultTagId(source: PlatformSourceId): string {
  return platformBrowseHotTags(source)[0]?.id ?? 'default';
}

export interface BrowsePlatformPlaylistsResult {
  list: OnlinePlaylistSummary[];
  total: number;
  limit: number;
  /** 空列表时的可读原因（未登录等），由歌单页展示 */
  emptyHint?: string;
}

export async function browsePlatformPlaylists(
  source: PlatformSourceId,
  page = 1,
  tagId?: string | null,
): Promise<BrowsePlatformPlaylistsResult> {
  const limit = 40;
  if (page > 1) return { list: [], total: 0, limit };

  const tag = tagId || platformDefaultTagId(source);

  if (source === 'netease') {
    if (tag === PLATFORM_SONG_LIST_TAGS.neteaseMine) {
      const { getUserPlaylists } = await import('@/lib/media/audio/platform/api/netease');
      const pls = await getUserPlaylists(limit);
      const list: OnlinePlaylistSummary[] = pls.map((p) => ({
        id: p.id,
        name: p.name,
        source: 'netease',
        coverUrl: p.coverUrl,
        trackCount: p.trackCount,
      }));
      return {
        list,
        total: list.length,
        limit,
        emptyHint: list.length
          ? undefined
          : '未登录或无法读取「我的歌单」，请先在账号设置中登录网易云',
      };
    }
    if (tag === PLATFORM_SONG_LIST_TAGS.neteaseHighQuality) {
      const { getHighQualityPlaylists } = await import(
        '@/lib/media/audio/platform/api/netease'
      );
      const pls = await getHighQualityPlaylists('全部', limit);
      const list: OnlinePlaylistSummary[] = pls.map((p) => ({
        id: p.id,
        name: p.name,
        source: 'netease',
        coverUrl: p.coverUrl,
        trackCount: p.trackCount,
      }));
      return { list, total: list.length, limit };
    }
    const { getRecommendedPlaylists } = await import(
      '@/lib/media/audio/platform/api/netease'
    );
    const pls = await getRecommendedPlaylists(limit);
    const list: OnlinePlaylistSummary[] = pls.map((p) => ({
      id: p.id,
      name: p.name,
      source: 'netease',
      coverUrl: p.coverUrl,
      trackCount: p.trackCount,
    }));
    return {
      list,
      total: list.length,
      limit,
      emptyHint: list.length ? undefined : '暂无推荐歌单，请稍后重试',
    };
  }

  if (source === 'bili') {
    const {
      listBiliFavoriteFolders,
      listBiliCollectedFolders,
      isBiliLoggedInForFavorites,
    } = await import('@/lib/media/audio/platform/api/bili');
    const loggedIn = await isBiliLoggedInForFavorites();
    if (!loggedIn) {
      return {
        list: [],
        total: 0,
        limit,
        emptyHint: 'B 站没有公开发现流，请先登录账号以查看收藏夹',
      };
    }
    const folders =
      tag === PLATFORM_SONG_LIST_TAGS.biliCollected
        ? await listBiliCollectedFolders()
        : await listBiliFavoriteFolders();
    const list: OnlinePlaylistSummary[] = folders.map((f) => ({
      id: f.id,
      name: f.title,
      source: 'bili',
      coverUrl: f.coverUrl,
      trackCount: f.mediaCount,
    }));
    return {
      list,
      total: list.length,
      limit,
      emptyHint: list.length
        ? undefined
        : tag === PLATFORM_SONG_LIST_TAGS.biliCollected
          ? '暂无订阅的收藏夹'
          : '暂无自建收藏夹',
    };
  }

  const { listYtmHomeRecommendPlaylists, listYtmLibraryPlaylists } = await import(
    '@/lib/media/audio/platform/api/ytm'
  );
  if (tag === PLATFORM_SONG_LIST_TAGS.ytmLibrary) {
    const pls = await listYtmLibraryPlaylists();
    const list: OnlinePlaylistSummary[] = pls.map((p) => ({
      id: p.browseId,
      name: p.name,
      source: 'ytm',
      coverUrl: p.coverUrl,
      trackCount: p.trackCount,
      author: p.subtitle,
    }));
    return {
      list,
      total: list.length,
      limit,
      emptyHint: list.length
        ? undefined
        : '曲库为空，请确认已登录 YouTube Music 账号',
    };
  }
  const pls = await listYtmHomeRecommendPlaylists(limit);
  const list: OnlinePlaylistSummary[] = pls.map((p) => ({
    id: p.browseId,
    name: p.name,
    source: 'ytm',
    coverUrl: p.coverUrl,
    trackCount: p.trackCount,
    author: p.subtitle,
  }));
  return {
    list,
    total: list.length,
    limit,
    emptyHint: list.length
      ? undefined
      : '暂无 Home 推荐歌单，请确认已登录 YouTube Music 或稍后重试',
  };
}

export async function browsePlatformPlaylistDetail(
  source: PlatformSourceId,
  id: string,
  page = 1,
): Promise<OnlinePlaylistDetail> {
  if (source === 'netease') {
    const { getPlaylistDetail } = await import('@/lib/media/audio/platform/api/netease');
    const tracks = page === 1 ? await getPlaylistDetail(id) : [];
    return {
      info: {
        id,
        name: id,
        source: 'netease',
      },
      tracks,
      total: tracks.length,
      page,
      limit: tracks.length || 30,
    };
  }

  if (source === 'bili') {
    const { getBiliFavoriteTracks } = await import('@/lib/media/audio/platform/api/bili');
    const result = await getBiliFavoriteTracks(id, page);
    return {
      info: {
        id,
        name: id,
        source: 'bili',
      },
      tracks: result.tracks,
      total: result.total,
      page,
      limit: 40,
    };
  }

  const { getYtmPlaylistTracks } = await import('@/lib/media/audio/platform/api/ytm');
  const tracks = page === 1 ? await getYtmPlaylistTracks(id) : [];
  return {
    info: {
      id,
      name: id,
      source: 'ytm',
    },
    tracks,
    total: tracks.length,
    page,
    limit: tracks.length || 30,
  };
}
