/**
 * 酷狗歌单（yueku 优先，mobilecdn / m.kugou 降级）
 */

import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
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

const SOURCE: MusicSdkSource = 'kg';
const LIMIT = 30;
const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

const SORT_LIST: SongListSort[] = [
  { id: '5', name: '推荐' },
  { id: '6', name: '最热' },
  { id: '7', name: '最新' },
];

const LIST_DATA_RE = /global\.data = (\[.+\]);/;
const LIST_INFO_RE = /global = {[\s\S]+?name: "(.+)"[\s\S]+?pic: "(.+)"[\s\S]+?};/;
const LIST_DETAIL_LINK_RE = /^.+\/(\d+)\.html(?:\?.*|&.*$|#.*$|$)/;

function formatPlayCount(num: number | string): string {
  const n = Number(num);
  if (Number.isNaN(n)) return String(num);
  if (n > 100_000_000) return `${Math.floor(n / 10_000_000) / 10}亿`;
  if (n > 10_000) return `${Math.floor(n / 1000) / 10}万`;
  return String(n);
}

function mapPlaylist(item: Record<string, unknown>): OnlinePlaylistSummary {
  const specialId = item.specialid ?? item.id;
  return {
    id: `id_${specialId}`,
    name: String(item.specialname ?? item.name ?? ''),
    author: String(item.nickname ?? ''),
    coverUrl: String(item.img ?? item.imgurl ?? '').replace('{size}', '400'),
    playCount: item.play_count != null
      ? formatPlayCount(item.play_count as number | string)
      : item.total_play_count != null
        ? formatPlayCount(item.total_play_count as number | string)
        : undefined,
    trackCount: Number(item.songcount ?? 0) || undefined,
    desc: String(item.intro ?? ''),
    source: SOURCE,
  };
}

function mapGatewayTrack(item: Record<string, unknown>) {
  const audioInfo = item.audio_info as Record<string, unknown> | undefined;
  const albumInfo = item.album_info as Record<string, unknown> | undefined;
  if (!audioInfo) return null;
  const songId = String(audioInfo.audio_id ?? '');
  const hash = String(audioInfo.hash ?? '');
  if (!songId || !hash) return null;
  const ms = Number(audioInfo.timelength ?? 0);
  return {
    id: buildTrackId(SOURCE, `${songId}_${hash}`),
    name: String(item.songname ?? item.ori_audio_name ?? '未知'),
    artist: String(item.author_name ?? '未知'),
    source: SOURCE,
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId,
      hash,
      albumId: String(albumInfo?.album_id ?? ''),
      albumName: String(albumInfo?.album_name ?? ''),
      songmid: songId,
    },
  };
}

async function fetchMusicInfosByHash(
  items: Array<{ hash: string }>,
  tryNum = 0,
): Promise<ReturnType<typeof mapGatewayTrack>[]> {
  if (tryNum > 2) throw new Error('酷狗曲目信息加载失败');
  const seen = new Set<string>();
  const hashes = items.filter(({ hash }) => {
    if (!hash || seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
  if (!hashes.length) return [];

  const tasks: Promise<unknown[][]>[] = [];
  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);
    const body = {
      area_code: '1',
      show_privilege: 1,
      show_album_info: '1',
      is_publish: '',
      appid: 1005,
      clientver: 11451,
      mid: '1',
      dfid: '-',
      clienttime: Date.now(),
      key: 'OIlwieks28dk2k092lksi2UIkp',
      fields: 'album_info,author_name,audio_info,ori_audio_name,base,songname',
      data: batch,
    };
    tasks.push(
      onlineFetchJson<unknown[][]>('http://gateway.kugou.com/v2/album_audio/audio', {
        method: 'POST',
        headers: {
          'KG-THash': '13a3164',
          'KG-RC': '1',
          'KG-Fake': '0',
          'KG-RF': '00869891',
          'User-Agent': 'Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi',
          'x-router': 'kmr.service.kugou.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }).catch(() => [] as unknown[][]),
    );
  }

  try {
    const batches = await Promise.all(tasks);
    const tracks: NonNullable<ReturnType<typeof mapGatewayTrack>>[] = [];
    const trackIds = new Set<string>();
    for (const batch of batches.flat()) {
      const row = Array.isArray(batch) ? (batch[0] as Record<string, unknown>) : null;
      if (!row) continue;
      const track = mapGatewayTrack(row);
      if (!track || trackIds.has(track.meta.songId as string)) continue;
      trackIds.add(track.meta.songId as string);
      tracks.push(track);
    }
    if (!tracks.length && tryNum < 2) return fetchMusicInfosByHash(items, tryNum + 1);
    return tracks;
  } catch {
    return fetchMusicInfosByHash(items, tryNum + 1);
  }
}

function filterHotTags(raw: unknown): SongListTag[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((tag) => ({
      id: String((tag as { special_id?: number; id?: number }).special_id ?? (tag as { id?: number }).id ?? ''),
      name: String((tag as { special_name?: string; name?: string }).special_name ?? (tag as { name?: string }).name ?? ''),
      source: SOURCE,
    })).filter((t) => t.id && t.name);
  }
  if (typeof raw === 'object') {
    return Object.values(raw as Record<string, { special_id?: number; special_name?: string }>).map((tag) => ({
      id: String(tag.special_id ?? ''),
      name: String(tag.special_name ?? ''),
      source: SOURCE,
    })).filter((t) => t.id && t.name);
  }
  return [];
}

function filterTagGroups(raw: Record<string, { data?: Array<{ id: number; name: string; pname?: string }> }>): SongListTagGroup[] {
  return Object.keys(raw).map((name) => ({
    name,
    list: (raw[name]?.data ?? []).map((tag) => ({
      id: String(tag.id),
      name: tag.name,
      source: SOURCE,
      parentName: tag.pname ?? name,
    })),
  }));
}

export function getSortList(): SongListSort[] {
  return SORT_LIST;
}

export async function getTags(): Promise<SongListTagGroup[]> {
  const groups = await firstSuccess(
    [
      async () => {
        const body = await onlineFetchJson<{
          status?: number;
          data?: {
            tagids?: Record<string, { data?: Array<{ id: number; name: string; pname?: string }> }>;
          };
        }>('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_smarty=1&', {
          headers: KUGOU_HEADERS,
        });
        if (body.status !== 1 || !body.data?.tagids) return null;
        const list = filterTagGroups(body.data.tagids);
        return hasItems(list) ? list : null;
      },
      loadTagsLegacy,
    ],
    hasItems,
  );
  return groups ?? [];
}

export async function getHotTags(): Promise<SongListTag[]> {
  const tags = await firstSuccess(
    [
      async () => {
        const body = await onlineFetchJson<{
          status?: number;
          data?: { hotTag?: unknown };
        }>('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_smarty=1&', {
          headers: KUGOU_HEADERS,
        });
        if (body.status !== 1) return null;
        const list = filterHotTags(body.data?.hotTag);
        return hasItems(list) ? list : null;
      },
      async () => {
        const groups = await loadTagsLegacy();
        return groups?.[0]?.list.slice(0, 12) ?? null;
      },
    ],
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
    [
      async () => {
        const c = tagId ?? '';
        const url = `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_ajax=1&cdn=cdn&t=${sortId}&c=${c}&p=${page}`;
        const body = await onlineFetchJson<{
          status?: number;
          special_db?: Record<string, unknown>[];
          data?: { params?: { total?: number } };
        }>(url, { headers: KUGOU_HEADERS });
        if (body.status !== 1) return null;
        const list = (body.special_db ?? []).map(mapPlaylist);
        if (!hasItems(list)) return null;
        return {
          list,
          total: Number(body.data?.params?.total ?? list.length),
          page,
          limit: LIMIT,
          source: SOURCE,
        } satisfies PaginatedPlaylists;
      },
      () => loadListLegacy(sortId, tagId, page),
    ],
    () => true,
  );
  return result ?? { list: [], total: 0, page, limit: LIMIT, source: SOURCE };
}

export async function getListDetail(id: string, page = 1): Promise<OnlinePlaylistDetail> {
  const pid = resolveListId(id);
  const detail = await firstSuccess(
    [() => loadDetailYueku(pid, page), () => loadDetailMobile(pid, page)],
    (d) => hasItems(d.tracks) || !!d.info.name,
  );
  if (!detail) throw new Error('酷狗歌单详情加载失败');
  return detail;
}

async function loadTagsLegacy(): Promise<SongListTagGroup[] | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: { info?: Array<{ specialid: number; specialname: string }> };
    }>('http://mobilecdn.kugou.com/api/v3/tag/list', { headers: KUGOU_HEADERS }),
  );
  const list = (body?.data?.info ?? []).map((t) => ({
    id: String(t.specialid),
    name: t.specialname,
    source: SOURCE,
  }));
  if (!hasItems(list)) return null;
  return [{ name: '分类', list }];
}

async function loadListLegacy(
  sortId: string,
  tagId: string | null,
  page: number,
): Promise<PaginatedPlaylists | null> {
  const url = tagId
    ? `http://mobilecdn.kugou.com/api/v3/tag/specialList?tagid=${tagId}&sorttype=${sortId}&plat=0&page=${page}&pagesize=${LIMIT}`
    : `http://mobilecdn.kugou.com/api/v5/special/recommend?plat=0&version=8000&mid=0&userid=0&page=${page}&pagesize=${LIMIT}`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: { info?: Record<string, unknown>[]; total?: number };
      errcode?: number;
    }>(url, { headers: KUGOU_HEADERS }),
  );
  if (!body?.data?.info) return null;
  const list = body.data.info.map(mapPlaylist);
  if (!hasItems(list)) return null;
  return {
    list,
    total: Number(body.data.total ?? list.length),
    page,
    limit: LIMIT,
    source: SOURCE,
  };
}

async function loadDetailYueku(pid: string, page: number): Promise<OnlinePlaylistDetail | null> {
  const url = `http://www2.kugou.kugou.com/yueku/v9/special/single/${pid}-5-9999.html`;
  const html = await fetchListDetailHtml(url);
  const listDataMatch = html.match(LIST_DATA_RE);
  if (!listDataMatch?.[1]) return null;

  const rawList = JSON.parse(listDataMatch[1]) as Array<{ hash?: string }>;
  const tracks = (await fetchMusicInfosByHash(rawList.map((item) => ({ hash: String(item.hash ?? '') }))))
    .filter((t): t is NonNullable<typeof t> => t != null);

  const listInfoMatch = html.match(LIST_INFO_RE);
  return {
    info: {
      id: pid,
      name: listInfoMatch?.[1] ?? '',
      author: '',
      coverUrl: (listInfoMatch?.[2] ?? '').replace('{size}', '400'),
      source: SOURCE,
    },
    tracks,
    total: tracks.length,
    page,
    limit: tracks.length || 1,
  };
}

async function loadDetailMobile(pid: string, page: number): Promise<OnlinePlaylistDetail | null> {
  const url = `https://m.kugou.com/plist/list/${pid}/?json=true&page=${page}&pagesize=200`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      info?: { list?: { specialname?: string; imgurl?: string; intro?: string; nickname?: string; songcount?: number } };
      list?: { list?: { songs?: Record<string, unknown>[] }; songs?: Record<string, unknown>[] };
      songs?: Record<string, unknown>[];
    }>(url, { headers: KUGOU_HEADERS }),
  );
  if (!body) return null;
  const info = body.info?.list;
  const songs = body.list?.list?.songs ?? body.list?.songs ?? body.songs ?? [];
  const tracks = songs.map((item) => {
    const songId = String(item.audio_id ?? item.Audioid ?? '');
    const hash = String(item.hash ?? item.FileHash ?? '');
    const sec = Number(item.duration ?? item.Duration ?? 0);
    return {
      id: buildTrackId(SOURCE, `${songId}_${hash}`),
      name: String(item.songname ?? item.SongName ?? '未知'),
      artist: String(item.author_name ?? item.SingerName ?? '未知'),
      source: SOURCE,
      duration: sec > 0 ? formatDurationSec(sec) : '00:00',
      meta: { songId, hash, albumId: String(item.album_id ?? ''), songmid: songId },
    };
  }).filter((t) => t.meta.songId);
  if (!hasItems(tracks) && !info?.specialname) return null;
  return {
    info: {
      id: pid,
      name: String(info?.specialname ?? ''),
      author: String(info?.nickname ?? ''),
      coverUrl: String(info?.imgurl ?? '').replace('{size}', '400'),
      desc: String(info?.intro ?? ''),
      source: SOURCE,
    },
    tracks,
    total: Number(info?.songcount ?? tracks.length),
    page,
    limit: 200,
  };
}

async function fetchListDetailHtml(url: string, tryNum = 0): Promise<string> {
  if (tryNum > 2) throw new Error('酷狗歌单详情加载失败');
  try {
    const html = await onlineFetchText(url, { headers: KUGOU_HEADERS });
    if (!LIST_DATA_RE.test(html)) return fetchListDetailHtml(url, tryNum + 1);
    return html;
  } catch {
    return fetchListDetailHtml(url, tryNum + 1);
  }
}

function resolveListId(raw: string): string {
  if (raw.startsWith('id_')) return raw.slice(3);
  const m = raw.match(LIST_DETAIL_LINK_RE);
  if (m?.[1]) return m[1];
  const htmlMatch = raw.match(/\/(\d+)\.html/);
  if (htmlMatch?.[1]) return htmlMatch[1];
  return raw.replace(/[^\d]/g, '') || raw;
}

export function parseListIdFromUrl(url: string): string | null {
  if (LIST_DETAIL_LINK_RE.test(url)) {
    return url.replace(LIST_DETAIL_LINK_RE, '$1');
  }
  const m = url.match(/id_(\d+)/);
  return m?.[1] ?? null;
}

export async function searchPlaylists(
  keyword: string,
  page = 1,
): Promise<SongListSearchResult> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      errcode?: number;
      data?: { info?: Record<string, unknown>[]; total?: number };
    }>(
      `http://msearchretry.kugou.com/api/v3/search/special?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${LIMIT}&showtype=10&filter=0&version=7910&sver=2`,
      { headers: KUGOU_HEADERS },
    ),
  );
  const list = (body?.data?.info ?? []).map(mapPlaylist);
  return {
    list,
    total: Number(body?.data?.total ?? list.length),
    page,
    limit: LIMIT,
    source: SOURCE,
  };
}
