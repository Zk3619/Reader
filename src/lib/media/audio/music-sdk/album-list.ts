/**
 * 专辑发现列表（LX 独立列表页数据源）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { searchOnline } from '@/lib/media/audio/online/source-router';

export type AlbumListItem = {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
  source: AudioTrackSource;
};

export type AlbumListPage = {
  items: AlbumListItem[];
  page: number;
  hasMore: boolean;
};

async function wyAlbumList(page: number): Promise<AlbumListPage> {
  const limit = 30;
  const offset = (page - 1) * limit;
  const body = await safeCall(() =>
    weapiPost<{
      albums?: Array<{
        id?: number;
        name?: string;
        picUrl?: string;
        artists?: Array<{ name?: string }>;
        artist?: { name?: string };
      }>;
    }>('album/new', {
      offset,
      total: true,
      limit,
      area: 'ALL',
    }),
  );
  const items = (body?.albums ?? []).map((a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    artist:
      (a.artists ?? []).map((x) => x.name).filter(Boolean).join('、') ||
      String(a.artist?.name ?? ''),
    coverUrl: a.picUrl,
    source: 'wy' as const,
  })).filter((x) => x.id && x.name);
  return { items, page, hasMore: items.length >= limit };
}

async function kgAlbumList(page: number): Promise<AlbumListPage> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: {
        info?: Array<{
          albumid?: number;
          albumname?: string;
          singername?: string;
          imgurl?: string;
        }>;
      };
    }>(
      `https://mobileservice.kugou.com/api/v5/album/list?version=9108&type=1&page=${page}&pagesize=30`,
    ),
  );
  const items = (body?.data?.info ?? []).map((a) => ({
    id: String(a.albumid ?? ''),
    name: String(a.albumname ?? ''),
    artist: String(a.singername ?? ''),
    coverUrl: a.imgurl?.replace('{size}', '240'),
    source: 'kg' as const,
  })).filter((x) => x.id && x.name);
  return { items, page, hasMore: items.length >= 20 };
}

async function searchFallbackAlbums(
  source: AudioTrackSource,
  page: number,
): Promise<AlbumListPage> {
  const keywords = ['新专辑', '热门专辑', '华语', '流行', '经典'];
  const keyword = keywords[(page - 1) % keywords.length] ?? '新专辑';
  const hit = await safeCall(() => searchOnline(source, keyword, 1));
  const seen = new Set<string>();
  const items: AlbumListItem[] = [];
  for (const t of hit?.tracks ?? []) {
    const name = String(t.meta.albumName ?? '').trim();
    const id = String(t.meta.albumId ?? t.meta.albumMid ?? name).trim();
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      name,
      artist: t.artist,
      coverUrl: typeof t.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
      source,
    });
    if (items.length >= 30) break;
  }
  return { items, page, hasMore: page < keywords.length };
}

export async function fetchAlbumList(
  source: AudioTrackSource,
  page = 1,
): Promise<AlbumListPage> {
  switch (source) {
    case 'wy':
      return wyAlbumList(page);
    case 'kg':
      return kgAlbumList(page);
    case 'kw':
    case 'tx':
    case 'mg':
      return searchFallbackAlbums(source, page);
    default:
      return { items: [], page, hasMore: false };
  }
}
