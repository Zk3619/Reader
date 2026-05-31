/**
 * 封面加载熔断：避免 refresh → onCoverUrlRefreshed → 重载 死循环，以及失败书反复打网。
 */

const FAILURE_TTL_MS = 30 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_LOAD_ATTEMPTS_PER_BOOK = 2;
const ATTEMPT_WINDOW_MS = 60 * 1000;

/** bookUrl → 窗口内已发起的完整加载次数 */
const loadAttemptsByBook = new Map<string, { count: number; since: number }>();

/** bookUrl → 失败冷却截止时间 */
const failureByBookUrl = new Map<string, number>();
/** cover 内存 cache key → 失败冷却 */
const failureByCoverKey = new Map<string, number>();
/** bookUrl → 已走过 getBookInfo 刷新，冷却内不再刷新 */
const refreshCooldownByBook = new Map<string, number>();

function pruneExpired(map: Map<string, number>, now: number): void {
  for (const [k, until] of map) {
    if (until <= now) map.delete(k);
  }
}

export function coverGuardCacheKey(
  coverUrl: string,
  sourceId?: string,
): string {
  return `${coverUrl}\0${sourceId ?? ''}`;
}

export function isCoverLoadFailureCached(
  bookUrl: string | null | undefined,
  coverUrl: string,
  sourceId?: string,
): boolean {
  const now = Date.now();
  pruneExpired(failureByBookUrl, now);
  pruneExpired(failureByCoverKey, now);

  const book = bookUrl?.trim();
  if (book) {
    const until = failureByBookUrl.get(book);
    if (until && until > now) return true;
  }

  const key = coverGuardCacheKey(coverUrl, sourceId);
  const untilUrl = failureByCoverKey.get(key);
  return !!untilUrl && untilUrl > now;
}

export function rememberCoverLoadFailure(
  bookUrl: string | null | undefined,
  coverUrl: string,
  sourceId?: string,
): void {
  const until = Date.now() + FAILURE_TTL_MS;
  const book = bookUrl?.trim();
  if (book) failureByBookUrl.set(book, until);
  failureByCoverKey.set(coverGuardCacheKey(coverUrl, sourceId), until);
}

export function clearCoverLoadFailure(
  bookUrl: string | null | undefined,
  coverUrl?: string,
  sourceId?: string,
): void {
  const book = bookUrl?.trim();
  if (book) failureByBookUrl.delete(book);
  if (coverUrl) {
    failureByCoverKey.delete(coverGuardCacheKey(coverUrl, sourceId));
  }
}

/** 是否仍可对本书发起 getBookInfo 刷新 thumb_url */
export function canRefreshCoverUrlForBook(bookUrl: string | null | undefined): boolean {
  const book = bookUrl?.trim();
  if (!book) return false;
  const now = Date.now();
  pruneExpired(refreshCooldownByBook, now);
  const until = refreshCooldownByBook.get(book);
  return !until || until <= now;
}

export function markCoverUrlRefreshAttempted(
  bookUrl: string | null | undefined,
): void {
  const book = bookUrl?.trim();
  if (!book) return;
  refreshCooldownByBook.set(book, Date.now() + REFRESH_COOLDOWN_MS);
}

/**
 * 记录一次封面完整加载尝试；窗口内超过上限则记入失败冷却（按 bookUrl）。
 * @returns 是否应中止本次加载
 */
export function registerCoverLoadAttempt(
  bookUrl: string | null | undefined,
  coverUrl: string,
  sourceId?: string,
): boolean {
  const book = bookUrl?.trim();
  if (!book) return false;

  const now = Date.now();
  let entry = loadAttemptsByBook.get(book);
  if (!entry || now - entry.since > ATTEMPT_WINDOW_MS) {
    entry = { count: 0, since: now };
  }
  entry.count += 1;
  loadAttemptsByBook.set(book, entry);

  if (entry.count > MAX_LOAD_ATTEMPTS_PER_BOOK) {
    rememberCoverLoadFailure(book, coverUrl, sourceId);
    return true;
  }
  return false;
}

export function resetCoverLoadAttempts(bookUrl: string | null | undefined): void {
  const book = bookUrl?.trim();
  if (book) loadAttemptsByBook.delete(book);
}
