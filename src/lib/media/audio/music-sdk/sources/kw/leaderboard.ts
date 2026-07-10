/**
 * 酷我排行榜（kbangserver 优先，www.kuwo.cn API 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'kw';
const LIMIT = 100;

const BOARDS: LeaderboardBoard[] = [
  { id: 'kw__93', name: '飙升榜', bangId: '93', source: SOURCE },
  { id: 'kw__17', name: '新歌榜', bangId: '17', source: SOURCE },
  { id: 'kw__16', name: '热歌榜', bangId: '16', source: SOURCE },
  { id: 'kw__158', name: '抖音热歌榜', bangId: '158', source: SOURCE },
  { id: 'kw__104', name: '华语榜', bangId: '104', source: SOURCE },
  { id: 'kw__22', name: '欧美榜', bangId: '22', source: SOURCE },
  { id: 'kw__182', name: '粤语榜', bangId: '182', source: SOURCE },
  { id: 'kw__184', name: '韩语榜', bangId: '184', source: SOURCE },
  { id: 'kw__183', name: '日语榜', bangId: '183', source: SOURCE },
];

function mapTrack(item: Record<string, unknown>) {
  const songId = String(item.id ?? item.rid ?? '');
  const sec = parseInt(String(item.duration ?? '0'), 10);
  return {
    id: buildTrackId(SOURCE, songId),
    name: String(item.name ?? '未知'),
    artist: String(item.artist ?? '未知').replace(/&/g, '、'),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      albumName: String(item.album ?? ''),
      coverUrl: String(item.pic ?? ''),
    },
  };
}

function parseBangBody(
  raw: Record<string, unknown>[],
  total: number,
  board: LeaderboardBoard,
  page: number,
): LeaderboardDetail | null {
  const tracks = raw.map(mapTrack);
  if (!hasItems(tracks)) return null;
  return { board, tracks, total, page, limit: LIMIT };
}

export async function getBoards(): Promise<LeaderboardBoard[]> {
  return BOARDS;
}

export async function getBoardList(bangId: string, page = 1): Promise<LeaderboardDetail> {
  const board = BOARDS.find((b) => b.bangId === bangId) ?? {
    id: `kw__${bangId}`,
    name: bangId,
    bangId,
    source: SOURCE,
  };

  const detail = await firstSuccess(
    [
      async () => {
        const url = `http://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&pn=${page - 1}&rn=${LIMIT}&type=bang&data=content&id=${bangId}&show_copyright_off=0&pcmp4=1&isbang=1`;
        const body = await safeCall(() =>
          onlineFetchJson<{ musiclist?: Record<string, unknown>[]; TOTAL?: string }>(url),
        );
        const raw = body?.musiclist ?? [];
        const total = parseInt(String(body?.TOTAL ?? raw.length), 10) || raw.length;
        return parseBangBody(raw, total, board, page);
      },
      async () => {
        const url = `https://www.kuwo.cn/api/www/bang/bangInfo?id=${bangId}&pn=${page - 1}&rn=${LIMIT}`;
        const body = await safeCall(() =>
          onlineFetchJson<{
            code?: number;
            data?: { musiclist?: Record<string, unknown>[]; total?: number };
          }>(url, { headers: { Referer: 'https://www.kuwo.cn/' } }),
        );
        const raw = body?.data?.musiclist ?? [];
        const total = Number(body?.data?.total ?? raw.length);
        return parseBangBody(raw, total, board, page);
      },
    ],
    (d) => hasItems(d.tracks),
  );

  if (!detail) throw new Error('酷我排行榜加载失败');
  return detail;
}
