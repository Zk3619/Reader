/**
 * 专辑浏览（对齐 lx album.js；kw/mg/tx/kg/wy）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import { parseKuwoObjStr } from '@/lib/media/audio/music-sdk/sources/kw/parse-kuwo-json';
import { searchOnline } from '@/lib/media/audio/online/source-router';
import {
  isUsableAlbumBrowseId,
  normalizeMusicBrowseSource,
  pickAlbumIdFromTracks,
  primaryArtistName,
} from '@/lib/media/audio/music-sdk/browse-resolve';

export interface AlbumDetail {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
  intro?: string;
  tracks: AudioTrack[];
  source: AudioTrackSource;
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
}

const WY_PLAIN_API_HEADERS = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0',
} as const;

type WyAlbumSong = {
  id?: number;
  name?: string;
  dt?: number;
  duration?: number;
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
};

type WyAlbumBody = {
  code?: number;
  album?: {
    name?: string;
    picUrl?: string;
    blurPicUrl?: string;
    description?: string;
    briefDesc?: string;
    artists?: Array<{ name?: string }>;
    artist?: { name?: string };
  };
  songs?: WyAlbumSong[];
};

function mapWyAlbumTrack(
  s: WyAlbumSong,
  artist: string,
  albumId: string,
  albumName: string,
): AudioTrack {
  const artists = s.ar ?? s.artists ?? [];
  const ms = Number(s.dt ?? s.duration ?? 0);
  const sec =
    ms >= 10_000 ? ms / 1000 : ms > 0 ? (s.dt != null ? ms / 1000 : ms) : 0;
  return {
    id: buildTrackId('wy', String(s.id ?? '')),
    name: String(s.name ?? ''),
    artist: artists.map((a) => a.name).filter(Boolean).join('、') || artist,
    source: 'wy' as const,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId: String(s.id ?? ''),
      albumId,
      ...(albumName ? { albumName } : {}),
    },
  };
}

export async function fetchWyAlbum(albumId: string): Promise<AlbumDetail | null> {
  // lx / NCM：/weapi/v1/album/{id}（body 为空）；旧路径 weapi/album+{id} 常空响应 →「音源服务不可用」
  let body = await safeCall(() => weapiPost<WyAlbumBody>(`v1/album/${albumId}`, {}));
  if (!body?.album && !body?.songs?.length) {
    body = await safeCall(() =>
      onlineFetchJson<WyAlbumBody>(`https://music.163.com/api/v1/album/${albumId}`, {
        headers: WY_PLAIN_API_HEADERS,
      }),
    );
  }
  if (!body?.album && !body?.songs?.length) {
    body = await safeCall(() => weapiPost<WyAlbumBody>(`album/${albumId}`, {}));
  }
  if (!body?.album && !body?.songs?.length) return null;

  const album = body.album ?? {};
  const artist =
    (album.artists ?? []).map((a) => a.name).filter(Boolean).join('、') ||
    String(album.artist?.name ?? '');
  const albumName = String(album.name ?? '');
  const tracks = (body.songs ?? []).map((s) =>
    mapWyAlbumTrack(s, artist, albumId, albumName),
  );
  const intro = String(album.description ?? album.briefDesc ?? '').trim() || undefined;
  return {
    id: albumId,
    name: albumName,
    artist,
    coverUrl: album.picUrl || album.blurPicUrl,
    intro,
    tracks,
    source: 'wy',
    total: tracks.length,
    hasMore: false,
  };
}

type KgAlbumInfo = {
  album_name?: string;
  albumname?: string;
  author_name?: string;
  singername?: string;
  sizable_cover?: string;
  cover?: string;
  imgurl?: string;
  intro?: string;
  intro_text?: string;
};

function unwrapKgAlbumInfo(raw: unknown): KgAlbumInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (Array.isArray(raw)) return (raw[0] as KgAlbumInfo | undefined) ?? undefined;
  const obj = raw as {
    data?: KgAlbumInfo | KgAlbumInfo[] | { info?: KgAlbumInfo };
    info?: KgAlbumInfo;
  };
  if (Array.isArray(obj.data)) return obj.data[0];
  if (obj.data && typeof obj.data === 'object' && 'info' in obj.data) {
    return (obj.data as { info?: KgAlbumInfo }).info;
  }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    return obj.data as KgAlbumInfo;
  }
  return obj.info;
}

function kgCoverUrl(info?: KgAlbumInfo): string | undefined {
  const raw = info?.sizable_cover || info?.cover || info?.imgurl;
  if (!raw?.trim()) return undefined;
  return raw.replace('{size}', '480');
}

async function fetchKgAlbumInfo(albumId: string): Promise<KgAlbumInfo | undefined> {
  // 1) kmr container（签名 key 可能失效，先试）
  const kmr = await safeCall(() =>
    onlineFetchJson<unknown>(
      'http://kmrserviceretry.kugou.com/container/v1/album?dfid=-&mid=xxx&userid=0&appid=1005&clientver=11589',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appid: 1005,
          clienttime: Math.floor(Date.now() / 1000),
          clientver: 11589,
          data: [{ album_id: albumId }],
          fields:
            'language,intro,sizable_cover,cover,album_name,author_name,publish_date,album_id',
          isBuy: 0,
          key: 'e6f3306ff7e2afb494e89fbbda0becbf',
          mid: '22945702112173152889429073101964063697',
          show_album_tag: 0,
        }),
      },
    ),
  );
  const fromKmr = unwrapKgAlbumInfo(kmr);
  if (fromKmr?.album_name || fromKmr?.author_name || kgCoverUrl(fromKmr)) return fromKmr;

  // 2) 移动端明文 album/info
  const mobile = await safeCall(() =>
    onlineFetchJson<{ data?: KgAlbumInfo } | KgAlbumInfo>(
      `https://mobiles.kugou.com/api/v3/album/info?albumid=${albumId}&version=9108`,
    ),
  );
  const fromMobile = unwrapKgAlbumInfo(mobile);
  if (fromMobile?.album_name || fromMobile?.albumname || kgCoverUrl(fromMobile)) {
    return fromMobile;
  }

  // 3) m 站 JSON
  const mSite = await safeCall(() =>
    onlineFetchJson<{ data?: KgAlbumInfo } | KgAlbumInfo>(
      `http://m.kugou.com/album/info/?albumid=${albumId}&json=true`,
    ),
  );
  return unwrapKgAlbumInfo(mSite) ?? fromKmr ?? fromMobile;
}

export async function fetchKgAlbum(albumId: string, page = 1): Promise<AlbumDetail | null> {
  const limit = 200;
  const [listBody, albumInfo] = await Promise.all([
    safeCall(() =>
      onlineFetchJson<{
        data?: {
          info?: Array<{
            hash?: string;
            filename?: string;
            songname?: string;
            duration?: number;
            album_audio_id?: number | string;
            author_name?: string;
            album_name?: string;
            album_img?: string;
            img?: string;
          }>;
          total?: number;
        };
      }>(
        `https://mobiles.kugou.com/api/v3/album/song?version=9108&albumid=${albumId}&plat=0&pagesize=${limit}&area_code=0&page=${page}&with_res_tag=0`,
      ),
    ),
    fetchKgAlbumInfo(albumId),
  ]);

  const songs = listBody?.data?.info ?? [];
  if (!songs.length && !albumInfo) return null;

  const artist = String(
    albumInfo?.author_name ??
      albumInfo?.singername ??
      songs[0]?.author_name ??
      (songs[0]?.filename?.includes(' - ')
        ? songs[0].filename.split(' - ')[0]
        : '') ??
      '',
  ).trim();
  const albumName = String(
    albumInfo?.album_name ?? albumInfo?.albumname ?? songs[0]?.album_name ?? '',
  ).trim();
  const coverFromSongs = (songs[0]?.album_img || songs[0]?.img)?.replace('{size}', '480');
  const intro = String(albumInfo?.intro ?? albumInfo?.intro_text ?? '').trim() || undefined;

  const tracks = songs.map((s) => {
    const name =
      s.songname ??
      (s.filename?.includes(' - ') ? s.filename.split(' - ').slice(1).join(' - ') : s.filename) ??
      '';
    const trackArtist =
      String(s.author_name ?? '').trim() ||
      (s.filename?.includes(' - ') ? s.filename.split(' - ')[0]?.trim() : '') ||
      artist;
    return {
      id: buildTrackId('kg', `${s.album_audio_id ?? albumId}_${s.hash ?? ''}`),
      name: String(name),
      artist: trackArtist,
      source: 'kg' as const,
      duration: s.duration ? formatDurationSec(s.duration) : '00:00',
      meta: {
        songId: String(s.album_audio_id ?? ''),
        hash: s.hash,
        albumId,
        ...(albumName ? { albumName } : {}),
      },
    };
  });
  const total = Number(listBody?.data?.total ?? tracks.length);
  return {
    id: albumId,
    name: albumName,
    artist,
    coverUrl: kgCoverUrl(albumInfo) || coverFromSongs,
    intro,
    tracks,
    source: 'kg',
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

export async function fetchKwAlbum(albumId: string, page = 1): Promise<AlbumDetail | null> {
  const limit = 1000;
  const text = await safeCall(() =>
    onlineFetchText(
      `http://search.kuwo.cn/r.s?pn=${page - 1}&rn=${limit}&stype=albuminfo&albumid=${albumId}&show_copyright_off=0&encoding=utf&vipver=MUSIC_9.1.0`,
    ),
  );
  if (!text) return null;
  const body = parseKuwoObjStr<{
    name?: string;
    artist?: string;
    img?: string;
    hts_img?: string;
    info?: string;
    albumid?: string;
    songnum?: string | number;
    musiclist?: Array<{
      id?: string;
      name?: string;
      artist?: string;
      pic?: string;
      formats?: string;
    }>;
  }>(text);
  if (!body?.musiclist) return null;
  const albumName = decodeHtmlEntities(String(body.name ?? ''));
  const artist = decodeHtmlEntities(String(body.artist ?? ''));
  const tracks = body.musiclist.map((item) => ({
    id: buildTrackId('kw', String(item.id ?? '')),
    name: decodeHtmlEntities(String(item.name ?? '')),
    artist: decodeHtmlEntities(String(item.artist ?? artist)),
    source: 'kw' as const,
    duration: '00:00',
    meta: { songId: String(item.id ?? ''), albumId, albumName },
  }));
  const total = Number(body.songnum ?? tracks.length);
  return {
    id: albumId,
    name: albumName,
    artist,
    coverUrl: body.img || body.hts_img,
    intro: body.info ? decodeHtmlEntities(String(body.info)) : undefined,
    tracks,
    source: 'kw',
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

export async function fetchMgAlbum(albumId: string, page = 1): Promise<AlbumDetail | null> {
  const [list, info] = await Promise.all([
    safeCall(() =>
      onlineFetchJson<{
        songList?: Array<{
          songId?: string;
          copyrightId?: string;
          songName?: string;
          singer?: string;
          artists?: Array<{ name?: string }>;
          length?: string;
        }>;
      }>(`http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong?albumId=${albumId}&pageNo=${page}`, {
        headers: { channel: '0146921' },
      }),
    ),
    safeCall(() =>
      onlineFetchJson<{
        title?: string;
        summary?: string;
        singer?: string;
        totalCount?: number;
        imgItems?: Array<{ img?: string }>;
      }>(`https://app.c.nf.migu.cn/MIGUM3.0/resource/album/v2.0?albumId=${albumId}`, {
        headers: { channel: '0146921' },
      }),
    ),
  ]);
  if (!list?.songList && !info) return null;
  const artist = String(info?.singer ?? '');
  const albumName = String(info?.title ?? '');
  const tracks = (list?.songList ?? []).map((s) => ({
    id: buildTrackId('mg', String(s.copyrightId ?? s.songId ?? '')),
    name: String(s.songName ?? ''),
    artist:
      (s.artists ?? []).map((a) => a.name).filter(Boolean).join('、') ||
      String(s.singer ?? artist),
    source: 'mg' as const,
    duration: s.length ?? '00:00',
    meta: {
      songId: String(s.songId ?? ''),
      copyrightId: String(s.copyrightId ?? ''),
      albumId,
      ...(albumName ? { albumName } : {}),
    },
  }));
  const total = Number(info?.totalCount ?? tracks.length);
  return {
    id: albumId,
    name: albumName,
    artist,
    coverUrl: info?.imgItems?.[0]?.img,
    intro: info?.summary ? String(info.summary) : undefined,
    tracks,
    source: 'mg',
    page,
    limit: total,
    total,
    hasMore: false,
  };
}

export async function fetchTxAlbum(albumId: string): Promise<AlbumDetail | null> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      req_0?: {
        code?: number;
        data?: {
          basicInfo?: {
            albumName?: string;
            singerName?: string;
            pmid?: string;
            desc?: string;
          };
          songList?: Array<{
            songInfo?: {
              id?: number;
              mid?: string;
              name?: string;
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
        comm: { ct: 24, cv: 0 },
        req_0: {
          module: 'music.musichallAlbum.AlbumInfoServer',
          method: 'GetAlbumDetail',
          param: { albumMid: albumId },
        },
      }),
    }),
  );
  const data = body?.req_0?.data;
  if (!data) return null;
  const basic = data.basicInfo;
  const artist = String(basic?.singerName ?? '');
  const albumName = String(basic?.albumName ?? '');
  const tracks = (data.songList ?? [])
    .map((row) => {
      const item = row.songInfo;
      if (!item?.mid) return null;
      const mediaMid = String(item.file?.media_mid ?? '');
      if (!mediaMid) return null;
      return {
        id: buildTrackId('tx', item.mid),
        name: String(item.title ?? item.name ?? ''),
        artist: (item.singer ?? []).map((s) => s.name).filter(Boolean).join('、') || artist,
        source: 'tx' as const,
        duration: item.interval ? formatDurationSec(item.interval) : '00:00',
        meta: {
          songId: String(item.id ?? ''),
          songmid: item.mid,
          strMediaMid: mediaMid,
          mediaMid,
          albumId,
          albumMid: String(item.album?.mid ?? albumId),
          albumName: String(item.album?.name ?? albumName),
        },
      };
    })
    .filter((t): t is NonNullable<typeof t> => t != null);

  return {
    id: albumId,
    name: albumName,
    artist,
    coverUrl: basic?.pmid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${basic.pmid}.jpg`
      : undefined,
    intro: basic?.desc ? String(basic.desc) : undefined,
    tracks,
    source: 'tx',
    total: tracks.length,
    hasMore: false,
  };
}

async function fetchAlbumById(
  source: AudioTrackSource,
  albumId: string,
  page: number,
): Promise<AlbumDetail | null> {
  switch (source) {
    case 'wy':
      return fetchWyAlbum(albumId);
    case 'kg':
      return fetchKgAlbum(albumId, page);
    case 'kw':
      return fetchKwAlbum(albumId, page);
    case 'mg':
      return fetchMgAlbum(albumId, page);
    case 'tx':
      return fetchTxAlbum(albumId);
    default:
      return null;
  }
}

async function resolveAlbumIdByName(
  source: AudioTrackSource,
  albumName: string,
  artist?: string,
): Promise<string | null> {
  const name = albumName.trim();
  if (!name) return null;
  const keyword = [name, primaryArtistName(artist ?? '')].filter(Boolean).join(' ');
  const hit = await safeCall(() => searchOnline(source, keyword || name, 1));
  return pickAlbumIdFromTracks(hit?.tracks ?? [], name, artist);
}

export async function fetchAlbumDetail(
  source: AudioTrackSource,
  albumId: string,
  page = 1,
  options?: { albumName?: string; artist?: string },
): Promise<AlbumDetail | null> {
  const src = normalizeMusicBrowseSource(source);
  const id = albumId.trim();
  const albumName = options?.albumName?.trim() || '';
  const artist = options?.artist?.trim() || '';

  if (isUsableAlbumBrowseId(id, src, albumName)) {
    const detail = await fetchAlbumById(src, id, page);
    if (detail) return detail;
  }

  // 右键 ID 无效或缺字段：按专辑名（+ 歌手）搜歌解析真实 albumId 后再拉详情
  if (albumName && page === 1) {
    const resolvedId = await resolveAlbumIdByName(src, albumName, artist);
    if (resolvedId && resolvedId !== id) {
      const detail = await fetchAlbumById(src, resolvedId, page);
      if (detail) return detail;
    }
  }

  return null;
}
