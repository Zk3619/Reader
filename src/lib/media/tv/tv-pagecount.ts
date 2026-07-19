/**
 * 影视 Result 页码归一：对齐 TV-fongmi CustomScroller（pageCount==0 表示可继续试探翻页）
 */

/** Java Integer.MAX_VALUE — 部分 spider 用作「总页数未知」哨兵 */
export const TV_PAGECOUNT_JAVA_MAX = 2_147_483_647;

/** 超过此阈值的 pagecount 视为哨兵/异常，不当作真实总页数展示 */
const TV_PAGECOUNT_SANE_MAX = 100_000;

/**
 * 归一化 pagecount：
 * - 缺失 / 非有限 / 负值 / Java MAX / 过大 → 0（未知总页，可继续下一页直至空列表）
 * - 其余取整后的正整数为真实总页数
 */
export function normalizeTvPageCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= TV_PAGECOUNT_JAVA_MAX || n >= TV_PAGECOUNT_SANE_MAX) return 0;
  return Math.floor(n);
}

/** 是否还有下一页（对齐 fongmi：`page < pageCount || pageCount == 0`，空列表不再前进） */
export function tvCategoryHasNextPage(
  page: number,
  pagecount: number,
  currentListLength: number,
): boolean {
  if (currentListLength <= 0) return false;
  if (pagecount <= 0) return true;
  return page < pagecount;
}

/** 是否展示分页条 */
export function tvCategoryShowPager(page: number, pagecount: number, listLength: number): boolean {
  if (pagecount > 1) return true;
  if (pagecount === 0 && (page > 1 || listLength > 0)) return true;
  return page > 1;
}
