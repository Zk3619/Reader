/**
 * 歌手浏览 API（对齐 lx singer.js；tx 正式接口；wy/kg 分页；kw/mg 搜歌兜底）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { searchOnline } from '@/lib/media/audio/online/source-router';
import { eapiPostBody } from '@/lib/media/audio/platform/api/eapi-crypto';
import {
  isUsableSingerBrowseId,
  normalizeMusicBrowseSource,
  pickSingerIdFromTracks,
  primaryArtistName,
} from '@/lib/media/audio/music-sdk/browse-resolve';

export interface SingerDetail {
  id: string;
  name: string;
  coverUrl?: string;
  intro?: string;
  tracks: AudioTrack[];
  source: AudioTrackSource;
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
}

const WY_PAGE_SIZE = 100;
const KG_PAGE_SIZE = 100;
const TX_PAGE_SIZE = 100;

type WyArtistInfo = {
  name?: string;
  picUrl?: string;
  img1v1Url?: string;
  cover?: string;
  avatar?: string;
  briefDesc?: string;
  musicSize?: number;
};

type WySongRaw = {
  id?: number;
  name?: string;
  /** 标准曲目字段（毫秒） */
  dt?: number;
  /** v1/artist/songs 旧字段，多为毫秒；偶发秒 */
  duration?: number;
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
  al?: { id?: number; name?: string; picUrl?: string };
  album?: { id?: number; name?: string; picUrl?: string };
};

function wySongDurationSec(s: WySongRaw): number {
  if (s.dt != null && Number(s.dt) > 0) return Number(s.dt) / 1000;
  const d = Number(s.duration ?? 0);
  if (d <= 0) return 0;
  // ≥10000 按毫秒（约 ≥10s）；更小值按秒，兼容旧接口
  return d >= 10_000 ? d / 1000 : d;
}

function mapWySingerTrack(s: WySongRaw, artistName: string, singerId: string): AudioTrack {
  const artists = s.ar ?? s.artists ?? [];
  const album = s.al ?? s.album;
  const sec = wySongDurationSec(s);
  return {
    id: buildTrackId('wy', String(s.id ?? '')),
    name: String(s.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || artistName,
    source: 'wy' as const,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId: String(s.id ?? ''),
      singerId,
      ...(album?.id != null ? { albumId: String(album.id) } : {}),
      ...(album?.name ? { albumName: String(album.name) } : {}),
      ...(album?.picUrl ? { coverUrl: String(album.picUrl) } : {}),
    },
  };
}

function joinArtistIntro(
  brief?: string | null,
  introduction?: Array<{ ti?: string; txt?: string }> | null,
): string | undefined {
  const parts: string[] = [];
  if (brief?.trim()) parts.push(brief.trim());
  for (const block of introduction ?? []) {
    const body = [block.ti?.trim(), block.txt?.trim()].filter(Boolean).join('\n');
    if (body) parts.push(body);
  }
  const text = parts.join('\n\n').trim();
  return text || undefined;
}

function pickWyArtistCover(
  artist: WyArtistInfo,
  userAvatar?: string,
): string | undefined {
  const url =
    artist.picUrl ||
    artist.cover ||
    artist.avatar ||
    artist.img1v1Url ||
    userAvatar ||
    '';
  const trimmed = url.trim();
  // 过滤默认 1x1 / 空图占位
  if (!trimmed || /default|img1v1\.jpg/i.test(trimmed)) {
    return artist.picUrl?.trim() || artist.cover?.trim() || userAvatar?.trim() || undefined;
  }
  return trimmed;
}

const WY_PLAIN_API_HEADERS = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0',
} as const;

type WyArtistHeadBody = {
  code?: number;
  data?: {
    artist?: WyArtistInfo;
    user?: { avatarUrl?: string };
  };
};

type WyArtistClassicBody = {
  code?: number;
  artist?: WyArtistInfo;
  hotSongs?: WySongRaw[];
};

type WyArtistDescBody = {
  code?: number;
  briefDesc?: string;
  introduction?: Array<{ ti?: string; txt?: string }>;
};

/** 简介：weapi artist/introduction（对齐 NeteaseCloudMusicApi artist_desc），明文 API 兜底 */
async function fetchWyArtistDesc(singerId: string): Promise<WyArtistDescBody | null> {
  const weapi = await safeCall(() =>
    weapiPost<WyArtistDescBody>('artist/introduction', { id: singerId }),
  );
  if (weapi?.briefDesc || weapi?.introduction?.length) return weapi;
  const plain = await safeCall(() =>
    onlineFetchJson<WyArtistDescBody>(
      `https://music.163.com/api/artist/introduction?id=${singerId}`,
      { headers: WY_PLAIN_API_HEADERS },
    ),
  );
  if (plain?.briefDesc || plain?.introduction?.length) return plain;
  return weapi ?? plain;
}

async function fetchWyArtistProfile(singerId: string): Promise<{
  artist: WyArtistInfo;
  hotSongs?: WySongRaw[];
  intro?: string;
} | null> {
  // lx：/weapi/artist/head/info/get → data.artist；部分环境 weapi 空响应，退明文 API
  let head = await safeCall(() =>
    weapiPost<WyArtistHeadBody>('artist/head/info/get', { id: singerId }),
  );
  if (!head?.data?.artist?.name) {
    head = await safeCall(() =>
      onlineFetchJson<WyArtistHeadBody>(
        `https://music.163.com/api/artist/head/info/get?id=${singerId}`,
        { headers: WY_PLAIN_API_HEADERS },
      ),
    );
  }
  const headArtist = head?.data?.artist;
  if (headArtist?.name) {
    const descBody = await fetchWyArtistDesc(singerId);
    return {
      artist: {
        ...headArtist,
        picUrl: pickWyArtistCover(headArtist, head?.data?.user?.avatarUrl),
      },
      intro: joinArtistIntro(
        headArtist.briefDesc || descBody?.briefDesc,
        descBody?.introduction,
      ),
    };
  }

  // 经典：/weapi/v1/artist/{id}（含 hotSongs），同样带明文 API 兜底
  let classic = await safeCall(() =>
    weapiPost<WyArtistClassicBody>(`v1/artist/${singerId}`, {}),
  );
  if (!classic?.artist?.name && !classic?.hotSongs?.length) {
    classic = await safeCall(() =>
      onlineFetchJson<WyArtistClassicBody>(
        `https://music.163.com/api/v1/artist/${singerId}`,
        { headers: WY_PLAIN_API_HEADERS },
      ),
    );
  }
  if (classic?.artist?.name || classic?.hotSongs?.length) {
    const artist = classic.artist ?? {};
    const descBody = await fetchWyArtistDesc(singerId);
    return {
      artist: {
        ...artist,
        picUrl: pickWyArtistCover(artist),
      },
      hotSongs: classic.hotSongs,
      intro: joinArtistIntro(artist.briefDesc || descBody?.briefDesc, descBody?.introduction),
    };
  }

  return null;
}

async function fetchWyArtistSongsPage(
  singerId: string,
  page: number,
): Promise<{ songs: WySongRaw[]; total?: number; more?: boolean } | null> {
  const offset = (page - 1) * WY_PAGE_SIZE;
  const params = {
    id: singerId,
    private_cloud: 'true',
    work_type: 1,
    order: 'hot',
    limit: WY_PAGE_SIZE,
    offset,
  };

  // lx：/weapi/v1/artist/songs（artists / duration / album）
  const weapi = await safeCall(() =>
    weapiPost<{
      code?: number;
      songs?: WySongRaw[];
      total?: number;
      more?: boolean;
    }>('v1/artist/songs', params),
  );
  if (weapi?.songs?.length) {
    return { songs: weapi.songs, total: weapi.total, more: weapi.more };
  }

  // 兜底：eapi v2（需 unwrap batch）
  const eapi = await safeCall(() =>
    eapiPostBody<{
      code?: number;
      songs?: WySongRaw[];
      total?: number;
      more?: boolean;
    }>('/api/v2/artist/songs', {
      id: singerId,
      limit: WY_PAGE_SIZE,
      offset,
      order: 'hot',
    }),
  );
  if (eapi?.songs?.length) {
    return { songs: eapi.songs, total: eapi.total, more: eapi.more };
  }

  if (weapi && Array.isArray(weapi.songs)) {
    return { songs: weapi.songs, total: weapi.total, more: weapi.more };
  }
  if (eapi && Array.isArray(eapi.songs)) {
    return { songs: eapi.songs, total: eapi.total, more: eapi.more };
  }
  return null;
}

export async function fetchWySinger(singerId: string, page = 1): Promise<SingerDetail | null> {
  const [profile, songPage] = await Promise.all([
    fetchWyArtistProfile(singerId),
    fetchWyArtistSongsPage(singerId, page),
  ]);

  const artistName = String(profile?.artist?.name ?? '');
  const songList =
    songPage?.songs ??
    (page === 1 ? profile?.hotSongs : undefined) ??
    [];
  if (!artistName && !songList.length) return null;

  const tracks = songList.map((s) => mapWySingerTrack(s, artistName, singerId));
  const total = Number(
    songPage?.total ?? profile?.artist?.musicSize ?? tracks.length,
  );
  return {
    id: singerId,
    name: artistName,
    coverUrl: profile?.artist?.picUrl || profile?.artist?.img1v1Url,
    intro: profile?.intro || profile?.artist?.briefDesc,
    tracks,
    source: 'wy',
    page,
    limit: WY_PAGE_SIZE,
    total,
    hasMore: songPage?.more ?? page * WY_PAGE_SIZE < total,
  };
}

export async function fetchKgSinger(singerId: string, page = 1): Promise<SingerDetail | null> {
  if (singerId === '0') return null;
  const [infoBody, songBody] = await Promise.all([
    safeCall(() =>
      onlineFetchJson<{
        data?: {
          singerid?: number;
          singername?: string;
          imgurl?: string;
          intro?: string;
          songcount?: number;
        };
        singerid?: number;
        singername?: string;
        imgurl?: string;
        intro?: string;
        songcount?: number;
      }>(`http://mobiles.kugou.com/api/v5/singer/info?singerid=${singerId}`),
    ),
    safeCall(() =>
      onlineFetchJson<{
        data?: {
          info?: Array<{
            hash?: string;
            filename?: string;
            songname?: string;
            duration?: number;
            album_audio_id?: string | number;
            album_id?: string | number;
            album_name?: string;
            remark?: string;
          }>;
          total?: number;
        };
      }>(
        `http://mobiles.kugou.com/api/v5/singer/song?singerid=${singerId}&page=${page}&pagesize=${KG_PAGE_SIZE}`,
      ),
    ),
  ]);

  const info = infoBody?.data ?? infoBody;
  const songs = songBody?.data?.info ?? [];
  if (!info && !songs.length) return null;
  const artist = String((info as { singername?: string })?.singername ?? '');
  const tracks = songs.map((s) => {
    const name =
      s.songname ??
      (s.filename?.includes(' - ') ? s.filename.split(' - ').slice(1).join(' - ') : s.filename) ??
      '';
    // v5 接口专辑名可能在 album_name 或 remark（旧字段惯用 remark 放专辑）
    const albumName = String(s.album_name ?? s.remark ?? '').trim();
    return {
      id: buildTrackId('kg', `${s.album_audio_id ?? singerId}_${s.hash ?? ''}`),
      name: String(name),
      artist,
      source: 'kg' as const,
      duration: s.duration ? formatDurationSec(s.duration) : '00:00',
      meta: {
        songId: String(s.album_audio_id ?? ''),
        hash: s.hash,
        singerId,
        ...(s.album_id != null ? { albumId: String(s.album_id) } : {}),
        ...(albumName ? { albumName } : {}),
      },
    };
  });
  const total = Number(songBody?.data?.total ?? (info as { songcount?: number })?.songcount ?? tracks.length);
  const cover = (info as { imgurl?: string })?.imgurl?.replace('{size}', '480');
  return {
    id: singerId,
    name: artist,
    coverUrl: cover,
    intro: (info as { intro?: string })?.intro,
    tracks,
    source: 'kg',
    page,
    limit: KG_PAGE_SIZE,
    total,
    hasMore: page * KG_PAGE_SIZE < total,
  };
}

export async function fetchTxSinger(singerId: string, page = 1): Promise<SingerDetail | null> {
  const begin = (page - 1) * TX_PAGE_SIZE;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      req_1?: {
        code?: number;
        data?: {
          singer_list?: Array<{
            basic_info?: { name?: string; singer_mid?: string };
            ex_info?: { desc?: string };
            pic?: { pic?: string };
          }>;
        };
      };
      req_2?: {
        code?: number;
        data?: {
          totalNum?: number;
          songList?: Array<{
            songInfo?: {
              id?: number;
              mid?: string;
              title?: string;
              interval?: number;
              singer?: Array<{ name?: string }>;
              file?: { media_mid?: string };
              album?: { mid?: string; name?: string };
            };
          }>;
        };
      };
    }>('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          uin: 0,
        },
        req_1: {
          module: 'music.musichallSinger.SingerInfoInter',
          method: 'GetSingerDetail',
          param: {
            singer_mid: [singerId],
            ex_singer: 1,
            wiki_singer: 1,
            group_singer: 0,
            pic: 1,
            photos: 0,
          },
        },
        req_2: {
          module: 'musichall.song_list_server',
          method: 'GetSingerSongList',
          param: {
            singerMid: singerId,
            order: 1,
            begin,
            num: TX_PAGE_SIZE,
          },
        },
      }),
    }),
  );

  const info = body?.req_1?.data?.singer_list?.[0];
  const music = body?.req_2?.data;
  if (!info && !music?.songList?.length) return null;
  const artist = String(info?.basic_info?.name ?? '');
  const tracks = (music?.songList ?? [])
    .map((row) => {
      const item = row.songInfo;
      if (!item?.mid) return null;
      const mediaMid = String(item.file?.media_mid ?? '');
      if (!mediaMid) return null;
      return {
        id: buildTrackId('tx', item.mid),
        name: String(item.title ?? ''),
        artist: (item.singer ?? []).map((s) => s.name).filter(Boolean).join('、') || artist,
        source: 'tx' as const,
        duration: item.interval ? formatDurationSec(item.interval) : '00:00',
        meta: {
          songId: String(item.id ?? ''),
          songmid: item.mid,
          strMediaMid: mediaMid,
          mediaMid,
          albumMid: String(item.album?.mid ?? ''),
          albumName: String(item.album?.name ?? ''),
          singerId,
        },
      };
    })
    .filter((t): t is NonNullable<typeof t> => t != null);

  const total = Number(music?.totalNum ?? tracks.length);
  return {
    id: singerId,
    name: artist,
    coverUrl: info?.pic?.pic,
    intro: info?.ex_info?.desc,
    tracks,
    source: 'tx',
    page,
    limit: TX_PAGE_SIZE,
    total,
    hasMore: begin + tracks.length < total,
  };
}

/** kw/mg：lx 无独立 singer 模块 → 按歌手名搜索兜底，不宣称仅靠 ID 可走详情 */
async function fetchSingerBySearch(
  source: AudioTrackSource,
  singerId: string,
  singerName: string,
): Promise<SingerDetail | null> {
  const primary = primaryArtistName(singerName) || singerName.trim();
  if (!primary) return null;
  const { tracks } = await searchOnline(source, primary);
  const filtered = tracks.filter(
    (t) => t.artist.includes(primary) || primary.includes(t.artist),
  );
  return {
    id: singerId || primary,
    name: singerName.trim() || primary,
    tracks: (filtered.length > 0 ? filtered : tracks).slice(0, 30),
    source,
    hasMore: false,
  };
}

async function resolveSingerIdByName(
  source: AudioTrackSource,
  singerName: string,
): Promise<string | null> {
  const primary = primaryArtistName(singerName);
  if (!primary) return null;
  const hit = await safeCall(() => searchOnline(source, primary, 1));
  return pickSingerIdFromTracks(hit?.tracks ?? [], primary);
}

function withSingerDisplayName(
  detail: SingerDetail | null,
  singerName?: string,
): SingerDetail | null {
  if (!detail) return null;
  const name = singerName?.trim();
  if (!detail.name.trim() && name) return { ...detail, name };
  return detail;
}

async function fetchSingerById(
  source: AudioTrackSource,
  singerId: string,
  page: number,
): Promise<SingerDetail | null> {
  switch (source) {
    case 'wy':
      return fetchWySinger(singerId, page);
    case 'kg':
      return fetchKgSinger(singerId, page);
    case 'tx':
      return fetchTxSinger(singerId, page);
    default:
      return null;
  }
}

export async function fetchSingerDetail(
  source: AudioTrackSource,
  singerId: string,
  singerName?: string,
  page = 1,
): Promise<SingerDetail | null> {
  const src = normalizeMusicBrowseSource(source);
  const id = singerId.trim();
  const name = singerName?.trim() || '';

  if (src === 'kw' || src === 'mg') {
    if (!name) return null;
    // 分页仅第一页走搜歌兜底
    if (page > 1) return null;
    return fetchSingerBySearch(src, id, name);
  }

  if (isUsableSingerBrowseId(id, src, name)) {
    const detail = withSingerDisplayName(await fetchSingerById(src, id, page), name);
    if (detail) return detail;
  }

  // 右键缺 ID / ID 无效：先搜歌解析真实 singerId，再走详情接口
  if (name && page === 1) {
    const resolvedId = await resolveSingerIdByName(src, name);
    if (resolvedId && resolvedId !== id) {
      const detail = withSingerDisplayName(
        await fetchSingerById(src, resolvedId, page),
        name,
      );
      if (detail) return detail;
    }
    return fetchSingerBySearch(src, resolvedId || id || name, name);
  }

  return null;
}
