/**
 * 漫画插图加载失败冷却（对齐 Legado 跨章失败跳过）
 */

import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';

const MAX_FAILURES = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

type FailureEntry = { count: number; until: number };

const failures = new Map<string, FailureEntry>();

function guardKey(url: string, sourceId?: string): string {
  return `${normalizeImageUrl(url.trim())}\0${sourceId ?? ''}`;
}

export function isMangaImageLoadBlocked(
  url: string,
  sourceId?: string,
): boolean {
  const key = guardKey(url, sourceId);
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function rememberMangaImageLoadFailure(
  url: string,
  sourceId?: string,
): void {
  const key = guardKey(url, sourceId);
  const prev = failures.get(key);
  const count = (prev?.count ?? 0) + 1;
  failures.set(key, {
    count,
    until: Date.now() + COOLDOWN_MS,
  });
}

export function clearMangaImageLoadFailure(
  url: string,
  sourceId?: string,
): void {
  failures.delete(guardKey(url, sourceId));
}

export function clearAllMangaImageLoadFailures(): void {
  failures.clear();
}
