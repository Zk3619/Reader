/**
 * Legado AnalyzeUrl POST 查询串 / 表单编码（简化版 analyzeFields / analyzeQuery）
 */

import { isGbkLikeCharset } from '@/lib/book-source/response-charset';

export { isGbkLikeCharset };

function encodeParamValue(value: string, charset = 'utf-8'): string {
  if (charset === 'escape') {
    return value;
  }
  return encodeURIComponent(value);
}

/** 解析 key=value&... 为表单 body */
export function encodeFormBody(fieldsTxt: string, charset?: string): string {
  const cs = charset?.trim() || 'utf-8';
  const parts: string[] = [];
  let pos = 0;
  const len = fieldsTxt.length;
  while (pos <= len) {
    if (parts.length > 0) parts.push('&');
    let amp = fieldsTxt.indexOf('&', pos);
    if (amp === -1) amp = len;
    const eq = fieldsTxt.indexOf('=', pos);
    if (eq === -1 || eq > amp) {
      parts.push(encodeParamValue(fieldsTxt.slice(pos, amp).trim(), cs));
      pos = amp + 1;
      continue;
    }
    const key = fieldsTxt.slice(pos, eq).trim();
    let value = fieldsTxt.slice(eq + 1, amp);
    if (value.startsWith('<') && value.endsWith('>')) {
      value = value.slice(1, -1);
      try {
        value = atob(value);
      } catch {
        /* keep */
      }
    }
    parts.push(`${encodeParamValue(key, cs)}=${encodeParamValue(value, cs)}`);
    pos = amp + 1;
  }
  return parts.join('');
}

/** GET 时附加到 URL 的 query（已编码） */
export function encodeQueryString(query: string, charset?: string): string {
  return encodeFormBody(query, charset);
}

/**
 * 对齐 Legado AnalyzeUrl POST：charset=gbk 时须 GBK 百分号编码（非 UTF-8 encodeURIComponent）
 */
export async function encodeLegadoFormBody(
  fieldsTxt: string,
  charset?: string,
): Promise<string> {
  if (!fieldsTxt.trim()) return fieldsTxt;
  if (isGbkLikeCharset(charset)) {
    try {
      const { isTauri } = await import('@/lib/platform/detect');
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('encode_form_urlencoded_gbk', { fields: fieldsTxt });
      }
    } catch (e) {
      console.warn('[encodeLegadoFormBody] GBK 编码失败，回退 UTF-8', e);
    }
  }
  return encodeFormBody(fieldsTxt, charset);
}

/** 根据 body 形态设置 Content-Type */
export function inferPostContentType(
  body: string,
  charset?: string,
): string | undefined {
  const t = body.trim();
  if (!t) return charset ? `text/plain; charset=${charset}` : 'text/plain';
  if (
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('[') && t.endsWith(']'))
  ) {
    return charset ? `application/json; charset=${charset}` : 'application/json';
  }
  if (t.includes('=') && (t.includes('&') || /^[^=&\s]+=[^=&\s]*$/.test(t))) {
    return charset
      ? `application/x-www-form-urlencoded; charset=${charset}`
      : 'application/x-www-form-urlencoded';
  }
  return charset ? `text/plain; charset=${charset}` : undefined;
}
