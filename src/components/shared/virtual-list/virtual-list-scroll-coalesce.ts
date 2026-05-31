/**
 * 虚拟列表滚动合并：快速滚动时推迟封面等重任务，停滚后再执行（对齐 RecyclerView + Glide 行为）。
 */

import {
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
} from 'solid-js';

/** 略长以减少停滚瞬间全视口封面同时读盘 */
const DEFAULT_IDLE_MS = 200;

export type VirtualListScrollCoalesce = {
  markScrolling: () => void;
  isScrollIdle: Accessor<boolean>;
  /** 停滚后执行；若已空闲则同步执行 */
  runWhenIdle: (fn: () => void) => void;
};

export const VirtualListScrollCoalesceContext =
  createContext<VirtualListScrollCoalesce>();

/** 供 cover-image-loader 等在非组件上下文判断列表是否在滚动 */
let coverLoadScrollIdle: () => boolean = () => true;

export function setCoverLoadScrollIdleProbe(probe: (() => boolean) | null): void {
  coverLoadScrollIdle = probe ?? (() => true);
}

export function isCoverLoadScrollIdle(): boolean {
  return coverLoadScrollIdle();
}

export function createVirtualListScrollCoalesce(
  idleMs = DEFAULT_IDLE_MS,
): VirtualListScrollCoalesce {
  const [idle, setIdle] = createSignal(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const whenIdleQueue: Array<() => void> = [];

  const flushWhenIdle = () => {
    if (!idle()) return;
    const batch = whenIdleQueue.splice(0, whenIdleQueue.length);
    for (const fn of batch) {
      try {
        fn();
      } catch (e) {
        console.warn('[virtual-list] runWhenIdle failed', e);
      }
    }
  };

  const markScrolling = () => {
    setIdle(false);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      setIdle(true);
      flushWhenIdle();
    }, idleMs);
  };

  const runWhenIdle = (fn: () => void) => {
    if (idle()) {
      fn();
      return;
    }
    whenIdleQueue.push(fn);
  };

  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
    whenIdleQueue.length = 0;
  });

  return {
    markScrolling,
    isScrollIdle: idle,
    runWhenIdle,
  };
}

/** 列表外（无 Provider）时视为空闲，封面可立即加载 */
export function useVirtualListScrollIdle(): Accessor<boolean> {
  const ctx = useContext(VirtualListScrollCoalesceContext);
  return () => ctx?.isScrollIdle() ?? true;
}

export function useVirtualListScrollCoalesce(): VirtualListScrollCoalesce | undefined {
  return useContext(VirtualListScrollCoalesceContext);
}

/** 停滚后再执行（如探索页 onCoverUrlRefreshed 更新列表，避免滚动中整表 reconcile） */
export function runWhenVirtualListScrollIdle(fn: () => void): void {
  const ctx = useContext(VirtualListScrollCoalesceContext);
  if (!ctx) {
    fn();
    return;
  }
  ctx.runWhenIdle(fn);
}
