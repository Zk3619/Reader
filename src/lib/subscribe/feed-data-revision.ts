/**
 * 订阅源/条目数据变更版本号：侧栏与主列表据此 refetch。
 * 独立模块，避免 service ↔ periodic-refresh 循环依赖。
 */

import { createSignal } from 'solid-js';

const [subscribeFeedDataRevision, setSubscribeFeedDataRevision] = createSignal(0);
export { subscribeFeedDataRevision };

export function bumpSubscribeFeedDataRevision(): void {
  setSubscribeFeedDataRevision((value) => value + 1);
}
