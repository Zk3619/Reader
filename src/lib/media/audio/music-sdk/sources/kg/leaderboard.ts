/**
 * 酷狗排行榜（mobilecdnbj 优先，mobilecdn 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'kg';
const LIMIT = 100;
const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

const BOARDS: LeaderboardBoard[] = [
  { id: 'kg__8888', name: 'TOP500', bangId: '8888', source: SOURCE },
  { id: 'kg__6666', name: '飙升榜', bangId: '6666', source: SOURCE },
  { id: 'kg__52144', name: '抖音热歌榜', bangId: '52144', source: SOURCE },
  { id: 'kg__24971', name: 'DJ热歌榜', bangId: '24971', source: SOURCE },
  { id: 'kg__23784', name: '网络红歌榜', bangId: '23784', source: SOURCE },
  { id: 'kg__31308', name: '内地榜', bangId: '31308', source: SOURCE },
  { id: 'kg__33160', name: '电音榜', bangId: '33160', source: SOURCE },
  { id: 'kg__31310', name: '欧美榜', bangId: '31310', source: SOURCE },
  { id: 'kg__31311', name: '韩国榜', bangId: '31311', source: SOURCE },
  { id: 'kg__31312', name: '日本榜', bangId: '31312', source: SOURCE },
  { id: 'kg__33165', name: '粤语金曲榜', bangId: '33165', source: SOURCE },
  { id: 'kg__33161', name: '古风新歌榜', bangId: '33161', source: SOURCE },
];

function mapTrack(item: Record<string, unknown>) {
  const songId = String(item.audio_id ?? '');
  const hash = String(item.hash ?? '');
  const sec = Number(item.duration ?? 0);
  const authors = (item.authors as Array<{ author_name?: string }> | undefined) ?? [];
  return {
    id: buildTrackId(SOURCE, `${songId}_${hash}`),
    name: String(item.songname ?? '未知'),
    artist: authors.map((a) => a.author_name).filter(Boolean).join('、') || '未知',
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: { songId, hash, albumId: String(item.album_id ?? ''), songmid: songId },
  };
}

function parseRankBody(
  body: { data?: { info?: Record<string, unknown>[]; total?: number } } | null,
  board: LeaderboardBoard,
  page: number,
): LeaderboardDetail | null {
  const tracks = (body?.data?.info ?? []).map(mapTrack);
  if (!hasItems(tracks)) return null;
  return {
    board,
    tracks,
    total: Number(body?.data?.total ?? tracks.length),
    page,
    limit: LIMIT,
  };
}

export async function getBoards(): Promise<LeaderboardBoard[]> {
  return BOARDS;
}

export async function getBoardList(bangId: string, page = 1): Promise<LeaderboardDetail> {
  const board = BOARDS.find((b) => b.bangId === bangId) ?? {
    id: `kg__${bangId}`,
    name: bangId,
    bangId,
    source: SOURCE,
  };

  const detail = await firstSuccess(
    [
      async () => {
        const url = `http://mobilecdnbj.kugou.com/api/v3/rank/song?version=9108&ranktype=1&plat=0&pagesize=${LIMIT}&area_code=1&page=${page}&rankid=${bangId}&with_res_tag=0`;
        const body = await safeCall(() =>
          onlineFetchJson<{ data?: { info?: Record<string, unknown>[]; total?: number } }>(url, {
            headers: KUGOU_HEADERS,
          }),
        );
        return parseRankBody(body, board, page);
      },
      async () => {
        const url = `http://mobilecdn.kugou.com/api/v3/rank/song?version=9108&ranktype=1&plat=0&pagesize=${LIMIT}&area_code=1&page=${page}&rankid=${bangId}&with_res_tag=0`;
        const body = await safeCall(() =>
          onlineFetchJson<{ data?: { info?: Record<string, unknown>[]; total?: number } }>(url, {
            headers: KUGOU_HEADERS,
          }),
        );
        return parseRankBody(body, board, page);
      },
    ],
    (d) => hasItems(d.tracks),
  );

  if (!detail) throw new Error('酷狗排行榜加载失败');
  return detail;
}
