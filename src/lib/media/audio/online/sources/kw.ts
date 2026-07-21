/**
 * 酷我音乐源（search.kuwo.cn 优先，wapi 降级）
 */

import { firstFullest, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson, onlineFetchText } from '@/lib/media/audio/online/online-http';
import { parseKuwoObjStr } from '@/lib/media/audio/music-sdk/sources/kw/parse-kuwo-json';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import {
  decodeKwLyricRaw,
  isValidKwLrc,
  parseKwLrcText,
  stripKwWordTimeTags,
} from '@/lib/media/audio/platform/api/kw-lyric-decode';
import { request } from '@/lib/http';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';
import { kwTypeForQuality, qualityFallbackChain, getPlayQuality } from '@/lib/media/audio/music-quality';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';

export interface OnlineSearchResult {
  tracks: AudioTrack[];
  total: number;
}

/** 酷我 ARTIST 用 & 分隔歌手；须先 decodeName（&#32; 等），再替换分隔符 */
function formatKwArtist(raw: unknown): string {
  const text = decodeHtmlEntities(String(raw ?? ''));
  return text.replace(/&/g, '、').trim() || '未知';
}

const KW_MINFO_RE = /level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/;

function parseKwNMinfo(nMinfo: string): {
  qualitys: string[];
  _qualitys: Record<string, { size: string }>;
} {
  const qualitys: string[] = [];
  const _qualitys: Record<string, { size: string }> = {};
  for (const part of nMinfo.split(';')) {
    const m = part.match(KW_MINFO_RE);
    if (!m) continue;
    const bitrate = m[2]!;
    const size = (m[4] ?? '').toUpperCase();
    let type: string | null = null;
    switch (bitrate) {
      case '4000':
        type = 'flac24bit';
        break;
      case '2000':
        type = 'flac';
        break;
      case '320':
        type = '320k';
        break;
      case '128':
        type = '128k';
        break;
      default:
        break;
    }
    if (!type || _qualitys[type]) continue;
    qualitys.push(type);
    _qualitys[type] = { size };
  }
  qualitys.reverse();
  return { qualitys, _qualitys };
}

function mapAbslistItem(info: Record<string, unknown>): AudioTrack | null {
  if (!info.N_MINFO) return null;
  const songId = String(info.MUSICRID ?? '').replace('MUSIC_', '');
  if (!songId) return null;
  const sec = parseInt(String(info.DURATION ?? '0'), 10);
  const { qualitys, _qualitys } = parseKwNMinfo(String(info.N_MINFO));
  return {
    id: buildTrackId('kw', songId),
    name: decodeHtmlEntities(String(info.SONGNAME ?? '未知')),
    artist: formatKwArtist(info.ARTIST),
    source: 'kw',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      albumId: String(info.ALBUMID ?? ''),
      albumName: decodeHtmlEntities(String(info.ALBUM ?? '')),
      singerId: String(info.ARTISTID ?? info.artistid ?? '').trim(),
      qualitys,
      _qualitys,
    },
  };
}

function mapWapiItem(info: Record<string, unknown>): AudioTrack | null {
  const songId = String(info.rid ?? info.id ?? '').replace('MUSIC_', '');
  if (!songId) return null;
  const sec = parseInt(String(info.duration ?? '0'), 10);
  return {
    id: buildTrackId('kw', songId),
    name: decodeHtmlEntities(String(info.name ?? '未知')),
    artist: formatKwArtist(info.artist),
    source: 'kw',
    duration: sec > 0 ? formatDurationSec(sec) : '00:00',
    meta: {
      songId,
      songmid: songId,
      albumId: String(info.albumid ?? ''),
      albumName: decodeHtmlEntities(String(info.album ?? '')),
      singerId: String(info.artistid ?? info.ARTISTID ?? '').trim(),
    },
  };
}

async function searchKuwoR(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const url =
    `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}` +
    `&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1` +
    `&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8` +
    `&rformat=json&vermerge=1&mobi=1&issubtitle=1`;
  const text = await safeCall(() => onlineFetchText(url));
  if (!text) return null;
  let body: { TOTAL?: string; abslist?: Array<Record<string, unknown>>; SHOW?: string };
  try {
    body = parseKuwoObjStr(text);
  } catch {
    return null;
  }
  // 对齐 lx kw/musicSearch.search：TOTAL 非 0 但 SHOW=0 时整页失败，走降级/重试
  if (body.TOTAL !== '0' && body.SHOW === '0') return null;
  const rawList = body.abslist ?? [];
  // 对齐 lx handleResult：任一缺 N_MINFO 则整页失败（勿静默丢条目，否则聚合页 < 150）
  if (rawList.some((info) => !info.N_MINFO)) return null;
  const tracks = rawList
    .map(mapAbslistItem)
    .filter((t): t is AudioTrack => t !== null);
  if (!hasItems(tracks)) return null;
  return {
    tracks,
    total: parseInt(String(body.TOTAL ?? tracks.length), 10) || tracks.length,
  };
}

async function searchWapi(keyword: string, page: number, limit: number): Promise<OnlineSearchResult | null> {
  const url =
    `http://wapi.kuwo.cn/api/www/search/searchMusicBykeyWord?key=${encodeURIComponent(keyword)}` +
    `&pn=${page - 1}&rn=${limit}`;
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: { list?: Array<Record<string, unknown>>; total?: number };
    }>(url, { headers: { Referer: 'https://www.kuwo.cn/' } }),
  );
  const tracks = (body?.data?.list ?? [])
    .map(mapWapiItem)
    .filter((t): t is AudioTrack => t !== null);
  if (!hasItems(tracks)) return null;
  return {
    tracks,
    total: Number(body?.data?.total ?? tracks.length),
  };
}

export async function kwSearch(
  keyword: string,
  page = 1,
  limit = 30,
): Promise<OnlineSearchResult> {
  // 对齐 lx：同接口重试，并优先选用满页结果（避免 r.s 短页直接截断）
  const result = await firstFullest(
    [
      () => searchKuwoR(keyword, page, limit),
      () => searchKuwoR(keyword, page, limit),
      () => searchKuwoR(keyword, page, limit),
      () => searchWapi(keyword, page, limit),
    ],
    (r) => r.tracks.length,
    limit,
    (r) => hasItems(r.tracks),
  );
  return result ?? { tracks: [], total: 0 };
}

function isValidKwPlayUrl(url: string | undefined | null, meta?: { bitrate?: number; duration?: number }): boolean {
  if (!url?.trim()) return false;
  // mobi convert_url_with_sign 对 VIP/失败会返回 bitrate=1、约 11 秒占位音
  if (/bitrate\$1(?:&|$)/i.test(url)) return false;
  if (typeof meta?.bitrate === 'number' && meta.bitrate > 0 && meta.bitrate < 48) return false;
  if (typeof meta?.duration === 'number' && meta.duration > 0 && meta.duration < 30) return false;
  return true;
}

/** 对齐官方 lx-music-source：从首页 Cookie 生成 Secret */
function kwEncryptToken(str: string, pwd: string): string | null {
  if (!pwd) return null;
  let prand = '';
  for (let i = 0; i < pwd.length; i++) prand += String(pwd.charCodeAt(i));
  const sPos = Math.floor(prand.length / 5);
  const mult = parseInt(
    prand.charAt(sPos) +
      prand.charAt(sPos * 2) +
      prand.charAt(sPos * 3) +
      prand.charAt(sPos * 4) +
      prand.charAt(sPos * 5),
    10,
  );
  if (mult < 2) return null;
  const incr = Math.ceil(pwd.length / 2);
  const modu = Math.pow(2, 31) - 1;
  let salt = Math.round(Math.random() * 1_000_000_000) % 100_000_000;
  prand += String(salt);
  while (prand.length > 10) {
    prand = String(parseInt(prand.substring(0, 10), 10) + parseInt(prand.substring(10), 10));
  }
  let nPrand = (mult * parseInt(prand, 10) + incr) % modu;
  let encStr = '';
  for (let i = 0; i < str.length; i++) {
    const encChr = str.charCodeAt(i) ^ Math.floor((nPrand / modu) * 255);
    encStr += encChr < 16 ? `0${encChr.toString(16)}` : encChr.toString(16);
    nPrand = (mult * nPrand + incr) % modu;
  }
  let saltHex = salt.toString(16);
  while (saltHex.length < 8) saltHex = `0${saltHex}`;
  return encStr + saltHex;
}

let cachedKwAuth: { cookie: string; secret: string; at: number } | null = null;

/** 供 UserApi shim 纠正酷我 playUrl 的 Secret（Cookie 名会轮换，脚本默认 key 常失效） */
export async function getKwPlayAuth(): Promise<{ cookie: string; secret: string } | null> {
  if (cachedKwAuth && Date.now() - cachedKwAuth.at < 10 * 60_000) {
    return { cookie: cachedKwAuth.cookie, secret: cachedKwAuth.secret };
  }
  try {
    const res = await request('http://www.kuwo.cn/', {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:82.0) Gecko/20100101 Firefox/82.0',
        Referer: 'http://www.kuwo.cn/',
      },
      useBackendHttp: true,
      ignorePageNavigationAbort: true,
      allowNon2xx: true,
    });
    const setCookie =
      res.headers['set-cookie'] ??
      res.headers['Set-Cookie'] ??
      '';
    const match = String(setCookie).match(/Hm_Iuvt_[^=]+=([^;]+)/);
    if (!match) return null;
    const cookieName = String(setCookie).match(/Hm_Iuvt_\w+/)?.[0] ?? 'Hm_Iuvt_cdb524f42f0ce19b169a8071123a4700';
    const cookieToken = match[1]!;
    const cookie = `${cookieName}=${cookieToken}`;
    const secret = kwEncryptToken(cookieToken, cookieName);
    if (!secret) return null;
    cachedKwAuth = { cookie, secret, at: Date.now() };
    return { cookie, secret };
  } catch {
    return null;
  }
}

/** 对齐官方 lx-music-source kw.musicUrl */
async function kwUrlFromPlayApi(songId: string, br: string): Promise<string | null> {
  const auth = await getKwPlayAuth();
  if (!auth) return null;
  const url = `http://www.kuwo.cn/api/v1/www/music/playUrl?mid=${songId}&type=music&br=${br}`;
  const body = await safeCall(() =>
    onlineFetchJson<{ code?: number; data?: { url?: string } }>(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:82.0) Gecko/20100101 Firefox/82.0',
        Referer: 'http://kuwo.cn/',
        Secret: auth.secret,
        Cookie: auth.cookie,
      },
    }),
  );
  const play = body?.data?.url;
  return body?.code === 200 && isValidKwPlayUrl(play) ? play! : null;
}

async function kwUrlFromAnti(songId: string, quality: string): Promise<string | null> {
  const formats = quality.includes('flac') ? ['flac', 'mp3'] : ['mp3'];
  for (const format of formats) {
    const url =
      `https://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=${songId}` +
      `&format=${format}&response=url&br=${quality}`;
    const body = await safeCall(() =>
      onlineFetchJson<{ code?: number | string; url?: string; msg?: string }>(url),
    );
    const play = body?.url?.trim();
    if ((body?.code === 200 || body?.code === '200') && isValidKwPlayUrl(play)) {
      return play!;
    }
  }
  return null;
}

export async function kwGetMusicUrl(track: AudioTrack, quality = getPlayQuality()): Promise<string | null> {
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!songId) return null;

  for (const q of qualityFallbackChain(quality)) {
    const type = kwTypeForQuality(q);

    // 1) 官方 lx-music-source：playUrl + Secret（可拿到非 VIP 整曲）
    const official = await kwUrlFromPlayApi(songId, type);
    if (official) return official;

    // 2) antiserver（VIP 常仅试听，由上层体积校验过滤）
    const anti = await kwUrlFromAnti(songId, type);
    if (anti) return anti;
  }
  return null;
}

function buildKwLyricParams(id: string, isGetLyricx: boolean): string {
  let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`;
  if (isGetLyricx) params += '&lrcx=1';
  const bufKey = new Uint8Array([121, 101, 101, 108, 105, 111, 110]);
  const bufStr = new TextEncoder().encode(params);
  const output = new Uint16Array(bufStr.length);
  let i = 0;
  while (i < bufStr.length) {
    let j = 0;
    while (j < bufKey.length && i < bufStr.length) {
      output[i] = bufKey[j]! ^ bufStr[i]!;
      i++;
      j++;
    }
  }
  const bytes = new Uint8Array(output.buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function kwGetLyric(track: AudioTrack): Promise<LyricBundle | null> {
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '').replace('MUSIC_', '');
  if (!songId) return null;
  const param = buildKwLyricParams(songId, true);
  const res = await safeCall(() =>
    request(`http://newlyric.kuwo.cn/newlyric.lrc?${param}`, { method: 'GET' }),
  );
  if (!res?.ok) return null;
  const raw = await res.arrayBuffer();
  const decoded = await decodeKwLyricRaw(raw, true);
  if (!decoded) return null;
  const parsed = parseKwLrcText(decoded);
  let lxlyric: string | null = null;
  try {
    const { parseKwLxLyric } = await import('@/lib/media/audio/platform/api/kw-lyric-decode');
    lxlyric = parseKwLxLyric(parsed.lyric) || null;
  } catch {
    lxlyric = null;
  }
  const lyric = stripKwWordTimeTags(parsed.lyric);
  const tlyric = parsed.tlyric ? stripKwWordTimeTags(parsed.tlyric) : '';
  if (!isValidKwLrc(lyric)) return null;
  return { lyric, tlyric: tlyric || null, lxlyric };
}

export async function kwHotSearch(): Promise<string[]> {
  try {
    const body = await onlineFetchJson<{ data?: string[] }>(
      'https://www.kuwo.cn/api/www/search/hotSearch',
      { headers: { Referer: 'https://www.kuwo.cn/' } },
    );
    return body.data ?? [];
  } catch {
    return [];
  }
}
