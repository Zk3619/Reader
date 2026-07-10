/**
 * QQ音乐歌单（musicu GET 优先，POST / fcg 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
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

const SOURCE: MusicSdkSource = 'tx';
const LIMIT_LIST = 36;
const SUCCESS_CODE = 0;

const SORT_LIST: SongListSort[] = [
  { id: '5', name: '最热' },
  { id: '2', name: '最新' },
];

const LIST_DETAIL_LINK_RE = /\/playlist\/(\d+)/;
const LIST_DETAIL_LINK2_RE = /id=(\d+)/;
const HOT_TAG_HTML_RE = /data-id="(\w+)">([^<]+)<\/a>/g;

const TX_HEADERS = {
  Origin: 'https://y.qq.com',
  Referer: 'https://y.qq.com/',
};

function musicuGetUrl(payload: Record<string, unknown>): string {
  return `https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0&data=${encodeURIComponent(JSON.stringify(payload))}`;
}

function buildListPayload(sortId: string, tagId: string | null, page: number): Record<string, unknown> {
  if (tagId) {
    const id = parseInt(tagId, 10);
    return {
      comm: { cv: 1602, ct: 20 },
      playlist: {
        method: 'get_category_content',
        param: {
          titleid: id,
          caller: '0',
          category_id: id,
          size: LIMIT_LIST,
          page: page - 1,
          use_page: 1,
        },
        module: 'playlist.PlayListCategoryServer',
      },
    };
  }
  return {
    comm: { cv: 1602, ct: 20 },
    playlist: {
      method: 'get_playlist_by_tag',
      param: {
        id: 10000000,
        sin: LIMIT_LIST * (page - 1),
        size: LIMIT_LIST,
        order: parseInt(sortId, 10),
        cur_page: page,
      },
      module: 'playlist.PlayListPlazaServer',
    },
  };
}

async function txMusicuPost<T>(payload: Record<string, unknown>): Promise<T | null> {
  return safeCall(() =>
    onlineFetchJson<T>('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: { ...TX_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

function formatPlayCount(num: number): string {
  if (num > 100_000_000) return `${Math.floor(num / 10_000_000) / 10}亿`;
  if (num > 10_000) return `${Math.floor(num / 1000) / 10}万`;
  return String(num);
}

function stripHtml(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function formatSingers(singers: unknown): string {
  if (!Array.isArray(singers)) return '未知';
  return singers
    .map((s) => (typeof s === 'object' && s && 'name' in s ? String((s as { name?: string }).name ?? '') : ''))
    .filter(Boolean)
    .join('、') || '未知';
}

function mapPlaylistPlaza(item: Record<string, unknown>): OnlinePlaylistSummary {
  const creator = item.creator_info as { nick?: string } | undefined;
  return {
    id: String(item.tid ?? item.dissid ?? ''),
    name: String(item.title ?? item.dissname ?? ''),
    author: String(creator?.nick ?? ''),
    coverUrl: String(item.cover_url_medium ?? (item.cover as { url?: string } | undefined)?.url ?? ''),
    playCount: item.access_num != null ? formatPlayCount(Number(item.access_num)) : undefined,
    trackCount: Array.isArray(item.song_ids) ? item.song_ids.length : undefined,
    desc: item.desc != null ? stripHtml(String(item.desc)) : undefined,
    source: SOURCE,
  };
}

function mapPlaylistCategory(basic: Record<string, unknown>): OnlinePlaylistSummary {
  const creator = basic.creator as { nick?: string } | undefined;
  const cover = basic.cover as { medium_url?: string; default_url?: string } | undefined;
  return {
    id: String(basic.tid ?? ''),
    name: String(basic.title ?? ''),
    author: String(creator?.nick ?? ''),
    coverUrl: String(cover?.medium_url ?? cover?.default_url ?? ''),
    playCount: basic.play_cnt != null ? formatPlayCount(Number(basic.play_cnt)) : undefined,
    desc: basic.desc != null ? stripHtml(String(basic.desc)) : undefined,
    source: SOURCE,
  };
}

function mapTrack(item: Record<string, unknown>) {
  const songId = String(item.songid ?? item.id ?? '');
  const mid = String(item.songmid ?? item.mid ?? songId);
  const sec = Number(item.interval ?? item.duration ?? 0);
  const album = item.album as { name?: string; mid?: string } | undefined;
  return {
    id: buildTrackId(SOURCE, mid),
    name: String(item.title ?? item.songname ?? '未知'),
    artist: formatSingers(item.singer),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: mid,
      albumName: String(album?.name ?? ''),
      albumId: String(album?.mid ?? ''),
    },
  };
}

function parseListResponse(body: {
  code?: number;
  playlist?: {
    data?: {
      v_playlist?: Record<string, unknown>[];
      content?: { v_item?: Array<{ basic?: Record<string, unknown> }>; total_cnt?: number };
      total?: number;
    };
  };
}, tagId: string | null, page: number): PaginatedPlaylists | null {
  if (body.code !== SUCCESS_CODE) return null;
  if (tagId) {
    const content = body.playlist?.data?.content;
    const list = (content?.v_item ?? [])
      .map((item) => (item.basic ? mapPlaylistCategory(item.basic) : null))
      .filter((p): p is OnlinePlaylistSummary => p != null);
    if (!hasItems(list)) return null;
    return {
      list,
      total: Number(content?.total_cnt ?? list.length),
      page,
      limit: LIMIT_LIST,
      source: SOURCE,
    };
  }
  const list = (body.playlist?.data?.v_playlist ?? []).map(mapPlaylistPlaza);
  if (!hasItems(list)) return null;
  return {
    list,
    total: Number(body.playlist?.data?.total ?? list.length),
    page,
    limit: LIMIT_LIST,
    source: SOURCE,
  };
}

export function getSortList(): SongListSort[] {
  return SORT_LIST;
}

export async function getTags(): Promise<SongListTagGroup[]> {
  const groups = await firstSuccess([loadTagsGet, loadTagsPost], hasItems);
  return groups ?? [];
}

export async function getHotTags(): Promise<SongListTag[]> {
  const tags = await firstSuccess([loadHotTagsHtml, () => getTags().then((g) => g.flatMap((x) => x.list).slice(0, 12))], hasItems);
  return tags ?? [];
}

export async function getList(
  sortId: string,
  tagId: string | null,
  page = 1,
): Promise<PaginatedPlaylists> {
  const result = await firstSuccess(
    [() => loadListGet(sortId, tagId, page), () => loadListPost(sortId, tagId, page)],
    (r) => hasItems(r.list),
  );
  return result ?? { list: [], total: 0, page, limit: LIMIT_LIST, source: SOURCE };
}

export async function getListDetail(id: string, page = 1): Promise<OnlinePlaylistDetail> {
  const pid = await resolveListId(id);
  const detail = await firstSuccess(
    [() => loadDetailFcg(pid), () => loadDetailMusicu(pid)],
    (d) => hasItems(d.tracks) || !!d.info.name,
  );
  if (!detail) throw new Error('QQ音乐歌单详情加载失败');
  return { ...detail, page };
}

async function loadTagsGet(): Promise<SongListTagGroup[] | null> {
  const url = musicuGetUrl({
    tags: { method: 'get_all_categories', param: { qq: '' }, module: 'playlist.PlaylistAllCategoriesServer' },
  });
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      tags?: { data?: { v_group?: Array<{ group_name: string; v_item: Array<{ id: number; name: string }> }> } };
    }>(url),
  );
  if (body?.code !== SUCCESS_CODE) return null;
  const groups = (body.tags?.data?.v_group ?? []).map((g) => ({
    name: g.group_name,
    list: g.v_item.map((item) => ({
      id: String(item.id),
      name: item.name,
      source: SOURCE,
      parentName: g.group_name,
    })),
  }));
  return hasItems(groups) ? groups : null;
}

async function loadTagsPost(): Promise<SongListTagGroup[] | null> {
  const body = await txMusicuPost<{
    code?: number;
    tags?: { data?: { v_group?: Array<{ group_name: string; v_item: Array<{ id: number; name: string }> }> } };
  }>({
    comm: { cv: 1602, ct: 20 },
    tags: { method: 'get_all_categories', param: { qq: '' }, module: 'playlist.PlaylistAllCategoriesServer' },
  });
  if (body?.code !== SUCCESS_CODE) return null;
  const groups = (body.tags?.data?.v_group ?? []).map((g) => ({
    name: g.group_name,
    list: g.v_item.map((item) => ({
      id: String(item.id),
      name: item.name,
      source: SOURCE,
      parentName: g.group_name,
    })),
  }));
  return hasItems(groups) ? groups : null;
}

async function loadHotTagsHtml(): Promise<SongListTag[] | null> {
  const html = await safeCall(() =>
    onlineFetchText('https://c.y.qq.com/node/pc/wk_v15/category_playlist.html', { headers: TX_HEADERS }),
  );
  if (!html) return null;
  const tags: SongListTag[] = [];
  for (const match of html.matchAll(HOT_TAG_HTML_RE)) {
    tags.push({ id: match[1]!, name: match[2]!, source: SOURCE });
  }
  return hasItems(tags) ? tags : null;
}

async function loadListGet(sortId: string, tagId: string | null, page: number): Promise<PaginatedPlaylists | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      playlist?: {
        data?: {
          v_playlist?: Record<string, unknown>[];
          content?: { v_item?: Array<{ basic?: Record<string, unknown> }>; total_cnt?: number };
          total?: number;
        };
      };
    }>(musicuGetUrl(buildListPayload(sortId, tagId, page))),
  );
  if (!body) return null;
  return parseListResponse(body, tagId, page);
}

async function loadListPost(sortId: string, tagId: string | null, page: number): Promise<PaginatedPlaylists | null> {
  const body = await txMusicuPost<{
    code?: number;
    playlist?: {
      data?: {
        v_playlist?: Record<string, unknown>[];
        content?: { v_item?: Array<{ basic?: Record<string, unknown> }>; total_cnt?: number };
        total?: number;
      };
    };
  }>(buildListPayload(sortId, tagId, page));
  if (!body) return null;
  return parseListResponse(body, tagId, page);
}

async function loadDetailFcg(pid: string): Promise<OnlinePlaylistDetail | null> {
  const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${pid}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      cdlist?: Array<{
        dissname?: string;
        logo?: string;
        desc?: string;
        nickname?: string;
        songnum?: number;
        visitnum?: number;
        songlist?: Record<string, unknown>[];
      }>;
    }>(url, {
      headers: {
        ...TX_HEADERS,
        Referer: `https://y.qq.com/n/yqq/playsquare/${pid}.html`,
      },
    }),
  );
  const cd = body?.cdlist?.[0];
  if (!cd || body?.code !== SUCCESS_CODE) return null;
  const tracks = (cd.songlist ?? []).map(mapTrack);
  if (!hasItems(tracks) && !cd.dissname) return null;
  return {
    info: {
      id: pid,
      name: String(cd.dissname ?? ''),
      author: String(cd.nickname ?? ''),
      coverUrl: String(cd.logo ?? ''),
      desc: stripHtml(String(cd.desc ?? '')),
      playCount: cd.visitnum != null ? formatPlayCount(cd.visitnum) : undefined,
      source: SOURCE,
    },
    tracks,
    total: Number(cd.songnum ?? tracks.length),
    page: 1,
    limit: tracks.length || 1,
  };
}

async function loadDetailMusicu(pid: string): Promise<OnlinePlaylistDetail | null> {
  const body = await txMusicuPost<{
    code?: number;
    req?: {
      data?: {
        dirinfo?: {
          title?: string;
          desc?: string;
          creator?: { nick?: string };
          cover?: { url?: string };
          visitnum?: number;
        };
        songlist?: Record<string, unknown>[];
        total_song_num?: number;
      };
    };
  }>({
    comm: { cv: 1602, ct: 20 },
    req: {
      module: 'music.srfDissInfo.DissInfoServer',
      method: 'uniform_get_Dissinfo',
      param: {
        disstid: parseInt(pid, 10),
        onlysonglist: 1,
        song_begin: 0,
        song_num: 200,
      },
    },
  });
  const data = body?.req?.data;
  const dir = data?.dirinfo;
  if (!data || body?.code !== SUCCESS_CODE) return null;
  const tracks = (data.songlist ?? []).map(mapTrack);
  if (!hasItems(tracks) && !dir?.title) return null;
  return {
    info: {
      id: pid,
      name: String(dir?.title ?? ''),
      author: String(dir?.creator?.nick ?? ''),
      coverUrl: String(dir?.cover?.url ?? ''),
      desc: stripHtml(String(dir?.desc ?? '')),
      playCount: dir?.visitnum != null ? formatPlayCount(dir.visitnum) : undefined,
      source: SOURCE,
    },
    tracks,
    total: Number(data.total_song_num ?? tracks.length),
    page: 1,
    limit: tracks.length || 1,
  };
}

async function resolveListId(raw: string): Promise<string> {
  if (/^\d+$/.test(raw)) return raw;
  if (LIST_DETAIL_LINK_RE.test(raw)) {
    const m = LIST_DETAIL_LINK_RE.exec(raw);
    if (m?.[1]) return m[1];
  }
  const m2 = LIST_DETAIL_LINK2_RE.exec(raw);
  if (m2?.[1]) return m2[1];
  return raw.replace(/.*\/playlist\/(\d+).*/, '$1').replace(/.*id=(\d+).*/, '$1');
}

export function parseListIdFromUrl(url: string): string | null {
  const m = url.match(LIST_DETAIL_LINK_RE) ?? url.match(LIST_DETAIL_LINK2_RE);
  return m?.[1] ?? null;
}

export async function searchPlaylists(
  keyword: string,
  page = 1,
): Promise<SongListSearchResult> {
  const url = `http://c.y.qq.com/soso/fcgi-bin/client_music_search_songlist?page_no=${page - 1}&num_per_page=${LIMIT_LIST}&format=json&query=${encodeURIComponent(keyword)}&remoteplace=txt.yqq.playlist&inCharset=utf8&outCharset=utf-8`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: { list?: Record<string, unknown>[]; sum?: number };
    }>(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
        Referer: 'http://y.qq.com/portal/search.html',
      },
    }),
  );
  const list = (body?.data?.list ?? []).map((item) => ({
    id: String(item.dissid ?? ''),
    name: String(item.dissname ?? ''),
    author: String((item.creator as { name?: string } | undefined)?.name ?? ''),
    coverUrl: String(item.imgurl ?? ''),
    playCount: item.listennum != null ? formatPlayCount(Number(item.listennum)) : undefined,
    trackCount: Number(item.song_count ?? 0) || undefined,
    desc: stripHtml(String(item.introduction ?? '')),
    source: SOURCE,
  }));
  return {
    list,
    total: Number(body?.data?.sum ?? list.length),
    page,
    limit: LIMIT_LIST,
    source: SOURCE,
  };
}
