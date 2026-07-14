/**
 * QQ QRC 前端解密（默认路径；与 Tauri `tx_qrc_decode` 算法对齐）
 *
 * 高性能 / 原生侧分支：保留 `invokeDecodeTxQrc` → `decode_tx_qrc_lyric`，
 * 未来可切换为主路径而不删 Rust 实现。
 */

import CryptoJS from 'crypto-js';
import { inflateSync } from 'fflate';

/** 与 src-tauri/src/tx_qrc_decode.rs QRC_KEY 一致（24 字节） */
const QRC_KEY = CryptoJS.enc.Utf8.parse('!@#)(*$%123ZXC!@!@#)(NYE');

function parseCiphertext(raw: string): CryptoJS.lib.WordArray | null {
  const trimmed = raw.trim();
  if (!trimmed) return CryptoJS.lib.WordArray.create();
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return CryptoJS.enc.Hex.parse(trimmed);
  }
  try {
    return CryptoJS.enc.Base64.parse(trimmed);
  } catch {
    return null;
  }
}

function wordArrayToUint8(wa: CryptoJS.lib.WordArray): Uint8Array {
  const { words, sigBytes } = wa;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function inflateUtf8(data: Uint8Array): string | null {
  try {
    const inflated = inflateSync(data);
    return new TextDecoder('utf-8').decode(inflated);
  } catch {
    return null;
  }
}

function tripleDesEcbDecrypt(cipher: CryptoJS.lib.WordArray): Uint8Array | null {
  if (cipher.sigBytes === 0) return new Uint8Array();
  try {
    const decrypted = CryptoJS.TripleDES.decrypt(
      { ciphertext: cipher } as CryptoJS.lib.CipherParams,
      QRC_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
    );
    if (decrypted.sigBytes > 0) return wordArrayToUint8(decrypted);
  } catch {
    // try NoPadding
  }
  try {
    const decrypted = CryptoJS.TripleDES.decrypt(
      { ciphertext: cipher } as CryptoJS.lib.CipherParams,
      QRC_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding },
    );
    if (decrypted.sigBytes > 0) return wordArrayToUint8(decrypted);
  } catch {
    return null;
  }
  return null;
}

function decodeOne(raw: string): string | null {
  if (!raw) return '';
  const cipher = parseCiphertext(raw);
  if (!cipher) return null;
  const plain = tripleDesEcbDecrypt(cipher);
  if (!plain) return null;
  const inflated = inflateUtf8(plain);
  if (inflated?.trim()) return inflated;
  const text = new TextDecoder('utf-8').decode(plain);
  if (text.includes('[') || text.includes('LyricContent')) return text;
  return null;
}

export type TxQrcDecodeResult = {
  lyric: string;
  tlyric: string;
  rlyric: string;
};

/** 纯前端解密；任一路主歌词失败返回 null（由调用方回退 LRC） */
export function decodeTxQrcFrontend(
  lrc: string,
  tlrc = '',
  rlrc = '',
): TxQrcDecodeResult | null {
  const lyric = decodeOne(lrc);
  if (lyric == null || (lrc && !lyric)) return null;
  return {
    lyric,
    tlyric: decodeOne(tlrc) ?? '',
    rlyric: decodeOne(rlrc) ?? '',
  };
}
