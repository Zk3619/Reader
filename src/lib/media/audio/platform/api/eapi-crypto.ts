/**
 * 网易云 eapi 加密（对齐 lx-music-source / NeteaseCloudMusicApi）
 */

import CryptoJS from 'crypto-js';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';

const EAPI_KEY = 'e82ckenh8dichen8';

/** 播放取链：官方 lx-music-source 直连 interface3，不用 /eapi/batch */
const EAPI_PLAYER_URLS = [
  'https://interface3.music.163.com/eapi/song/enhance/player/url',
  'http://interface.music.163.com/eapi/song/enhance/player/url',
] as const;

const EAPI_BATCH_URLS = [
  'http://interface.music.163.com/eapi/batch',
  'https://interface3.music.163.com/eapi/batch',
] as const;

export function eapiEncrypt(
  path: string,
  object: Record<string, unknown>,
): { params: string } {
  const text = JSON.stringify(object);
  const message = `nobody${path}use${text}md5forencrypt`;
  const digest = CryptoJS.MD5(message).toString();
  const data = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const encrypted = CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(data),
    CryptoJS.enc.Utf8.parse(EAPI_KEY),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  );
  return { params: encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase() };
}

function eapiRequestHeaders(cookies?: string): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
    Origin: 'https://music.163.com',
    Referer: 'https://music.163.com/',
    ...(cookies ? { Cookie: cookies } : {}),
  };
}

async function eapiPostToUrls<T>(
  urls: readonly string[],
  path: string,
  data: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  const { params } = eapiEncrypt(path, data);
  const body = new URLSearchParams({ params }).toString();
  const requestOptions = {
    method: 'POST' as const,
    headers: eapiRequestHeaders(cookies),
    body,
    useBackendHttp: isTauri(),
    ignorePageNavigationAbort: true,
  };

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await request(url, requestOptions);
      if (!res.ok) {
        if (res.status >= 500) {
          lastError = new Error(`eapi ${path} HTTP ${res.status} @ ${url}`);
          continue;
        }
        throw new Error(`eapi ${path} HTTP ${res.status}`);
      }
      return res.json<T>();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error(`eapi ${path} failed`);
}

/** 搜索等仍走 batch */
export async function eapiPost<T>(
  path: string,
  data: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  return eapiPostToUrls<T>(EAPI_BATCH_URLS, path, data, cookies);
}

/** 播放 URL：对齐 lx-music-source 直连 /eapi/song/enhance/player/url */
export async function eapiPlayerUrlPost<T>(
  data: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  return eapiPostToUrls<T>(
    EAPI_PLAYER_URLS,
    '/api/song/enhance/player/url',
    data,
    cookies,
  );
}

const EAPI_LYRIC_URLS = [
  'https://interface3.music.163.com/eapi/song/lyric',
  'http://interface.music.163.com/eapi/song/lyric',
] as const;

/** 歌词：直连 eapi/song/lyric，避免 weapi 被掐 / batch 503 */
export async function eapiLyricPost<T>(
  data: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  return eapiPostToUrls<T>(EAPI_LYRIC_URLS, '/api/song/lyric', data, cookies);
}

/** eapi batch 响应常为数组，取首项作为业务 body */
export function unwrapEapiBody<T>(raw: unknown): T {
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

export async function eapiPostBody<T>(
  path: string,
  data: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  const raw = await eapiPost<unknown>(path, data, cookies);
  return unwrapEapiBody<T>(raw);
}
