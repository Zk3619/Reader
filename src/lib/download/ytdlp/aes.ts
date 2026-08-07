/**
 * yt-dlp AES helpers — Tube8 URL decrypt + HLS AES-128 segment decrypt.
 */

import CryptoJS from 'crypto-js';
import { aesDecryptTextNative } from './aes-ytdlp-native';

function u8ToWA(u8: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((((u8[i] ?? 0) << 24) |
        ((u8[i + 1] ?? 0) << 16) |
        ((u8[i + 2] ?? 0) << 8) |
        (u8[i + 3] ?? 0)) >>>
        0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

function waToU8(wa: CryptoJS.lib.WordArray): Uint8Array {
  const out = new Uint8Array(wa.sigBytes);
  for (let i = 0; i < wa.sigBytes; i++) {
    out[i] = (wa.words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

/** Decrypt Tube8/YouPorn flashvars encrypted URLs (yt-dlp aes_decrypt_text parity). */
export function aesDecryptText(
  data: string,
  password: string,
  keySizeBytes: 16 | 24 | 32 = 32,
): string {
  return aesDecryptTextNative(data, password, keySizeBytes);
}

/**
 * AES-128-CBC decrypt for HLS `#EXT-X-KEY:METHOD=AES-128` media segments.
 * Key/IV are 16-byte arrays (or hex strings).
 */
export function aes128CbcDecrypt(
  cipher: Uint8Array,
  key: Uint8Array | string,
  iv: Uint8Array | string,
): Uint8Array {
  const keyBytes =
    typeof key === 'string'
      ? Uint8Array.from(key.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)))
      : key;
  const ivBytes =
    typeof iv === 'string'
      ? Uint8Array.from(iv.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)))
      : iv;
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: u8ToWA(cipher) }),
    u8ToWA(keyBytes),
    {
      iv: u8ToWA(ivBytes),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return waToU8(decrypted);
}

function toKeyIvBytes(v: Uint8Array | string): Uint8Array {
  if (typeof v !== 'string') return v;
  return Uint8Array.from(v.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
}

/** AES-ECB encrypt with PKCS#7 — yt-dlp aes_ecb_encrypt. */
export function aesEcbEncrypt(
  data: Uint8Array,
  key: Uint8Array | string,
): Uint8Array {
  const keyBytes = toKeyIvBytes(key);
  const encrypted = CryptoJS.AES.encrypt(u8ToWA(data), u8ToWA(keyBytes), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return waToU8(encrypted.ciphertext);
}

/** AES-ECB decrypt — yt-dlp aes_ecb_decrypt (padding stripped). */
export function aesEcbDecrypt(
  data: Uint8Array,
  key: Uint8Array | string,
): Uint8Array {
  const keyBytes = toKeyIvBytes(key);
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: u8ToWA(data) }),
    u8ToWA(keyBytes),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return waToU8(decrypted);
}

/**
 * AES-CTR encrypt/decrypt (symmetric) — yt-dlp aes_ctr_encrypt / aes_ctr_decrypt.
 * `iv` is the 16-byte counter block (incremented per block by CryptoJS CTR).
 */
export function aesCtrEncrypt(
  data: Uint8Array,
  key: Uint8Array | string,
  iv: Uint8Array | string,
): Uint8Array {
  const keyBytes = toKeyIvBytes(key);
  const ivBytes = toKeyIvBytes(iv);
  const encrypted = CryptoJS.AES.encrypt(u8ToWA(data), u8ToWA(keyBytes), {
    iv: u8ToWA(ivBytes),
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return waToU8(encrypted.ciphertext);
}

export function aesCtrDecrypt(
  data: Uint8Array,
  key: Uint8Array | string,
  iv: Uint8Array | string,
): Uint8Array {
  return aesCtrEncrypt(data, key, iv);
}

/** Snake_case aliases matching yt-dlp aes.py exports. */
export const aes_ecb_encrypt = aesEcbEncrypt;
export const aes_ecb_decrypt = aesEcbDecrypt;
export const aes_ctr_encrypt = aesCtrEncrypt;
export const aes_ctr_decrypt = aesCtrDecrypt;
