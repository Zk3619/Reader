/**
 * 酷我 wbd 接口加解密（对齐 lx-music kw/util.js wbdCrypto）
 */

import CryptoJS from 'crypto-js';

const AES_MODE = CryptoJS.mode.ECB;
const AES_PAD = CryptoJS.pad.Pkcs7;
/** aes-128-ecb key bytes from lx */
const AES_KEY_BYTES = [112, 87, 39, 61, 199, 250, 41, 191, 57, 68, 45, 114, 221, 94, 140, 228];
const AES_KEY = CryptoJS.enc.Latin1.parse(String.fromCharCode(...AES_KEY_BYTES));
const APP_ID = 'y67sprxhhpws';

function createSign(encodeData: string, time: number): string {
  return CryptoJS.MD5(`${APP_ID}${encodeData}${time}`).toString().toUpperCase();
}

export function kwWbdBuildParam(jsonData: Record<string, unknown>): string {
  const encodeData = CryptoJS.AES.encrypt(JSON.stringify(jsonData), AES_KEY, {
    mode: AES_MODE,
    padding: AES_PAD,
  }).toString();
  const time = Date.now();
  const sign = createSign(encodeData, time);
  return `data=${encodeURIComponent(encodeData)}&time=${time}&appId=${APP_ID}&sign=${sign}`;
}

export function kwWbdDecodeData(base64Result: string): unknown {
  const encoded = decodeURIComponent(base64Result.trim());
  const decrypted = CryptoJS.AES.decrypt(encoded, AES_KEY, {
    mode: AES_MODE,
    padding: AES_PAD,
  });
  const text = decrypted.toString(CryptoJS.enc.Utf8);
  if (!text) throw new Error('酷我 wbd 解密失败');
  return JSON.parse(text) as unknown;
}
