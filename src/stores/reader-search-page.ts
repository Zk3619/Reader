/**
 * 阅读模块内置搜索页：入参、返回 Tab 与独立叠层请求
 */

import { createSignal } from 'solid-js';
import {
  readerInternalTabValue,
  requestReaderInternalTab,
  setReaderInternalTab,
  type ReaderInternalTab,
} from '@/stores/reader-internal-tab';

export interface ReaderBookSearchRequest {
  initialQuery?: string;
  initialScope?: string;
}

const [searchRequest, setSearchRequest] = createSignal<ReaderBookSearchRequest | null>(null);
const [searchReturnTab, setSearchReturnTab] = createSignal<ReaderInternalTab>('shelf');
/** CF 挑战等场景：由 App 推入导航叠层的独立搜索页 */
const [standaloneOverlayRequested, setStandaloneOverlayRequested] = createSignal(false);

export function readerBookSearchRequest(): ReaderBookSearchRequest | null {
  return searchRequest();
}

export function readerBookSearchReturnTab(): ReaderInternalTab {
  return searchReturnTab();
}

export function consumeReaderBookSearchStandaloneRequest(): boolean {
  const pending = standaloneOverlayRequested();
  if (pending) setStandaloneOverlayRequested(false);
  return pending;
}

/** 打开阅读模块内置搜索（默认入口） */
export function openReaderBookSearch(opts?: ReaderBookSearchRequest): void {
  const current = readerInternalTabValue();
  if (current !== 'search') {
    setSearchReturnTab(current);
  }
  setSearchRequest({
    initialQuery: opts?.initialQuery?.trim() || undefined,
    initialScope: opts?.initialScope,
  });
  requestReaderInternalTab('search');
}

/** 关闭内置搜索并回到进入前的 Tab */
export function closeReaderBookSearch(): void {
  const returnTab = searchReturnTab();
  setSearchRequest(null);
  if (readerInternalTabValue() === 'search') {
    setReaderInternalTab(returnTab);
  }
}

/** 搜索进行中触发 CF 等：请求 App 打开独立叠层搜索页 */
export function requestReaderBookSearchStandaloneOverlay(): void {
  setStandaloneOverlayRequested(true);
}
