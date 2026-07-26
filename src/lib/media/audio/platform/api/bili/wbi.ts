/**
 * B 站 WBI 签名（公开协议，自行重写）
 */

import CryptoJS from 'crypto-js';
import { platformFetchJson } from '@/lib/media/audio/platform/api/platform-http';

const MIXIN_INDEX = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
  29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 62, 6, 63, 57, 20, 34, 52, 59, 11, 36, 44,
];

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav';
const WBI_CACHE_MS = 10 * 60 * 1000;

let cachedMixinKey: string | null = null;
let cachedAt = 0;

function filterValue(v: string): string {
  return v.replace(/[!'()*]/g, '');
}

function mixinFromImgUrls(imgUrl: string, subUrl: string): string {
  const imgKey = imgUrl.split('/').pop()?.split('.')[0] ?? '';
  const subKey = subUrl.split('/').pop()?.split('.')[0] ?? '';
  const raw = imgKey + subKey;
  let mixed = '';
  for (const idx of MIXIN_INDEX) {
    if (idx < raw.length) mixed += raw[idx];
  }
  return mixed.slice(0, 32);
}

export async function getBiliMixinKey(cookies?: string): Promise<string> {
  const now = Date.now();
  if (cachedMixinKey && now - cachedAt < WBI_CACHE_MS) return cachedMixinKey;

  const body = await platformFetchJson<{
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  }>(NAV_URL, {
    headers: {
      Referer: 'https://www.bilibili.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  const imgUrl = body.data?.wbi_img?.img_url ?? '';
  const subUrl = body.data?.wbi_img?.sub_url ?? '';
  if (!imgUrl || !subUrl) throw new Error('WBI key unavailable');
  cachedMixinKey = mixinFromImgUrls(imgUrl, subUrl);
  cachedAt = now;
  return cachedMixinKey;
}

/** 导出供单测：从 img/sub URL 计算 mixin */
export function computeMixinKeyFromUrls(imgUrl: string, subUrl: string): string {
  return mixinFromImgUrls(imgUrl, subUrl);
}

export async function signWbiParams(
  paramsIn: Record<string, string>,
  cookies?: string,
): Promise<Record<string, string>> {
  const mixinKey = await getBiliMixinKey(cookies);
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(paramsIn)) {
    params[k] = filterValue(v);
  }
  params.wts = String(Math.floor(Date.now() / 1000));
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`)
    .join('&');
  const wRid = CryptoJS.MD5(sorted + mixinKey).toString();
  return { ...params, w_rid: wRid };
}

export async function buildWbiUrl(
  base: string,
  paramsIn: Record<string, string>,
  cookies?: string,
): Promise<string> {
  const signed = await signWbiParams(paramsIn, cookies);
  const qs = new URLSearchParams(signed).toString();
  return `${base}?${qs}`;
}

export function clearWbiCache(): void {
  cachedMixinKey = null;
  cachedAt = 0;
}
