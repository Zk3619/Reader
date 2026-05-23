/**
 * 书源导入黑名单匹配（内置 18+ + 用户自定义域名/URL）
 */

import { sourceBlocklistStore, type SourceBlocklistEntry } from '@/stores/source-blocklist';

let builtinHosts: Set<string> | null = null;
let builtinLoadPromise: Promise<Set<string>> | null = null;

function decodeBase64Host(line: string): string {
  try {
    if (typeof atob === 'function') return atob(line.trim());
  } catch {
    /* ignore */
  }
  return '';
}

async function loadBuiltinHosts(): Promise<Set<string>> {
  if (builtinHosts) return builtinHosts;
  if (builtinLoadPromise) return builtinLoadPromise;
  builtinLoadPromise = (async () => {
    const set = new Set<string>();
    try {
      const res = await fetch('/assets/18PlusList.txt');
      if (res.ok) {
        const text = await res.text();
        for (const line of text.split(/\r?\n/)) {
          const host = decodeBase64Host(line);
          if (host) set.add(host.toLowerCase());
        }
      }
    } catch (e) {
      console.warn('[书源黑名单] 加载内置列表失败', e);
    }
    builtinHosts = set;
    return set;
  })();
  return builtinLoadPromise;
}

/** 从书源 URL 提取主域名（与 Legado SourceHelp.is18Plus 一致） */
export function extractBlocklistHost(sourceUrl: string): string | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed.includes('//') && !trimmed.includes('.')) return null;
  try {
    const base =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(base);
    const parts = u.hostname.split('.');
    if (parts.length > 2) {
      return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`.toLowerCase();
    }
    return u.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function entryMatchesSource(entry: SourceBlocklistEntry, sourceUrl: string): boolean {
  if (!entry.enabled) return false;
  const value = entry.value.trim().toLowerCase();
  if (!value) return false;
  const urlLower = sourceUrl.trim().toLowerCase();
  if (value.includes('/') || value.startsWith('http')) {
    return urlLower.includes(value);
  }
  const host = extractBlocklistHost(sourceUrl);
  return host === value || (host != null && host.endsWith(`.${value}`));
}

export async function isBlocklistedBookSourceUrl(sourceUrl: string): Promise<boolean> {
  const builtin = await loadBuiltinHosts();
  const host = extractBlocklistHost(sourceUrl);
  if (host && builtin.has(host)) return true;

  if (!sourceBlocklistStore.state.loaded) {
    await sourceBlocklistStore.load();
  }
  for (const entry of sourceBlocklistStore.state.userEntries) {
    if (entryMatchesSource(entry, sourceUrl)) return true;
  }
  return false;
}

export async function filterBlocklistedBookSources<
  T extends { sourceUrl: string; sourceName: string },
>(sources: T[]): Promise<{ allowed: T[]; blocked: T[] }> {
  const allowed: T[] = [];
  const blocked: T[] = [];
  for (const s of sources) {
    if (await isBlocklistedBookSourceUrl(s.sourceUrl)) {
      blocked.push(s);
    } else {
      allowed.push(s);
    }
  }
  return { allowed, blocked };
}
