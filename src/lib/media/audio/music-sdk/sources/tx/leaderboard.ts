/**
 * QQ音乐排行榜（musicu POST 优先，GET 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { request } from '@/lib/http';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'tx';
const LIMIT = 300;
const SUCCESS_CODE = 0;

const BOARDS: LeaderboardBoard[] = [
  { id: 'tx__4', name: '流行指数榜', bangId: '4', source: SOURCE },
  { id: 'tx__26', name: '热歌榜', bangId: '26', source: SOURCE },
  { id: 'tx__27', name: '新歌榜', bangId: '27', source: SOURCE },
  { id: 'tx__62', name: '飙升榜', bangId: '62', source: SOURCE },
  { id: 'tx__58', name: '说唱榜', bangId: '58', source: SOURCE },
  { id: 'tx__28', name: '网络歌曲榜', bangId: '28', source: SOURCE },
  { id: 'tx__5', name: '内地榜', bangId: '5', source: SOURCE },
  { id: 'tx__3', name: '欧美榜', bangId: '3', source: SOURCE },
  { id: 'tx__59', name: '香港地区榜', bangId: '59', source: SOURCE },
  { id: 'tx__16', name: '韩国榜', bangId: '16', source: SOURCE },
  { id: 'tx__60', name: '抖快榜', bangId: '60', source: SOURCE },
  { id: 'tx__17', name: '日本榜', bangId: '17', source: SOURCE },
  { id: 'tx__65', name: '国风热歌榜', bangId: '65', source: SOURCE },
];

function buildPayload(bangId: string) {
  return {
    toplist: {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: { topid: parseInt(bangId, 10), num: LIMIT, period: '' },
    },
    comm: { uin: 0, format: 'json', ct: 20, cv: 1859 },
  };
}

function mapTrack(item: Record<string, unknown>) {
  const mid = String(item.mid ?? item.songmid ?? '');
  const songId = String(item.id ?? item.songid ?? mid);
  const sec = Number(item.interval ?? 0);
  const singers = (item.singer as Array<{ name?: string }> | undefined) ?? [];
  return {
    id: buildTrackId(SOURCE, mid || songId),
    name: String(item.title ?? item.name ?? '未知'),
    artist: singers.map((s) => s.name).filter(Boolean).join('、') || '未知',
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      albumName: String((item.album as { name?: string } | undefined)?.name ?? ''),
    },
  };
}

function parseBoardResponse(
  body: { toplist?: { data?: { songInfoList?: Record<string, unknown>[]; totalNum?: number } } },
  board: LeaderboardBoard,
  page: number,
): LeaderboardDetail | null {
  const raw = body.toplist?.data?.songInfoList ?? [];
  if (!hasItems(raw)) return null;
  const rangeStart = (page - 1) * LIMIT;
  const tracks = raw.slice(rangeStart, rangeStart + LIMIT).map(mapTrack);
  return {
    board,
    tracks,
    total: Number(body.toplist?.data?.totalNum ?? raw.length),
    page,
    limit: LIMIT,
  };
}

export async function getBoards(): Promise<LeaderboardBoard[]> {
  return BOARDS;
}

export async function getBoardList(bangId: string, page = 1): Promise<LeaderboardDetail> {
  const board = BOARDS.find((b) => b.bangId === bangId) ?? {
    id: `tx__${bangId}`,
    name: bangId,
    bangId,
    source: SOURCE,
  };

  const detail = await firstSuccess(
    [
      async () => {
        const payload = buildPayload(bangId);
        const res = await safeCall(() =>
          request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        );
        if (!res?.ok) return null;
        const body = (await res.json()) as {
          code?: number;
          toplist?: { data?: { songInfoList?: Record<string, unknown>[]; totalNum?: number } };
        };
        if (body.code !== SUCCESS_CODE) return null;
        return parseBoardResponse(body, board, page);
      },
      async () => {
        const payload = buildPayload(bangId);
        const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify(payload))}`;
        const body = await safeCall(() =>
          onlineFetchJson<{
            code?: number;
            toplist?: { data?: { songInfoList?: Record<string, unknown>[]; totalNum?: number } };
          }>(url),
        );
        if (!body || body.code !== SUCCESS_CODE) return null;
        return parseBoardResponse(body, board, page);
      },
    ],
    (d) => hasItems(d.tracks),
  );

  if (!detail) throw new Error('QQ排行榜加载失败');
  return detail;
}
