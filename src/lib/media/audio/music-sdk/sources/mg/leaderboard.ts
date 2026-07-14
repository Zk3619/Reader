/**
 * 咪咕排行榜（app.c.nf.migu.cn 优先，music.migu.cn v3 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { mgSearchHeaders } from '@/lib/media/audio/online/sources/mg';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'mg';
const LIMIT = 200;
const SUCCESS_CODE = '000000';

/** 与 lx-music mg/leaderboard boardList 对齐 */
const BOARDS: LeaderboardBoard[] = [
  { id: 'mg__27553319', name: '新歌榜', bangId: '27553319', source: SOURCE },
  { id: 'mg__27186466', name: '热歌榜', bangId: '27186466', source: SOURCE },
  { id: 'mg__27553408', name: '原创榜', bangId: '27553408', source: SOURCE },
  { id: 'mg__75959118', name: '音乐风向榜', bangId: '75959118', source: SOURCE },
  { id: 'mg__76557036', name: '彩铃分贝榜', bangId: '76557036', source: SOURCE },
  { id: 'mg__76557745', name: '会员臻爱榜', bangId: '76557745', source: SOURCE },
  { id: 'mg__23189800', name: '港台榜', bangId: '23189800', source: SOURCE },
  { id: 'mg__23189399', name: '内地榜', bangId: '23189399', source: SOURCE },
  { id: 'mg__19190036', name: '欧美榜', bangId: '19190036', source: SOURCE },
  { id: 'mg__83176390', name: '国风金曲榜', bangId: '83176390', source: SOURCE },
];

function albumFromItem(item: Record<string, unknown>): { albumId: string; albumName: string } {
  const rawAlbum = item.album;
  if (typeof rawAlbum === 'string') {
    return {
      albumId: String(item.albumId ?? ''),
      albumName: rawAlbum,
    };
  }
  const nested = rawAlbum as { albumId?: string; albumName?: string; name?: string } | undefined;
  return {
    albumId: String(item.albumId ?? nested?.albumId ?? ''),
    albumName: String(nested?.albumName ?? nested?.name ?? ''),
  };
}

function mapTrack(item: Record<string, unknown>) {
  const copyrightId = String(item.copyrightId ?? item.id ?? '');
  const sec = Number(item.length ?? item.duration ?? 0);
  const album = albumFromItem(item);
  return {
    id: buildTrackId(SOURCE, copyrightId),
    name: String(item.songName ?? item.name ?? '未知'),
    artist: String(item.singerName ?? item.singer ?? '未知'),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId: copyrightId,
      copyrightId,
      songmid: copyrightId,
      albumId: album.albumId,
      albumName: album.albumName,
    },
  };
}

function mapAppTrack(item: Record<string, unknown>) {
  const objectInfo = item.objectInfo as Record<string, unknown> | undefined;
  const raw = objectInfo ?? item;
  const copyrightId = String(raw.copyrightId ?? raw.contentId ?? raw.id ?? '');
  const sec = Number(raw.duration ?? raw.length ?? 0);
  const album = albumFromItem(raw);
  return {
    id: buildTrackId(SOURCE, copyrightId),
    name: String(raw.songName ?? raw.name ?? raw.title ?? '未知'),
    artist: String(raw.singerName ?? raw.singer ?? '未知'),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId: copyrightId,
      copyrightId,
      songmid: copyrightId,
      albumId: album.albumId,
      albumName: album.albumName,
    },
  };
}

function buildDetail(
  tracks: ReturnType<typeof mapTrack>[],
  total: number,
  board: LeaderboardBoard,
  page: number,
): LeaderboardDetail | null {
  if (!hasItems(tracks)) return null;
  return { board, tracks, total, page, limit: LIMIT };
}

export async function getBoards(): Promise<LeaderboardBoard[]> {
  return BOARDS;
}

export async function getBoardList(bangId: string, page = 1): Promise<LeaderboardDetail> {
  const board = BOARDS.find((b) => b.bangId === bangId) ?? {
    id: `mg__${bangId}`,
    name: bangId,
    bangId,
    source: SOURCE,
  };

  const detail = await firstSuccess(
    [
      async () => {
        const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querycontentbyId.do?columnId=${bangId}&needAll=0`;
        const body = await safeCall(() =>
          onlineFetchJson<{
            code?: string;
            columnInfo?: { contents?: Array<{ objectInfo?: Record<string, unknown> }> };
          }>(url, { headers: mgSearchHeaders(bangId) }),
        );
        if (body?.code !== SUCCESS_CODE) return null;
        const tracks = (body.columnInfo?.contents ?? []).map(mapAppTrack);
        return buildDetail(tracks, tracks.length, board, page);
      },
      async () => {
        const url = `https://music.migu.cn/v3/api/music/rankService/getRankDetail?rankId=${bangId}&pageNo=${page}&pageSize=${LIMIT}`;
        const body = await safeCall(() =>
          onlineFetchJson<{ data?: { musicList?: Record<string, unknown>[]; total?: number } }>(url, {
            headers: mgSearchHeaders(bangId),
          }),
        );
        const tracks = (body?.data?.musicList ?? []).map(mapTrack);
        return buildDetail(tracks, Number(body?.data?.total ?? tracks.length), board, page);
      },
    ],
    (d) => hasItems(d.tracks),
  );

  if (!detail) throw new Error('咪咕排行榜加载失败');
  return detail;
}
