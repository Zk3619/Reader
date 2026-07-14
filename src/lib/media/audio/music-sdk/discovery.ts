/**
 * 五源热搜与搜索联想
 */

import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { eapiPostBody } from '@/lib/media/audio/platform/api/eapi-crypto';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';

const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' };

export async function hotSearchKw(): Promise<string[]> {
  const body = await safeCall(() =>
    onlineFetchJson<{ data?: string[] }>(
      'https://kuwo.cn/api/www/search/hotSearch',
      { headers: { Referer: 'https://www.kuwo.cn/' } },
    ),
  );
  return body?.data ?? [];
}

/** 对齐 lx-music wy/hotSearch：eapi /api/search/chart/detail */
export async function hotSearchWy(): Promise<string[]> {
  const eapi = await safeCall(() =>
    eapiPostBody<{
      code?: number;
      data?: { itemList?: Array<{ searchWord?: string }> };
    }>('/api/search/chart/detail', {
      id: 'HOT_SEARCH_SONG#@#',
    }),
  );
  if (eapi?.code === 200) {
    const words = (eapi.data?.itemList ?? [])
      .map((d) => String(d.searchWord ?? ''))
      .filter(Boolean);
    if (words.length) return words;
  }
  const weapi = await safeCall(() =>
    weapiPost<{ code?: number; data?: Array<{ searchWord?: string }> }>('search/hot', {
      type: 1111,
    }),
  );
  if (weapi?.code !== 200) return [];
  return (weapi.data ?? []).map((d) => String(d.searchWord ?? '')).filter(Boolean);
}

export async function hotSearchKg(): Promise<string[]> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      errcode?: number;
      data?: { info?: Array<{ keyword?: string }> };
    }>(
      'https://gateway.kugou.com/v3/search/hot?plat=0&version=9108&format=json',
      { headers: KUGOU_HEADERS },
    ),
  );
  if (body?.errcode !== 0) return [];
  return (body?.data?.info ?? [])
    .map((i) => String(i.keyword ?? ''))
    .filter(Boolean);
}

export async function hotSearchTx(): Promise<string[]> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: { vec_hotkey?: Array<{ query?: string }> };
    }>(
      'https://c.y.qq.com/node/pc/wy/search_tab/hotkey.html?format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=jqspaframe.json',
      { headers: { Referer: 'https://y.qq.com/' } },
    ),
  );
  return (body?.data?.vec_hotkey ?? [])
    .map((i) => String(i.query ?? ''))
    .filter(Boolean);
}

export async function hotSearchMg(): Promise<string[]> {
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string;
      data?: Array<{ word?: string }>;
    }>('https://music.migu.cn/v3/api/search/hotWord', {
      headers: { Referer: 'https://music.migu.cn/' },
    }),
  );
  return (body?.data ?? []).map((i) => String(i.word ?? '')).filter(Boolean);
}

export async function hotSearchForSource(source: AudioTrackSource): Promise<string[]> {
  switch (source) {
    case 'kw':
      return hotSearchKw();
    case 'wy':
      return hotSearchWy();
    case 'kg':
      return hotSearchKg();
    case 'tx':
      return hotSearchTx();
    case 'mg':
      return hotSearchMg();
    default:
      return [];
  }
}

type WyTipSong = {
  name?: string;
  artists?: Array<{ name?: string }>;
  ar?: Array<{ name?: string }>;
};

/** 对齐 lx-music `formatSingerName(info.artists, 'name')` */
function formatWyTipSong(song: WyTipSong): string {
  const name = String(song.name ?? '').trim();
  if (!name) return '';
  const singers = song.artists ?? song.ar ?? [];
  const artists = singers
    .map((a) => String(a.name ?? '').trim())
    .filter(Boolean)
    .join('、');
  return artists ? `${name} - ${artists}` : name;
}

export async function tipSearchKw(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  // 对齐 lx-music kw/tipSearch
  const body = await safeCall(() =>
    onlineFetchJson<{ WORDITEMS?: Array<{ RELWORD?: string }> }>(
      `https://tips.kuwo.cn/t.s?corp=kuwo&newver=3&p2p=1&notrace=0&c=mbox&w=${encodeURIComponent(keyword)}&encoding=utf8&rformat=json`,
      { headers: { Referer: 'http://www.kuwo.cn/' } },
    ),
  );
  if (!body?.WORDITEMS) return [];
  return body.WORDITEMS.map((i) => String(i.RELWORD ?? '')).filter(Boolean);
}

export async function tipSearchWy(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  // 对齐 lx-music wy/tipSearch：优先 weapi/search/suggest/web
  const fromWeapi = await safeCall(() =>
    weapiPost<{ code?: number; result?: { songs?: WyTipSong[] } }>(
      'search/suggest/web',
      { s: keyword },
    ),
  );
  if (fromWeapi?.code === 200 && (fromWeapi.result?.songs?.length ?? 0) > 0) {
    return (fromWeapi.result?.songs ?? []).map(formatWyTipSong).filter(Boolean);
  }
  // weapi 空体时退回同路径公开 api（字段与 weapi 结果一致）
  const fromApi = await safeCall(() =>
    onlineFetchJson<{ code?: number; result?: { songs?: WyTipSong[] } }>(
      `https://music.163.com/api/search/suggest/web?csrf_token=&s=${encodeURIComponent(keyword)}`,
      {
        headers: {
          Referer: 'https://music.163.com/',
          Origin: 'https://music.163.com/',
        },
      },
    ),
  );
  return (fromApi?.result?.songs ?? []).map(formatWyTipSong).filter(Boolean);
}

export async function tipSearchKg(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  // 对齐 lx-music kg/tipSearch：MusicTipCount=10 → HintInfo
  const body = await safeCall(() =>
    onlineFetchJson<
      | Array<{ RecordDatas?: Array<{ HintInfo?: string }> }>
      | { data?: Array<{ RecordDatas?: Array<{ HintInfo?: string }> }> }
    >(
      `https://searchtip.kugou.com/getSearchTip?MusicTipCount=10&keyword=${encodeURIComponent(keyword)}`,
      { headers: KUGOU_HEADERS },
    ),
  );
  const rows = Array.isArray(body) ? body : (body?.data ?? []);
  const records = rows[0]?.RecordDatas ?? [];
  return records.map((i) => String(i.HintInfo ?? '')).filter(Boolean);
}

export async function tipSearchTx(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: {
        song?: { itemlist?: Array<{ name?: string; singer?: string }> };
      };
    }>(
      `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?is_xml=0&format=json&key=${encodeURIComponent(keyword)}&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`,
      { headers: { Referer: 'https://y.qq.com/portal/player.html' } },
    ),
  );
  if (body?.code !== 0) return [];
  return (body?.data?.song?.itemlist ?? [])
    .map((item) => {
      const name = String(item.name ?? '').trim();
      const singer = String(item.singer ?? '').trim();
      return singer ? `${name} - ${singer}` : name;
    })
    .filter(Boolean);
}

export async function tipSearchMg(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  // 对齐 lx-music mg/tipSearch：/v3/api/search/suggest → songs
  const body = await safeCall(() =>
    onlineFetchJson<{
      songs?: Array<{ name?: string; singerName?: string }>;
      data?: Array<{ word?: string }>;
    }>(
      `https://music.migu.cn/v3/api/search/suggest?keyword=${encodeURIComponent(keyword)}`,
      { headers: { Referer: 'https://music.migu.cn/v3' } },
    ),
  );
  const songs = body?.songs ?? [];
  if (songs.length > 0) {
    return songs
      .map((item) => {
        const name = String(item.name ?? '').trim();
        const singer = String(item.singerName ?? '').trim();
        return singer ? `${name} - ${singer}` : name;
      })
      .filter(Boolean);
  }
  return (body?.data ?? []).map((i) => String(i.word ?? '')).filter(Boolean);
}

export async function tipSearchForSource(
  source: MusicSdkSource | AudioTrackSource,
  keyword: string,
): Promise<string[]> {
  switch (source) {
    case 'kw':
      return tipSearchKw(keyword);
    case 'wy':
      return tipSearchWy(keyword);
    case 'kg':
      return tipSearchKg(keyword);
    case 'tx':
      return tipSearchTx(keyword);
    case 'mg':
      return tipSearchMg(keyword);
    default:
      return [];
  }
}
