/**
 * 专辑/歌手浏览（对齐 lx album.js；kw/mg/tx/kg/wy）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import { parseKuwoObjStr } from '@/lib/media/audio/music-sdk/sources/kw/parse-kuwo-json';

export interface AlbumDetail {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
  tracks: AudioTrack[];
  source: AudioTrackSource;
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
}

export async function fetchWyAlbum(albumId: string): Promise<AlbumDetail | null> {
  const body = await weapiPost<{
    album?: { name?: string; picUrl?: string; artists?: Array<{ name?: string }> };
    songs?: Array<{ id?: number; name?: string; dt?: number; ar?: Array<{ name?: string }> }>;
  }>('album', { id: albumId });
  if (!body.album) return null;
  const artist = (body.album.artists ?? []).map((a) => a.name).filter(Boolean).join('、');
  const tracks = (body.songs ?? []).map((s) => ({
    id: buildTrackId('wy', String(s.id ?? '')),
    name: String(s.name ?? ''),
    artist: (s.ar ?? []).map((a) => a.name).filter(Boolean).join('、') || artist,
    source: 'wy' as const,
    duration: s.dt ? formatDurationSec(s.dt / 1000) : '00:00',
    meta: { songId: String(s.id ?? ''), albumId },
  }));
  return {
    id: albumId,
    name: String(body.album.name ?? ''),
    artist,
    coverUrl: body.album.picUrl,
    tracks,
    source: 'wy',
    total: tracks.length,
    hasMore: false,
  };
}

export async function fetchKgAlbum(albumId: string, page = 1): Promise<AlbumDetail | null> {
  const limit = 200;
  const [listBody, infoBody] = await Promise.all([
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
          }>;
          total?: number;
        };
      }>(
        `https://mobiles.kugou.com/api/v3/album/song?version=9108&albumid=${albumId}&plat=0&pagesize=${limit}&area_code=0&page=${page}&with_res_tag=0`,
      ),
    ),
    safeCall(() =>
      onlineFetchJson<
        Array<{
          album_name?: string;
          author_name?: string;
          sizable_cover?: string;
          intro?: string;
        }>
      >('http://kmrserviceretry.kugou.com/container/v1/album?dfid=-&mid=xxx&userid=0&appid=1005&clientver=11589', {
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
      }),
    ),
  ]);

  const songs = listBody?.data?.info ?? [];
  const albumInfo = Array.isArray(infoBody) ? infoBody[0] : undefined;
  if (!songs.length && !albumInfo) return null;

  const artist = String(albumInfo?.author_name ?? songs[0]?.author_name ?? '');
  const tracks = songs.map((s) => {
    const name =
      s.songname ??
      (s.filename?.includes(' - ') ? s.filename.split(' - ').slice(1).join(' - ') : s.filename) ??
      '';
    return {
      id: buildTrackId('kg', `${s.album_audio_id ?? albumId}_${s.hash ?? ''}`),
      name: String(name),
      artist,
      source: 'kg' as const,
      duration: s.duration ? formatDurationSec(s.duration) : '00:00',
      meta: {
        songId: String(s.album_audio_id ?? ''),
        hash: s.hash,
        albumId,
      },
    };
  });
  const total = Number(listBody?.data?.total ?? tracks.length);
  return {
    id: albumId,
    name: String(albumInfo?.album_name ?? ''),
    artist,
    coverUrl: albumInfo?.sizable_cover?.replace('{size}', '240'),
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
    },
  }));
  const total = Number(info?.totalCount ?? tracks.length);
  return {
    id: albumId,
    name: String(info?.title ?? ''),
    artist,
    coverUrl: info?.imgItems?.[0]?.img,
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
          basicInfo?: { albumName?: string; singerName?: string; pmid?: string };
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
          albumName: String(item.album?.name ?? basic?.albumName ?? ''),
        },
      };
    })
    .filter((t): t is NonNullable<typeof t> => t != null);

  return {
    id: albumId,
    name: String(basic?.albumName ?? ''),
    artist,
    coverUrl: basic?.pmid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${basic.pmid}.jpg`
      : undefined,
    tracks,
    source: 'tx',
    total: tracks.length,
    hasMore: false,
  };
}

export async function fetchAlbumDetail(
  source: AudioTrackSource,
  albumId: string,
  page = 1,
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
