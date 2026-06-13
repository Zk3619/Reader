import { createVirtualizer } from '@tanstack/solid-virtual';
import { For, type JSX } from 'solid-js';

export function VirtualSourceList<T>(props: {
  items: () => readonly T[];
  estimateSize?: number;
  maxHeight?: string;
  getKey?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => JSX.Element;
}) {
  let scrollRef: HTMLDivElement | undefined;

  const virtualizer = createVirtualizer({
    get count() {
      return props.items().length;
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => props.estimateSize ?? 52,
    overscan: 10,
    getItemKey: props.getKey
      ? (index) => String(props.getKey!(props.items()[index], index))
      : undefined,
  });

  return (
    <div
      ref={scrollRef}
      class="virtual-source-list overflow-y-auto overflow-x-hidden"
      style={{ 'max-height': props.maxHeight ?? '60vh' }}
    >
      <div
        class="virtual-source-list-inner relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <For each={virtualizer.getVirtualItems()}>
          {(virtualRow) => {
            const item = () => props.items()[virtualRow.index];
            return (
              <div
                class="virtual-source-list-row absolute left-0 w-full"
                style={{
                  '--virtual-row-height': `${virtualRow.size}px`,
                  '--virtual-row-offset': `${virtualRow.start}px`,
                }}
              >
                {props.children(item(), virtualRow.index)}
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
