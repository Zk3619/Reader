/**
 * 删除书源时清除与之相关的登录态、Cookie、变量与内存缓存。
 */

import { deleteCookie } from '@/lib/http/cookie-manager';
import * as sourcesDb from '@/lib/database/sources';
import { clearExploreSectionsCache } from '@/lib/book-source/explore-sections';
import { getCfActiveRequestOrigin } from '@/lib/book-source/source-http';
import { readSourceCookieStore } from '@/lib/js-engine/legado/login-script-runner';
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

const COOKIE_CF_STORAGE_PREFIXES = [
  STORAGE_PREFIX_COOKIES,
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
  removeLocalStoragePrefixesForAliases(aliases, STORAGE_PREFIXES);
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

function collectSourceHttpCookieHosts(source: BookSource): Set<string> {
  const hosts = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    if (/^https?:\/\//i.test(t)) {
      try {
        hosts.add(new URL(t).origin);
      } catch {
        hosts.add(t);
      }
      return;
    }
    hosts.add(`https://${t}`);
  };

  add(getScriptBaseUrl(source));
  for (const h of hostsFromJsLib((source as Record<string, unknown>).jsLib)) add(h);
  add(source.sourceUrl);
  add(getCfActiveRequestOrigin(source));
  for (const key of readSourceCookieStore(source).keys()) add(key);
  return hosts;
}

async function clearHttpCookiesForHosts(hosts: Iterable<string>): Promise<void> {
  for (const host of hosts) {
    try {
      if (/^https?:\/\//i.test(host)) await deleteCookie(host);
    } catch {
      /* ignore */
    }
  }
}

async function clearHttpCookiesForSource(source: BookSource): Promise<void> {
  await clearHttpCookiesForHosts(collectSourceHttpCookieHosts(source));
}

function removeLocalStoragePrefixesForAliases(
  aliases: string[],
  prefixes: readonly (typeof STORAGE_PREFIXES)[number][],
): void {
  for (const alias of aliases) {
    for (const prefix of prefixes) {
      try {
        localStorage.removeItem(storageKey(prefix, alias));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 清除该书源的 Cookie 池与 CF 活跃域记录（保留登录信息、源变量与发现缓存）。
 */
export async function clearSourceCookieAndCfRecord(source: BookSource): Promise<void> {
  if (!source || typeof source !== 'object') return;

  const aliases = collectBookSourceKeyAliases(source);
  const hosts = collectSourceHttpCookieHosts(source);
  removeLocalStoragePrefixesForAliases(aliases, COOKIE_CF_STORAGE_PREFIXES);
  await clearHttpCookiesForHosts(hosts);
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
