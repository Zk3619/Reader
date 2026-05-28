/**
 * Legado AnalyzeUrl POST 查询串 / 表单编码（简化版 analyzeFields / analyzeQuery）
 */

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
