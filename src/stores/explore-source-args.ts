/**
 * 书源发现脚本变量（localStorage）变更版本，供书源页 / 探索页共享失效缓存。
 */

import { createSignal } from 'solid-js';

const versions = new Map<string, number>();
const [revision, setRevision] = createSignal(0);

export const EXPLORE_SOURCE_ARGS_CHANGE_EVENT = 'explore-source-args-change';

/** 读取某书源当前参数版本（响应 revision，跨页同步） */
export function getExploreSourceArgsVersion(sourceUrl: string | null | undefined): number {
  revision();
  if (!sourceUrl) return 0;
  return versions.get(sourceUrl) ?? 0;
}

/** 书源变量写入后递增版本并广播 */
export function bumpExploreSourceArgsVersion(sourceUrl: string): void {
  const next = (versions.get(sourceUrl) ?? 0) + 1;
  versions.set(sourceUrl, next);
  setRevision((r) => r + 1);
  window.dispatchEvent(
    new CustomEvent(EXPLORE_SOURCE_ARGS_CHANGE_EVENT, { detail: { sourceUrl } }),
  );
}
