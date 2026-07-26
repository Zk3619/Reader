/**
 * 咪咕歌单（app.c.nf.migu.cn 优先，music.migu.cn v3 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { mgSearchHeaders } from '@/lib/media/audio/online/sources/mg';
import {
  formatMgPlayCount,
  mapMgPlaylistTrack,
} from '@/lib/media/audio/music-sdk/sources/mg/music-info';
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

const SOURCE: MusicSdkSource = 'mg';
const LIMIT = 30;
const LIMIT_SONG = 50;
const SUCCESS_CODE = '000000';

const SORT_LIST: SongListSort[] = [{ id: '15127315', name: '推荐' }];

const LIST_DETAIL_LINK_RE = /^.+\/playlist\/(\d+)(?:\?.*|&.*$|#.*$|$)/;

const MG_DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
  Referer: 'https://m.music.migu.cn/',
};

function mgHeaders(signText: string): Record<string, string> {
  return { ...MG_DEFAULT_HEADERS, ...mgSearchHeaders(signText) };
}

function mapPlaylistFromRecommend(item: Record<string, unknown>): OnlinePlaylistSummary | null {
  const logEvent = item.logEvent as { contentId?: string } | undefined;
  const id = String(
    logEvent?.contentId ?? item.contentId ?? item.resId ?? item.id ?? '',
  );
  if (!id) return null;
  return {
    id,
    name: String(item.title ?? item.name ?? ''),
    author: String(item.ownerName ?? item.singer ?? ''),
    coverUrl: String(item.imageUrl ?? item.img ?? item.imgUrl ?? ''),
    playCount: Array.isArray(item.barList) && item.barList[0]
      ? String((item.barList[0] as { title?: string }).title ?? '')
      : undefined,
    source: SOURCE,
  };
}

function extractRecommendPlaylists(data: {
  contents?: Array<Record<string, unknown>>;
  contentItemList?: Array<{ itemList?: Array<Record<string, unknown>> }>;
}): OnlinePlaylistSummary[] {
  if (data.contents?.length) {
    return collectTagPlaylists(data.contents);
  }
  const list: OnlinePlaylistSummary[] = [];
  for (const block of data.contentItemList ?? []) {
    for (const item of block.itemList ?? []) {
      const mapped = mapPlaylistFromRecommend(item);
      if (mapped) list.push(mapped);
    }
    if (list.length) return list;
  }
  return list;
}

function mapPlaylistFromTag(item: Record<string, unknown>): OnlinePlaylistSummary {
  return {
    id: String(item.resId ?? ''),
    name: String(item.txt ?? ''),
    author: '',
    coverUrl: String(item.img ?? ''),
    desc: String(item.txt2 ?? ''),
    source: SOURCE,
  };
}

function collectTagPlaylists(
  contents: Array<Record<string, unknown>>,
  list: OnlinePlaylistSummary[] = [],
  ids = new Set<string>(),
): OnlinePlaylistSummary[] {
  for (const item of contents) {
    if (Array.isArray(item.contents)) {
      collectTagPlaylists(item.contents as Array<Record<string, unknown>>, list, ids);
    } else if (item.resType === '2021' || item.resType === 2021) {
      const id = String(item.resId ?? '');
      if (!id || ids.has(id)) continue;
      ids.add(id);
      list.push(mapPlaylistFromTag(item));
    }
  }
  return list;
}

function filterTagInfo(rawList: Array<{
  header?: { title?: string };
  content?: Array<{ texts?: [string, string] }>;
}>): { hotTags: SongListTag[]; groups: SongListTagGroup[] } {
  if (!rawList.length) return { hotTags: [], groups: [] };
  const hotTags = (rawList[0]?.content ?? []).map(({ texts }) => ({
    id: texts?.[1] ?? '',
    name: texts?.[0] ?? '',
    source: SOURCE,
  })).filter((t) => t.id && t.name);

  const groups = rawList.slice(1).map(({ header, content }) => ({
    name: header?.title ?? '分类',
    list: (content ?? []).map(({ texts }) => ({
      id: texts?.[1] ?? '',
      name: texts?.[0] ?? '',
      source: SOURCE,
      parentName: header?.title,
    })).filter((t) => t.id && t.name),
  }));

  return { hotTags, groups };
}

export function getSortList(): SongListSort[] {
  return SORT_LIST;
}

export async function getTags(): Promise<SongListTagGroup[]> {
  const groups = await firstSuccess([loadTagsApp, loadTagsWeb], hasItems);
  return groups ?? [];
}

export async function getHotTags(): Promise<SongListTag[]> {
  const tags = await firstSuccess(
    [async () => (await loadTagsAppWithHot())?.hotTags ?? null, loadHotTagsWeb],
    hasItems,
  );
  return tags ?? [];
}

export async function getList(
  sortId: string,
  tagId: string | null,
  page = 1,
): Promise<PaginatedPlaylists> {
  const result = await firstSuccess(
    [() => loadListApp(sortId, tagId, page), () => loadListWeb(tagId, page)],
    (r) => hasItems(r.list),
  );
  return result ?? { list: [], total: 0, page, limit: LIMIT, source: SOURCE };
}

export async function getListDetail(id: string, page = 1): Promise<OnlinePlaylistDetail> {
  const pid = resolveListId(id);
  const detail = await firstSuccess(
    [() => loadDetailApp(pid, page), () => loadDetailWeb(pid, page)],
    (d) => hasItems(d.tracks) || !!d.info.name,
  );
  if (!detail) throw new Error('咪咕歌单详情加载失败');
  return detail;
}

async function loadTagsApp(): Promise<SongListTagGroup[] | null> {
  const url = 'https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-taglist/release';
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string;
      data?: Array<{
        header?: { title?: string };
        content?: Array<{ texts?: [string, string] }>;
      }>;
    }>(url, { headers: mgHeaders('release') }),
  );
  if (body?.code !== SUCCESS_CODE) return null;
  const parsed = filterTagInfo(body.data ?? []);
  return hasItems(parsed.groups) ? parsed.groups : null;
}

async function loadTagsAppWithHot(): Promise<{ hotTags: SongListTag[]; groups: SongListTagGroup[] } | null> {
  const url = 'https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-taglist/release';
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string;
      data?: Array<{
        header?: { title?: string };
        content?: Array<{ texts?: [string, string] }>;
      }>;
    }>(url, { headers: mgHeaders('release') }),
  );
  if (body?.code !== SUCCESS_CODE) return null;
  const parsed = filterTagInfo(body.data ?? []);
  if (!hasItems(parsed.groups) && !hasItems(parsed.hotTags)) return null;
  return parsed;
}

async function loadTagsWeb(): Promise<SongListTagGroup[] | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{ data?: Array<{ tagName: string; tagId: string }> }>(
      'https://music.migu.cn/v3/api/music/playlistService/getTagList?templateCode=PC_SONG_LIST_TAG',
    ),
  );
  const list = (body?.data ?? []).map((t) => ({
    id: t.tagId,
    name: t.tagName,
    source: SOURCE,
  }));
  if (!hasItems(list)) return null;
  return [{ name: '分类', list }];
}

async function loadHotTagsWeb(): Promise<SongListTag[] | null> {
  const groups = await loadTagsWeb();
  const list = groups?.[0]?.list.slice(0, 8) ?? [];
  return hasItems(list) ? list : null;
}

async function loadListApp(
  _sortId: string,
  tagId: string | null,
  page: number,
): Promise<PaginatedPlaylists | null> {
  const url = tagId
    ? `https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-listbytag/release?pageNumber=${page}&templateVersion=2&tagId=${tagId}`
    : `https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0?templateVersion=2&pageNo=${page}`;
  const signKey = tagId ?? `playlist-square-recommend-${page}`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string;
      data?: {
        contents?: Array<Record<string, unknown>>;
        contentItemList?: Array<{ itemList?: Array<Record<string, unknown>> }>;
        nextPageUrl?: string;
      };
    }>(url, { headers: mgHeaders(signKey) }),
  );
  if (body?.code !== SUCCESS_CODE) return null;
  // 新版 listbytag 与推荐页同为 contentItemList；旧版才是 contents+resType=2021
  const fromItems = extractRecommendPlaylists(body.data ?? {});
  const fromLegacy =
    tagId && !hasItems(fromItems)
      ? collectTagPlaylists(body.data?.contents ?? [])
      : [];
  const list = hasItems(fromItems) ? fromItems : fromLegacy;
  if (!hasItems(list)) return null;
  const hasMore = Boolean(body.data?.nextPageUrl);
  return {
    list,
    total: hasMore ? page * LIMIT + list.length : (page - 1) * LIMIT + list.length,
    page,
    limit: LIMIT,
    source: SOURCE,
  };
}

async function loadListWeb(tagId: string | null, page: number): Promise<PaginatedPlaylists | null> {
  // web 端 getTagList 与 app tagId 体系不一致；有 tag 时仅作弱兜底，无 tag 时拉推荐
  const url = tagId
    ? `https://music.migu.cn/v3/api/music/playlistService/getTagPlayList?tagId=${tagId}&pageNo=${page}&pageSize=${LIMIT}`
    : `https://music.migu.cn/v3/api/music/playlistService/getRecommendPlayList?pageNo=${page}&pageSize=${LIMIT}`;
  const body = await safeCall(() =>
    onlineFetchJson<{ data?: { list?: Record<string, unknown>[]; total?: number } }>(url),
  );
  const list = (body?.data?.list ?? []).map((item) => ({
    id: String(item.musicListId ?? item.id ?? ''),
    name: String(item.title ?? item.name ?? ''),
    author: String(item.ownerName ?? item.singer ?? ''),
    coverUrl: String(item.img ?? item.imgUrl ?? ''),
    source: SOURCE,
  })).filter((p) => p.id);
  if (!hasItems(list)) return null;
  return {
    list,
    total: Number(body?.data?.total ?? list.length),
    page,
    limit: LIMIT,
    source: SOURCE,
  };
}

async function loadDetailApp(pid: string, page: number): Promise<OnlinePlaylistDetail | null> {
  const [tracksBody, infoBody] = await Promise.all([
    safeCall(() =>
      onlineFetchJson<{
        code?: string;
        data?: { songList?: Record<string, unknown>[]; totalCount?: number };
      }>(
        `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0?pageNo=${page}&pageSize=${LIMIT_SONG}&playlistId=${pid}`,
        { headers: mgHeaders(pid) },
      ),
    ),
    safeCall(() =>
      onlineFetchJson<{
        code?: string;
        data?: {
          title?: string;
          summary?: string;
          ownerName?: string;
          imgItem?: { img?: string };
          opNumItem?: { playNum?: number };
        };
      }>(
        `https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${pid}`,
        { headers: mgHeaders(pid) },
      ),
    ),
  ]);
  if (tracksBody?.code !== SUCCESS_CODE) return null;
  const tracks = (tracksBody.data?.songList ?? [])
    .map(mapMgPlaylistTrack)
    .filter((t): t is NonNullable<typeof t> => t != null);
  const info = infoBody?.data;
  if (!hasItems(tracks) && !info?.title) return null;
  return {
    info: {
      id: pid,
      name: String(info?.title ?? ''),
      author: String(info?.ownerName ?? ''),
      coverUrl: String(info?.imgItem?.img ?? ''),
      desc: String(info?.summary ?? ''),
      playCount: info?.opNumItem?.playNum != null
        ? formatMgPlayCount(info.opNumItem.playNum)
        : undefined,
      source: SOURCE,
    },
    tracks,
    total: Number(tracksBody.data?.totalCount ?? tracks.length),
    page,
    limit: LIMIT_SONG,
  };
}

async function loadDetailWeb(pid: string, page: number): Promise<OnlinePlaylistDetail | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: {
        title?: string;
        img?: string;
        intro?: string;
        ownerName?: string;
        musicNum?: number;
        musicList?: Record<string, unknown>[];
      };
    }>(
      `https://music.migu.cn/v3/api/music/playlistService/getPlayListDetail?musicListId=${pid}&pageNo=${page}&pageSize=200`,
      { headers: mgHeaders(pid) },
    ),
  );
  const data = body?.data;
  if (!data) return null;
  const tracks = (data.musicList ?? [])
    .map(mapMgPlaylistTrack)
    .filter((t): t is NonNullable<typeof t> => t != null);
  if (!hasItems(tracks) && !data.title) return null;
  return {
    info: {
      id: pid,
      name: String(data.title ?? ''),
      author: String(data.ownerName ?? ''),
      coverUrl: String(data.img ?? ''),
      desc: String(data.intro ?? ''),
      source: SOURCE,
    },
    tracks,
    total: Number(data.musicNum ?? tracks.length),
    page,
    limit: 200,
  };
}

function resolveListId(raw: string): string {
  if (LIST_DETAIL_LINK_RE.test(raw)) return raw.replace(LIST_DETAIL_LINK_RE, '$1');
  const paramMatch = raw.match(/(?:playlistId|id)=(\d+)/);
  if (paramMatch?.[1]) return paramMatch[1];
  return raw.replace(/[^\d]/g, '') || raw;
}

export function parseListIdFromUrl(url: string): string | null {
  const isMgHost = /migu\.cn/i.test(url);
  if (isMgHost && LIST_DETAIL_LINK_RE.test(url)) {
    return url.replace(LIST_DETAIL_LINK_RE, '$1');
  }
  // 宽松 id= 仅在咪咕域名下生效，避免误匹配网易等 ?id=
  if (isMgHost) {
    const m = url.match(/(?:playlistId|musicListId|id)=(\d+)/);
    return m?.[1] ?? null;
  }
  return null;
}

export async function searchPlaylists(
  keyword: string,
  page = 1,
  limit = LIMIT,
): Promise<SongListSearchResult> {
  const pageSize = Math.max(1, limit);
  // 对齐 lx songList.search：jadeite searchAll + songlist switch
  const url =
    `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1` +
    `&searchSwitch=%7B%22song%22%3A0%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22bestShow%22%3A0%2C%22songlist%22%3A1%2C%22lyricSong%22%3A0%7D` +
    `&pageSize=${pageSize}&text=${encodeURIComponent(keyword)}&pageNo=${page}&sort=0&sid=USS`;

  const result = await firstSuccess(
    [
      async () => {
        const body = await safeCall(() =>
          onlineFetchJson<{
            songListResultData?: {
              result?: Record<string, unknown>[];
              totalCount?: number | string;
            };
          }>(url, { headers: mgHeaders(keyword) }),
        );
        const raw = body?.songListResultData?.result ?? [];
        if (!hasItems(raw)) return null;
        const list: OnlinePlaylistSummary[] = [];
        for (const item of raw) {
          const id = String(item.id ?? '');
          if (!id) continue;
          const playNum = parseInt(String(item.playNum ?? ''), 10);
          list.push({
            id,
            name: String(item.name ?? ''),
            author: String(item.userName ?? ''),
            coverUrl: String(item.musicListPicUrl ?? item.img ?? ''),
            playCount: Number.isFinite(playNum) ? formatMgPlayCount(playNum) : undefined,
            trackCount: Number(item.musicNum ?? 0) || undefined,
            source: SOURCE,
          });
        }
        if (!hasItems(list)) return null;
        return {
          list,
          total: parseInt(String(body?.songListResultData?.totalCount ?? list.length), 10) || list.length,
          page,
          limit: pageSize,
          source: SOURCE,
        } satisfies SongListSearchResult;
      },
      async () => {
        // 降级：旧 web 搜索
        const webUrl = `https://music.migu.cn/v3/api/search/searchAll?keyword=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${pageSize}&searchType=2`;
        const body = await safeCall(() =>
          onlineFetchJson<{
            data?: {
              songListResult?: {
                songLists?: Record<string, unknown>[];
                totalCount?: number;
              };
            };
          }>(webUrl, { headers: mgHeaders(keyword) }),
        );
        const raw = body?.data?.songListResult?.songLists ?? [];
        if (!hasItems(raw)) return null;
        const list: OnlinePlaylistSummary[] = raw.map((item) => ({
          id: String(item.musicListId ?? item.id ?? ''),
          name: String(item.title ?? item.name ?? ''),
          author: String(item.ownerName ?? ''),
          coverUrl: String(item.img ?? ''),
          source: SOURCE,
        }));
        return {
          list,
          total: Number(body?.data?.songListResult?.totalCount ?? list.length),
          page,
          limit: pageSize,
          source: SOURCE,
        } satisfies SongListSearchResult;
      },
    ],
    (r) => hasItems(r.list),
  );

  return result ?? { list: [], total: 0, page, limit: pageSize, source: SOURCE };
}
