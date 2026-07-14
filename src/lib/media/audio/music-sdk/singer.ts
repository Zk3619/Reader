/**
 * 歌手浏览 API（对齐 lx singer.js；tx 正式接口；wy/kg 分页；kw/mg 搜歌兜底）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { searchOnline } from '@/lib/media/audio/online/source-router';
import { eapiPost } from '@/lib/media/audio/platform/api/eapi-crypto';

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

export async function fetchWySinger(singerId: string, page = 1): Promise<SingerDetail | null> {
  const [infoBody, songBody] = await Promise.all([
    safeCall(() =>
      weapiPost<{
        artist?: { name?: string; picUrl?: string; briefDesc?: string; musicSize?: number };
        hotSongs?: Array<{ id?: number; name?: string; dt?: number; ar?: Array<{ name?: string }> }>;
      }>('artist', { id: singerId }),
    ),
    safeCall(async () => {
      const offset = (page - 1) * WY_PAGE_SIZE;
      return eapiPost<{
        code?: number;
        songs?: Array<{
          id?: number;
          name?: string;
          dt?: number;
          ar?: Array<{ name?: string }>;
        }>;
        total?: number;
        more?: boolean;
      }>('/api/v2/artist/songs', {
        id: singerId,
        limit: WY_PAGE_SIZE,
        offset,
      });
    }),
  ]);

  const artistName = String(infoBody?.artist?.name ?? '');
  if (!artistName && !songBody?.songs?.length && !infoBody?.hotSongs?.length) return null;

  const songList =
    songBody?.songs ??
    (page === 1 ? infoBody?.hotSongs : undefined) ??
    [];
  const tracks = songList.map((s) => ({
    id: buildTrackId('wy', String(s.id ?? '')),
    name: String(s.name ?? ''),
    artist: (s.ar ?? []).map((a) => a.name).filter(Boolean).join('、') || artistName,
    source: 'wy' as const,
    duration: s.dt ? formatDurationSec(s.dt / 1000) : '00:00',
    meta: { songId: String(s.id ?? ''), singerId },
  }));
  const total = Number(songBody?.total ?? infoBody?.artist?.musicSize ?? tracks.length);
  return {
    id: singerId,
    name: artistName,
    coverUrl: infoBody?.artist?.picUrl,
    intro: infoBody?.artist?.briefDesc,
    tracks,
    source: 'wy',
    page,
    limit: WY_PAGE_SIZE,
    total,
    hasMore: songBody?.more ?? page * WY_PAGE_SIZE < total,
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
    return {
      id: buildTrackId('kg', `${s.album_audio_id ?? singerId}_${s.hash ?? ''}`),
      name: String(name),
      artist,
      source: 'kg' as const,
      duration: s.duration ? formatDurationSec(s.duration) : '00:00',
      meta: { songId: String(s.album_audio_id ?? ''), hash: s.hash, singerId },
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
  const { tracks } = await searchOnline(source, singerName);
  const filtered = tracks.filter((t) => t.artist.includes(singerName) || singerName.includes(t.artist));
  return {
    id: singerId,
    name: singerName,
    tracks: (filtered.length > 0 ? filtered : tracks).slice(0, 30),
    source,
    hasMore: false,
  };
}

export async function fetchSingerDetail(
  source: AudioTrackSource,
  singerId: string,
  singerName?: string,
  page = 1,
): Promise<SingerDetail | null> {
  switch (source) {
    case 'wy':
      return fetchWySinger(singerId, page);
    case 'kg':
      return fetchKgSinger(singerId, page);
    case 'tx':
      return fetchTxSinger(singerId, page);
    case 'kw':
    case 'mg':
      if (!singerName?.trim()) return null;
      return fetchSingerBySearch(source, singerId, singerName);
    default:
      return null;
  }
}
