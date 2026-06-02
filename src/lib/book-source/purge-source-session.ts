/**
 * 删除书源时清除与之相关的登录态、Cookie、变量与内存缓存。
 */

import { deleteCookie } from '@/lib/http/cookie-manager';
import * as sourcesDb from '@/lib/database/sources';
import { clearExploreSectionsCache } from '@/lib/book-source/explore-sections';
import {
  getScriptBaseUrl,
  getLegadoSourceKey,
  hostsFromJsLib,
  storageKey,
  STORAGE_PREFIX_ARGS,
  STORAGE_PREFIX_CF_ORIGIN,
  STORAGE_PREFIX_CF_UA,
  STORAGE_PREFIX_COOKIES,
  STORAGE_PREFIX_LOGIN,
} from '@/lib/js-engine/legado/source-script-shared';
import { pageCacheStore } from '@/stores/page-cache';
import {
  resetExploreSourceArgsVersion,
} from '@/stores/explore-source-args';
import type { BookSource } from '@/types';

const STORAGE_PREFIXES = [
  STORAGE_PREFIX_ARGS,
  STORAGE_PREFIX_COOKIES,
  STORAGE_PREFIX_LOGIN,
  STORAGE_PREFIX_CF_ORIGIN,
  STORAGE_PREFIX_CF_UA,
] as const;

/** 书源可能用过的 localStorage / 缓存键别名（bookSourceUrl 与 sourceUrl 等） */
export function collectBookSourceKeyAliases(source: BookSource): string[] {
  const src = source as Record<string, unknown>;
  const keys = new Set<string>();
  for (const value of [
    src.bookSourceUrl,
    source.sourceUrl,
    source.sourceId,
    source.sourceName,
    getLegadoSourceKey(source),
  ]) {
    const s = String(value ?? '').trim();
    if (s) keys.add(s);
  }
  return [...keys];
}

function collectPageCacheSourceIds(source: BookSource): string[] {
  const ids = new Set<string>();
  for (const value of [
    source.sourceId,
    source.sourceUrl,
    source.sourceName,
    getLegadoSourceKey(source),
    (source as Record<string, unknown>).bookSourceUrl,
  ]) {
    const s = String(value ?? '').trim();
    if (s) ids.add(s);
  }
  return [...ids];
}

function removeLocalStorageForAliases(aliases: string[]): void {
  for (const alias of aliases) {
    for (const prefix of STORAGE_PREFIXES) {
      try {
        localStorage.removeItem(storageKey(prefix, alias));
      } catch {
        /* ignore */
      }
    }
  }
}

function clearInMemoryCaches(source: BookSource, aliases: string[]): void {
  const seen = new Set<string>();
  for (const alias of aliases) {
    if (seen.has(alias)) continue;
    seen.add(alias);
    clearExploreSectionsCache(alias);
    resetExploreSourceArgsVersion(alias);
  }
  for (const id of collectPageCacheSourceIds(source)) {
    pageCacheStore.clearExploreCacheForSource(id);
  }
}

async function clearHttpCookiesForSource(source: BookSource): Promise<void> {
  const hosts = new Set<string>();
  const baseUrl = getScriptBaseUrl(source);
  if (baseUrl?.trim()) hosts.add(baseUrl.trim());
  for (const h of hostsFromJsLib((source as Record<string, unknown>).jsLib)) {
    if (h?.trim()) hosts.add(h.trim());
  }
  const su = (source.sourceUrl ?? '').trim();
  if (/^https?:\/\//i.test(su)) hosts.add(su);

  for (const host of hosts) {
    try {
      if (/^https?:\/\//i.test(host)) await deleteCookie(host);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 清除该书源在 Reader 内的会话数据（localStorage、发现缓存、页缓存、HTTP Cookie 等）。
 * 须在从数据库删除书源记录之前调用（以便仍能解析 jsLib / args 中的线路 host）。
 */
export async function purgeBookSourceSession(source: BookSource): Promise<void> {
  if (!source || typeof source !== 'object') return;

  const aliases = collectBookSourceKeyAliases(source);
  await clearHttpCookiesForSource(source);
  removeLocalStorageForAliases(aliases);
  clearInMemoryCaches(source, aliases);
}

/** 删除书源并清除其会话数据 */
export async function deleteBookSourceWithSessionPurge(source: BookSource): Promise<void> {
  await purgeBookSourceSession(source);
  await sourcesDb.deleteSource(source.sourceUrl);
}
