/**
 * 网易云 eapi 加密（对齐 lx-music wy/utils/crypto.js）
 */

import CryptoJS from 'crypto-js';
import { request } from '@/lib/http';

const EAPI_KEY = 'e82ckenh8dichen8';

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

export async function eapiPost<T>(
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const { params } = eapiEncrypt(path, data);
  const res = await request('http://interface.music.163.com/eapi/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
      Origin: 'https://music.163.com',
      Referer: 'https://music.163.com/',
    },
    body: new URLSearchParams({ params }).toString(),
  });
  if (!res.ok) throw new Error(`eapi ${path} HTTP ${res.status}`);
  return res.json<T>();
}

/** eapi batch 响应常为数组，取首项作为业务 body */
export function unwrapEapiBody<T>(raw: unknown): T {
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

export async function eapiPostBody<T>(
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const raw = await eapiPost<unknown>(path, data);
  return unwrapEapiBody<T>(raw);
}
