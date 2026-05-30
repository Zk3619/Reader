/**
 * /content POST item_id 诊断（对齐 Legado java.log(op) 对比）
 */

import { utf8FromBase64 } from '@/lib/book-source/utils';

export function decodeAggregationItemIdLabel(itemId: string): string {
  const raw = itemId.trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9+/=_-]+$/.test(raw) && raw.length >= 8 && !raw.startsWith('eyJ')) {
    try {
      const decoded = utf8FromBase64(raw);
      if (decoded && /^[\x20-\x7E\u4e00-\u9fff_=-]+$/.test(decoded)) {
        return decoded;
      }
    } catch {
      /* ignore */
    }
  }
  if (raw.startsWith('eyJ')) {
    try {
      const decoded = utf8FromBase64(raw);
      if (decoded.startsWith('{')) return decoded.slice(0, 120);
    } catch {
      /* ignore */
    }
  }
  return raw.length <= 120 ? raw : `${raw.slice(0, 60)}…${raw.slice(-20)}`;
}

export function summarizeContentPostItemId(itemId: string): Record<string, unknown> {
  const raw = itemId.trim();
  const decoded = decodeAggregationItemIdLabel(raw);
  return {
    item_id_len: raw.length,
    item_id_starts_eyJ: raw.startsWith('eyJ'),
    item_id_decoded: decoded || undefined,
  };
}

export function summarizeContentPostBody(body: string): Record<string, unknown> {
  try {
    const post = JSON.parse(body) as Record<string, unknown>;
    const itemId = typeof post.item_id === 'string' ? post.item_id : '';
    return {
      source: post.source,
      tab: post.tab,
      tone_id: post.tone_id,
      version: post.version,
      html_len: typeof post.html === 'string' ? post.html.length : 0,
      ...summarizeContentPostItemId(itemId),
    };
  } catch {
    return { body_len: body.length };
  }
}
