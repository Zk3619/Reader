/**
 * 页面导航作用域：切换 Tab / 叠层时中止上一页进行中的 HTTP 等请求。
 *
 * 切页后仍应继续的后台任务请使用 {@link withIgnoredPageNavigationAbort} 或 HTTP
 * `ignorePageNavigationAbort: true`，例如：
 * - 规则订阅自动更新（rule-update）
 * - 书架后台拉目录 / 目录补救（save-book-to-shelf，`persistTocFetch` 作用域）
 * - 离线章节缓存下载（download-queue）
 * - 书架缓存导出（run-cache-export）
 * - 封面签名过期后台刷新（cover-image-loader）
 */

import { cancelAllExploreSectionsFetches } from '@/lib/book-source/explore-sections-fetch';

let activeScopeKey = '';
let revision = 0;
let unscopedController: AbortController | null = null;
let ignorePageAbortDepth = 0;
type PageNavigationScopeFrame = {
  key: string;
  controller: AbortController;
  cancelExploreOnExit: boolean;
};
let scopeFrames: PageNavigationScopeFrame[] = [];

export type PageNavigationScopeStackEntry = {
  key: string;
  /** 该页面离开导航栈时，同时终止动态探索分类脚本。 */
  cancelExploreOnExit?: boolean;
  /** UI 叠层自行管理请求生命周期，不改变底层页面的全局作用域。 */
  inheritParent?: boolean;
};

/** @internal 测试重置 */
export function __resetPageNavigationScopeForTests(): void {
  activeScopeKey = '';
  revision = 0;
  ignorePageAbortDepth = 0;
  unscopedController?.abort();
  unscopedController = null;
  for (const frame of scopeFrames) frame.controller.abort();
  scopeFrames = [];
}

export function getPageNavigationScopeKey(): string {
  return activeScopeKey;
}

/** 递增时供 createResource source 等感知页面已切换 */
export function getPageNavigationRevision(): number {
  return revision;
}

export function getPageNavigationSignal(): AbortSignal {
  if (ignorePageAbortDepth > 0) {
    return neverAbortedSignal;
  }
  const current = scopeFrames[scopeFrames.length - 1];
  if (current) return current.controller.signal;
  if (!unscopedController) {
    unscopedController = new AbortController();
  }
  return unscopedController.signal;
}

/** 后台任务（离线缓存等）不受页面切换取消 */
export async function withIgnoredPageNavigationAbort<T>(
  fn: () => Promise<T>,
): Promise<T> {
  ignorePageAbortDepth += 1;
  try {
    return await fn();
  } finally {
    ignorePageAbortDepth = Math.max(0, ignorePageAbortDepth - 1);
  }
}

const neverAbortedController = new AbortController();
const neverAbortedSignal = neverAbortedController.signal;

/**
 * 页面或叠层变化时调用；相同 key 不重复中止。
 * @param scopeKey 建议 `${currentPage}\0${overlayEntryId ?? 'shell'}`
 */
export function bumpPageNavigationScope(scopeKey: string): void {
  if (!scopeKey || scopeKey === activeScopeKey) return;
  unscopedController?.abort();
  unscopedController = null;
  for (const frame of scopeFrames) frame.controller.abort();
  scopeFrames = [{
    key: scopeKey,
    controller: new AbortController(),
    cancelExploreOnExit: true,
  }];
  activeScopeKey = scopeKey;
  revision += 1;
  cancelAllExploreSectionsFetches();
}

/**
 * 同步 shell + overlay 导航栈。
 *
 * 压入叠层时保留底层页面的控制器，因此书籍详情请求不会取消仍挂载的探索页请求；
 * 弹出叠层时只取消被移除叠层自己的请求，并恢复底层页面作用域。
 */
export function syncPageNavigationScopeStack(
  entries: readonly PageNavigationScopeStackEntry[],
): void {
  const next = entries.filter((entry) => entry.key && !entry.inheritParent);
  if (
    next.length === scopeFrames.length &&
    next.every((entry, index) => entry.key === scopeFrames[index]?.key)
  ) {
    return;
  }

  let commonLength = 0;
  while (
    commonLength < next.length &&
    commonLength < scopeFrames.length &&
    next[commonLength].key === scopeFrames[commonLength].key
  ) {
    commonLength += 1;
  }

  unscopedController?.abort();
  unscopedController = null;

  const removed = scopeFrames.slice(commonLength);
  for (const frame of removed) frame.controller.abort();
  if (removed.some((frame) => frame.cancelExploreOnExit)) {
    cancelAllExploreSectionsFetches();
  }

  scopeFrames = scopeFrames.slice(0, commonLength);
  for (const entry of next.slice(commonLength)) {
    scopeFrames.push({
      key: entry.key,
      controller: new AbortController(),
      cancelExploreOnExit: entry.cancelExploreOnExit === true,
    });
  }

  activeScopeKey = scopeFrames[scopeFrames.length - 1]?.key ?? '';
  revision += 1;
}

/** 异步任务完成后校验是否仍在同一导航作用域 */
export function isPageNavigationScopeCurrent(scopeKey: string): boolean {
  return scopeKey === activeScopeKey;
}
