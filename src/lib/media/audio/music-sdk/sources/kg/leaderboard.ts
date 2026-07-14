/**
 * 酷狗排行榜（mobilecdnbj 优先，mobilecdn 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'kg';
const LIMIT = 100;
const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

/** 与 lx-music kg/leaderboard boardList 对齐 */
const BOARDS: LeaderboardBoard[] = [
  { id: 'kg__8888', name: 'TOP500', bangId: '8888', source: SOURCE },
  { id: 'kg__6666', name: '飙升榜', bangId: '6666', source: SOURCE },
  { id: 'kg__59703', name: '蜂鸟流行音乐榜', bangId: '59703', source: SOURCE },
  { id: 'kg__52144', name: '抖音热歌榜', bangId: '52144', source: SOURCE },
  { id: 'kg__52767', name: '快手热歌榜', bangId: '52767', source: SOURCE },
  { id: 'kg__24971', name: 'DJ热歌榜', bangId: '24971', source: SOURCE },
  { id: 'kg__23784', name: '网络红歌榜', bangId: '23784', source: SOURCE },
  { id: 'kg__44412', name: '说唱先锋榜', bangId: '44412', source: SOURCE },
  { id: 'kg__31308', name: '内地榜', bangId: '31308', source: SOURCE },
  { id: 'kg__33160', name: '电音榜', bangId: '33160', source: SOURCE },
  { id: 'kg__31313', name: '香港地区榜', bangId: '31313', source: SOURCE },
  { id: 'kg__51341', name: '民谣榜', bangId: '51341', source: SOURCE },
  { id: 'kg__54848', name: '台湾地区榜', bangId: '54848', source: SOURCE },
  { id: 'kg__31310', name: '欧美榜', bangId: '31310', source: SOURCE },
  { id: 'kg__33162', name: 'ACG新歌榜', bangId: '33162', source: SOURCE },
  { id: 'kg__31311', name: '韩国榜', bangId: '31311', source: SOURCE },
  { id: 'kg__31312', name: '日本榜', bangId: '31312', source: SOURCE },
  { id: 'kg__49225', name: '80后热歌榜', bangId: '49225', source: SOURCE },
  { id: 'kg__49223', name: '90后热歌榜', bangId: '49223', source: SOURCE },
  { id: 'kg__49224', name: '00后热歌榜', bangId: '49224', source: SOURCE },
  { id: 'kg__33165', name: '粤语金曲榜', bangId: '33165', source: SOURCE },
  { id: 'kg__33166', name: '欧美金曲榜', bangId: '33166', source: SOURCE },
  { id: 'kg__33163', name: '影视金曲榜', bangId: '33163', source: SOURCE },
  { id: 'kg__51340', name: '伤感榜', bangId: '51340', source: SOURCE },
  { id: 'kg__35811', name: '会员专享榜', bangId: '35811', source: SOURCE },
  { id: 'kg__37361', name: '雷达榜', bangId: '37361', source: SOURCE },
  { id: 'kg__21101', name: '分享榜', bangId: '21101', source: SOURCE },
  { id: 'kg__46910', name: '综艺新歌榜', bangId: '46910', source: SOURCE },
  { id: 'kg__30972', name: '酷狗音乐人原创榜', bangId: '30972', source: SOURCE },
  { id: 'kg__60170', name: '闽南语榜', bangId: '60170', source: SOURCE },
  { id: 'kg__65234', name: '儿歌榜', bangId: '65234', source: SOURCE },
  { id: 'kg__4681', name: '美国BillBoard榜', bangId: '4681', source: SOURCE },
  { id: 'kg__25028', name: 'Beatport电子舞曲榜', bangId: '25028', source: SOURCE },
  { id: 'kg__4680', name: '英国单曲榜', bangId: '4680', source: SOURCE },
  { id: 'kg__38623', name: '韩国Melon音乐榜', bangId: '38623', source: SOURCE },
  { id: 'kg__42807', name: 'joox本地热歌榜', bangId: '42807', source: SOURCE },
  { id: 'kg__36107', name: '小语种热歌榜', bangId: '36107', source: SOURCE },
  { id: 'kg__4673', name: '日本公信榜', bangId: '4673', source: SOURCE },
  { id: 'kg__46868', name: '日本SPACE SHOWER榜', bangId: '46868', source: SOURCE },
  { id: 'kg__42808', name: 'KKBOX风云榜', bangId: '42808', source: SOURCE },
  { id: 'kg__60171', name: '越南语榜', bangId: '60171', source: SOURCE },
  { id: 'kg__60172', name: '泰语榜', bangId: '60172', source: SOURCE },
  { id: 'kg__59895', name: 'R&B榜', bangId: '59895', source: SOURCE },
  { id: 'kg__59896', name: '摇滚榜', bangId: '59896', source: SOURCE },
  { id: 'kg__59897', name: '爵士榜', bangId: '59897', source: SOURCE },
  { id: 'kg__59898', name: '乡村音乐榜', bangId: '59898', source: SOURCE },
  { id: 'kg__59900', name: '纯音乐榜', bangId: '59900', source: SOURCE },
  { id: 'kg__59899', name: '古典榜', bangId: '59899', source: SOURCE },
  { id: 'kg__22603', name: '5sing音乐榜', bangId: '22603', source: SOURCE },
  { id: 'kg__21335', name: '繁星音乐榜', bangId: '21335', source: SOURCE },
  { id: 'kg__33161', name: '古风新歌榜', bangId: '33161', source: SOURCE },
];

function mapTrack(item: Record<string, unknown>) {
  const songId = String(item.audio_id ?? '');
  const hash = String(item.hash ?? '');
  const sec = Number(item.duration ?? 0);
  const authors = (item.authors as Array<{ author_name?: string }> | undefined) ?? [];
  const qualitys: string[] = [];
  const _qualitys: Record<string, { hash: string }> = {};
  if (Number(item.filesize ?? 0) !== 0 && hash) {
    qualitys.push('128k');
    _qualitys['128k'] = { hash };
  }
  const hash320 = String(item['320hash'] ?? '');
  if (Number(item['320filesize'] ?? 0) !== 0 && hash320) {
    qualitys.push('320k');
    _qualitys['320k'] = { hash: hash320 };
  }
  const hashFlac = String(item.sqhash ?? '');
  if (Number(item.sqfilesize ?? 0) !== 0 && hashFlac) {
    qualitys.push('flac');
    _qualitys.flac = { hash: hashFlac };
  }
  const hashHigh = String(item.hash_high ?? '');
  if (Number(item.filesize_high ?? 0) !== 0 && hashHigh) {
    qualitys.push('flac24bit');
    _qualitys.flac24bit = { hash: hashHigh };
  }
  return {
    id: buildTrackId(SOURCE, `${songId}_${hash}`),
    name: decodeHtmlEntities(String(item.songname ?? '未知')),
    artist:
      authors.map((a) => a.author_name).filter(Boolean).join('、') || '未知',
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      hash,
      hash_320: hash320 || undefined,
      hash_flac: hashFlac || undefined,
      hash_high: hashHigh || undefined,
      albumId: String(item.album_id ?? ''),
      /** 对齐 lx：酷狗榜单专辑名取 remark */
      albumName: decodeHtmlEntities(String(item.remark ?? '')),
      songmid: songId,
      _qualitys,
      qualitys,
    },
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
