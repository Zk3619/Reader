/**
 * 五源热搜与搜索联想
 */

import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
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

export async function hotSearchWy(): Promise<string[]> {
  const body = await safeCall(() =>
    weapiPost<{ code?: number; data?: Array<{ searchWord?: string }> }>('search/hot', {
      type: 1111,
    }),
  );
  if (body?.code !== 200) return [];
  return (body.data ?? []).map((d) => String(d.searchWord ?? '')).filter(Boolean);
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

export async function tipSearchKw(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const body = await safeCall(() =>
    onlineFetchJson<{ WORDITEMS?: Array<{ RELWORD?: string }> }>(
      `https://tips.kuwo.cn/t.s?corp=kuwo&newver=3&client=kt&uid=0&ver=kwplayer_ar_11.1.0.0&rid=0&all=${encodeURIComponent(keyword)}&rformat=json`,
      { headers: { Referer: 'https://www.kuwo.cn/' } },
    ),
  );
  return (body?.WORDITEMS ?? []).map((i) => String(i.RELWORD ?? '')).filter(Boolean);
}

export async function tipSearchWy(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const body = await safeCall(() =>
    weapiPost<{ code?: number; result?: { songs?: Array<{ name?: string }> } }>(
      'search/suggest/web',
      { s: keyword },
    ),
  );
  return (body?.result?.songs ?? []).map((s) => String(s.name ?? '')).filter(Boolean);
}

export async function tipSearchKg(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const body = await safeCall(() =>
    onlineFetchJson<{
      errcode?: number;
      data?: { list?: Array<{ keyword?: string }> };
    }>(
      `https://searchtip.kugou.com/getSearchTip?MusicTipCount=10&keyword=${encodeURIComponent(keyword)}`,
      { headers: KUGOU_HEADERS },
    ),
  );
  return (body?.data?.list ?? []).map((i) => String(i.keyword ?? '')).filter(Boolean);
}

export async function tipSearchTx(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: number;
      data?: string;
    }>(
      `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?remote=1&w=${encodeURIComponent(keyword)}&format=json`,
      { headers: { Referer: 'https://y.qq.com/' } },
    ),
  );
  if (!body?.data) return [];
  try {
    const parsed = JSON.parse(body.data) as { items?: Array<{ text?: string }> };
    return (parsed.items ?? []).map((i) => String(i.text ?? '')).filter(Boolean);
  } catch {
    return [];
  }
}

export async function tipSearchMg(keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const body = await safeCall(() =>
    onlineFetchJson<{
      data?: Array<{ word?: string }>;
    }>(
      `https://music.migu.cn/v3/api/search/suggestWord?keyword=${encodeURIComponent(keyword)}`,
      { headers: { Referer: 'https://music.migu.cn/' } },
    ),
  );
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
