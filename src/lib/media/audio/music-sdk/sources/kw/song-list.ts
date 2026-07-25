/**
 * 酷我歌单（wapi 优先，mobile er.s / qukudata 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { parseKuwoObjStr } from '@/lib/media/audio/music-sdk/sources/kw/parse-kuwo-json';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
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

const SOURCE: MusicSdkSource = 'kw';
const LIMIT_LIST = 36;
const LIMIT_SONG = 200;

const SORT_LIST: SongListSort[] = [
  { id: 'new', name: '最新' },
  { id: 'hot', name: '最热' },
];

const LIST_DETAIL_RE =
  /\/playlist(?:_detail)?\/(\d+)(?:\?.*|&.*$|#.*$|$)/;

const WAPI_BASE =
  'http://wapi.kuwo.cn/api/pc/classify/playlist';

function formatPlayCount(num: number): string {
  if (num > 100_000_000) return `${Math.floor(num / 10_000_000) / 10}亿`;
  if (num > 10_000) return `${Math.floor(num / 1000) / 10}万`;
  return String(num);
}

function mapPlaylistItem(item: Record<string, unknown>): OnlinePlaylistSummary {
  return {
    id: String(item.id ?? ''),
    name: decodeHtmlEntities(String(item.name ?? '')),
    author: decodeHtmlEntities(String(item.uname ?? item.author ?? '')),
    coverUrl: String(item.img ?? item.pic ?? ''),
    playCount: item.listencnt != null ? formatPlayCount(Number(item.listencnt)) : undefined,
    trackCount: Number(item.total ?? 0) || undefined,
    desc: decodeHtmlEntities(String(item.desc ?? '')),
    source: SOURCE,
  };
}

function mapTrack(item: Record<string, unknown>) {
  const songId = String(item.id ?? item.rid ?? '').replace('MUSIC_', '');
  const sec = parseInt(String(item.duration ?? item.DURATION ?? '0'), 10);
  return {
    id: buildTrackId(SOURCE, songId),
    name: String(item.name ?? item.SONGNAME ?? '未知'),
    artist: String(item.artist ?? item.ARTIST ?? '未知').replace(/&/g, '、'),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: { songId, songmid: songId, albumName: String(item.album ?? item.ALBUM ?? '') },
  };
}

export function getSortList(): SongListSort[] {
  return SORT_LIST;
}

export async function getTags(): Promise<SongListTagGroup[]> {
  const groups = await firstSuccess([loadTagsWapi], hasItems);
  return groups ?? [];
}

export async function getHotTags(): Promise<SongListTag[]> {
  const tags = await firstSuccess(
    [loadHotTagsWapi, async () => (await loadTagsWapi())?.flatMap((g) => g.list).slice(0, 12) ?? null],
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
    [() => loadListWapi(sortId, tagId, page), () => loadListMobile(tagId, page)],
    (r) => hasItems(r.list),
  );
  return result ?? { list: [], total: 0, page, limit: LIMIT_LIST, source: SOURCE };
}

export async function getListDetail(id: string, page = 1): Promise<OnlinePlaylistDetail> {
  const pid = resolveListId(id);
  const detail = await firstSuccess(
    [() => loadDetailNpl(pid, page), () => loadDetailDigest5(pid, page)],
    (d) => hasItems(d.tracks) || !!d.info.name,
  );
  if (!detail) throw new Error('酷我歌单详情加载失败');
  return detail;
}

async function loadTagsWapi(): Promise<SongListTagGroup[] | null> {
  const url =
    `${WAPI_BASE}/getTagList?cmd=rcm_keyword_playlist&user=0&prod=kwplayer_pc_9.0.5.0&vipver=9.0.5.0&source=kwplayer_pc_9.0.5.0&loginUid=0&loginSid=0&appUid=76039576`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: Array<{ id: string; name: string; data: Array<{ id: string; name: string; digest: string }> }>;
    }>(url),
  );
  if (body?.code !== 200 || !body.data) return null;
  const groups = body.data.map((type) => ({
    name: type.name,
    list: type.data.map((item) => ({
      id: `${item.id}-${item.digest}`,
      name: item.name,
      source: SOURCE,
      parentId: type.id,
      parentName: type.name,
    })),
  }));
  return hasItems(groups) ? groups : null;
}

async function loadHotTagsWapi(): Promise<SongListTag[] | null> {
  const url =
    `${WAPI_BASE}/getRcmTagList?loginUid=0&loginSid=0&appUid=76039576`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: Array<{ data: Array<{ id: string; name: string; digest: string }> }>;
    }>(url),
  );
  const raw = body?.data?.[0]?.data ?? [];
  const list = raw.map((item) => ({
    id: `${item.id}-${item.digest}`,
    name: item.name,
    source: SOURCE,
  }));
  return hasItems(list) ? list : null;
}

async function loadListWapi(
  sortId: string,
  tagId: string | null,
  page: number,
): Promise<PaginatedPlaylists | null> {
  let url: string;
  if (!tagId) {
    url = `${WAPI_BASE}/getRcmPlayList?loginUid=0&loginSid=0&appUid=76039576&pn=${page}&rn=${LIMIT_LIST}&order=${sortId}`;
  } else {
    const [id, type] = tagId.split('-');
    if (type === '10000') {
      url = `${WAPI_BASE}/getTagPlayList?loginUid=0&loginSid=0&appUid=76039576&pn=${page}&id=${id}&rn=${LIMIT_LIST}`;
    } else {
      return loadListMobile(tagId, page);
    }
  }
  const body = await safeCall(() => onlineFetchJson<Record<string, unknown>>(url));
  const data = body?.data as { data?: unknown[]; total?: number } | undefined;
  const list = (data?.data as Record<string, unknown>[] | undefined)?.map(mapPlaylistItem) ?? [];
  if (!hasItems(list)) return null;
  return {
    list,
    total: Number(data?.total ?? list.length),
    page,
    limit: LIMIT_LIST,
    source: SOURCE,
  };
}

async function loadListMobile(tagId: string | null, page: number): Promise<PaginatedPlaylists | null> {
  if (!tagId) return null;
  const [id] = tagId.split('-');
  const url = `http://mobileinterfaces.kuwo.cn/er.s?type=get_pc_qz_data&f=web&id=${id}&prod=pc`;
  const body = await safeCall(() => onlineFetchJson<unknown>(url));
  const list: OnlinePlaylistSummary[] = [];
  if (Array.isArray(body)) {
    for (const group of body) {
      const g = group as { list?: Record<string, unknown>[] };
      for (const item of g.list ?? []) list.push(mapPlaylistItem(item));
    }
  }
  if (!hasItems(list)) return null;
  return { list, total: 1000, page, limit: LIMIT_LIST, source: SOURCE };
}

async function loadDetailNpl(pid: string, page: number): Promise<OnlinePlaylistDetail | null> {
  const url = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${pid}&pn=${page - 1}&rn=${LIMIT_SONG}&encode=utf-8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      result?: string;
      musiclist?: Record<string, unknown>[];
      total?: number;
      rn?: number;
      title?: string;
      pic?: string;
      info?: string;
      uname?: string;
      playnum?: number;
    }>(url),
  );
  if (body?.result !== 'ok') return null;
  const tracks = (body.musiclist ?? []).map(mapTrack);
  if (!hasItems(tracks) && !body.title) return null;
  return {
    info: {
      id: pid,
      name: String(body.title ?? ''),
      author: String(body.uname ?? ''),
      coverUrl: String(body.pic ?? ''),
      desc: String(body.info ?? ''),
      playCount: body.playnum != null ? formatPlayCount(body.playnum) : undefined,
      source: SOURCE,
    },
    tracks,
    total: Number(body.total ?? tracks.length),
    page,
    limit: Number(body.rn ?? LIMIT_SONG),
  };
}

async function loadDetailDigest5(pid: string, page: number): Promise<OnlinePlaylistDetail | null> {
  const infoBody = await safeCall(() =>
    onlineFetchJson<{ child?: Array<{ sourceid?: string }> }>(
      `http://qukudata.kuwo.cn/q.k?op=query&cont=ninfo&node=${pid}&pn=0&rn=1&fmt=json&src=mbox&level=2`,
    ),
  );
  const detailId = infoBody?.child?.[0]?.sourceid;
  if (!detailId) return null;
  return loadDetailNpl(detailId, page);
}

function resolveListId(raw: string): string {
  if (raw.includes('__')) return raw.split('__').pop()!;
  if (/^digest-/.test(raw)) return raw.replace(/^digest-\d+__/, '');
  const m = raw.match(LIST_DETAIL_RE);
  if (m?.[1]) return m[1];
  return raw;
}

export function parseListIdFromUrl(url: string): string | null {
  // /playlist/{id} 在多平台通用，仅在酷我域名下解析
  if (!/kuwo\.cn/i.test(url)) return null;
  const m = url.match(LIST_DETAIL_RE);
  return m?.[1] ?? null;
}

export async function searchPlaylists(
  keyword: string,
  page = 1,
  limit = LIMIT_LIST,
): Promise<SongListSearchResult> {
  const pageSize = Math.max(1, limit);
  const url =
    `http://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${pageSize}` +
    `&rformat=json&encoding=utf8&ver=mbox&vipver=MUSIC_8.7.7.0_BCS37&plat=pc&devid=28156413&ft=playlist&pay=0&needliveshow=0`;
  // 对齐 lx：text + objStr2JSON（勿用 Response.json，单引号体会直接失败）
  const text = await safeCall(() => onlineFetchText(url));
  if (!text) {
    return { list: [], total: 0, page, limit: pageSize, source: SOURCE };
  }
  let body: { abslist?: Record<string, unknown>[]; TOTAL?: string };
  try {
    body = parseKuwoObjStr(text);
  } catch {
    return { list: [], total: 0, page, limit: pageSize, source: SOURCE };
  }
  const list = (body.abslist ?? []).map((item) =>
    mapPlaylistItem({
      id: item.playlistid,
      name: item.name,
      uname: item.nickname,
      img: item.pic,
      listencnt: item.playcnt,
      total: item.songnum,
      desc: item.intro,
    }),
  );
  return {
    list,
    total: parseInt(String(body.TOTAL ?? list.length), 10) || list.length,
    page,
    limit: pageSize,
    source: SOURCE,
  };
}
