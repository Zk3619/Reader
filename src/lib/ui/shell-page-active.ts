import type { Accessor } from 'solid-js';

/** 侧边栏页隐藏挂载时，由 App 传入 active 以门控数据请求 */
export function readShellPageActive(active?: boolean | Accessor<boolean>): boolean {
  if (active === undefined) return true;
  return typeof active === 'function' ? active() : active;
}
