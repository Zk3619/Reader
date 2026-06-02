/**
 * HTTP 响应体解压：部分书源返回 gzip 但未标 Content-Encoding，浏览器/代理会当文本解码成乱码。
 * 对齐 OkHttp/Jsoup 对 gzip 魔数的容错。
 */

import { gunzipSync, inflateSync } from 'fflate';

export function isGzipBytes(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

function looksLikeTextPayload(data: Uint8Array): boolean {
  if (data.length === 0) return false;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(
    data.subarray(0, Math.min(128, data.length)),
  );
  const t = head.trimStart();
  if (!t) return false;
  const c = t.charCodeAt(0);
  return (
    c === 0x3c || // <
    c === 0x7b || // {
    c === 0x5b || // [
    c === 0xef || // UTF-8 BOM / 中文
    (c >= 0x20 && c <= 0x7e)
  );
}

function tryGunzip(data: Uint8Array): Uint8Array | null {
  try {
    const out = gunzipSync(data);
    return looksLikeTextPayload(out) ? out : null;
  } catch {
    return null;
  }
}

function tryInflate(data: Uint8Array): Uint8Array | null {
  try {
    const out = inflateSync(data);
    return looksLikeTextPayload(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * 按 Content-Encoding 或 gzip 魔数解压；无法识别时原样返回。
 */
export function maybeDecompressHttpBody(
  data: Uint8Array,
  contentEncoding?: string | null,
): Uint8Array {
  if (!data.length) return data;

  const enc = contentEncoding?.trim().toLowerCase() ?? '';

  if (enc.includes('gzip') || enc.includes('x-gzip')) {
    const out = tryGunzip(data);
    if (out) return out;
  }
  if (enc.includes('deflate')) {
    const out = tryInflate(data);
    if (out) return out;
  }

  if (isGzipBytes(data)) {
    const out = tryGunzip(data);
    if (out) return out;
  }

  return data;
}
