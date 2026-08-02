/**
 * 悬浮全局播放窗运行时坐标（供收起条贴边定位）
 * live 在展开壳卸载时不清空 lastDock，避免收起条定位/key 抖动。
 */

import { createSignal } from 'solid-js';
import type { GmpFloatEdge, GmpFloatPos } from '@/lib/viewer/global-media-player-float-pos';

export type GmpFloatLive = {
  pos: GmpFloatPos;
  edge: GmpFloatEdge;
  width: number;
  height: number;
};

const [live, setLive] = createSignal<GmpFloatLive | null>(null);
/** 最近一次有效停靠快照（含收起瞬间），不随壳卸载清空 */
let lastDock: GmpFloatLive | null = null;

export function getGmpFloatLive(): GmpFloatLive | null {
  return live() ?? lastDock;
}

export function setGmpFloatLive(next: GmpFloatLive | null): void {
  if (next) lastDock = next;
  setLive(next);
}

/** 仅清 live 信号，保留 lastDock 给收起条 */
export function clearGmpFloatLiveSignal(): void {
  setLive(null);
}

export function getGmpFloatLastDock(): GmpFloatLive | null {
  return lastDock;
}
