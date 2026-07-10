/**
 * 网易云 weapi 加密（对齐 NeteaseCloudMusicApi / lx-music crypto.js）
 */

import CryptoJS from 'crypto-js';
import { request } from '@/lib/http';

const IV = '0102030405060708';
const PRESET_KEY = '0CoJUm6Qyw8W8jud';
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** RSA 公钥模数（128 字节） */
const RSA_MODULUS = BigInt(
  '0x00e0b509f625ceddf0244b1495c264f5574d4074f3258463cb5986e9ca4e9f025762c585df1ba3c9ac574a7374490d6251d1627e5836179d83be839440ea3accc730968c6556ddeb0d99d24faed74ef26a817ea3f4759626dae2739a0f1098140408622ab5f5d3446a8986e1d82bf4e1e50e47c63878dd9d9',
);
const RSA_EXPONENT = BigInt(65537);

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  let b = base % mod;
  let e = exp;
  while (e > BigInt(0)) {
    if (e % BigInt(2) === BigInt(1)) result = (result * b) % mod;
    e = e / BigInt(2);
    b = (b * b) % mod;
  }
  return result;
}

/** 生成 16 字节 secretKey（与 lx-music randomBytes(16).map 一致） */
export function randomWeapiSecretKey(): Uint8Array {
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  return new Uint8Array(Array.from(raw, (n) => BASE62.charCodeAt(n % 62)));
}

function secretKeyToString(key: Uint8Array): string {
  return String.fromCharCode(...key);
}

function aesEncryptBase64(plain: string, keyStr: string): string {
  return CryptoJS.AES.encrypt(plain, CryptoJS.enc.Utf8.parse(keyStr), {
    iv: CryptoJS.enc.Utf8.parse(IV),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
}

function rsaEncryptSecretKey(secretKey: Uint8Array): string {
  const reversed = [...secretKey].reverse();
  const padded = new Uint8Array(128);
  padded.set(reversed, 128 - reversed.length);
  let m = BigInt(0);
  for (const b of padded) {
    m = (m << BigInt(8)) + BigInt(b);
  }
  const c = modPow(m, RSA_EXPONENT, RSA_MODULUS);
  return c.toString(16).padStart(256, '0');
}

export function weapiEncrypt(object: Record<string, unknown>): {
  params: string;
  encSecKey: string;
} {
  const text = JSON.stringify(object);
  const secretKey = randomWeapiSecretKey();
  const secretKeyStr = secretKeyToString(secretKey);
  const firstPass = aesEncryptBase64(text, PRESET_KEY);
  const params = aesEncryptBase64(firstPass, secretKeyStr);
  const encSecKey = rsaEncryptSecretKey(secretKey);
  return { params, encSecKey };
}

export const WEAPI_PREFIX = 'https://music.163.com/weapi/';

const LINUXAPI_KEY = 'rFgB&h#%2?^eDg:Q';

/** linuxapi 加密（歌单详情等） */
export function linuxapiEncrypt(object: Record<string, unknown>): { eparams: string } {
  const text = JSON.stringify(object);
  const encrypted = CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(text),
    CryptoJS.enc.Utf8.parse(LINUXAPI_KEY),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  );
  return { eparams: encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase() };
}

export async function linuxapiPost<T>(
  data: Record<string, unknown>,
  cookies = 'MUSIC_U=',
): Promise<T> {
  const { eparams } = linuxapiEncrypt(data);
  const res = await request('https://music.163.com/api/linux/forward', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
      Cookie: cookies,
    },
    body: new URLSearchParams({ eparams }).toString(),
  });
  if (!res.ok) throw new Error(`linuxapi HTTP ${res.status}`);
  return res.json<T>();
}

export async function weapiPost<T>(
  path: string,
  data: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  const { params, encSecKey } = weapiEncrypt(data);
  const body = new URLSearchParams({ params, encSecKey }).toString();
  const res = await request(`${WEAPI_PREFIX}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
      Origin: 'https://music.163.com',
      Referer: 'https://music.163.com/',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body,
  });
  if (!res.ok) throw new Error(`weapi ${path} HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`weapi ${path} 返回空响应`);
  return JSON.parse(text) as T;
}
