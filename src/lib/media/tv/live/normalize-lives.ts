/**
 * 规范化 lives（对齐 fongmi LiveConfig.initLive + BaseConfig.fetchArray）
 * - 字符串项：拉取远程 JSON 数组并展开
 * - 相对 url/epg/api 相对配置根解析
 * - 继承全局 spider 为 jar
 * - 过滤无 name/url/api/groups 的空占位（如 `{}`）
 */

import { resolveConfigAssetUrl } from '../config/decoder';
import { tvGet } from '../net/rules';
import type { LiveGroup, LiveSource } from '../types';
import JSON5 from 'json5';

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith('file:');
}

function resolveMaybe(asset: string | undefined, baseUrl: string): string | undefined {
  if (!asset) return undefined;
  const t = asset.trim();
  if (!t) return undefined;
  if (isHttpUrl(t) || t.startsWith('csp_')) return t;
  return resolveConfigAssetUrl(t, baseUrl);
}

function deriveLiveName(raw: Partial<LiveSource>, index: number): string {
  const named = String(raw.name ?? '').trim();
  if (named) return named;
  const url = String(raw.url ?? '').trim();
  if (url) {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (last) return decodeURIComponent(last);
      return u.hostname || `直播${index + 1}`;
    } catch {
      return url.slice(0, 48);
    }
  }
  const api = String(raw.api ?? '').trim();
  if (api) return api.startsWith('csp_') ? api.slice(4) || api : api;
  return '';
}

function isUsableLive(live: LiveSource): boolean {
  if (live.groups?.length) return true;
  if (live.url?.trim()) return true;
  if (live.api?.trim()) return true;
  return false;
}

function normalizeOne(
  raw: Partial<LiveSource> | null | undefined,
  baseUrl: string,
  spider: string | undefined,
  index: number,
): LiveSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = deriveLiveName(raw, index);
  const url = resolveMaybe(raw.url, baseUrl);
  const api = resolveMaybe(raw.api, baseUrl);
  const epg = resolveMaybe(raw.epg, baseUrl);
  const logo = resolveMaybe(raw.logo, baseUrl);
  let jar = raw.jar?.trim() || spider || undefined;
  if (jar && baseUrl) {
    if (!jar.startsWith('http') && !jar.includes('://')) {
      const [path, md5] = jar.split(';md5;');
      const abs = resolveConfigAssetUrl(path!, baseUrl);
      jar = md5 ? `${abs};md5;${md5}` : abs;
    }
  }
  const live: LiveSource = {
    name: name || `直播${index + 1}`,
    type: raw.type,
    url,
    api,
    jar,
    epg,
    logo,
    timeout: raw.timeout,
    header: raw.header,
    groups: Array.isArray(raw.groups) ? (raw.groups as LiveGroup[]) : undefined,
    ext: typeof (raw as LiveSource).ext === 'string' ? (raw as LiveSource).ext : undefined,
  };
  if (!isUsableLive(live) && !name) return null;
  if (!isUsableLive(live)) return null;
  return live;
}

async function fetchLiveArray(url: string): Promise<unknown[]> {
  try {
    const absolute = isHttpUrl(url) ? url : url;
    const body = await tvGet(absolute, { timeout: 30000 });
    const parsed = JSON5.parse(body.trim()) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[tv-lives] fetchArray', url, e);
    return [];
  }
}

/**
 * 展开并规范化配置中的 lives 字段。
 * @param raw lives 原始值（可能含字符串 URL 或空对象）
 * @param baseUrl 当前配置 URL（用于相对路径）
 * @param spider 全局 spider.jar
 */
export async function normalizeLives(
  raw: unknown,
  baseUrl: string,
  spider?: string,
): Promise<LiveSource[]> {
  if (raw == null) return [];
  let items: unknown[] = [];
  if (typeof raw === 'string' && raw.trim()) {
    const resolved = resolveMaybe(raw.trim(), baseUrl) ?? raw.trim();
    items = await fetchLiveArray(resolved);
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    return [];
  }

  const expanded: unknown[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      const resolved = resolveMaybe(item.trim(), baseUrl) ?? item.trim();
      const nested = await fetchLiveArray(resolved);
      expanded.push(...nested);
    } else if (item && typeof item === 'object') {
      expanded.push(item);
    }
  }

  const out: LiveSource[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < expanded.length; i++) {
    const live = normalizeOne(expanded[i] as Partial<LiveSource>, baseUrl, spider, i);
    if (!live) continue;
    const key = `${live.name}|${live.url ?? ''}|${live.api ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(live);
  }
  return out;
}

export function countRawLivesEntries(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'string' && raw.trim()) return 1;
  return 0;
}
