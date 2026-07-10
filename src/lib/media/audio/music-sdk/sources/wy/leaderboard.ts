/**
 * 网易云排行榜（eapi 优先，weapi 降级）
 */

import { firstSuccess, hasItems } from '@/lib/media/audio/music-sdk/fallback';
import { eapiPostBody } from '@/lib/media/audio/platform/api/eapi-crypto';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'wy';
const SUCCESS_CODE = 200;

const BOARDS: LeaderboardBoard[] = [
  { id: 'wy__19723756', name: '飙升榜', bangId: '19723756', source: SOURCE },
  { id: 'wy__3779629', name: '新歌榜', bangId: '3779629', source: SOURCE },
  { id: 'wy__2884035', name: '原创榜', bangId: '2884035', source: SOURCE },
  { id: 'wy__3778678', name: '热歌榜', bangId: '3778678', source: SOURCE },
  { id: 'wy__991319590', name: '说唱榜', bangId: '991319590', source: SOURCE },
  { id: 'wy__71384707', name: '古典榜', bangId: '71384707', source: SOURCE },
  { id: 'wy__1978921795', name: '电音榜', bangId: '1978921795', source: SOURCE },
  { id: 'wy__745956260', name: '韩语榜', bangId: '745956260', source: SOURCE },
  { id: 'wy__2809513713', name: '欧美热歌榜', bangId: '2809513713', source: SOURCE },
  { id: 'wy__5059644681', name: '日语榜', bangId: '5059644681', source: SOURCE },
  { id: 'wy__5059633707', name: '摇滚榜', bangId: '5059633707', source: SOURCE },
  { id: 'wy__5059642708', name: '国风榜', bangId: '5059642708', source: SOURCE },
  { id: 'wy__5059661515', name: '民谣榜', bangId: '5059661515', source: SOURCE },
];

function mapTrack(song: Record<string, unknown>) {
  const id = String(song.id ?? '');
  const ms = Number(song.dt ?? 0);
  const ar = (song.ar as Array<{ name?: string }> | undefined) ?? [];
  const al = song.al as { name?: string; picUrl?: string } | undefined;
  return {
    id: buildTrackId(SOURCE, id),
    name: String(song.name ?? '未知'),
    artist: ar.map((a) => a.name).filter(Boolean).join('、') || '未知',
    source: SOURCE,
    duration: ms > 0 ? formatDurationSec(ms / 1000) : '00:00',
    meta: {
      songId: id,
      albumName: String(al?.name ?? ''),
      coverUrl: String(al?.picUrl ?? ''),
    },
  };
}

export async function getBoards(): Promise<LeaderboardBoard[]> {
  return BOARDS;
}

export async function getBoardList(bangId: string, page = 1): Promise<LeaderboardDetail> {
  const board = BOARDS.find((b) => b.bangId === bangId) ?? {
    id: `wy__${bangId}`,
    name: bangId,
    bangId,
    source: SOURCE,
  };
  const limit = 1000;
  const rangeStart = (page - 1) * limit;

  const pl = await firstSuccess(
    [
      async () => {
        const body = await eapiPostBody<{
          code?: number;
          playlist?: { trackIds?: Array<{ id: number }>; tracks?: Record<string, unknown>[] };
        }>('/api/v6/playlist/detail', { id: bangId, n: 100_000, s: 8 });
        return body.code === SUCCESS_CODE ? body.playlist ?? null : null;
      },
      async () => {
        const body = await weapiPost<{
          code?: number;
          playlist?: { trackIds?: Array<{ id: number }>; tracks?: Record<string, unknown>[] };
        }>('v3/playlist/detail', { id: bangId, n: 100_000, p: page });
        return body.code === SUCCESS_CODE ? body.playlist ?? null : null;
      },
    ],
    (p) => hasItems(p.tracks) || hasItems(p.trackIds),
  );

  if (!pl) throw new Error('网易排行榜加载失败');

  let tracks: ReturnType<typeof mapTrack>[] = [];
  if (pl.tracks?.length) {
    tracks = pl.tracks.slice(rangeStart, rangeStart + limit).map(mapTrack);
  } else {
    const ids = (pl.trackIds ?? []).slice(rangeStart, rangeStart + limit).map((t) => t.id);
    if (ids.length) {
      const detail = await eapiPostBody<{ songs?: Record<string, unknown>[] }>(
        '/api/v3/song/detail',
        { c: JSON.stringify(ids.map((i) => ({ id: i }))) },
      );
      tracks = (detail.songs ?? []).map(mapTrack);
    }
  }

  return {
    board,
    tracks,
    total: pl.trackIds?.length ?? tracks.length,
    page,
    limit,
  };
}
