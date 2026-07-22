/**
 * 歌手发现列表（LX 独立列表页数据源）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { searchOnline } from '@/lib/media/audio/online/source-router';

export type SingerListItem = {
  id: string;
  name: string;
  coverUrl?: string;
  source: AudioTrackSource;
};

export type SingerListPage = {
  items: SingerListItem[];
  page: number;
  hasMore: boolean;
};

async function wySingerList(page: number): Promise<SingerListPage> {
  const limit = 30;
  const offset = (page - 1) * limit;
  const body = await safeCall(() =>
    weapiPost<{
      artists?: Array<{ id?: number; name?: string; picUrl?: string; img1v1Url?: string }>;
      more?: boolean;
    }>('artist/top', {
      offset,
      total: true,
      limit,
    }),
  );
  const items = (body?.artists ?? []).map((a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    coverUrl: a.picUrl || a.img1v1Url,
    source: 'wy' as const,
  })).filter((x) => x.id && x.name);
  return { items, page, hasMore: Boolean(body?.more) || items.length >= limit };
}

async function kgSingerList(page: number): Promise<SingerListPage> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: {
        info?: Array<{ singerid?: number; singername?: string; imgurl?: string }>;
      };
    }>(
      `https://mobileservice.kugou.com/api/v5/singer/list?version=9108&type=0&showtype=2&plat=0&sextype=0&sort=1&musician=0&page=${page}&pagesize=30`,
    ),
  );
  const items = (body?.data?.info ?? []).map((a) => ({
    id: String(a.singerid ?? ''),
    name: String(a.singername ?? ''),
    coverUrl: a.imgurl?.replace('{size}', '240'),
    source: 'kg' as const,
  })).filter((x) => x.id && x.name);
  return { items, page, hasMore: items.length >= 20 };
}

async function searchFallbackSingers(
  source: AudioTrackSource,
  page: number,
): Promise<SingerListPage> {
  const keywords = ['热门', '流行', '华语', '欧美', '摇滚'];
  const keyword = keywords[(page - 1) % keywords.length] ?? '热门';
  const hit = await safeCall(() => searchOnline(source, keyword, 1));
  const seen = new Set<string>();
  const items: SingerListItem[] = [];
  for (const t of hit?.tracks ?? []) {
    const name = t.artist?.split(/[、,/&]/)[0]?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const id = String(t.meta.singerId ?? name);
    items.push({
      id,
      name,
      coverUrl: typeof t.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
      source,
    });
    if (items.length >= 30) break;
  }
  return { items, page, hasMore: page < keywords.length };
}

export async function fetchSingerList(
  source: AudioTrackSource,
  page = 1,
): Promise<SingerListPage> {
  switch (source) {
    case 'wy':
      return wySingerList(page);
    case 'kg':
      return kgSingerList(page);
    case 'kw':
    case 'tx':
    case 'mg':
      return searchFallbackSingers(source, page);
    default:
      return { items: [], page, hasMore: false };
  }
}
