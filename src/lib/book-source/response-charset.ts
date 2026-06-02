/**
 * 书源 HTTP 响应 charset（AnalyzeUrl charset=gbk 等）
 */

import { maybeDecompressHttpBody } from '@/lib/http/decompress-body';

export function isGbkLikeCharset(charset?: string): boolean {
  const cs = charset?.trim().toLowerCase();
  return cs === 'gbk' || cs === 'gb2312' || cs === 'gb18030';
}

export async function decodeBookSourceResponseBytes(
  data: ArrayBuffer | Uint8Array,
  charset?: string,
  contentEncoding?: string | null,
): Promise<string> {
  const raw = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (raw.length === 0) return '';
  const bytes = maybeDecompressHttpBody(raw, contentEncoding);

  if (isGbkLikeCharset(charset)) {
    try {
      const { isTauri } = await import('@/lib/platform/detect');
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('decode_gbk', { data: Array.from(bytes) });
      }
    } catch (e) {
      console.warn('[decodeBookSourceResponseBytes] Tauri GBK 解码失败', e);
    }
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      /* fall through */
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
