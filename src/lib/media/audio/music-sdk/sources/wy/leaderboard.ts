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
/** 对齐酷我/酷狗榜单页容量，便于 Hub 分页/滚动加载 */
const LIMIT = 100;

/** 与 lx-music wy/leaderboard topList 对齐 */
const BOARDS: LeaderboardBoard[] = [
  { id: 'wy__19723756', name: '飙升榜', bangId: '19723756', source: SOURCE },
  { id: 'wy__3779629', name: '新歌榜', bangId: '3779629', source: SOURCE },
  { id: 'wy__2884035', name: '原创榜', bangId: '2884035', source: SOURCE },
  { id: 'wy__3778678', name: '热歌榜', bangId: '3778678', source: SOURCE },
  { id: 'wy__991319590', name: '说唱榜', bangId: '991319590', source: SOURCE },
  { id: 'wy__71384707', name: '古典榜', bangId: '71384707', source: SOURCE },
  { id: 'wy__1978921795', name: '电音榜', bangId: '1978921795', source: SOURCE },
  { id: 'wy__5453912201', name: '黑胶VIP爱听榜', bangId: '5453912201', source: SOURCE },
  { id: 'wy__71385702', name: 'ACG榜', bangId: '71385702', source: SOURCE },
  { id: 'wy__745956260', name: '韩语榜', bangId: '745956260', source: SOURCE },
  { id: 'wy__10520166', name: '国电榜', bangId: '10520166', source: SOURCE },
  { id: 'wy__180106', name: 'UK排行榜周榜', bangId: '180106', source: SOURCE },
  { id: 'wy__60198', name: '美国Billboard榜', bangId: '60198', source: SOURCE },
  { id: 'wy__3812895', name: 'Beatport全球电子舞曲榜', bangId: '3812895', source: SOURCE },
  { id: 'wy__21845217', name: 'KTV唛榜', bangId: '21845217', source: SOURCE },
  { id: 'wy__60131', name: '日本Oricon榜', bangId: '60131', source: SOURCE },
  { id: 'wy__2809513713', name: '欧美热歌榜', bangId: '2809513713', source: SOURCE },
  { id: 'wy__2809577409', name: '欧美新歌榜', bangId: '2809577409', source: SOURCE },
  { id: 'wy__27135204', name: '法国 NRJ Vos Hits 周榜', bangId: '27135204', source: SOURCE },
  { id: 'wy__3001835560', name: 'ACG动画榜', bangId: '3001835560', source: SOURCE },
  { id: 'wy__3001795926', name: 'ACG游戏榜', bangId: '3001795926', source: SOURCE },
  { id: 'wy__3001890046', name: 'ACG VOCALOID榜', bangId: '3001890046', source: SOURCE },
  { id: 'wy__3112516681', name: '中国新乡村音乐排行榜', bangId: '3112516681', source: SOURCE },
  { id: 'wy__5059644681', name: '日语榜', bangId: '5059644681', source: SOURCE },
  { id: 'wy__5059633707', name: '摇滚榜', bangId: '5059633707', source: SOURCE },
  { id: 'wy__5059642708', name: '国风榜', bangId: '5059642708', source: SOURCE },
  { id: 'wy__5338990334', name: '潜力爆款榜', bangId: '5338990334', source: SOURCE },
  { id: 'wy__5059661515', name: '民谣榜', bangId: '5059661515', source: SOURCE },
  { id: 'wy__6688069460', name: '听歌识曲榜', bangId: '6688069460', source: SOURCE },
  { id: 'wy__6723173524', name: '网络热歌榜', bangId: '6723173524', source: SOURCE },
  { id: 'wy__6732051320', name: '俄语榜', bangId: '6732051320', source: SOURCE },
  { id: 'wy__6732014811', name: '越南语榜', bangId: '6732014811', source: SOURCE },
  { id: 'wy__6886768100', name: '中文DJ榜', bangId: '6886768100', source: SOURCE },
  { id: 'wy__6939992364', name: '俄罗斯top hit流行音乐榜', bangId: '6939992364', source: SOURCE },
  { id: 'wy__7095271308', name: '泰语榜', bangId: '7095271308', source: SOURCE },
  { id: 'wy__7356827205', name: 'BEAT排行榜', bangId: '7356827205', source: SOURCE },
  { id: 'wy__7325478166', name: '编辑推荐榜VOL.44 天才女子摇滚乐队boygenius剖白卑微心迹', bangId: '7325478166', source: SOURCE },
  { id: 'wy__7603212484', name: 'LOOK直播歌曲榜', bangId: '7603212484', source: SOURCE },
  { id: 'wy__7775163417', name: '赏音榜', bangId: '7775163417', source: SOURCE },
  { id: 'wy__7785123708', name: '黑胶VIP新歌榜', bangId: '7785123708', source: SOURCE },
  { id: 'wy__7785066739', name: '黑胶VIP热歌榜', bangId: '7785066739', source: SOURCE },
  { id: 'wy__7785091694', name: '黑胶VIP爱搜榜', bangId: '7785091694', source: SOURCE },
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
  const rangeStart = (page - 1) * LIMIT;

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
    tracks = pl.tracks.slice(rangeStart, rangeStart + LIMIT).map(mapTrack);
  } else {
    const ids = (pl.trackIds ?? []).slice(rangeStart, rangeStart + LIMIT).map((t) => t.id);
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
    total: pl.trackIds?.length ?? pl.tracks?.length ?? tracks.length,
    page,
    limit: LIMIT,
  };
}
