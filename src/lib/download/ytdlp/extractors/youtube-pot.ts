/**
 * YouTube PO Token 辅助。
 * - 从 webpage/ytcfg 提取 visitorData
 * - 配置/缓存注入的 poToken
 * - Innertube 请求附带 serviceIntegrityDimensions.poToken
 * - 完整 WebPO/BotGuard mint 见 `youtube-webpo.ts`（bgutils-js）
 */

const potCache = new Map<string, { token: string; at: number }>();
const POT_TTL_MS = 30 * 60 * 1000;

export function extractVisitorData(webpage: string): string | null {
  const patterns = [
    /"VISITOR_DATA"\s*:\s*"([^"]+)"/,
    /"visitorData"\s*:\s*"([^"]+)"/,
    /ytcfg\.set\(\s*\{[^}]*"VISITOR_DATA"\s*:\s*"([^"]+)"/,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (m?.[1]) return m[1].replace(/\\u0026/g, '&');
  }
  return null;
}

/** 页面偶发内嵌的 content binding / gvs po token（非 BotGuard 完整解） */
export function extractEmbeddedPoToken(webpage: string): string | null {
  const patterns = [
    /"poToken"\s*:\s*"([^"]+)"/,
    /"po_token"\s*:\s*"([^"]+)"/,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (m?.[1] && m[1].length > 20) return m[1];
  }
  return null;
}

export function cachePoToken(client: string, token: string): void {
  potCache.set(client, { token, at: Date.now() });
}

export function getCachedPoToken(client: string): string | null {
  const hit = potCache.get(client);
  if (!hit) return null;
  if (Date.now() - hit.at > POT_TTL_MS) {
    potCache.delete(client);
    return null;
  }
  return hit.token;
}

/**
 * 解析设置里手动配置的 po_token（对齐 yt-dlp `extractor-args youtube:po_token=web.gvs+TOKEN`）。
 */
export function parseConfiguredPoToken(
  raw: string | undefined,
  client: string,
  context = 'gvs',
): string | null {
  if (!raw?.trim()) return null;
  for (const part of raw.split(',')) {
    const [meta, token] = part.trim().split('+');
    if (!token) continue;
    const [c, ctx] = (meta || '').toLowerCase().split('.');
    if (c && c !== client.toLowerCase()) continue;
    if (ctx && ctx !== context.toLowerCase()) continue;
    return token.trim();
  }
  return null;
}

export function buildIntegrityDimensions(poToken: string | null | undefined): Record<string, string> | undefined {
  if (!poToken) return undefined;
  return { poToken };
}
