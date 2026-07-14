/**
 * QQ音乐排行榜（musicu POST 优先，GET 降级）
 */

import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { request } from '@/lib/http';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import type { LeaderboardBoard, LeaderboardDetail, MusicSdkSource } from '@/lib/media/audio/music-sdk/types';

const SOURCE: MusicSdkSource = 'tx';
const LIMIT = 300;
const SUCCESS_CODE = 0;
const PERIOD_URL = 'https://c.y.qq.com/node/pc/wk_v15/top.html';
const PERIOD_LIST_RE =
  /<i class="play_cover__btn c_tx_link js_icon_play" data-listkey=".+?" data-listname=".+?" data-tid=".+?" data-date=".+?" .+?<\/i>/g;
const PERIOD_RE = /data-listname="(.+?)" data-tid=".*?\/(.+?)" data-date="(.+?)" .+?<\/i>/;

/** bangId → period（对齐 lx getPeriods） */
const periodCache: Record<string, string> = {};
let periodFetchPromise: Promise<void> | null = null;

/** 与 lx-music tx/leaderboard boardList 对齐 */
const BOARDS: LeaderboardBoard[] = [
  { id: 'tx__4', name: '流行指数榜', bangId: '4', source: SOURCE },
  { id: 'tx__26', name: '热歌榜', bangId: '26', source: SOURCE },
  { id: 'tx__27', name: '新歌榜', bangId: '27', source: SOURCE },
  { id: 'tx__62', name: '飙升榜', bangId: '62', source: SOURCE },
  { id: 'tx__58', name: '说唱榜', bangId: '58', source: SOURCE },
  { id: 'tx__57', name: '喜力电音榜', bangId: '57', source: SOURCE },
  { id: 'tx__28', name: '网络歌曲榜', bangId: '28', source: SOURCE },
  { id: 'tx__5', name: '内地榜', bangId: '5', source: SOURCE },
  { id: 'tx__3', name: '欧美榜', bangId: '3', source: SOURCE },
  { id: 'tx__59', name: '香港地区榜', bangId: '59', source: SOURCE },
  { id: 'tx__16', name: '韩国榜', bangId: '16', source: SOURCE },
  { id: 'tx__60', name: '抖快榜', bangId: '60', source: SOURCE },
  { id: 'tx__29', name: '影视金曲榜', bangId: '29', source: SOURCE },
  { id: 'tx__17', name: '日本榜', bangId: '17', source: SOURCE },
  { id: 'tx__52', name: '腾讯音乐人原创榜', bangId: '52', source: SOURCE },
  { id: 'tx__36', name: 'K歌金曲榜', bangId: '36', source: SOURCE },
  { id: 'tx__61', name: '台湾地区榜', bangId: '61', source: SOURCE },
  { id: 'tx__63', name: 'DJ舞曲榜', bangId: '63', source: SOURCE },
  { id: 'tx__64', name: '综艺新歌榜', bangId: '64', source: SOURCE },
  { id: 'tx__65', name: '国风热歌榜', bangId: '65', source: SOURCE },
  { id: 'tx__67', name: '听歌识曲榜', bangId: '67', source: SOURCE },
  { id: 'tx__72', name: '动漫音乐榜', bangId: '72', source: SOURCE },
  { id: 'tx__73', name: '游戏音乐榜', bangId: '73', source: SOURCE },
  { id: 'tx__75', name: '有声榜', bangId: '75', source: SOURCE },
  { id: 'tx__131', name: '校园音乐人排行榜', bangId: '131', source: SOURCE },
];

async function ensurePeriodsLoaded(): Promise<void> {
  if (Object.keys(periodCache).length > 0) return;
  if (periodFetchPromise) return periodFetchPromise;
  periodFetchPromise = (async () => {
    try {
      const html = await onlineFetchText(PERIOD_URL);
      const matches = html.match(PERIOD_LIST_RE);
      if (!matches) return;
      for (const item of matches) {
        const m = item.match(PERIOD_RE);
        if (!m) continue;
        periodCache[m[2]] = m[3];
      }
    } catch {
      // 失败时 period 回退 ''
    } finally {
      periodFetchPromise = null;
    }
  })();
  return periodFetchPromise;
}

async function resolvePeriod(bangId: string): Promise<string> {
  if (periodCache[bangId]) return periodCache[bangId];
  await ensurePeriodsLoaded();
  return periodCache[bangId] ?? '';
}

function buildPayload(bangId: string, period: string) {
  return {
    toplist: {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: { topid: parseInt(bangId, 10), num: LIMIT, period },
    },
    comm: { uin: 0, format: 'json', ct: 20, cv: 1859 },
  };
}

function sizeFormate(size: number): string {
  if (!size || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = size;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

function mapTxFileQualities(file: Record<string, unknown> | undefined): {
  qualitys: string[];
  _qualitys: Record<string, { size?: string }>;
} {
  const qualitys: string[] = [];
  const _qualitys: Record<string, { size?: string }> = {};
  if (!file) return { qualitys, _qualitys };
  if (Number(file.size_128mp3 ?? 0) !== 0) {
    qualitys.push('128k');
    _qualitys['128k'] = { size: sizeFormate(Number(file.size_128mp3)) };
  }
  if (Number(file.size_320mp3 ?? 0) !== 0) {
    qualitys.push('320k');
    _qualitys['320k'] = { size: sizeFormate(Number(file.size_320mp3)) };
  }
  if (Number(file.size_flac ?? 0) !== 0) {
    qualitys.push('flac');
    _qualitys.flac = { size: sizeFormate(Number(file.size_flac)) };
  }
  if (Number(file.size_hires ?? 0) !== 0) {
    qualitys.push('flac24bit');
    _qualitys.flac24bit = { size: sizeFormate(Number(file.size_hires)) };
  }
  return { qualitys, _qualitys };
}

function mapTrack(item: Record<string, unknown>) {
  const mid = String(item.mid ?? item.songmid ?? '');
  if (!mid) return null;
  const file = item.file as Record<string, unknown> | undefined;
  const mediaMid = String(file?.media_mid ?? '');
  // 对齐 lx：无 media_mid 时跳过（取流 filename 会错）
  if (!mediaMid) return null;
  const songId = String(item.id ?? item.songid ?? mid);
  const sec = Number(item.interval ?? 0);
  const singers = (item.singer as Array<{ name?: string }> | undefined) ?? [];
  const album = item.album as { name?: string; mid?: string } | undefined;
  const { qualitys, _qualitys } = mapTxFileQualities(file);
  return {
    id: buildTrackId(SOURCE, mid),
    name: String(item.title ?? item.name ?? '未知'),
    artist: singers.map((s) => s.name).filter(Boolean).join('、') || '未知',
    source: SOURCE,
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: mid,
      strMediaMid: mediaMid,
      mediaMid,
      albumName: String(album?.name ?? ''),
      albumId: String(album?.mid ?? ''),
      albumMid: String(album?.mid ?? ''),
      qualitys,
      _qualitys,
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
  const tracks = raw
    .slice(rangeStart, rangeStart + LIMIT)
    .map(mapTrack)
    .filter((t): t is NonNullable<typeof t> => t != null);
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

  const period = await resolvePeriod(bangId);

  const detail = await firstSuccess(
    [
      async () => {
        const payload = buildPayload(bangId, period);
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
        const payload = buildPayload(bangId, period);
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
