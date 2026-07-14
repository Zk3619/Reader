/**
 * 酷我 search.kuwo.cn / r.s 响应解析（对齐 lx-music objStr2JSON）
 * 部分接口返回单引号伪 JSON，标准 JSON.parse / Response.json 会失败。
 */

/** @see lx-music-desktop src/renderer/utils/musicSdk/kw/util.js objStr2JSON */
export function parseKuwoObjStr<T = unknown>(raw: string): T {
  const text = raw.trim();
  if (!text) throw new Error('empty kuwo response');
  try {
    return JSON.parse(text) as T;
  } catch {
    // 对齐 lx：仅替换充当键/值边界的单引号
    return JSON.parse(
      text.replace(/('(?=(,\s*')))|('(?=:))|((?<=([:,]\s*))')|((?<={)')|('(?=}))/g, '"'),
    ) as T;
  }
}

export async function parseKuwoResponseBody<T = unknown>(
  body: string | unknown,
): Promise<T> {
  if (typeof body === 'string') return parseKuwoObjStr<T>(body);
  if (body != null && typeof body === 'object') return body as T;
  throw new Error('invalid kuwo response');
}
