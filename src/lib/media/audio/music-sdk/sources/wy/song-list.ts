/**
 * 网易云歌单（eapi 优先，weapi/linuxapi 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { eapiPostBody } from '@/lib/media/audio/platform/api/eapi-crypto';
import { linuxapiPost, weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type {
  MusicSdkSource,
  OnlinePlaylistDetail,
  OnlinePlaylistSummary,
  PaginatedPlaylists,
  SongListSearchResult,
  SongListSort,
  SongListTag,
  SongListTagGroup,
} from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'wy';
const LIMIT_LIST = 30;
const LIMIT_SONG = 100_000;
const SUCCESS_CODE = 200;
const WY_COOKIE = 'MUSIC_U=';

const SORT_LIST: SongListSort[] = [{ id: 'hot', name: '最热' }];

const LIST_ID_RE = /(?:\?|&)id=(\d+)(?:&.*$|#.*$|$)/;
const LIST_DETAIL_LINK2_RE = /^.+\/playlist\/(\d+)\/\d+\/.+$/;

type WyTagRaw = {
  categories?: Record<string, string>;
  tags?: Array<{
    name?: string;
    category?: number;
    hot?: boolean;
    playlistTag?: { name?: string; category?: number };
  }>;
  sub?: Array<{ name: string; category: number }>;
};

type WyPlaylistRaw = {
  id?: number;
  name?: string;
  coverImgUrl?: string;
  description?: string;
  creator?: { nickname?: string };
  playCount?: number;
  trackIds?: Array<{ id: number }>;
  tracks?: Record<string, unknown>[];
  privileges?: unknown[];
};

function formatPlayCount(num: number): string {
  if (num > 100_000_000) return `${Math.floor(num / 10_000_000) / 10}亿`;
  if (num > 10_000) return `${Math.floor(num / 1000) / 10}万`;
  return String(num);
}

function mapPlaylist(item: Record<string, unknown>): OnlinePlaylistSummary {
  const creator = item.creator as { nickname?: string } | undefined;
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    author: String(creator?.nickname ?? ''),
    coverUrl: String(item.coverImgUrl ?? ''),
    playCount: item.playCount != null ? formatPlayCount(Number(item.playCount)) : undefined,
    trackCount: Number(item.trackCount ?? 0) || undefined,
    desc: String(item.description ?? ''),
    source: SOURCE,
  };
}

function mapTrack(song: Record<string, unknown>) {
  const id = String(song.id ?? '');
  const ms = Number(song.dt ?? 0);
  const ar = (song.ar as Array<{ name?: string }> | undefined) ?? [];
  const al = song.al as { id?: number; name?: string; picUrl?: string } | undefined;
  return {
    id: buildTrackId(SOURCE, id),
    name: String(song.name ?? '未知'),
    artist: ar.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: SOURCE,
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId: id,
      albumId: String(al?.id ?? ''),
      albumName: String(al?.name ?? ''),
      coverUrl: String(al?.picUrl ?? ''),
    },
  };
}

function parseTagGroups(body: WyTagRaw): SongListTagGroup[] {
  if (body.sub?.length && body.categories) {
    const subByCategory = new Map<number, SongListTag[]>();
    for (const item of body.sub) {
      const catName = body.categories[String(item.category)] ?? '其他';
      if (!subByCategory.has(item.category)) subByCategory.set(item.category, []);
      subByCategory.get(item.category)!.push({
        id: item.name,
        name: item.name,
        source: SOURCE,
        parentName: catName,
      });
    }
    return Object.keys(body.categories).map((key) => ({
      name: body.categories![key]!,
      list: subByCategory.get(Number(key)) ?? [],
    }));
  }

  const categories = body.categories ?? {};
  const subByCategory = new Map<number, SongListTag[]>();
  for (const item of body.tags ?? []) {
    const category = item.category ?? item.playlistTag?.category ?? 0;
    const name = item.name ?? item.playlistTag?.name ?? '';
    if (!name) continue;
    const catName = categories[String(category)] ?? '其他';
    if (!subByCategory.has(category)) subByCategory.set(category, []);
    subByCategory.get(category)!.push({
      id: name,
      name,
      source: SOURCE,
      parentName: catName,
    });
  }
  return Object.keys(categories).map((key) => ({
    name: categories[key]!,
    list: subByCategory.get(Number(key)) ?? [],
  }));
}

function parseHotTags(body: WyTagRaw): SongListTag[] {
  if (body.tags?.some((t) => 'hot' in t)) {
    return body.tags
      .filter((t) => t.hot)
      .map((t) => {
        const name = t.name ?? t.playlistTag?.name ?? '';
        return { id: name, name, source: SOURCE };
      })
      .filter((t) => t.id);
  }
  return (body.tags ?? []).map((t) => {
    const name = t.playlistTag?.name ?? t.name ?? '';
    return { id: name, name, source: SOURCE };
  }).filter((t) => t.id);
}

/** 并行 getTags/getHotTags 共用同一次 eapi，避免重复 /eapi/batch */
let tagsEapiInflight: Promise<WyTagRaw | null> | null = null;

async function loadTagsEapi(): Promise<WyTagRaw | null> {
  if (tagsEapiInflight) return tagsEapiInflight;
  tagsEapiInflight = (async () => {
    try {
      const body = await safeCall(() =>
        eapiPostBody<{ code?: number } & WyTagRaw>('/api/playlist/tags', {}),
      );
      if (!body || body.code !== SUCCESS_CODE) return null;
      return body;
    } finally {
      // 保留短时共用；下一轮刷新仍可重新请求
      queueMicrotask(() => {
        tagsEapiInflight = null;
      });
    }
  })();
  return tagsEapiInflight;
}

async function loadTagsWeapiCatalogue(): Promise<WyTagRaw | null> {
  const body = await safeCall(() =>
    weapiPost<{ code?: number } & WyTagRaw>('playlist/catalogue', {}, WY_COOKIE),
  );
  if (!body || body.code !== SUCCESS_CODE) return null;
  return body;
}

async function loadTagsWeapiHot(): Promise<WyTagRaw | null> {
  const body = await safeCall(() =>
    weapiPost<{
      code?: number;
      tags?: Array<{ playlistTag?: { name: string } }>;
    }>('playlist/hottags', {}, WY_COOKIE),
  );
  if (!body || body.code !== SUCCESS_CODE) return null;
  return {
    tags: (body.tags ?? []).map((t) => ({
      hot: true,
      playlistTag: t.playlistTag,
      name: t.playlistTag?.name,
    })),
  };
}

async function fetchSongDetails(ids: number[]) {
  if (!ids.length) return [];
  const eapi = await safeCall(() =>
    eapiPostBody<{ songs?: Record<string, unknown>[] }>('/api/v3/song/detail', {
      c: JSON.stringify(ids.map((i) => ({ id: i }))),
    }),
  );
  if (hasItems(eapi?.songs)) return eapi!.songs!.map(mapTrack);
  const weapi = await safeCall(() =>
    weapiPost<{ songs?: Record<string, unknown>[] }>(
      'v3/song/detail',
      { c: JSON.stringify(ids.map((i) => ({ id: i }))) },
      WY_COOKIE,
    ),
  );
  return (weapi?.songs ?? []).map(mapTrack);
}

async function buildDetailFromPlaylist(
  pl: WyPlaylistRaw,
  playlistId: string,
  page: number,
): Promise<OnlinePlaylistDetail> {
  const limit = 1000;
  const rangeStart = (page - 1) * limit;
  let tracks: ReturnType<typeof mapTrack>[] = [];

  if (pl.tracks?.length && pl.tracks.length === (pl.privileges?.length ?? pl.tracks.length)) {
    tracks = pl.tracks.slice(rangeStart, rangeStart + limit).map(mapTrack);
  } else {
    const ids = (pl.trackIds ?? []).slice(rangeStart, rangeStart + limit).map((t) => t.id);
    tracks = await fetchSongDetails(ids);
  }

  return {
    info: {
      id: String(pl.id ?? playlistId),
      name: String(pl.name ?? ''),
      author: String(pl.creator?.nickname ?? ''),
      coverUrl: String(pl.coverImgUrl ?? ''),
      desc: String(pl.description ?? ''),
      playCount: pl.playCount != null ? formatPlayCount(pl.playCount) : undefined,
      source: SOURCE,
    },
    tracks,
    total: pl.trackIds?.length ?? tracks.length,
    page,
    limit,
  };
}

export function getSortList(): SongListSort[] {
  return SORT_LIST;
}

/** 对齐 lx：优先 weapi catalogue；eapi 作降级 */
export async function getTags(): Promise<SongListTagGroup[]> {
  const body = await firstSuccess([loadTagsWeapiCatalogue, loadTagsEapi], (b) =>
    hasItems(parseTagGroups(b)),
  );
  return body ? parseTagGroups(body) : [];
}

/** 对齐 lx：优先 weapi hottags；eapi 作降级 */
export async function getHotTags(): Promise<SongListTag[]> {
  const body = await firstSuccess([loadTagsWeapiHot, loadTagsEapi], (b) =>
    hasItems(parseHotTags(b)),
  );
  return body ? parseHotTags(body) : [];
}

function mapListResponse(
  body: { playlists?: Record<string, unknown>[]; total?: number },
  page: number,
): PaginatedPlaylists | null {
  const list = (body.playlists ?? []).map(mapPlaylist);
  if (!hasItems(list)) return null;
  const total = Number(body.total);
  return {
    list,
    // 对齐 lx：parseInt(body.total)；无 total 时勿用 list.length 冒充（会导致只显示 1 页）
    total: Number.isFinite(total) && total > 0 ? total : list.length,
    page,
    limit: LIMIT_LIST,
    source: SOURCE,
  };
}

export async function getList(
  sortId: string,
  tagId: string | null,
  page = 1,
): Promise<PaginatedPlaylists> {
  const offset = (page - 1) * LIMIT_LIST;
  const payload = {
    cat: tagId ?? '全部',
    order: sortId,
    limit: LIMIT_LIST,
    offset,
    total: true,
  };
  // 对齐 lx weapi/playlist/list。
  // 切勿降级到 /api/playlist/category/list：会前置约 4 条精品且常不带正确 total，页数严重偏差。
  const result = await firstSuccess(
    [
      async () => {
        const body = await weapiPost<{
          code?: number;
          playlists?: Record<string, unknown>[];
          total?: number;
        }>('playlist/list', payload, WY_COOKIE);
        if (body.code !== SUCCESS_CODE) return null;
        return mapListResponse(body, page);
      },
      async () => {
        const body = await eapiPostBody<{
          code?: number;
          playlists?: Record<string, unknown>[];
          total?: number;
        }>('/api/playlist/list', payload);
        if (body.code !== SUCCESS_CODE) return null;
        return mapListResponse(body, page);
      },
    ],
    (v) => hasItems(v.list),
  );

  return result ?? { list: [], total: 0, page, limit: LIMIT_LIST, source: SOURCE };
}

export async function getListDetail(id: string, page = 1): Promise<OnlinePlaylistDetail> {
  const playlistId = await resolveListId(id);

  const detail = await firstSuccess(
    [
      async () => {
        const body = await eapiPostBody<{ code?: number; playlist?: WyPlaylistRaw }>(
          '/api/v6/playlist/detail',
          { id: playlistId, n: LIMIT_SONG, s: 8 },
        );
        if (body.code !== SUCCESS_CODE || !body.playlist) return null;
        return buildDetailFromPlaylist(body.playlist, playlistId, page);
      },
      async () => {
        const body = await linuxapiPost<{ code?: number; playlist?: WyPlaylistRaw }>(
          {
            method: 'POST',
            url: 'https://music.163.com/api/v3/playlist/detail',
            params: { id: playlistId, n: LIMIT_SONG, s: 8 },
          },
          WY_COOKIE,
        );
        if (body.code !== SUCCESS_CODE || !body.playlist) return null;
        return buildDetailFromPlaylist(body.playlist, playlistId, page);
      },
      async () => {
        const body = await weapiPost<{ code?: number; playlist?: WyPlaylistRaw }>(
          'v3/playlist/detail',
          { id: playlistId, n: LIMIT_SONG, s: 8 },
          WY_COOKIE,
        );
        if (body.code !== SUCCESS_CODE || !body.playlist) return null;
        return buildDetailFromPlaylist(body.playlist, playlistId, page);
      },
    ],
    (d) => !!d.info.id,
  );

  if (!detail) throw new Error('网易歌单详情加载失败');
  return detail;
}

async function resolveListId(raw: string): Promise<string> {
  if (/^\d+$/.test(raw)) return raw;
  if (LIST_ID_RE.test(raw)) {
    const m = raw.match(LIST_ID_RE);
    if (m) return m[1] ?? m[2] ?? raw;
  }
  if (LIST_DETAIL_LINK2_RE.test(raw)) return raw.replace(LIST_DETAIL_LINK2_RE, '$1');
  return raw;
}

export function parseListIdFromUrl(url: string): string | null {
  const m = url.match(LIST_ID_RE);
  if (m) return m[1] ?? m[2] ?? null;
  const m2 = url.match(LIST_DETAIL_LINK2_RE);
  return m2?.[1] ?? null;
}

export async function searchPlaylists(
  keyword: string,
  page = 1,
  limit = LIMIT_LIST,
): Promise<SongListSearchResult> {
  const pageSize = Math.max(1, limit);
  const result = await firstSuccess(
    [
      async () => {
        const body = await eapiPostBody<{
          result?: { playlists?: Record<string, unknown>[]; playlistCount?: number };
        }>('/api/cloudsearch/pc', {
          s: keyword,
          type: 1000,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          total: page === 1,
        });
        const list = (body.result?.playlists ?? []).map(mapPlaylist);
        if (!hasItems(list)) return null;
        return {
          list,
          total: Number(body.result?.playlistCount ?? list.length),
          page,
          limit: pageSize,
          source: SOURCE,
        } satisfies SongListSearchResult;
      },
      async () => {
        const body = await weapiPost<{
          code?: number;
          result?: { playlists?: Record<string, unknown>[]; playlistCount?: number };
        }>(
          'search/get',
          {
            s: keyword,
            type: 1000,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          },
          WY_COOKIE,
        );
        if (body.code !== SUCCESS_CODE) return null;
        const list = (body.result?.playlists ?? []).map(mapPlaylist);
        if (!hasItems(list)) return null;
        return {
          list,
          total: Number(body.result?.playlistCount ?? list.length),
          page,
          limit: pageSize,
          source: SOURCE,
        } satisfies SongListSearchResult;
      },
    ],
    () => true,
  );

  return result ?? { list: [], total: 0, page, limit: pageSize, source: SOURCE };
}
