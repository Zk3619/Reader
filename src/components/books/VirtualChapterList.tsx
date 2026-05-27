/**
 * 章节目录虚拟列表：仅渲染可视区行，大目录打开时不阻塞主线程。
 */

import { For, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { CATALOG_ROW_HEIGHT_PX } from '@/lib/catalog/chapter-list-layout';
import { cn } from '@/lib/utils';

const DEFAULT_OVERSCAN = 8;

export interface VirtualChapterListProps {
  count: number;
  class?: string;
  /** 单行高度（px），默认 40 */
  rowHeight?: number;
  overscan?: number;
  /** 滚动容器就绪 */
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  children: (index: number) => JSX.Element;
}

export function VirtualChapterList(props: VirtualChapterListProps) {
  const rowHeight = () => props.rowHeight ?? CATALOG_ROW_HEIGHT_PX;
  const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(320);

  let root: HTMLDivElement | undefined;
  let ro: ResizeObserver | undefined;

  onMount(() => {
    if (!root) return;
    props.onScrollContainer?.(root);
    ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h != null && h > 0) setViewportHeight(h);
    });
    ro.observe(root);
    onCleanup(() => ro?.disconnect());
  });

  const range = createMemo(() => {
    const n = props.count;
    if (n <= 0) return { start: 0, end: -1, indices: [] as number[] };

    const rh = rowHeight();
    const top = scrollTop();
    const vh = viewportHeight();
    const start = Math.max(0, Math.floor(top / rh) - overscan());
    const end = Math.min(n - 1, Math.ceil((top + vh) / rh) + overscan());
    const indices: number[] = [];
    for (let i = start; i <= end; i++) indices.push(i);
    return { start, end, indices };
  });

  const totalHeight = () => Math.max(0, props.count * rowHeight());

  const offsetY = () => range().start * rowHeight();

  const visibleIndices = () => range().indices;

  return (
    <div
      ref={(el) => {
        root = el;
        props.onScrollContainer?.(el);
      }}
      class={cn('flex-1 overflow-y-auto', props.class)}
      onScroll={(e) => {
        setScrollTop(e.currentTarget.scrollTop);
        props.onScroll?.(e.currentTarget);
      }}
    >
      <div class="relative w-full" style={{ height: `${totalHeight()}px` }}>
        <div
          class="absolute left-0 right-0 top-0"
          style={{ transform: `translateY(${offsetY()}px)` }}
        >
          <For each={visibleIndices()}>{(index) => props.children(index)}</For>
        </div>
      </div>
    </div>
  );
}

/** 将章节索引滚入视口（固定行高近似） */
export function scrollCatalogIndexIntoView(
  container: HTMLDivElement,
  index: number,
  rowHeight = CATALOG_ROW_HEIGHT_PX,
  behavior: ScrollBehavior = 'auto',
): void {
  const top = Math.max(
    0,
    index * rowHeight - container.clientHeight / 2 + rowHeight / 2,
  );
  container.scrollTo({ top, behavior });
}
