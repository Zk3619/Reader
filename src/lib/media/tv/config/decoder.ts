/**
 * 配置解码：对齐 FongMi Decoder（** base64、2423 AES-CBC、相对 .js/jar URI）
 */

import CryptoJS from 'crypto-js';
import JSON5 from 'json5';
import type { VodConfigJson } from '../types';
import { tvGet } from '../net/rules';

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function padEnd16(key: string): string {
  return key + '0000000000000000'.slice(key.length);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

/** 2423… AES-CBC（对齐 Decoder.cbc） */
export function decode2423(data: string): string {
  const compact = data.replace(/\s+/g, '');
  const rawBytes = hexToBytes(compact);
  const decode = bytesToLatin1(rawBytes).toLowerCase();
  const key = padEnd16(decode.slice(decode.indexOf('$#') + 2, decode.indexOf('#$')));
  const iv = padEnd16(decode.slice(decode.length - 13));
  const payloadHex = compact.slice(compact.indexOf('2324') + 4, compact.length - 26);
  const encrypted = CryptoJS.enc.Hex.parse(payloadHex);
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: encrypted }),
    CryptoJS.enc.Utf8.parse(key),
    {
      iv: CryptoJS.enc.Utf8.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/** `********` + `**` 包裹的 base64 段 */
export function decodeStarBase64(data: string): string {
  const m = /[A-Za-z0-9]{8}\*\*/.exec(data);
  if (!m) return data;
  const extract = data.slice(data.indexOf(m[0]!) + 10);
  try {
    return atob(extract.replace(/\s/g, ''));
  } catch {
    return data;
  }
}

function resolveRelative(configUrl: string, data: string): string {
  if (!configUrl.startsWith('http')) return data;
  let out = data;
  const jsUri = /"(\.|\\.\\.)\/(.?|.+?)\.js\?(.?|.+?)"/g;
  out = out.replace(jsUri, (full) => {
    try {
      const inner = full.slice(1, -1);
      const abs = new URL(inner, configUrl).toString();
      return `"${abs}"`;
    } catch {
      return full;
    }
  });
  try {
    const base = new URL('./', configUrl).toString();
    const up = new URL('../', configUrl).toString();
    out = out.replace(/\.\.\//g, up).replace(/\.\//g, base);
  } catch {
    /* */
  }
  return out;
}

export function verifyConfigBody(url: string, data: string): string {
  let text = stripBom(data.trim());
  if (!text) throw new Error('empty config');
  try {
    JSON5.parse(text);
    return resolveRelative(url, text);
  } catch {
    /* continue */
  }
  if (text.includes('**')) text = decodeStarBase64(text);
  if (text.startsWith('2423')) text = decode2423(text);
  return resolveRelative(url, text);
}

/** 部分配置用 base64 / gzip 包装；先尝试明文 JSON */
export function parseConfigText(raw: string, baseUrl = ''): VodConfigJson {
  const text = verifyConfigBody(baseUrl || 'pasted://', raw);
  try {
    return JSON5.parse(text) as VodConfigJson;
  } catch {
    try {
      const decoded = atob(text.replace(/\s/g, ''));
      return JSON5.parse(decoded) as VodConfigJson;
    } catch {
      throw new Error('无法解析影视配置 JSON');
    }
  }
}

export async function fetchConfigJson(url: string): Promise<VodConfigJson> {
  const body = await tvGet(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 30000,
  });
  const verified = verifyConfigBody(url, body);
  return JSON5.parse(verified) as VodConfigJson;
}

export function isDepotConfig(cfg: VodConfigJson): boolean {
  return Array.isArray(cfg.urls) && cfg.urls.length > 0 && !cfg.sites;
}

/** 相对配置 URL 解析 jar / .js */
export function resolveConfigAssetUrl(asset: string, configUrl: string): string {
  if (!asset) return asset;
  if (asset.startsWith('http://') || asset.startsWith('https://') || asset.startsWith('file:')) {
    return asset;
  }
  if (!configUrl.startsWith('http')) return asset;
  try {
    return new URL(asset, configUrl).toString();
  } catch {
    return asset;
  }
}
