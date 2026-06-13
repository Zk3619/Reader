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
let controller: AbortController | null = null;
let ignorePageAbortDepth = 0;

/** @internal 测试重置 */
export function __resetPageNavigationScopeForTests(): void {
  activeScopeKey = '';
  revision = 0;
  ignorePageAbortDepth = 0;
  controller?.abort();
  controller = null;
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
  if (!controller) {
    controller = new AbortController();
  }
  return controller.signal;
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
  activeScopeKey = scopeKey;
  revision += 1;
  controller?.abort();
  controller = new AbortController();
  cancelAllExploreSectionsFetches();
}

/** 异步任务完成后校验是否仍在同一导航作用域 */
export function isPageNavigationScopeCurrent(scopeKey: string): boolean {
  return scopeKey === activeScopeKey;
}
