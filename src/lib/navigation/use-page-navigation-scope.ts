import { onMount } from 'solid-js';
import {
  getPageNavigationRevision,
  getPageNavigationScopeKey,
  isPageNavigationScopeCurrent,
} from '@/lib/navigation/page-navigation-scope';

/**
 * 捕获挂载时的导航作用域；页面切换后 isCurrent() 为 false。
 * 非 HTTP 异步可在完成后用 isCurrent() 丢弃过期结果。
 */
export function usePageNavigationScope(): {
  scopeKey: () => string;
  revision: () => number;
  isCurrent: (scopeKey?: string) => boolean;
} {
  let capturedKey = getPageNavigationScopeKey();
  onMount(() => {
    capturedKey = getPageNavigationScopeKey();
  });
  return {
    scopeKey: () => getPageNavigationScopeKey(),
    revision: () => getPageNavigationRevision(),
    isCurrent: (scopeKey = capturedKey) => isPageNavigationScopeCurrent(scopeKey),
  };
}
