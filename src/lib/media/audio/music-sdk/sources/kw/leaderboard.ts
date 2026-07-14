/**
 * 酷我排行榜（wbd 加密接口优先，对齐 lx；旧接口降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
import { kwWbdBuildParam, kwWbdDecodeData } from '@/lib/media/audio/music-sdk/sources/kw/wbd-crypto';

const SOURCE: MusicSdkSource = 'kw';
const LIMIT = 100;

/** 与 lx-music kw/leaderboard boardList 对齐 */
const BOARDS: LeaderboardBoard[] = [
  { id: 'kw__93', name: '飙升榜', bangId: '93', source: SOURCE },
  { id: 'kw__17', name: '新歌榜', bangId: '17', source: SOURCE },
  { id: 'kw__16', name: '热歌榜', bangId: '16', source: SOURCE },
  { id: 'kw__158', name: '抖音热歌榜', bangId: '158', source: SOURCE },
  { id: 'kw__292', name: '铃声榜', bangId: '292', source: SOURCE },
  { id: 'kw__284', name: '热评榜', bangId: '284', source: SOURCE },
  { id: 'kw__290', name: 'ACG新歌榜', bangId: '290', source: SOURCE },
  { id: 'kw__286', name: '台湾KKBOX榜', bangId: '286', source: SOURCE },
  { id: 'kw__279', name: '冬日暖心榜', bangId: '279', source: SOURCE },
  { id: 'kw__281', name: '巴士随身听榜', bangId: '281', source: SOURCE },
  { id: 'kw__255', name: 'KTV点唱榜', bangId: '255', source: SOURCE },
  { id: 'kw__280', name: '家务进行曲榜', bangId: '280', source: SOURCE },
  { id: 'kw__282', name: '熬夜修仙榜', bangId: '282', source: SOURCE },
  { id: 'kw__283', name: '枕边轻音乐榜', bangId: '283', source: SOURCE },
  { id: 'kw__278', name: '古风音乐榜', bangId: '278', source: SOURCE },
  { id: 'kw__264', name: 'Vlog音乐榜', bangId: '264', source: SOURCE },
  { id: 'kw__242', name: '电音榜', bangId: '242', source: SOURCE },
  { id: 'kw__187', name: '流行趋势榜', bangId: '187', source: SOURCE },
  { id: 'kw__204', name: '现场音乐榜', bangId: '204', source: SOURCE },
  { id: 'kw__186', name: 'ACG神曲榜', bangId: '186', source: SOURCE },
  { id: 'kw__185', name: '最强翻唱榜', bangId: '185', source: SOURCE },
  { id: 'kw__26', name: '经典怀旧榜', bangId: '26', source: SOURCE },
  { id: 'kw__104', name: '华语榜', bangId: '104', source: SOURCE },
  { id: 'kw__182', name: '粤语榜', bangId: '182', source: SOURCE },
  { id: 'kw__22', name: '欧美榜', bangId: '22', source: SOURCE },
  { id: 'kw__184', name: '韩语榜', bangId: '184', source: SOURCE },
  { id: 'kw__183', name: '日语榜', bangId: '183', source: SOURCE },
  { id: 'kw__145', name: '会员畅听榜', bangId: '145', source: SOURCE },
  { id: 'kw__153', name: '网红新歌榜', bangId: '153', source: SOURCE },
  { id: 'kw__64', name: '影视金曲榜', bangId: '64', source: SOURCE },
  { id: 'kw__176', name: 'DJ嗨歌榜', bangId: '176', source: SOURCE },
  { id: 'kw__106', name: '真声音', bangId: '106', source: SOURCE },
  { id: 'kw__12', name: 'Billboard榜', bangId: '12', source: SOURCE },
  { id: 'kw__49', name: 'iTunes音乐榜', bangId: '49', source: SOURCE },
  { id: 'kw__180', name: 'beatport电音榜', bangId: '180', source: SOURCE },
  { id: 'kw__13', name: '英国UK榜', bangId: '13', source: SOURCE },
  { id: 'kw__164', name: '百大DJ榜', bangId: '164', source: SOURCE },
  { id: 'kw__246', name: 'YouTube音乐排行榜', bangId: '246', source: SOURCE },
  { id: 'kw__265', name: '韩国Genie榜', bangId: '265', source: SOURCE },
  { id: 'kw__14', name: '韩国M-net榜', bangId: '14', source: SOURCE },
  { id: 'kw__8', name: '香港电台榜', bangId: '8', source: SOURCE },
  { id: 'kw__15', name: '日本公信榜', bangId: '15', source: SOURCE },
  { id: 'kw__151', name: '腾讯音乐人原创榜', bangId: '151', source: SOURCE },
];

function mapTrack(item: Record<string, unknown>) {
  const songId = String(item.id ?? item.rid ?? '');
  const sec = parseInt(String(item.duration ?? '0'), 10);
  return {
    id: buildTrackId(SOURCE, songId),
    name: decodeHtmlEntities(String(item.name ?? '未知')),
    artist: decodeHtmlEntities(String(item.artist ?? '未知')).replace(/&/g, '、'),
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      albumName: decodeHtmlEntities(String(item.album ?? '')),
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
  const safeTotal = Number.isFinite(total) && total > 0 ? total : tracks.length;
  return { board, tracks, total: safeTotal, page, limit: LIMIT };
}

/** 对齐 lx：wbd bang_info 分页（pn 从 0 起） */
async function fetchWbdBoardList(
  bangId: string,
  page: number,
  board: LeaderboardBoard,
): Promise<LeaderboardDetail | null> {
  const payload = {
    uid: '',
    devId: '',
    sFrom: 'kuwo_sdk',
    user_type: 'AP',
    carSource: 'kwplayercar_ar_6.0.1.0_apk_keluze.apk',
    id: bangId,
    pn: page - 1,
    rn: LIMIT,
  };
  const url = `https://wbd.kuwo.cn/api/bd/bang/bang_info?${kwWbdBuildParam(payload)}`;
  const bodyText = await safeCall(() => onlineFetchText(url));
  if (bodyText == null || bodyText === '') return null;

  let rawData: { code?: number | string; data?: { musiclist?: Record<string, unknown>[]; total?: number | string } };
  try {
    // 响应体可能是密文，也可能已是 JSON
    const trimmed = bodyText.trim();
    if (trimmed.startsWith('{')) {
      rawData = JSON.parse(trimmed) as typeof rawData;
    } else {
      rawData = kwWbdDecodeData(trimmed) as typeof rawData;
    }
  } catch {
    return null;
  }

  if (Number(rawData.code) !== 200) return null;
  const musiclist = rawData.data?.musiclist ?? [];
  const total = parseInt(String(rawData.data?.total ?? musiclist.length), 10);
  return parseBangBody(musiclist, total, board, page);
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
      async () => fetchWbdBoardList(bangId, page, board),
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
