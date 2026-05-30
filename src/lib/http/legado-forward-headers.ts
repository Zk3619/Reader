/**
 * 纯 Web 代理：将 Legado 正文图 headers 经同源请求带给 Vite __reader_http。
 */

/** 与 vite-plugins/reader-http-proxy 一致 */
export const LEGADO_FORWARD_HEADERS_HEADER = 'X-Reader-Legado-Headers';

const SKIP_FORWARD = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
]);

export function encodeLegadoForwardHeaders(
  headers: Record<string, string> | null | undefined,
): string | undefined {
  if (!headers) return undefined;
  const payload: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!v?.trim()) continue;
    if (SKIP_FORWARD.has(k.toLowerCase())) continue;
    payload[k] = v.trim();
  }
  if (Object.keys(payload).length === 0) return undefined;

  const json = JSON.stringify(payload);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeLegadoForwardHeaders(
  encoded: string | string[] | undefined,
): Record<string, string> {
  const raw = Array.isArray(encoded) ? encoded[0] : encoded;
  if (!raw?.trim()) return {};
  try {
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(raw.trim(), 'base64').toString('utf8')
        : new TextDecoder().decode(
            Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0)),
          );
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s) out[k] = s;
    }
    return out;
  } catch {
    return {};
  }
}

export function pickLegadoHeader(
  headers: Record<string, string> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && v?.trim()) return v.trim();
  }
  return undefined;
}
