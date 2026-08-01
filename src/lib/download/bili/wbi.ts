/**
 * WBI 签名（复用音乐模块 mixin，附加 dm_img 指纹参数）
 */

import CryptoJS from 'crypto-js';
import {
  clearWbiCache,
  getBiliMixinKey,
} from '@/lib/media/audio/platform/api/bili/wbi';
import { getWebGLFingerPrint } from './fingerprint';

export { clearWbiCache, getBiliMixinKey };

function filterValue(v: string): string {
  return v.replace(/[!'()*]/g, '');
}

/** 返回 query string（不含 ?），含 w_rid / dm_img_* */
export async function signWbiQuery(
  paramsIn: Record<string, string | number | undefined>,
  cookies?: string,
): Promise<string> {
  const mixinKey = await getBiliMixinKey(cookies);
  const { dm_img_str, dm_cover_img_str } = getWebGLFingerPrint();
  const params: Record<string, string> = {
    wts: String(Math.floor(Date.now() / 1000)),
    dm_img_str,
    dm_cover_img_str,
    dm_img_list: '[]',
  };
  for (const [k, v] of Object.entries(paramsIn)) {
    if (v === undefined || v === null) continue;
    params[k] = filterValue(String(v));
  }
  const query = Object.keys(params)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!)}`,
    )
    .join('&');
  const wRid = CryptoJS.MD5(query + mixinKey).toString();
  return `${query}&w_rid=${wRid}`;
}

export async function buildWbiUrl(
  base: string,
  paramsIn: Record<string, string | number | undefined>,
  cookies?: string,
): Promise<string> {
  const qs = await signWbiQuery(paramsIn, cookies);
  return `${base}?${qs}`;
}
