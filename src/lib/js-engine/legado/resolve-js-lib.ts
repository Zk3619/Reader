/**
 * 解析 Legado jsLib：内联脚本或 JSON 映射的远程 URL（对齐 SharedJsScope.resolveJsLibString）
 */

import { request } from '@/lib/http';

export { scriptReferencesJsLibFunctions } from '@/lib/js-engine/legado/js-lib-script-guard';

const remoteJsCache = new Map<string, string>();

function isJsonJsLib(jsLib: string): boolean {
  const t = jsLib.trim();
  return t.startsWith('{') && t.endsWith('}');
}

function normalizeRemoteJsUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function fetchRemoteJsLib(url: string): Promise<string> {
  const normalized = normalizeRemoteJsUrl(url);
  const hit = remoteJsCache.get(normalized);
  if (hit !== undefined) return hit;
  const res = await request(url, { method: 'GET', allowNon2xx: false });
  const body = await res.text();
  if (!body.trim()) {
    throw new Error(`下载 jsLib 失败: ${url}`);
  }
  remoteJsCache.set(normalized, body);
  return body;
}

/** 将书源 jsLib 展开为可执行脚本（远程 URL 会拉取并缓存） */
export async function resolveJsLibString(jsLib: string | undefined | null): Promise<string> {
  if (!jsLib?.trim()) return '';
  const trimmed = jsLib.trim();
  if (!isJsonJsLib(trimmed)) return trimmed;

  let map: Record<string, string>;
  try {
    map = JSON.parse(trimmed) as Record<string, string>;
  } catch {
    return trimmed;
  }

  const parts: string[] = [];
  for (const value of Object.values(map)) {
    const entry = String(value ?? '').trim();
    if (!entry) continue;
    if (/^https?:\/\//i.test(entry)) {
      parts.push(await fetchRemoteJsLib(entry));
    } else {
      parts.push(entry);
    }
  }
  return parts.filter(Boolean).join('\n');
}

/** 测试或同步远程 js 后清空缓存 */
export function clearResolvedJsLibCache(): void {
  remoteJsCache.clear();
}
