/**
 * 列表停滚后分批启动封面 load，避免数百本书同时 readCoverFromDisk / network-fetch。
 */

import { isCoverLoadScrollIdle } from '@/components/shared/virtual-list/virtual-list-scroll-coalesce';

type IdleCoverTask = () => void;

const queue: IdleCoverTask[] = [];
let flushScheduled = false;
/** 每帧最多新启动的 load 数（其余排队） */
const MAX_STARTS_PER_FLUSH = 2;

function flushIdleCoverQueue(): void {
  flushScheduled = false;
  if (!isCoverLoadScrollIdle()) {
    scheduleFlush();
    return;
  }
  let started = 0;
  while (queue.length > 0 && started < MAX_STARTS_PER_FLUSH) {
    const task = queue.shift()!;
    task();
    started += 1;
  }
  if (queue.length > 0) {
    scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(flushIdleCoverQueue);
  } else {
    setTimeout(flushIdleCoverQueue, 32);
  }
}

/** 始终入队；滚动期间由 flush 延后启动，不能丢弃已登记为 pending 的任务 */
export function enqueueIdleCoverTask(task: IdleCoverTask): void {
  queue.push(task);
  scheduleFlush();
}

export function clearIdleCoverQueue(): void {
  queue.length = 0;
  flushScheduled = false;
}
